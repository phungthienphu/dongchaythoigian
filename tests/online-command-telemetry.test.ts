// Run in its own Bun process: all database and Next request APIs are mocked.
// @ts-expect-error Bun runtime API
import { expect, mock, test } from 'bun:test';
import { newCity } from '../lib/engine';
import { COMMAND_BUCKET_MS, COMMAND_RETENTION_MS, commandBucketUpdate, newCommandMetrics } from '../lib/command-metrics';
const { NextResponse } = await import('next/server');
let jobs: (() => Promise<void>)[] = [], signedIn = true, writes = 0, failMetric = false, conflict = false;
let rows = new Map<string, any>();
const makeDoc = () => ({ _id: 'mine', name: 'Test village', owner: 'owner', state: newCity(Date.now(), 123), ver: 1, actionReceipts: [] as any[] });
let doc = makeDoc();
mock.module('next/server', () => ({ NextResponse, after: (job: () => Promise<void>) => { jobs.push(job); } }));
mock.module('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
mock.module('../lib/auth', () => ({ SESSION_COOKIE: 'sid', readSession: () => signedIn ? 'owner' : null, currentUser: async () => signedIn ? { _id: 'owner', cityId: 'mine' } : null }));
mock.module('../lib/world', () => ({ resolveDiscoveries: async () => {} }));
mock.module('../lib/diplomacy', () => ({ registerEnvoyVisits: async () => {} }));
mock.module('../lib/db', () => ({
  users: async () => ({ findOne: async () => ({ _id: 'owner', cityId: 'mine' }) }),
  cities: async () => ({
    findOne: async () => structuredClone(doc),
    updateOne: async (query: any, update: any) => {
      if (query.ver !== undefined && query.ver !== doc.ver) return { modifiedCount: 0 };
      if (conflict) { conflict = false; return { modifiedCount: 0 }; }
      Object.assign(doc, structuredClone(update.$set));
      doc.ver += update.$inc?.ver ?? 0;
      writes++;
      return { modifiedCount: 1 };
    },
  }),
  onlineCommandStats: async () => ({ updateOne: async (query: any, update: any) => {
    if (failMetric) throw new Error('offline analytics');
    const row = rows.get(query._id) ?? { _id: query._id, ...update.$setOnInsert };
    row.firstSeen = new Date(Math.min(row.firstSeen?.getTime() ?? Infinity, update.$min.firstSeen.getTime()));
    row.lastSeen = new Date(Math.max(row.lastSeen?.getTime() ?? 0, update.$max.lastSeen.getTime()));
    for (const [key, n] of Object.entries(update.$inc)) row[key] = (row[key] ?? 0) + (n as number);
    rows.set(query._id, row);
  } }),
}));
const { POST } = await import('../app/api/city/action/route');
const { withCity } = await import('../lib/city-store');
const { trackOnlineCommand } = await import('../lib/online-commands');
const reset = () => { jobs = []; rows = new Map(); doc = makeDoc(); writes = 0; signedIn = true; failMetric = false; conflict = false; };
const request = (body: unknown, id?: string) => new Request('http://localhost/api/city/action', { method: 'POST', headers: id ? { 'x-action-id': id } : {}, body: JSON.stringify(body) });
const flush = async () => { const pending = jobs; jobs = []; for (const job of pending) await job(); };

test('authenticated requests are counted after the response; repeat receipts do not become new commands', async () => {
  reset();
  const body = { type: 'setGuardPosts', posts: [] };
  expect((await POST(request(body, 'one-command'))).status).toBe(200);
  expect(rows.size).toBe(0); expect(writes).toBe(1);
  await flush();
  expect((await POST(request(body, 'one-command'))).status).toBe(200);
  expect(writes).toBe(1);
  await flush();
  const row = [...rows.values()][0];
  expect(row.requests).toBe(2); expect(row.replayed).toBe(1); expect(row.ok).toBe(2); expect(row.attempts).toBe(2);
  expect(row.command).toBe('city.setGuardPosts'); expect(row.cityId).toBe('mine');
  expect(row.settleMs).toBeGreaterThanOrEqual(0); expect(row.commandMs).toBeGreaterThanOrEqual(0);
  expect(Object.keys(row).sort()).toEqual(['_id','attempts','bucket','cityId','command','commandMs','errors','expiresAt','firstSeen','handlerMs','lastSeen','ok','rejected','replayed','requests','route','settleMs'].sort());
});

test('invalid and domain-rejected commands are distinguished even when the API returns HTTP 200', async () => {
  reset();
  const bad = await POST(request({ type: 'unbounded-user-label', email: 'must-not-be-stored', payload: 'secret' }));
  expect(bad.status).toBe(400); expect(writes).toBe(0);
  const refused = await POST(request({ type: 'advance' }, 'cannot-advance'));
  expect(refused.status).toBe(200); expect((await refused.json()).error).toBeTruthy();
  await flush();
  const values = [...rows.values()];
  expect(values.find(r => r.command === 'city.invalid').rejected).toBe(1);
  expect(values.find(r => r.command === 'city.advance').rejected).toBe(1);
  expect(JSON.stringify(values)).not.toContain('must-not-be-stored');
});

test('unauthenticated requests and background city settlement do not create online command samples', async () => {
  reset(); signedIn = false;
  expect((await POST(request({ type: 'alarm' }))).status).toBe(401);
  expect(jobs).toHaveLength(0);
  signedIn = true; await withCity('mine', () => null, { readOnlyFallback: true });
  expect(jobs).toHaveLength(0); expect(rows.size).toBe(0);
});

test('optimistic retries accumulate work but count one received request', async () => {
  reset(); conflict = true;
  await POST(request({ type: 'setGuardPosts', posts: [] }, 'retry-command')); await flush();
  const row = [...rows.values()][0]; expect(row.requests).toBe(1); expect(row.attempts).toBe(2); expect(row.replayed).toBe(0);
});

test('analytics failures cannot undo a successful command and uncaught handler failures are reported', async () => {
  reset(); failMetric = true;
  expect((await POST(request({ type: 'setGuardPosts', posts: [] }, 'analytics-down'))).status).toBe(200);
  await flush(); expect(writes).toBe(1); expect(doc.actionReceipts).toHaveLength(1);
  failMetric = false;
  await expect(trackOnlineCommand('mine', 'battle', async m => { m.command = 'battle.launch'; throw new Error('handler failed'); })).rejects.toThrow('handler failed');
  await flush(); expect([...rows.values()][0].errors).toBe(1);
});

test('UTC buckets separate villages and expire seven days after the bucket end', () => {
  const at = Date.UTC(2026, 10, 7, 4, 23, 17);
  const base = { ...newCommandMetrics('city'), command: 'city.train', cityId: 'a', route: 'city' as const, at, handlerMs: 1, outcome: 'ok' as const };
  const a = commandBucketUpdate(base), b = commandBucketUpdate({ ...base, cityId: 'b' });
  expect(a.id).not.toBe(b.id);
  expect(a.update.$setOnInsert.bucket.getTime()).toBe(Date.UTC(2026, 10, 7, 4, 15));
  expect(a.update.$setOnInsert.expiresAt.getTime() - a.update.$setOnInsert.bucket.getTime()).toBe(COMMAND_BUCKET_MS + COMMAND_RETENTION_MS);
});
test('one batch metric update includes child counters without per-command writes',()=>{
  const update=commandBucketUpdate({...newCommandMetrics('city'),command:'city.batch',commands:{assign:20,build:2},cityId:'a',route:'city',at:0,handlerMs:1,outcome:'ok'});
  expect(update.update.$inc.requests).toBe(1);
  const counters:Record<string,number>=update.update.$inc;
  expect(counters['actions.assign']).toBe(20);expect(counters['actions.build']).toBe(2);
});
