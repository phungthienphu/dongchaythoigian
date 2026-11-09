/** Local workerd/SQLite only. Build the real Worker with Wrangler --dry-run first. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Miniflare, convertV4MiniflareOptions } from '../worker/node_modules/miniflare/dist/src/index.js';

const bundle = resolve(process.argv[2] ?? '/tmp/dong-song-m03-bundle/index.js');
const storage = await mkdtemp(join(tmpdir(), 'dong-song-m03-runtime-'));
const options = { name: 'village-runtime-qa', modules: true, scriptPath: bundle, modulesRoot: dirname(bundle), compatibilityDate: '2026-11-09', compatibilityFlags: ['nodejs_compat'],
  durableObjects: { VILLAGES: { className: 'Village', useSQLite: true } }, resourcePersistencePath: storage,
  bindings: { VILLAGE_ENABLED: 'true', VILLAGE_EPOCH: 'cloudflare-qa-v1', AUTH_SECRET: 'local-workerd-qa-only-secret-of-at-least-32-characters' },
};
let mf = new Miniflare(convertV4MiniflareOptions(options)), requests = 0;
const r = { id: `qa-${randomUUID()}`, owner: 'runtime-qa-owner', name: 'Runtime QA', epoch: 'cloudflare-qa-v1', createdAt: Date.now() };
async function call(op, body = {}, session = 1) {
  requests++;
  const ns = await mf.getDurableObjectNamespace('VILLAGES');
  return ns.get(ns.idFromName(r.id)).fetch(`https://village.internal/${op}`, { method: 'POST',
    headers: { 'x-village-id': r.id, 'x-village-owner': r.owner, 'x-village-epoch': r.epoch, 'x-village-session': String(session) }, body: JSON.stringify(body) });
}
try {
  const created = await call('create', r); assert.equal(created.status, 200);
  const base = await created.json(); assert.equal(base.sync.ack, 0);
  const command = { seq: 1, id: randomUUID(), at: base.sync.at, anchor: base.sync.anchor,
    action: { type: 'assign', ids: [1], task: { t: 'idle' } } };
  const batch = { engine: base.sync.engine, session: 1, commands: [command] };
  const responses = await Promise.all([call('batch', batch), call('batch', batch)]);
  assert.deepEqual(responses.map(res => res.status), [200, 200]);
  const [first, retry] = await Promise.all(responses.map(res => res.json()));
  assert.equal(first.sync.ack, 1); assert.equal(first.sync.revision, retry.sync.revision); assert.deepEqual(first.state, retry.state);
  await mf.dispose(); mf = new Miniflare(convertV4MiniflareOptions(options));
  const replayResponse = await call('batch', batch); assert.equal(replayResponse.status, 200);
  const replay = await replayResponse.json();
  assert.equal(replay.sync.ack, 1); assert.equal(replay.sync.revision, first.sync.revision); assert.deepEqual(replay.state, first.state);
  assert.equal((await call('batch', { ...batch, commands: [{ ...command, action: { type: 'alarm' } }] })).status, 409);
  assert.equal((await call('fence', {}, 2)).status, 200);
  assert.equal((await call('batch', batch)).status, 401);
  assert.equal((await call('read')).status, 401);
  const current = await (await call('read', {}, 2)).json();
  assert.equal(current.sync.session, 2); assert.equal(current.sync.ack, 0);
  console.log(JSON.stringify({ ok: true, runtime: 'workerd + SQLite', requests,
    checks: ['creation', 'concurrent-retry', 'durable-ack', 'runtime-restart', 'payload-conflict', 'session-fence'] }));
} finally { await mf.dispose(); await rm(storage, { recursive: true, force: true }); }
