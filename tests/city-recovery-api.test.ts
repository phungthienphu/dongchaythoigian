// Run separately: isolated database/auth mocks, no network or real-account writes.
// @ts-expect-error Bun test runtime
import { test, expect, mock } from 'bun:test';
import { settle, HOUR, CityRecoveringError } from '../lib/engine';
import { syncFixture } from './sync-workload';
import type { CityDoc } from '../lib/db';
process.env.AUTH_SECRET = 'test-only-recovery-secret-with-at-least-32-characters';
let doc: CityDoc, writes = 0, conflicts = false, authenticated = true, uid = 'owner', found = true;
let user: any;
const now = 12 * HOUR + 371;
const originalNow = Date.now;
Date.now = () => now;
function reset() {
  doc = { _id: 'mine', owner: 'owner', name: 'Existing village', state: syncFixture(3), ver: 0,
    score: 44, era: 3, pop: 3, templeAt: null, createdAt: new Date(0), updatedAt: new Date(0),
    actionReceipts: [{ id: 'old-action', result: null }], citySync: { session: 1, ack: 4, lastAt: 0, results: [] } };
  doc.state.copperDepositsVersion = 1; doc.state.preciousDepositsVersion = 1;
  writes = 0; conflicts = false; authenticated = true; uid = 'owner'; found = true;
  user = { _id: uid, cityId: 'mine', sessionVersion: 1 };
}
reset();
const { NextResponse } = await import('next/server');
mock.module('next/server', () => ({ NextResponse }));
mock.module('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: 'test-session' }) }) }));
mock.module('../lib/auth', () => ({ SESSION_COOKIE: 'sid', readSession: () => uid, currentUser: async () => authenticated ? user : null }));
mock.module('../lib/db', () => ({
  cities: async () => ({
    findOne: async () => found ? structuredClone(doc) : null,
    updateOne: async (q: any, u: any) => {
      if (conflicts || q.ver !== undefined && q.ver !== doc.ver || q.owner !== undefined && q.owner !== doc.owner) return { modifiedCount: 0 };
      Object.assign(doc, structuredClone(u.$set)); doc.ver += u.$inc?.ver ?? 0; writes++; return { modifiedCount: 1 };
    },
  }), users: async () => ({}),
}));
mock.module('../lib/world', () => ({ resolveDiscoveries: async () => {} }));
mock.module('../lib/diplomacy', () => ({ registerEnvoyVisits: async () => {} }));
const { GET } = await import('../app/api/city/route');
const { withCity } = await import('../lib/city-store');

test('202 commits a bounded slice; retries resume without resetting village, receipts or ACK', async () => {
  reset();
  const full = structuredClone(doc.state); settle(full, now);
  const beforeLedger = structuredClone(doc.citySync), receipts = structuredClone(doc.actionReceipts);
  let requests = 0, previous = -1;
  while (true) {
    const res = await GET(), data = await res.json(); requests++;
    if (res.status === 200) {
      expect(JSON.parse(JSON.stringify(data.state))).toEqual(JSON.parse(JSON.stringify(full)));
      expect(data.name).toBe('Existing village'); expect(data.sync.ack).toBe(4); break;
    }
    expect(res.status).toBe(202); expect(data.state).toBeUndefined(); expect(data.sync).toBeUndefined();
    expect(data.progress.percent).toBeGreaterThanOrEqual(previous); previous = data.progress.percent;
    expect(writes).toBe(requests); expect(doc.state.last).toBe(data.progress.processed);
    // A fresh clone on every mock read represents reload/process restart.
    expect(doc.citySync).toEqual(beforeLedger); expect(doc.actionReceipts).toEqual(receipts);
    expect(doc.name).toBe('Existing village'); expect(requests).toBeLessThan(30);
  }
  expect(requests).toBeGreaterThan(2);
});
test('CAS conflict reports no uncommitted progress and does no CPU replay/write', async () => {
  reset(); conflicts = true;
  const before = structuredClone(doc), res = await GET(), data = await res.json();
  expect(res.status).toBe(202); expect(data.progress).toBeUndefined(); expect(writes).toBe(0); expect(doc).toEqual(before);
});
test('ordinary mutations and old receipts cannot bypass pending recovery', async () => {
  reset(); let mutated = false;
  await expect(withCity('mine', () => { mutated = true; }, { requestId: 'old-action' })).rejects.toThrow(CityRecoveringError);
  expect(mutated).toBe(false); expect(doc.citySync!.ack).toBe(4);
});
test('a returning owner checkpoints a short absence and receives the final slice without an extra HTTP request', async () => {
  reset();
  settle(doc.state, now - 90_000);
  const expected = structuredClone(doc.state); settle(expected, now);
  const ledger = structuredClone(doc.citySync), receipts = structuredClone(doc.actionReceipts);
  const response = await GET(), data = await response.json();
  expect(response.status).toBe(200);
  expect(doc.state.last).toBe(now);
  expect(JSON.parse(JSON.stringify(data.state))).toEqual(JSON.parse(JSON.stringify(expected)));
  expect(doc.citySync).toEqual(ledger); expect(doc.actionReceipts).toEqual(receipts);
  expect(data.sync.ack).toBe(4);
});
test('only a signed account without a city gets the naming form', async () => {
  reset(); authenticated = false; expect((await GET()).status).toBe(401); expect(writes).toBe(0);
  authenticated = true; user.cityId = null;
  let res = await GET(); expect(res.status).toBe(404); expect((await res.json()).needsName).toBe(true);
  user.cityId = 'mine'; found = false; res = await GET(); expect(res.status).toBe(409); expect((await res.json()).needsName).toBeUndefined();
  found = true; uid = 'someone-else'; res = await GET(); expect(res.status).toBe(409); expect(writes).toBe(0);
  Date.now = originalNow;
});
