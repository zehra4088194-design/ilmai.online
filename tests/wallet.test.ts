import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';

let db: PGlite;
const user = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const usage = JSON.stringify({ model: 'test/model', prompt_tokens: 10, completion_tokens: 10, cost_usd: 0, latency_ms: 20 });

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to authenticated,anon,service_role;
    alter default privileges in schema public grant all on tables to service_role;
    alter default privileges in schema public grant usage,select on sequences to service_role;
    alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;
  `);
  for (const file of ['0001_init.sql','0002_modes_quiz_suggestions.sql','0004_wallet_security.sql','0022_shared_credit_buckets.sql']) {
    const sql = await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8');
    await db.exec(sql.replace(/create extension if not exists pgcrypto\s*;/gi, ''));
  }
  await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)', [user,'first@example.test',other,'second@example.test']);
}, 60000);
afterAll(async () => { await db?.close(); });

const balance = async () => (await db.query<{ credits_balance: number; credits_reserved: number }>('select credits_balance::int,credits_reserved::int from profiles where id=$1',[user])).rows[0];

describe('real PostgreSQL wallet transactions', () => {
  it('reserves available funds and rejects overspending', async () => {
    await db.query('select reserve_generation($1,$2,$3,$4,$5)', [id(1),user,'test:first','test',400]);
    expect(await balance()).toEqual({ credits_balance: 500, credits_reserved: 400 });
    await expect(db.query('select reserve_generation($1,$2,$3,$4,$5)', [id(2),user,'test:second','test',200])).rejects.toThrow('insufficient_credits');
    expect(await balance()).toEqual({ credits_balance: 500, credits_reserved: 400 });
  });
  it('charges verified usage exactly once and releases unused reservation', async () => {
    await db.query('select settle_generation($1,$2,$3,$4)', [id(1),user,100,usage]);
    await db.query('select settle_generation($1,$2,$3,$4)', [id(1),user,100,usage]);
    expect(await balance()).toEqual({ credits_balance: 400, credits_reserved: 0 });
    const result = await db.query<{ count: number }>('select count(*)::int from usage_events where request_id=$1',[id(1)]);
    expect(result.rows[0].count).toBe(1);
  });
  it('releases failed requests without charging and refuses another owner', async () => {
    await db.query('select reserve_generation($1,$2,$3,$4,$5)', [id(3),user,'test:failure','test',250]);
    await expect(db.query('select settle_generation($1,$2,$3,$4)', [id(3),other,100,usage])).rejects.toThrow('generation_not_found');
    await db.query('select release_generation($1,$2)', [id(3),user]);
    await db.query('select release_generation($1,$2)', [id(3),user]);
    expect(await balance()).toEqual({ credits_balance: 400, credits_reserved: 0 });
  });
  it('does not silently clamp overdraws or underrecord ledger balances', async () => {
    await expect(db.query("select grant_credits($1,-1000,'invalid')",[user])).rejects.toThrow('insufficient_credits');
    expect((await balance()).credits_balance).toBe(400);
  });
  it('daily grants have correct deltas and cannot repeat within the UTC day', async () => {
    await db.query("select grant_credits($1,-350,'spend')",[user]);
    await db.query('select grant_daily_credits()');
    expect((await balance()).credits_balance).toBe(100);
    await db.query("select grant_credits($1,-50,'spend-again')",[user]);
    await db.query('select grant_daily_credits()');
    expect((await balance()).credits_balance).toBe(50);
    expect((await db.query<{ delta: number }>("select delta::int from credit_transactions where user_id=$1 and reason='daily_free_topup'",[user])).rows).toEqual([{ delta: 50 }]);
  });

  it('spends shared plan credits before wallet credits and records the settlement split', async () => {
    const bucketId = id(40);
    await db.query(
      `insert into plan_credit_buckets(id,user_id,plan_id,period_start,period_end,credits_granted,credits_remaining)
       values($1,$2,'pro',now()-interval '1 day',now()+interval '29 days',150,150)`,
      [bucketId,user],
    );
    await db.query('select reserve_generation($1,$2,$3,$4,$5)', [id(41),user,'plan:first','image',180]);
    expect((await db.query<{credits_reserved:number}>('select credits_reserved::int from profiles where id=$1',[user])).rows[0].credits_reserved).toBe(30);
    expect((await db.query<{credits_reserved:number}>('select credits_reserved::int from plan_credit_buckets where id=$1',[bucketId])).rows[0].credits_reserved).toBe(150);

    await db.query('select settle_generation($1,$2,$3,$4)', [id(41),user,100,usage]);
    expect((await db.query<{credits_balance:number;credits_reserved:number}>('select credits_balance::int,credits_reserved::int from profiles where id=$1',[user])).rows[0])
      .toEqual({credits_balance:50,credits_reserved:0});
    expect((await db.query<{credits_remaining:number;credits_reserved:number}>('select credits_remaining::int,credits_reserved::int from plan_credit_buckets where id=$1',[bucketId])).rows[0])
      .toEqual({credits_remaining:50,credits_reserved:0});
    const logged = (await db.query<{plan_credits_used:number;wallet_credits_used:number;provider_usage:Record<string,unknown>}>(
      'select plan_credits_used::int,wallet_credits_used::int,provider_usage from usage_events where request_id=$1',[id(41)]
    )).rows[0];
    expect(logged).toEqual({plan_credits_used:100,wallet_credits_used:0,provider_usage:{}});
  });

  it('direct charges consume remaining plan credits then wallet credits exactly once', async () => {
    const charged = await db.query<{result:{planCreditsUsed:number;walletCreditsUsed:number}}>(
      `select charge_credits($1,80,'direct-checkout','direct-charge-1') as result`,[user]
    );
    expect(charged.rows[0].result.planCreditsUsed).toBe(50);
    expect(charged.rows[0].result.walletCreditsUsed).toBe(30);
    expect((await db.query<{credits_balance:number}>('select credits_balance::int from profiles where id=$1',[user])).rows[0].credits_balance).toBe(20);
    const duplicate = await db.query<{result:{duplicate:boolean}}>(
      `select charge_credits($1,80,'direct-checkout','direct-charge-1') as result`,[user]
    );
    expect(duplicate.rows[0].result.duplicate).toBe(true);
    expect((await db.query('select count(*)::int from credit_transactions where user_id=$1 and idempotency_key=$2',[user,'direct-charge-1'])).rows[0].count).toBe(1);
  });
  it('RLS rejects cross-owner conversation references and private wallet RPC calls', async () => {
    const conv = id(20);
    await db.query('insert into conversations(id,user_id) values($1,$2)',[conv,other]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
    await db.exec('set role authenticated');
    try {
      await expect(db.query('select reserve_generation($1,$2,$3,$4,$5)', [id(21),user,'forged','chat',0])).rejects.toThrow('permission denied');
      await expect(db.query("insert into messages(conversation_id,user_id,role,content) values($1,$2,'user','forged')",[conv,user])).rejects.toThrow('row-level security');
      await expect(db.query('update profiles set role=$1 where id=$2',['admin',user])).rejects.toThrow('permission denied');
    } finally { await db.exec('reset role'); }
  });
});
