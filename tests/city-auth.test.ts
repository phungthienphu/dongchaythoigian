// Run alone: Bun module mocks must not leak into other API suites.
// @ts-expect-error Bun runtime API
import { expect, mock, test } from 'bun:test';
let uid: string | null = null;
let user: { _id: string; cityId: string | null } | null = null;
let owner = 'account';
let dbReads = 0, writes = 0;
const userCollection = { findOne: async () => { dbReads++; return user; }, updateOne: async () => { writes++; return { modifiedCount: 1 }; } };
const cityCollection = {
  findOne: async (query: { owner?: string }) => { dbReads++; return query.owner === owner ? { _id: 'owned', owner } : null; },
  insertOne: async (doc: { owner: string }) => { writes++; expect(doc.owner).toBe('account'); },
};
mock.module('next/headers', () => ({ cookies: async () => ({ get: (key: string) => key === 'pid' ? { value: 'old-guest-id' } : undefined, set: () => {} }) }));
mock.module('../lib/auth', () => ({ SESSION_COOKIE: 'sid', readSession: () => uid, currentUser: async () => user }));
mock.module('../lib/db', () => ({ cities: async () => cityCollection, users: async () => userCollection }));
mock.module('../lib/world', () => ({ resolveDiscoveries: async () => {} }));
mock.module('../lib/diplomacy', () => ({ registerEnvoyVisits: async () => {} }));
const { playerId } = await import('../lib/city-store');
const { GET, POST } = await import('../app/api/city/route');

test('legacy guest cookie cannot read or create a city without login', async () => {
  expect(await playerId()).toBeNull();
  const get = await GET();
  expect(get.status).toBe(401);
  expect((await get.json()).needsLogin).toBe(true);
  const post = await POST(new Request('http://localhost/api/city', { method: 'POST', body: '{"name":"Bến Mới"}' }));
  expect(post.status).toBe(401);
  expect(dbReads).toBe(0);
  expect(writes).toBe(0);
});

test('signed session only grants access to the city owned by that account', async () => {
  uid = 'account'; user = { _id: uid, cityId: 'owned' };
  expect(await playerId()).toBe('owned');
  owner = 'someone-else';
  expect(await playerId()).toBeNull();
  owner = 'account';
});

test('signed-in player without a village gets onboarding and can create an owned village', async () => {
  uid = 'account'; user = { _id: uid, cityId: null };
  expect((await GET()).status).toBe(404);
  const response = await POST(new Request('http://localhost/api/city', { method: 'POST', body: '{"name":"Bến Mới"}' }));
  expect(response.status).toBe(200);
  expect((await response.json()).name).toBe('Bến Mới');
  expect(writes).toBe(2);
});
