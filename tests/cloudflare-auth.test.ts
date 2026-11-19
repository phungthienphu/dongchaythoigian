import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { authRoute, createSession, sessionClaims, type AuthEnv, type AuthRepository } from '../cloudflare/api/auth';
import type { UserDoc } from '../lib/db';

const env: AuthEnv = { APP_URL: 'https://staging.example', AUTH_SECRET: 'qa-only-secret-of-at-least-32-characters', GOOGLE_CLIENT_ID: 'qa-client', GOOGLE_CLIENT_SECRET: 'qa-secret' };
const req = (path: string, cookie?: string, method = 'GET', origin = env.APP_URL) => new Request(`${env.APP_URL}${path}`, {
  method, headers: { ...(cookie ? { cookie } : {}), origin },
});
function harness() {
  const user: UserDoc = { _id: 'existing-google-sub', email: 'qa@example.com', name: 'QA', cityId: 'existing-city',
    friendCode: 'QA1234', friends: [], sessionVersion: 0, createdAt: new Date(), lastSeen: new Date() };
  let writes = 0, googleCalls = 0;
  const repo: AuthRepository = {
    async findUser(uid, version) { return uid === user._id && version === user.sessionVersion ? structuredClone(user) : null; },
    async upsertGoogle(profile) { writes++; assert.equal(profile.sub, user._id); return structuredClone(user); },
    async startSession(uid) { writes++; assert.equal(uid, user._id); user.sessionVersion!++; return structuredClone(user); },
    async endSession(uid, version) { if (uid === user._id && version === user.sessionVersion) { writes++; user.sessionVersion!++; } },
    async profile(found) { return { user: { id: found._id, hasCity: !!found.cityId }, friends: [] }; },
  };
  const googleFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    googleCalls++;
    assert.equal(init?.redirect, 'manual', 'Workers must reject redirects without using unsupported redirect:error');
    if (String(url).includes('/token')) {
      const body = new URLSearchParams(String(init?.body));
      assert.equal(body.get('redirect_uri'), `${env.APP_URL}/api/auth/callback/google`);
      assert.equal(body.get('client_secret'), env.GOOGLE_CLIENT_SECRET);
      assert.ok(body.get('code_verifier'));
      return Response.json({ access_token: 'qa-token' });
    }
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer qa-token');
    return Response.json({ sub: user._id, email: user.email, email_verified: true });
  }) as typeof fetch;
  const call = (request: Request) => authRoute(request, env, repo, googleFetch);
  async function signIn() {
    const login = await call(req('/api/auth/login'));
    const target = new URL(login.headers.get('location')!);
    const stateCookie = login.headers.getSetCookie()[0].split(';')[0];
    const response = await call(req(`/api/auth/callback/google?code=qa&state=${target.searchParams.get('state')}`, stateCookie));
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), `${env.APP_URL}/`);
    const sid = response.headers.getSetCookie().find(value => value.startsWith('sid='))!;
    assert.ok(sid);
    return sid.split(';')[0];
  }
  return { repo, call, signIn, user, get writes() { return writes; }, get googleCalls() { return googleCalls; } };
}

describe('Native Cloudflare authentication', () => {
  it('uses HTTPS callback, signed state, PKCE and secure cookies without database work', async () => {
    const h = harness(), response = await h.call(req('/api/auth/login'));
    const url = new URL(response.headers.get('location')!);
    assert.equal(url.origin, 'https://accounts.google.com');
    assert.equal(url.searchParams.get('redirect_uri'), `${env.APP_URL}/api/auth/callback/google`);
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    const cookie = response.headers.getSetCookie()[0];
    assert.match(cookie, /HttpOnly; Secure; SameSite=Lax; Max-Age=600/);
    const envelope = JSON.parse(Buffer.from(cookie.split('=')[1].split('.')[0], 'base64url').toString());
    assert.equal(createHash('sha256').update(envelope.verifier).digest('base64url'), url.searchParams.get('code_challenge'));
    assert.equal(h.writes, 0); assert.equal(h.googleCalls, 0);
    assert.ok(!response.headers.get('location')!.includes(env.GOOGLE_CLIENT_SECRET));
  });

  it('returns admin sign-ins to the fixed local admin page and rejects arbitrary redirects', async () => {
    for (const returnTo of ['/admin', 'https://evil.example', '//evil.example']) {
      const h = harness(), login = await h.call(req('/api/auth/login?returnTo=' + encodeURIComponent(returnTo)));
      const state = new URL(login.headers.get('location')!).searchParams.get('state');
      const cookie = login.headers.getSetCookie()[0].split(';')[0];
      const response = await h.call(req(`/api/auth/callback/google?code=qa&state=${state}`, cookie));
      assert.equal(response.headers.get('location'), env.APP_URL + (returnTo === '/admin' ? '/admin' : '/'));
    }
  });

  it('rejects absent or tampered OAuth state before Google or database access', async () => {
    const h = harness();
    for (const cookie of [undefined, 'oauth_state_cf=garbage', 'oauth_state_cf=a.b.c']) {
      const response = await h.call(req('/api/auth/callback/google?code=qa&state=wrong', cookie));
      assert.equal(response.headers.get('location'), `${env.APP_URL}/?auth=state`);
      assert.match(response.headers.getSetCookie()[0], /Max-Age=0/);
    }
    assert.equal(h.writes, 0); assert.equal(h.googleCalls, 0);
  });

  it('keeps account/city identity and invalidates the old browser on new login', async () => {
    const h = harness();
    const a = await h.signIn(), b = await h.signIn();
    assert.deepEqual(sessionClaims(b.slice(4), env.AUTH_SECRET), { uid: 'existing-google-sub', sessionVersion: 2 });
    assert.equal(h.user.cityId, 'existing-city');
    assert.equal((await (await h.call(req('/api/me', a))).json()).sessionEnded, true);
    assert.equal((await (await h.call(req('/api/me', b))).json()).user.id, 'existing-google-sub');
    await h.call(req('/api/auth/logout', a, 'POST'));
    assert.equal(h.user.sessionVersion, 2, 'Old browser logout must not revoke the current session');
    await h.call(req('/api/auth/logout', b, 'POST'));
    assert.equal(h.user.sessionVersion, 3);
    assert.equal((await (await h.call(req('/api/me', b))).json()).sessionEnded, true);
  });

  it('rejects cross-origin logout and unconfigured/mismatched deployment origins', async () => {
    const h = harness(), session = await h.signIn(), writes = h.writes;
    assert.equal((await h.call(req('/api/auth/logout', session, 'POST', 'https://evil.example'))).status, 403);
    assert.equal(h.writes, writes);
    assert.equal((await authRoute(new Request('https://other.example/api/auth/login'), env, h.repo)).status, 503);
    assert.equal((await authRoute(req('/api/auth/login'), { ...env, AUTH_SECRET: '' }, h.repo)).status, 503);
  });

  it('rejects expired, malformed and forged sessions', () => {
    const token = createSession({ _id: 'id', sessionVersion: 1 }, env.AUTH_SECRET, 0);
    assert.deepEqual(sessionClaims(token, env.AUTH_SECRET, 1), { uid: 'id', sessionVersion: 1 });
    assert.equal(sessionClaims(token, env.AUTH_SECRET, 60 * 86_400_000), null);
    for (const value of [undefined, '', 'x'.repeat(4097), `${token}.extra`, `${token}x`]) assert.equal(sessionClaims(value, env.AUTH_SECRET, 1), null);
    assert.equal(sessionClaims(token, 'a-different-secret', 1), null);
  });

  it('requires a verified Google email before creating an account', async () => {
    const h = harness(), login = await h.call(req('/api/auth/login'));
    const state = new URL(login.headers.get('location')!).searchParams.get('state');
    const cookie = login.headers.getSetCookie()[0].split(';')[0];
    let calls = 0;
    const fake = (async () => Response.json(++calls === 1 ? { access_token: 'token' } : { sub: h.user._id, email: h.user.email, email_verified: false })) as typeof fetch;
    const response = await authRoute(req(`/api/auth/callback/google?code=qa&state=${state}`, cookie), env, h.repo, fake);
    assert.equal(response.headers.get('location'), `${env.APP_URL}/?auth=profile`);
    assert.equal(h.writes, 0);
  });

  it('rejects a Google endpoint redirect without following it or creating a session', async () => {
    const h = harness(), login = await h.call(req('/api/auth/login'));
    const state = new URL(login.headers.get('location')!).searchParams.get('state');
    const cookie = login.headers.getSetCookie()[0].split(';')[0];
    let calls = 0;
    const fake = (async (_url: unknown, init?: RequestInit) => {
      calls++; assert.equal(init?.redirect, 'manual');
      return new Response(null, { status: 302, headers: { location: 'https://untrusted.example' } });
    }) as typeof fetch;
    const response = await authRoute(req(`/api/auth/callback/google?code=qa&state=${state}`, cookie), env, h.repo, fake);
    assert.equal(response.headers.get('location'), `${env.APP_URL}/?auth=token`);
    assert.equal(calls, 1); assert.equal(h.writes, 0);
  });
});
