const encoder = new TextEncoder();

export function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hmacSha256(secret: string, value: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return bytesToHex(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

export function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

export async function verifyRequest(input: {
  secret: string; timestamp: string; nonce: string; method: string; pathname: string; body: string;
  signature: string; now?: number;
}) {
  const timestamp = Number(input.timestamp);
  const now = input.now ?? Date.now();
  if (!input.secret || !Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > 60_000) return false;
  if (!/^[a-f0-9-]{20,80}$/i.test(input.nonce)) return false;
  if (!/^[a-f0-9]{64}$/i.test(input.signature)) return false;
  const signed = [input.timestamp, input.nonce, input.method.toUpperCase(), input.pathname, input.body].join('.');
  return constantTimeEqual(await hmacSha256(input.secret, signed), input.signature.toLowerCase());
}
