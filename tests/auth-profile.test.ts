import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(), getBearerToken: vi.fn(), adminClient: vi.fn(), getUser: vi.fn(),
  from: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), rpc: vi.fn(), single: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient, getBearerToken: mocks.getBearerToken }));
vi.mock('@/lib/supabase/admin', () => ({ adminClient: mocks.adminClient }));
vi.mock('@/lib/env', () => ({ env: { adminEmails: [] } }));

import { getAuth } from '../src/lib/auth';

const user = { id: 'user-1', email: 'user@example.test', user_metadata: { role: 'admin', credits_balance: 999999 } };
const profile = { id: user.id, role: 'user', credits_balance: 37, pricing_dismissed_at: '2026-01-01', onboarding_source: 'existing' };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getBearerToken.mockResolvedValue(null);
  mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser } });
  mocks.getUser.mockResolvedValue({ data: { user }, error: null });
  mocks.adminClient.mockReturnValue({ from: mocks.from, rpc: mocks.rpc });
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
  mocks.maybeSingle.mockResolvedValue({ data: profile, error: null });
  mocks.rpc.mockReturnValue({ single: mocks.single });
  mocks.single.mockResolvedValue({ data: { ...profile, onboarding_source: 'recovered' }, error: null });
});

describe('server profile lookup', () => {
  it('uses getUser and preserves existing credits and onboarding state', async () => {
    const result = await getAuth();
    expect(mocks.getUser).toHaveBeenCalledOnce();
    expect(result?.profile).toEqual(profile);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(result?.isAdmin).toBe(false);
  });

  it('verifies native Bearer tokens with Supabase Auth', async () => {
    const token = 'header.payload.signature';
    mocks.getBearerToken.mockResolvedValue(token);
    const result = await getAuth();
    expect(mocks.getUser).toHaveBeenCalledExactlyOnceWith(token);
    expect(result?.profile).toEqual(profile);
  });

  it('does not call the service client when signed out', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect(await getAuth()).toBeNull();
    expect(mocks.adminClient).not.toHaveBeenCalled();
  });

  it('fails closed on an auth error even if a user object is present', async () => {
    mocks.getUser.mockResolvedValue({ data: { user }, error: new Error('invalid') });
    expect(await getAuth()).toBeNull();
    expect(mocks.adminClient).not.toHaveBeenCalled();
  });

  it('recovers a missing profile using only the verified user ID', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    const result = await getAuth();
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('ensure_user_profile', { p_user: user.id });
    expect(result?.profile.onboarding_source).toBe('recovered');
    expect(result?.profile.credits_balance).toBe(37);
    expect(result?.isAdmin).toBe(false);
  });

  it('does not interpret read failures as missing accounts', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: new Error('db down') });
    await expect(getAuth()).rejects.toMatchObject({ status: 503, code: 'profile_unavailable' });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('surfaces recovery errors without hard-coded insert fallback', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.single.mockResolvedValue({ data: null, error: new Error('RPC unavailable') });
    await expect(getAuth()).rejects.toMatchObject({ status: 503, code: 'profile_unavailable' });
    expect(mocks.from).toHaveBeenCalledOnce();
  });
});

// Static contract checks only; database concurrency/RLS require a local Supabase integration run.
describe('onboarding migration security contract', () => {
  const sql = readFileSync(new URL('../supabase/migrations/0003_auth_onboarding.sql', import.meta.url), 'utf8');

  it('defaults existing profiles to dismissed, pending only in the signup trigger', () => {
    expect(sql).toContain('pricing_dismissed_at timestamptz default now()');
    expect(sql).toContain("default 'existing'");
    expect(sql).toContain("now(), 'recovered'");
    expect(sql).toContain("null, 'signup'");
  });

  it('validates the auth user and serializes recovery', () => {
    expect(sql).toContain('from auth.users where id = p_user for update');
    expect(sql).toContain("raise exception 'Auth user does not exist'");
    expect(sql).toContain('if found then return profile; end if;');
    expect(sql).toContain('on conflict (id) do nothing returning * into profile');
    expect(sql).toContain("key = 'default_credits'");
    expect(sql).not.toMatch(/\b500\b/);
  });

  it('locks RPC execution to service_role and keeps sensitive columns uneditable', () => {
    expect(sql).toContain('revoke all on function public.ensure_user_profile(uuid) from public, anon, authenticated');
    expect(sql).toContain('grant execute on function public.ensure_user_profile(uuid) to service_role');
    expect(sql).toContain('revoke update (role, plan, credits_balance, is_banned, pricing_dismissed_at, onboarding_source)');
    expect(sql).toContain('alter table public.profiles enable row level security');
    expect(sql).toContain("security definer set search_path = ''");
    const grants = sql.match(/grant update\s*\([^)]*\)/gi) ?? [];
    expect(grants).toHaveLength(1);
    expect(grants[0]).not.toMatch(/role|credits_balance|pricing_dismissed_at|onboarding_source|is_banned/);
  });
});
