import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { createClient, exchange, verify, getUser } = vi.hoisted(() => ({
  createClient: vi.fn(), exchange: vi.fn(), verify: vi.fn(), getUser: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient }));

import { GET as callback } from '../src/app/auth/callback/route';
import { GET as confirm } from '../src/app/auth/confirm/route';

const request = (path: string) => new NextRequest(`https://ilmai.online${path}`);
const destination = (response: Response) => new URL(response.headers.get('location')!);

beforeEach(() => {
  vi.resetAllMocks();
  createClient.mockResolvedValue({ auth: { exchangeCodeForSession: exchange, verifyOtp: verify, getUser } });
  exchange.mockResolvedValue({ error: null });
  verify.mockResolvedValue({ error: null });
  getUser.mockResolvedValue({ data: { user: { id: 'verified-user' } }, error: null });
});

describe('PKCE callback', () => {
  it('exchanges the code, verifies the user, and preserves an allowed next', async () => {
    const response = await callback(request('/auth/callback?code=pkce-code&next=%2Fsettings'));
    expect(exchange).toHaveBeenCalledWith('pkce-code');
    expect(getUser).toHaveBeenCalledOnce();
    expect(destination(response).href).toBe('https://ilmai.online/settings');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it.each(['//evil.test', '/\\evil.test', 'https://evil.test', '/api/me', '/chat?x=%0a'])('rejects next %s', async (next) => {
    const response = await callback(request(`/auth/callback?code=ok&next=${encodeURIComponent(next)}`));
    expect(destination(response).href).toBe('https://ilmai.online/chat');
  });

  it.each(['/auth/callback', '/auth/callback?error=access_denied&code=ignored'])('handles absent code/provider refusal: %s', async (path) => {
    const response = await callback(request(path));
    expect(createClient).not.toHaveBeenCalled();
    expect(destination(response).pathname).toBe('/login');
  });

  it('does not forward provider error details', async () => {
    exchange.mockResolvedValue({ error: new Error('secret code') });
    const response = await callback(request('/auth/callback?code=secret-code'));
    expect(destination(response).pathname).toBe('/login');
    expect(response.headers.get('location')).not.toContain('secret');
    expect(getUser).not.toHaveBeenCalled();
  });

  it('requires a verified user, not only a successful exchange', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect(destination(await callback(request('/auth/callback?code=ok'))).pathname).toBe('/login');
  });

  it('directs expired recovery links to request a new email', async () => {
    exchange.mockRejectedValue(new Error('expired'));
    const response = await callback(request('/auth/callback?code=expired&next=%2Freset-password'));
    expect(destination(response).pathname).toBe('/forgot-password');
    expect(destination(response).searchParams.get('error')).toBe('recovery');
  });

  it('handles client creation failures without leaking details', async () => {
    createClient.mockRejectedValue(new Error('internal configuration'));
    const response = await callback(request('/auth/callback?code=ok'));
    expect(destination(response).pathname).toBe('/login');
  });
});

describe('email confirmation', () => {
  it('verifies email tokens through the SSR client', async () => {
    const response = await confirm(request('/auth/confirm?token_hash=hashed-token&type=email&next=%2Fsettings'));
    expect(verify).toHaveBeenCalledWith({ token_hash: 'hashed-token', type: 'email' });
    expect(getUser).toHaveBeenCalledOnce();
    expect(destination(response).href).toBe('https://ilmai.online/settings');
    expect(response.headers.get('location')).not.toContain('hashed-token');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('forces a recovery token to the reset-password screen', async () => {
    const response = await confirm(request('/auth/confirm?token_hash=hash&type=recovery&next=%2Fadmin'));
    expect(verify).toHaveBeenCalledWith({ token_hash: 'hash', type: 'recovery' });
    expect(destination(response).pathname).toBe('/reset-password');
  });

  it.each(['invite', 'magiclink', 'signup', 'email_change', 'sms', ''])('rejects OTP type %s before calling Supabase', async (type) => {
    const response = await confirm(request(`/auth/confirm?token_hash=hash&type=${type}`));
    expect(verify).not.toHaveBeenCalled();
    expect(destination(response).pathname).toBe('/login');
  });

  it('does not verify missing tokens', async () => {
    await confirm(request('/auth/confirm?type=email'));
    expect(verify).not.toHaveBeenCalled();
  });

  it('does not trust external email destinations', async () => {
    const response = await confirm(request('/auth/confirm?token_hash=hash&type=email&next=//evil.test'));
    expect(destination(response).href).toBe('https://ilmai.online/chat');
  });

  it('handles expired tokens without forwarding them', async () => {
    verify.mockResolvedValue({ error: new Error('expired token') });
    const response = await confirm(request('/auth/confirm?token_hash=secret&type=recovery'));
    expect(destination(response).pathname).toBe('/forgot-password');
    expect(response.headers.get('location')).not.toContain('secret');
    expect(getUser).not.toHaveBeenCalled();
  });

  it('rejects an unverified user after OTP verification', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error('invalid') });
    const response = await confirm(request('/auth/confirm?token_hash=hash&type=email'));
    expect(destination(response).pathname).toBe('/login');
  });
});
