import { describe, expect, it } from 'vitest';
import { authCallbackPath, isAllowedOtpType, safeAuthRedirect } from '../src/lib/auth-redirect';

describe('safeAuthRedirect', () => {
  it.each([
    '/chat', '/chat/123e4567-e89b-12d3-a456-426614174000', '/tools/image_generation',
    '/settings', '/admin/users', '/usage', '/plans', '/projects/abc', '/library', '/reset-password',
    '/chat?mode=study-buddy', '/chat?text=%D8%B9%D9%84%D9%85#message-1',
  ])('preserves allowed destination %s', (path) => {
    expect(safeAuthRedirect(path)).toBe(path);
  });

  it.each([
    null, undefined, '', '/', 'https://evil.test/chat', 'javascript:alert(1)', '//evil.test/chat',
    '///evil.test', '/\\evil.test', '\\evil.test', ' /chat', '/chat ', '/chat\n', '/chat\r',
    '/chat?x=\t', '/chat#\u007f', '/chat?x=\u0085', '/chat?x=%0d%0aLocation:evil',
    '/chat?x=%250a', '/chat?x=%255c', '/%2f%2fevil.test', '/chat/%5c', '/chat/%2e%2e/admin',
    '/chat/../admin', '/chat/./abc', '/chat//evil', '/chat?x=%E0%A4%A', '/chat?x=%',
    '/chat?x=%2525252525250a', '/login', '/signup', '/auth/callback', '/api/me',
    '/chatty', '/administrator', '/reset-password/extra', '/not-allowed', '/chat?' + 'x'.repeat(2048),
  ])('rejects unsafe or unlisted destination %s', (path) => {
    expect(safeAuthRedirect(path)).toBe('/chat');
  });

  it('encodes a sanitized next once for PKCE callback URLs', () => {
    expect(authCallbackPath('//evil.test')).toBe('/auth/callback?next=%2Fchat');
    expect(authCallbackPath('/reset-password')).toBe('/auth/callback?next=%2Freset-password');
    const next = '/chat?mode=study-buddy&model=free';
    expect(new URL(authCallbackPath(next), 'https://ilmai.online').searchParams.get('next')).toBe(next);
  });
});

describe('OTP type allowlist', () => {
  it.each(['email', 'recovery'])('accepts %s', (type) => expect(isAllowedOtpType(type)).toBe(true));
  it.each([null, '', 'signup', 'invite', 'magiclink', 'sms', 'email_change', 'EMAIL'])('rejects %s', (type) => expect(isAllowedOtpType(type)).toBe(false));
});
