import { currentContext, serializeCookie, type CookieOptions } from './context';

// Deliberately small adapter for the APIs actually used by app/api. No Next
// server or SSR is bundled: gameplay handlers remain shared source code.
export class NextResponse extends Response {
  cookies = {
    set: (name: string, value: string, options: CookieOptions = {}) => this.headers.append('set-cookie', serializeCookie(name, value, options)),
    delete: (name: string) => this.headers.append('set-cookie', serializeCookie(name, '', { maxAge: 0 })),
  };
  static json(body: unknown, init: ResponseInit = {}) {
    const headers = new Headers(init.headers);
    if (!headers.has('content-type')) headers.set('content-type', 'application/json');
    return new NextResponse(JSON.stringify(body), { ...init, headers });
  }
  static redirect(url: string | URL, status = 307) { return new NextResponse(null, { status, headers: { location: String(url) } }); }
}
export function after(callback: () => void | Promise<void>) { currentContext().after.push(callback); }
