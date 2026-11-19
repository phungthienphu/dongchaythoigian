import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { UserDoc } from '../../lib/db';

export interface AuthEnv {
  APP_URL: string;
  AUTH_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
}
export interface AuthRepository {
  findUser(uid: string, version: number): Promise<UserDoc | null>;
  upsertGoogle(profile: GoogleProfile): Promise<UserDoc>;
  startSession(uid: string): Promise<UserDoc>;
  endSession(uid: string, version: number): Promise<void>;
  profile(user: UserDoc): Promise<unknown>;
}
export interface GoogleProfile { sub: string; email: string; email_verified?: boolean; name?: string; picture?: string }
const MAX_AGE = 60 * 86_400;
const STATE_AGE = 600;
const COOKIE = 'sid';
const STATE_COOKIE = 'oauth_state_cf';
const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };

function sign(data: string, secret: string) { return createHmac('sha256', secret).update(data).digest('base64url'); }
function seal(payload: unknown, secret: string) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${data}.${sign(data, secret)}`;
}
function unseal(value: string | undefined, secret: string): Record<string, unknown> | null {
  if (!value || value.length > 4096) return null;
  const [data, sig, extra] = value.split('.');
  if (!data || !sig || extra !== undefined) return null;
  const want = Buffer.from(sign(data, secret)), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const result = JSON.parse(Buffer.from(data, 'base64url').toString());
    return result && typeof result === 'object' && !Array.isArray(result) ? result : null;
  } catch { return null; }
}

// Same payload and signature as lib/auth.ts. Existing accounts keep their IDs;
// cookies themselves do not transfer between the Vercel and Cloudflare origins.
export function createSession(user: Pick<UserDoc, '_id' | 'sessionVersion'>, secret: string, now = Date.now()) {
  if (!user.sessionVersion || !Number.isSafeInteger(user.sessionVersion) || user.sessionVersion < 1) throw new Error('Session version missing');
  return seal({ uid: user._id, sessionVersion: user.sessionVersion, exp: now + MAX_AGE * 1000 }, secret);
}
export function sessionClaims(value: string | undefined, secret: string, now = Date.now()) {
  const claims = unseal(value, secret);
  if (!claims || typeof claims.uid !== 'string' || !claims.uid || !Number.isSafeInteger(claims.sessionVersion)
    || (claims.sessionVersion as number) < 1 || typeof claims.exp !== 'number' || claims.exp <= now) return null;
  return { uid: claims.uid, sessionVersion: claims.sessionVersion as number };
}
function cookie(request: Request, name: string) {
  return request.headers.get('cookie')?.split(';').map(p => p.trim()).find(p => p.startsWith(`${name}=`))?.slice(name.length + 1);
}
function setCookie(response: Response, name: string, value: string, seconds: number) {
  response.headers.append('set-cookie', `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`);
}
function redirect(url: string) { return new Response(null, { status: 303, headers: { ...headers, location: url } }); }
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
function configured(env: AuthEnv, origin: string) {
  try {
    const url = new URL(env.APP_URL);
    return url.protocol === 'https:' && url.origin === origin && (url.pathname === '/' || url.pathname === '')
      && !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET && env.AUTH_SECRET?.length >= 32;
  } catch { return false; }
}

/** Request/Response OAuth; no Next cookies(), global env or database singleton. */
export async function authRoute(request: Request, env: AuthEnv, repo: AuthRepository, googleFetch: typeof fetch = fetch): Promise<Response> {
  const url = new URL(request.url), path = url.pathname;
  if (!configured(env, url.origin)) return json({ error: 'Đăng nhập chưa sẵn sàng.' }, 503);
  const origin = new URL(env.APP_URL).origin;
  const claims = () => sessionClaims(cookie(request, COOKIE), env.AUTH_SECRET);

  if (path === '/api/auth/login' && request.method === 'GET') {
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(32).toString('base64url');
    const target = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    target.search = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: `${origin}/api/auth/callback/google`,
      response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).toString();
    const response = redirect(target.toString());
    setCookie(response, STATE_COOKIE, seal({ purpose: 'google-oauth', state, verifier, returnTo: url.searchParams.get('returnTo') === '/admin' ? '/admin' : '/', exp: Date.now() + STATE_AGE * 1000 }, env.AUTH_SECRET), STATE_AGE);
    return response;
  }

  if (path === '/api/auth/callback/google' && request.method === 'GET') {
    const fail = (reason: string) => {
      // Never log request URLs, codes, tokens, profiles or driver messages.
      console.warn('cloudflare_oauth_result', reason);
      const response = redirect(`${origin}/?auth=${reason}`);
      setCookie(response, STATE_COOKIE, '', 0);
      return response;
    };
    const saved = unseal(cookie(request, STATE_COOKIE), env.AUTH_SECRET);
    const code = url.searchParams.get('code'), state = url.searchParams.get('state');
    if (!code || code.length > 4096 || !state || saved?.purpose !== 'google-oauth' || saved.state !== state
      || typeof saved.verifier !== 'string' || typeof saved.exp !== 'number' || saved.exp <= Date.now()) return fail('state');
    let stage = 'token';
    try {
      const tokenResponse = await googleFetch('https://oauth2.googleapis.com/token', {
        // Workers rejects redirect:'error' with TypeError. Manual preserves the
        // same security property: reject any 3xx instead of following it.
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, redirect: 'manual', signal: AbortSignal.timeout(12_000),
        body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: `${origin}/api/auth/callback/google`, grant_type: 'authorization_code', code_verifier: saved.verifier }),
      });
      if (!tokenResponse.ok) {
        const result = await tokenResponse.json().catch(() => ({})) as { error?: string };
        const diagnostic = ['invalid_grant', 'invalid_client', 'redirect_uri_mismatch', 'invalid_request', 'unsupported_grant_type'].includes(result.error ?? '') ? result.error : 'unknown';
        console.warn('cloudflare_oauth_diagnostic', 'token', diagnostic);
        return fail('token');
      }
      const token = await tokenResponse.json() as { access_token?: string };
      if (!token.access_token) return fail('token');
      stage = 'profile';
      const profileResponse = await googleFetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { authorization: `Bearer ${token.access_token}` }, redirect: 'manual', signal: AbortSignal.timeout(12_000),
      });
      if (!profileResponse.ok) return fail('profile');
      const profile = await profileResponse.json() as GoogleProfile;
      if (typeof profile.sub !== 'string' || !profile.sub || typeof profile.email !== 'string' || !profile.email || profile.email_verified !== true) return fail('profile');
      stage = 'account';
      const user = await repo.upsertGoogle(profile);
      stage = 'session';
      const latest = await repo.startSession(user._id);
      const response = redirect(`${origin}${saved.returnTo === '/admin' ? '/admin' : '/'}`);
      setCookie(response, STATE_COOKIE, '', 0);
      setCookie(response, COOKIE, createSession(latest, env.AUTH_SECRET), MAX_AGE);
      // The legacy guest PID is never adopted on a different origin.
      setCookie(response, 'pid', '', 0);
      console.info('cloudflare_oauth_result', 'success');
      return response;
    } catch (error) {
      const kind = error instanceof Error && /^[A-Za-z]+Error$/.test(error.name) ? error.name : 'Error';
      console.warn('cloudflare_oauth_diagnostic', stage, kind);
      return fail('session');
    }
  }

  if (path === '/api/me' && request.method === 'GET') {
    const current = claims();
    if (!current) return json({ user: null, friends: [] });
    const user = await repo.findUser(current.uid, current.sessionVersion);
    return user ? json(await repo.profile(user)) : json({ user: null, friends: [], sessionEnded: true });
  }

  if (path === '/api/auth/logout' && request.method === 'POST') {
    // A forged cross-origin POST must not revoke the user's session.
    if (request.headers.get('origin') !== origin || request.headers.get('sec-fetch-site') === 'cross-site') return json({ error: 'Yêu cầu không hợp lệ.' }, 403);
    const current = claims();
    if (current) await repo.endSession(current.uid, current.sessionVersion);
    const response = json({ ok: true });
    setCookie(response, COOKIE, '', 0);
    setCookie(response, 'pid', '', 0);
    return response;
  }
  return json({ error: 'Không tìm thấy đường dẫn.' }, 404);
}
