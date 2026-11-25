import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handle, HttpError, json } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  token: z.string().min(1).max(2048),
  action: z.literal('login'),
});

const expectedHostnames = new Set(
  (process.env.TURNSTILE_HOSTNAMES ?? '')
    .split(',')
    .map((hostname) => hostname.trim().toLowerCase())
    .filter(Boolean),
);

export const POST = handle(async (req: NextRequest) => {
  const { token, action } = Body.parse(await req.json());
  const secret = process.env.TURNSTILE_SECRET;
  const origin = req.headers.get('origin');

  if (!secret || expectedHostnames.size === 0) {
    throw new HttpError(503, 'Security verification is not configured. Please try again later.', 'turnstile_not_configured');
  }

  if (!origin) throw new HttpError(403, 'Security verification failed. Please try again.', 'turnstile_origin_missing');

  let originHostname = '';
  try {
    originHostname = new URL(origin).hostname.toLowerCase();
  } catch {
    throw new HttpError(403, 'Security verification failed. Please try again.', 'turnstile_origin_invalid');
  }
  if (!expectedHostnames.has(originHostname)) {
    throw new HttpError(403, 'Security verification failed. Please try again.', 'turnstile_origin_rejected');
  }

  let verification: {
    success?: boolean;
    action?: string;
    hostname?: string;
  };
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('Turnstile Siteverify returned a non-success status');
    verification = await response.json();
  } catch {
    throw new HttpError(503, 'Security verification is temporarily unavailable. Please try again.', 'turnstile_unavailable');
  }

  if (
    verification.success !== true ||
    verification.action !== action ||
    typeof verification.hostname !== 'string' ||
    !expectedHostnames.has(verification.hostname.toLowerCase())
  ) {
    throw new HttpError(403, 'Security verification failed. Please complete the check again.', 'turnstile_rejected');
  }

  return json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } });
});
