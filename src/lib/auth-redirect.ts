const AUTH_DESTINATIONS = ['/chat', '/tools', '/settings', '/admin', '/usage', '/plans', '/projects', '/library'] as const;
const FALLBACK = '/chat';
const UNSAFE_CHARACTERS = /[\\\u0000-\u001f\u007f-\u009f]/;

/** Shared by the browser and auth routes. Never return an external URL or an auth/API endpoint. */
export function safeAuthRedirect(value: string | null | undefined): string {
  if (!value || value.length > 2048 || value !== value.trim() || !value.startsWith('/') || value.startsWith('//')) return FALLBACK;

  // Inspect nested encodings as well, but preserve the original query string in the result.
  let decoded = value;
  for (let depth = 0; depth < 5; depth++) {
    if (UNSAFE_CHARACTERS.test(decoded) || decoded.startsWith('//')) return FALLBACK;
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      if (depth === 4) return FALLBACK;
      decoded = next;
    } catch {
      return FALLBACK;
    }
  }

  const pathname = value.split(/[?#]/, 1)[0];
  // Route segments are deliberately limited; no encoded separators, traversal or normalization surprises.
  if (!/^\/[a-zA-Z0-9/_-]+$/.test(pathname) || pathname.includes('//')) return FALLBACK;
  if (pathname !== '/reset-password' && !AUTH_DESTINATIONS.some((root) => pathname === root || pathname.startsWith(`${root}/`))) return FALLBACK;
  return value;
}

export function authCallbackPath(next: string | null | undefined): string {
  return `/auth/callback?next=${encodeURIComponent(safeAuthRedirect(next))}`;
}

export function isAllowedOtpType(type: string | null): type is 'email' | 'recovery' {
  return type === 'email' || type === 'recovery';
}

/**
 * Resolve auth return URLs against the canonical public app URL.
 * Reverse proxies can expose an internal request URL (for example 0.0.0.0:3000);
 * never redirect an OAuth callback to that bind address.
 */
export function authAppOrigin(fallback?: string): string {
  const candidates = [process.env.NEXT_PUBLIC_SITE_URL, fallback];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      const host = url.hostname.toLowerCase();
      if (host === '0.0.0.0' || host === '::' || host === '[::]') continue;
      if (url.protocol === 'https:' || (url.protocol === 'http:' && (host === 'localhost' || host === '127.0.0.1'))) {
        return url.origin;
      }
    } catch {
      // Ignore malformed / untrusted origins and try the next candidate.
    }
  }
  return 'https://ilmai.online';
}
