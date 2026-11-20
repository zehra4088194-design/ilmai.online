import type { Env, Provider } from './env';

const KEY_COOLDOWN_429 = 30_000;
const KEY_COOLDOWN_SERVER = 15_000;
const KEY_COOLDOWN_AUTH = 60 * 60_000;

function slotKey(env: Env, provider: 'groq'|'gemini', slot: number) {
  const property = (provider.toUpperCase() + '_API_KEY_' + slot) as keyof Env;
  const value = env[property];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export class RequestGate {
  private ready: Promise<void>;
  constructor(private readonly state: DurableObjectState, private readonly env: Env) {
    this.ready = state.blockConcurrencyWhile(async () => {
      state.storage.sql.exec('CREATE TABLE IF NOT EXISTS nonces (nonce TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)');
      state.storage.sql.exec('CREATE TABLE IF NOT EXISTS requests (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at INTEGER NOT NULL)');
    });
  }

  async fetch(request: Request) {
    await this.ready;
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    const payload = await request.json() as { nonce?: string; timestamp?: number; userLimit?: number };
    const nonce = String(payload.nonce ?? '');
    const timestamp = Number(payload.timestamp);
    const now = Date.now();
    if (!nonce || !Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > 60_000)
      return Response.json({ error: 'stale_request' }, { status: 401 });

    this.state.storage.sql.exec('DELETE FROM nonces WHERE expires_at < ?', now);
    const inserted = this.state.storage.sql.exec<{ nonce: string }>(
      'INSERT OR IGNORE INTO nonces(nonce,expires_at) VALUES(?,?) RETURNING nonce', nonce, now + 120_000,
    ).toArray();
    if (!inserted.length) return Response.json({ error: 'replay_detected' }, { status: 409 });

    const windowStart = now - 60_000;
    this.state.storage.sql.exec('DELETE FROM requests WHERE created_at < ?', windowStart);
    const count = this.state.storage.sql.exec<{ count: number }>(
      'SELECT COUNT(*) AS count FROM requests WHERE created_at >= ?', windowStart,
    ).toArray()[0]?.count ?? 0;
    const limit = Math.max(1, Math.min(1000, Number(payload.userLimit ?? this.env.USER_REQUESTS_PER_MINUTE ?? 30)));
    if (count >= limit) return Response.json({ error: 'rate_limited', retryAfter: 60 }, { status: 429 });
    this.state.storage.sql.exec('INSERT INTO requests(created_at) VALUES(?)', now);
    return Response.json({ ok: true, remaining: limit - count - 1 });
  }
}

export class KeyPool {
  private ready: Promise<void>;
  constructor(private readonly state: DurableObjectState, private readonly env: Env) {
    this.ready = state.blockConcurrencyWhile(async () => {
      state.storage.sql.exec(
        'CREATE TABLE IF NOT EXISTS key_slots (' +
        'provider TEXT NOT NULL, slot INTEGER NOT NULL, last_used INTEGER NOT NULL DEFAULT 0, ' +
        'cooldown_until INTEGER NOT NULL DEFAULT 0, failures INTEGER NOT NULL DEFAULT 0, ' +
        'PRIMARY KEY(provider,slot))'
      );
    });
  }

  async fetch(request: Request) {
    await this.ready;
    const body = await request.json() as { action?: string; provider?: Provider; slot?: number; status?: number };
    const provider = body.provider;
    if (provider !== 'groq' && provider !== 'gemini') return Response.json({ error: 'invalid_provider' }, { status: 400 });

    if (body.action === 'acquire') {
      const configured: number[] = [];
      for (let slot = 1; slot <= 10; slot++) if (slotKey(this.env, provider, slot)) configured.push(slot);
      if (!configured.length) return Response.json({ error: 'provider_not_configured' }, { status: 503 });
      for (const slot of configured) this.state.storage.sql.exec('INSERT OR IGNORE INTO key_slots(provider,slot) VALUES(?,?)', provider, slot);
      const now = Date.now();
      const available = this.state.storage.sql.exec<{ slot: number }>(
        'SELECT slot FROM key_slots WHERE provider=? AND slot IN (' + configured.map(() => '?').join(',') +
        ') AND cooldown_until<=? ORDER BY last_used ASC, slot ASC LIMIT 1',
        provider, ...configured, now,
      ).toArray()[0]?.slot;
      if (available === undefined) {
        const earliest = this.state.storage.sql.exec<{ cooldown_until: number }>(
          'SELECT MIN(cooldown_until) AS cooldown_until FROM key_slots WHERE provider=?', provider,
        ).toArray()[0]?.cooldown_until ?? now + 30_000;
        return Response.json({ error: 'all_keys_cooling_down', retryAfterMs: Math.max(1000, earliest - now) }, { status: 429 });
      }
      this.state.storage.sql.exec('UPDATE key_slots SET last_used=? WHERE provider=? AND slot=?', now, provider, available);
      return Response.json({ provider, slot: available, key: slotKey(this.env, provider, available) });
    }

    if (body.action === 'report') {
      const slot = Number(body.slot);
      const status = Number(body.status ?? 0);
      if (!Number.isInteger(slot) || slot < 1 || slot > 10) return Response.json({ error: 'invalid_slot' }, { status: 400 });
      let cooldown = 0;
      if (status === 401 || status === 403) cooldown = Date.now() + KEY_COOLDOWN_AUTH;
      else if (status === 429) cooldown = Date.now() + KEY_COOLDOWN_429;
      else if (status >= 500) cooldown = Date.now() + KEY_COOLDOWN_SERVER;
      this.state.storage.sql.exec(
        'UPDATE key_slots SET cooldown_until=?, failures=MAX(0,failures+?) WHERE provider=? AND slot=?',
        cooldown, status >= 400 ? 1 : -1, provider, slot,
      );
      return Response.json({ ok: true });
    }
    if (body.action === 'health') {
      const slots = this.state.storage.sql.exec<{ slot: number; cooldown_until: number; failures: number }>(
        'SELECT slot,cooldown_until,failures FROM key_slots WHERE provider=? ORDER BY slot', provider,
      ).toArray().map((row) => ({
        slot: row.slot, configured: !!slotKey(this.env, provider, row.slot),
        coolingDown: row.cooldown_until > Date.now(), failures: row.failures,
      }));
      return Response.json({ provider, configuredCount: configuredSlots(this.env, provider), slots });
    }
    return Response.json({ error: 'invalid_action' }, { status: 400 });
  }
}

function configuredSlots(env: Env, provider: 'groq'|'gemini') {
  let n = 0;
  for (let i = 1; i <= 10; i++) if (slotKey(env, provider, i)) n++;
  return n;
}
