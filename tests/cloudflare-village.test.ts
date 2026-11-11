import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { Village } from '../cloudflare/api/village';
import { QA_EPOCH, type VillageContext, type VillageRegistration } from '../cloudflare/api/runtime';
import { applyCommandBatch, BATCH_BYTES, type BatchResponse, type SyncCommand } from '../lib/city-sync';
import { ENGINE_VER, HOUR, settle } from '../lib/engine';

const secret = 'local-village-test-only-key-at-least-32-characters';
function harness() {
  const db = new DatabaseSync(':memory:');
  let clock = 1_700_000_000_000, fail = false, writes = 0, queue = Promise.resolve();
  const originalNow = Date.now; Date.now = () => clock;
  const ctx: VillageContext = {
    blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T> {
      const result = queue.then(fn); queue = result.then(() => {}, () => {}); return result;
    },
    storage: {
      sql: { exec<T>(sql: string, ...args: (string | number | null)[]) {
        const rows = db.prepare(sql).all(...args) as T[];
        if (sql.startsWith('INSERT')) { writes++; if (fail) { fail = false; throw new Error('synthetic disk failure'); } }
        return { toArray: () => rows };
      } },
      transactionSync<T>(fn: () => T) { db.exec('BEGIN'); try { const result = fn(); db.exec('COMMIT'); return result; } catch (e) { db.exec('ROLLBACK'); throw e; } },
    },
  };
  const env = { VILLAGE_ENABLED: 'true', VILLAGE_EPOCH: QA_EPOCH, AUTH_SECRET: secret, VILLAGES: undefined as never };
  let village = new Village(ctx, env);
  const registration: VillageRegistration = { id: 'qa-11111111-1111-4111-8111-111111111111', owner: 'qa-owner', name: 'Làng QA', epoch: QA_EPOCH, createdAt: clock };
  const call = (op: string, body: unknown = {}, session = 1, changes: Record<string, string> = {}) => village.fetch(new Request(`https://village.internal/${op}`, {
    method: 'POST', headers: { 'x-village-id': registration.id, 'x-village-owner': registration.owner,
      'x-village-epoch': registration.epoch, 'x-village-session': String(session), ...changes }, body: JSON.stringify(body),
  }));
  return { call, registration, env, ctx, get writes() { return writes; }, get now() { return clock; },
    advance: (ms: number) => { clock += ms; }, failWrite: () => { fail = true; }, restart: () => { village = new Village(ctx, env); },
    stored: () => JSON.parse((db.prepare('SELECT value FROM village WHERE id=1').get() as { value: string }).value),
    close: () => { Date.now = originalNow; db.close(); },
  };
}
type Harness = ReturnType<typeof harness>;
async function create(h: Harness) {
  const response = await h.call('create', h.registration); assert.equal(response.status, 200);
  return response.json() as Promise<BatchResponse>;
}
const command = (base: BatchResponse, seq = 1): SyncCommand => ({ seq, id: `command-${seq}`, at: base.serverNow + 10,
  anchor: base.sync.anchor, action: { type: 'auto', on: false, mix: { food: 40, wood: 30, stone: 20, copper: 10, gold: 0, diamond: 0, coal: 0,aetherCrystal:0,rune:0,essence:0,celestialStone:0 } } });
const batch = (commands: SyncCommand[], session = 1) => ({ engine: ENGINE_VER, session, commands });

describe('Durable QA village authority', () => {
  it('matches the existing engine and persists ACK across instance replacement', async () => {
    const h = harness(); try {
      const base = await create(h), cmd = command(base); h.advance(10_000);
      const oracle = structuredClone(base.state), expected = applyCommandBatch(oracle, [cmd], h.now);
      const response = await h.call('batch', batch([cmd])); assert.equal(response.status, 200);
      const result = await response.json() as BatchResponse;
      assert.deepEqual(result.state, JSON.parse(JSON.stringify(oracle)));
      assert.deepEqual(result.sync.results, expected);
      assert.equal(result.sync.ack, 1); assert.equal(result.batchEnabled, true);
      h.restart(); const restored = await (await h.call('read')).json() as BatchResponse;
      assert.equal(restored.sync.ack, 1); assert.deepEqual(restored.state, result.state);
    } finally { h.close(); }
  });
  it('replays a lost response without another state write or simulation', async () => {
    const h = harness(); try {
      const base = await create(h), request = batch([command(base)]); h.advance(100);
      const first = await (await h.call('batch', request)).json() as BatchResponse;
      const writes = h.writes; h.advance(50_000); h.restart();
      const retry = await (await h.call('batch', request)).json() as BatchResponse;
      assert.equal(h.writes, writes); assert.equal(retry.sync.revision, first.sync.revision);
      assert.deepEqual(retry.state, first.state); assert.deepEqual(retry.sync.results, first.sync.results);
    } finally { h.close(); }
  });
  it('rolls back state and ACK together when durable storage fails', async () => {
    const h = harness(); try {
      const base = await create(h), request = batch([command(base)]), before = h.stored(); h.advance(100); h.failWrite();
      const failed = await h.call('batch', request); assert.equal(failed.status, 503);
      const body = await failed.json(); assert.equal(body.sync, undefined); assert.equal(body.state, undefined);
      assert.deepEqual(h.stored(), before); h.restart();
      const recovered = await (await h.call('batch', request)).json() as BatchResponse;
      assert.equal(recovered.sync.ack, 1);
    } finally { h.close(); }
  });
  it('serializes simultaneous duplicate requests around async signature checks', async () => {
    const h = harness(); try {
      const base = await create(h); h.advance(100); const request = batch([command(base)]), writes = h.writes;
      const responses = await Promise.all([h.call('batch', request), h.call('batch', request)]);
      assert.deepEqual(responses.map(r => r.status), [200, 200]); assert.equal(h.writes, writes + 1);
    } finally { h.close(); }
  });
  it('rejects forged anchors, sequence gaps, changed payloads and reused IDs', async () => {
    const h = harness(); try {
      const base = await create(h), cmd = command(base); h.advance(100);
      assert.equal((await h.call('batch', batch([{ ...cmd, anchor: cmd.anchor + 'x' }]))).status, 409);
      assert.equal((await h.call('batch', batch([{ ...cmd, seq: 2 }]))).status, 409);
      assert.equal((await h.call('batch', batch([cmd]))).status, 200);
      assert.equal((await h.call('batch', batch([{ ...cmd, action: { type: 'alarm' } }]))).status, 409);
      assert.equal((await h.call('batch', batch([{ ...cmd, seq: 2 }]))).status, 409);
      assert.equal(h.stored().ledger.ack, 1);
    } finally { h.close(); }
  });
  it('fences old in-flight requests, preserves ownership and cannot downgrade a session', async () => {
    const h = harness(); try {
      const base = await create(h); assert.equal((await h.call('fence', {}, 2)).status, 200);
      for (const op of ['read', 'create', 'batch', 'fence']) assert.equal((await h.call(op, batch([command(base)]))).status, 401);
      assert.equal((await h.call('read', {}, 2, { 'x-village-owner': 'other-user' })).status, 403);
      assert.equal((await h.call('read', {}, 2, { 'x-village-epoch': 'old-epoch' })).status, 403);
      const result = await (await h.call('read', {}, 2)).json() as BatchResponse;
      assert.equal(result.sync.session, 2); assert.equal(result.sync.ack, 0); assert.deepEqual(result.state, base.state);
    } finally { h.close(); }
  });
  it('creates one village on repeated provisioning and rejects changed registration', async () => {
    const h = harness(); try {
      const first = await create(h), second = await create(h);
      assert.deepEqual(second.state, first.state); assert.equal(second.sync.cityId, first.sync.cityId);
      assert.equal((await h.call('create', { ...h.registration, name: 'Different' })).status, 409);
      assert.equal((await h.call('seed', {})).status, 404);
      assert.equal((await h.call('session', { version: 99 })).status, 404);
    } finally { h.close(); }
  });
  it('records rejected commands exactly once without claiming they succeeded', async () => {
    const h = harness(); try {
      const base = await create(h), cmd = { ...command(base), action: { type: 'train', u: 'sword', n: 50 } } as SyncCommand; h.advance(100);
      const result = await (await h.call('batch', batch([cmd]))).json() as BatchResponse;
      assert.equal(result.sync.ack, 1); assert.ok(result.sync.results[0].error);
      assert.deepEqual(result.state.res, base.state.res);
      assert.equal((await h.call('batch', { ...batch([cmd]), engine: ENGINE_VER + 1 })).status, 400);
    } finally { h.close(); }
  });
  it('bounds request bodies before parsing JSON', async () => {
    const h = harness(); try {
      await create(h); const before = h.stored();
      assert.equal((await h.call('batch', { padding: 'x'.repeat(BATCH_BYTES) })).status, 413);
      assert.deepEqual(h.stored(), before);
    } finally { h.close(); }
  });
  it('resumes private long catch-up after restart without exposing partial state', async () => {
    const h = harness(); try {
      const base = await create(h); h.advance(6 * HOUR + 60_000);
      const response = await h.call('checkpoint'); assert.equal(response.status, 503);
      const pending = await response.json(); assert.equal(pending.code, 'CHECKPOINT_PENDING'); assert.equal(pending.state, undefined); assert.equal(pending.sync, undefined);
      assert.deepEqual(h.stored().state, base.state); assert.equal(h.stored().ledger.ack, 0);
      const blocked = await h.call('batch', batch([command(base)]));
      assert.equal(blocked.status, 503, 'Temporary catch-up must not permanently block the queue with 409');
      assert.equal((await blocked.json()).code, 'CHECKPOINT_PENDING'); assert.equal(h.stored().ledger.ack, 0);
      h.restart(); const done = await (await h.call('read')).json() as BatchResponse;
      const oracle = structuredClone(base.state); settle(oracle, h.now);
      assert.deepEqual(done.state, JSON.parse(JSON.stringify(oracle))); assert.equal(h.stored().work, undefined);
    } finally { h.close(); }
  });
  it('does not ACK an expired queued batch until final settlement commits', async () => {
    const h = harness(); try {
      const base = await create(h), request = batch([command(base)]); h.advance(6 * HOUR + 60_000);
      assert.equal((await h.call('batch', request)).status, 503);
      assert.equal(h.stored().ledger.ack, 0); h.restart();
      const retry = await (await h.call('batch', request)).json() as BatchResponse;
      assert.equal(retry.sync.ack, 1); assert.match(retry.sync.results[0].error!, /30 phút/);
    } finally { h.close(); }
  });
  it('cancels unpublished work when a new session takes control', async () => {
    const h = harness(); try {
      const base = await create(h); h.advance(6 * HOUR + 60_000);
      assert.equal((await h.call('batch', batch([command(base)]))).status, 503);
      assert.ok(h.stored().work); await h.call('fence', {}, 2);
      assert.equal(h.stored().work, undefined); assert.equal(h.stored().ledger.ack, 0); assert.deepEqual(h.stored().state, base.state);
    } finally { h.close(); }
  });
});
