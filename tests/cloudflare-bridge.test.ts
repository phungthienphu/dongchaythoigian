// Isolated adapter tests: no production credentials or database connection.
// @ts-expect-error Bun runtime API
import { test, expect, mock } from 'bun:test';
import * as server from '../cloudflare/bridge/server';
import * as headerAPI from '../cloudflare/bridge/headers';
mock.module('next/server', () => server);
mock.module('next/headers', () => headerAPI);
import { withRequestContext } from '../cloudflare/bridge/context';
import { createSession } from '../cloudflare/api/auth';
import { withRequestDatabase, requestDatabase } from '../lib/db-context';
import type { MongoClient } from 'mongodb';
const { default: bridge, workerCallback } = await import('../cloudflare/bridge/index');
const origin = 'https://game.example';
const secret = 'only-test-secret-at-least-thirty-two-characters';
const calls: Request[] = [], shards: string[] = [];
const env = { APP_URL: origin, AUTH_SECRET: secret, GOOGLE_CLIENT_ID: 'test', GOOGLE_CLIENT_SECRET: 'test',
  MONGODB_URI: 'unused', MONGODB_DB: 'qa', BATTLE_SERVER_SECRET: secret, RELEASE_ID: 'qa', GAME_ENABLED: 'true',
  ASSETS: { fetch: async () => new Response('asset') },
  GAME_API: { idFromName: (name: string) => { shards.push(name); return name; }, get: () => ({ fetch: async (req: Request) => { calls.push(req); return Response.json({ forwarded: true }); } }) },
};
const sid = createSession({ _id: 'account-a', sessionVersion: 1 }, secret);
const req = (path: string, method = 'GET', headers: Record<string, string> = {}, body?: string) => new Request(`${origin}${path}`, { method, headers, body });

test('health advertises the active 30-second batch window without forwarding to a DO', async () => {
  const before = calls.length;
  expect((await (await bridge.fetch(req('/api/health'), env)).json()).syncSeconds).toBe(30);
  expect(calls.length).toBe(before);
});

test('anonymous, forged, old and wrong-origin requests never reach Mongo executor', async () => {
  const before = calls.length;
  expect((await bridge.fetch(req('/api/city'), env)).status).toBe(401);
  expect((await bridge.fetch(req('/api/city', 'GET', { cookie: 'sid=forged' }), env)).status).toBe(401);
  expect(await (await bridge.fetch(req('/api/me'), env)).json()).toEqual({ user: null, friends: [] });
  expect((await bridge.fetch(req('/api/city/action', 'POST', { cookie: `sid=${sid}`, origin: 'https://attacker.example' }, '{}'), env)).status).toBe(403);
  expect(calls.length).toBe(before);
});
test('authenticated requests shard by signed account, ignoring forged internal headers', async () => {
  expect((await bridge.fetch(req('/api/city', 'GET', { cookie: `sid=${sid}`, 'x-village-id': 'victim' }), env)).status).toBe(200);
  expect(shards.at(-1)).toBe('account:account-a');
});
test('callbacks require server authentication and use recovery shard', async () => {
  expect(workerCallback('/api/battles/result')).toBe(true);
  expect(workerCallback('/api/battles/abc/start')).toBe(true);
  expect(workerCallback('/api/battles/abc')).toBe(false);
  expect((await bridge.fetch(req('/api/battles/reconcile', 'POST', {}, '{}'), env)).status).toBe(401);
  expect((await bridge.fetch(req('/api/battles/reconcile', 'POST', { authorization: `Bearer ${secret}` }, '{}'), env)).status).toBe(200);
  expect(shards.at(-1)).toBe('system-recovery');
});
test('stream limit, maintenance, unknown API and developer routes fail closed', async () => {
  expect((await bridge.fetch(req('/api/city/batch', 'POST', { cookie: `sid=${sid}`, origin }, 'x'.repeat(256 * 1024 + 1)), env)).status).toBe(413);
  expect((await bridge.fetch(req('/api/city'), { ...env, GAME_ENABLED: 'false' })).status).toBe(503);
  expect((await bridge.fetch(req('/api/unknown'), env)).status).toBe(404);
  expect((await bridge.fetch(req('/dev/art'), env)).status).toBe(404);
  expect(await (await bridge.fetch(req('/'), env)).text()).toBe('asset');
});
test('simultaneous requests isolate cookies, database client and after callbacks', async () => {
  const seen: string[] = [];
  await Promise.all(['a', 'b'].map((id, i) => {
    const client = { marker: id } as unknown as MongoClient;
    return withRequestDatabase(client, id, () => withRequestContext(req('/', 'GET', { cookie: `identity=${id}` }), async () => {
      await new Promise(resolve => setTimeout(resolve, (1 - i) * 10));
      expect((await headerAPI.cookies()).get('identity')?.value).toBe(id);
      expect(requestDatabase()?.client).toBe(client);
      expect(requestDatabase()?.database).toBe(id);
      (await headerAPI.cookies()).set('pid', id, { httpOnly: true, secure: true, sameSite: 'lax' });
      server.after(async () => { seen.push(`${requestDatabase()?.database}:${(await headerAPI.cookies()).get('identity')?.value}`); });
      const result = server.NextResponse.json({ id }); result.cookies.delete('sid');
      return result;
    })).then(result => {
      expect(result.headers.getSetCookie().some(value => value.startsWith(`pid=${id};`))).toBe(true);
      expect(result.headers.getSetCookie().some(value => value.startsWith('sid=;') && value.includes('Max-Age=0'))).toBe(true);
    });
  }));
  expect(seen.sort()).toEqual(['a:a', 'b:b']);
  expect(requestDatabase()).toBeUndefined();
});
