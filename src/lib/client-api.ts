/** Tiny fetch helper for client components. Throws Error(message) on non-2xx. */
export async function api<T = unknown>(url: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<T> {
  const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? `Request failed (${r.status})`);
  return j as T;
}
