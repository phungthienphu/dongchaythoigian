// Run alone: real auth against an in-memory collection, never production MongoDB.
// @ts-expect-error Bun runtime API
import { test, expect, mock } from 'bun:test';
import { createHmac } from 'node:crypto';
let cookie: string | undefined;
let version = 0;
let revokedFrom: number | undefined;
let workerFails = false;
const fences: number[] = [];
const user = () => ({ _id: 'account', cityId: 'village', sessionVersion: version, sessionRevokedFrom: revokedFrom });
mock.module('next/headers', () => ({ cookies: async () => ({ get: () => cookie ? { value: cookie } : undefined }) }));
mock.module('../lib/db', () => ({ users: async () => ({
  findOne: async (query: { _id: string; sessionVersion: number; sessionRevokedFrom?: number }) => query._id === 'account' && query.sessionVersion === version && (query.sessionRevokedFrom === undefined || query.sessionRevokedFrom === revokedFrom) ? user() : null,
  findOneAndUpdate: async (query: { sessionVersion?: number }, update: { $set?: { sessionRevokedFrom: number } }) => {
    if (query.sessionVersion !== undefined && query.sessionVersion !== version) return null;
    version++; revokedFrom = update.$set?.sessionRevokedFrom; return user();
  },
}) }));
mock.module('../lib/session-worker', () => ({ updateWorkerSession: async (_id: string, value: number) => { if (workerFails) throw new Error('Worker unavailable'); fences.push(value); } }));
process.env.AUTH_SECRET = 'test-only-auth-secret-at-least-32-characters';
const { startSession, endSession, currentUser, makeSession, readSessionClaims } = await import('../lib/auth');

test('new login revokes the old device; old logout cannot revoke the winner', async () => {
  const first = await startSession('account'); cookie = first;
  expect((await currentUser())?._id).toBe('account');
  const second = await startSession('account');
  expect(await currentUser()).toBeNull();
  await endSession(); expect(version).toBe(2);
  cookie = second; expect((await currentUser())?._id).toBe('account');
  await endSession(); expect(await currentUser()).toBeNull();
  expect(fences).toEqual([1, 2, 3]);
});

test('concurrent sign-ins produce only one active cookie', async () => {
  const tokens = await Promise.all([startSession('account'), startSession('account')]);
  let accepted = 0;
  for (const token of tokens) { cookie = token; if (await currentUser()) accepted++; }
  expect(accepted).toBe(1);
});

test('legacy, forged and expired cookies cannot authorize commands', () => {
  const raw = Buffer.from(JSON.stringify({ uid: 'account', exp: Date.now() + 60000 })).toString('base64url');
  const signature = createHmac('sha256', process.env.AUTH_SECRET!).update(raw).digest('base64url');
  expect(readSessionClaims(`${raw}.${signature}`)).toBeNull();
  const valid = makeSession('account', version);
  expect(readSessionClaims(valid)?.sessionVersion).toBe(version);
  expect(readSessionClaims(`${valid}x`)).toBeNull();
  const before = Date.now; const at = Date.now();
  Date.now = () => at + 61 * 86_400_000;
  try { expect(readSessionClaims(valid)).toBeNull(); } finally { Date.now = before; }
});


test('logout retries a failed Worker fence without signing the revoked cookie in again', async () => {
  cookie = await startSession('account'); const active = version;
  workerFails = true;
  await expect(endSession()).rejects.toThrow('Worker unavailable');
  expect(await currentUser()).toBeNull();
  workerFails = false; await endSession();
  expect(version).toBe(active + 1); expect(fences.at(-1)).toBe(active + 1);
  const winner = await startSession('account');
  await endSession(); expect(version).toBe(active + 2);
  cookie = winner; expect((await currentUser())?._id).toBe('account');
});
