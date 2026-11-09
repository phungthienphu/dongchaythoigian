import { currentContext, serializeCookie, type CookieOptions } from './context';

export async function cookies() {
  const context = currentContext();
  const jar = new Map(context.request.headers.get('cookie')?.split(';').map(piece => {
    const at = piece.indexOf('=');
    return [piece.slice(0, at).trim(), piece.slice(at + 1)] as [string, string];
  }).filter(([name]) => !!name));
  return {
    get(name: string) { const value = jar.get(name); return value === undefined ? undefined : { name, value }; },
    set(name: string, value: string, options: CookieOptions = {}) {
      jar.set(name, value);
      context.outgoing.push(serializeCookie(name, value, options));
    },
    delete(name: string) { jar.delete(name); context.outgoing.push(serializeCookie(name, '', { maxAge: 0 })); },
  };
}
export async function headers() { return currentContext().request.headers; }
