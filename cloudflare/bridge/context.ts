import { AsyncLocalStorage } from 'node:async_hooks';

export type CookieOptions = { httpOnly?: boolean; secure?: boolean; sameSite?: 'lax' | 'strict' | 'none'; path?: string; maxAge?: number };
export type RequestContext = { request: Request; outgoing: string[]; after: (() => void | Promise<void>)[] };
const context = new AsyncLocalStorage<RequestContext>();
export function currentContext() {
  const value = context.getStore();
  if (!value) throw new Error('Missing Cloudflare request context');
  return value;
}
export function serializeCookie(name: string, value: string, options: CookieOptions = {}) {
  if (!/^[\w-]+$/.test(name) || /[\r\n;]/.test(value)) throw new Error('Invalid cookie');
  return `${name}=${value}; Path=${options.path ?? '/'}${options.httpOnly ? '; HttpOnly' : ''}${options.secure ? '; Secure' : ''}${options.sameSite ? `; SameSite=${options.sameSite}` : ''}${options.maxAge !== undefined ? `; Max-Age=${Math.floor(options.maxAge)}` : ''}`;
}
export async function withRequestContext(request: Request, run: () => Promise<Response>) {
  const value: RequestContext = { request, outgoing: [], after: [] };
  return context.run(value, async () => {
    try {
      const response = await run();
      for (const cookie of value.outgoing) response.headers.append('set-cookie', cookie);
      return response;
    } finally {
      // Keep the request-owned Mongo connection alive until optional metrics finish.
      for (const callback of value.after) {
        try { await callback(); } catch { console.warn('cloudflare_after_failed'); }
      }
    }
  });
}
