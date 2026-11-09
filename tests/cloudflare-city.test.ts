import { it } from 'node:test';
import assert from 'node:assert/strict';
import { cityRoute } from '../cloudflare/api/city';
import { createSession } from '../cloudflare/api/auth';
import type { VillageRepository } from '../cloudflare/api/auth-repository';
import type { UserDoc } from '../lib/db';
import { BATCH_BYTES } from '../lib/city-sync';
import { QA_EPOCH, type VillageRegistration } from '../cloudflare/api/runtime';

function harness() {
  const user: UserDoc = { _id: 'qa-user', cityId: null, sessionVersion: 1, name: 'QA', email: 'qa@example.invalid',
    friendCode: 'QA1234', friends: [], createdAt: new Date(), lastSeen: new Date() };
  let registration: VillageRegistration | null = null, calls = 0, pending = false;
  const secret = 'city-router-test-only-key-at-least-32-characters';
  const env = { APP_URL: 'https://staging.example', AUTH_SECRET: secret, VILLAGE_ENABLED: 'true', VILLAGE_EPOCH: QA_EPOCH,
    VILLAGES: { idFromName: (name: string) => name, get(id: unknown) { return { async fetch(request: Request) {
      calls++; assert.equal(id, registration!.id); assert.equal(request.headers.get('x-village-owner'), user._id);
      assert.equal(request.headers.get('x-village-session'), '1'); assert.equal(request.headers.get('x-village-epoch'), QA_EPOCH);
      const op = new URL(request.url).pathname;
      if (pending && op === '/read') return Response.json({ needsName: true }, { status: 404 });
      pending = false; return Response.json({ op, committed: true });
    } }; } },
  };
  const repo: VillageRepository = {
    async findUser(uid, version) { return uid === user._id && version === user.sessionVersion ? user : null; },
    async upsertGoogle() { return user; }, async startSession() { return user; }, async endSession() {}, async profile() { return {}; },
    registration: () => registration,
    async reserveVillage(uid, version, name) {
      if (uid !== user._id || version !== user.sessionVersion) return null;
      registration ??= { id: 'qa-11111111-1111-4111-8111-111111111111', owner: uid, name, epoch: QA_EPOCH, createdAt: Date.now() };
      user.cityId = registration.id; return registration;
    },
  };
  const call = (path: string, method = 'GET', body?: unknown, changes: Record<string, string> = {}) => cityRoute(new Request(`${env.APP_URL}${path}`, {
    method, headers: { origin: env.APP_URL, cookie: `sid=${createSession(user, secret)}`,
      'x-village-owner': 'forged-public-owner', 'x-village-session': '999', ...changes },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), env, repo);
  return { call, user, get calls() { return calls; }, set pending(value: boolean) { pending = value; } };
}
it('requires authentication and rejects foreign-origin writes before provisioning', async () => {
  const h = harness();
  assert.equal((await h.call('/api/city', 'GET', undefined, { cookie: '' })).status, 401);
  assert.equal((await h.call('/api/city', 'POST', { name: 'QA Village' }, { origin: 'https://evil.example' })).status, 403);
  assert.equal(h.calls, 0);
});
it('resumes provisioning and strips public authority headers', async () => {
  const h = harness(); assert.equal((await h.call('/api/city')).status, 404);
  assert.equal((await h.call('/api/city', 'POST', { name: 'QA Village' })).status, 200);
  const id = h.user.cityId; h.pending = true;
  const recovered = await h.call('/api/city'); assert.equal(recovered.status, 200);
  assert.equal((await recovered.json()).op, '/create'); assert.equal(h.user.cityId, id);
  assert.equal((await h.call('/api/city', 'POST', { name: 'Retry' })).status, 200); assert.equal(h.user.cityId, id);
});
it('never exposes direct-action or client-selected city/epoch bypasses', async () => {
  const h = harness(); await h.call('/api/city', 'POST', { name: 'QA Village' }); const calls = h.calls;
  assert.equal((await h.call('/api/city/action', 'POST', { cityId: 'other', action: { type: 'alarm' } })).status, 405);
  assert.equal((await h.call('/api/city/batch', 'POST', { padding: 'x'.repeat(BATCH_BYTES) })).status, 413);
  assert.equal(h.calls, calls);
});
