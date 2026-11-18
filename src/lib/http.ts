import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export const json = (data: unknown, init?: number | ResponseInit) =>
  Response.json(data, typeof init === 'number' ? { status: init } : init);

/** Wrap a route handler: converts HttpError / ZodError / unknown errors into JSON responses. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message, code: e.code }, e.status);
      if (e instanceof ZodError) return json({ error: 'Invalid request', issues: e.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }, 400);
      console.error('[api]', e);
      return json({ error: 'Internal server error' }, 500);
    }
  };
}
