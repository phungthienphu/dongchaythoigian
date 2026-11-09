/** Real Mongo QA account + local SQLite Village; never accesses production DB. */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { MongoClient } from 'mongodb';
import { withAuthRepository } from '../cloudflare/api/auth-repository';
import { Village } from '../cloudflare/api/village';
import { QA_EPOCH, villageRequest, type VillageContext } from '../cloudflare/api/runtime';

process.loadEnvFile('.env.local');
const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('Mongo QA connection is not configured');
const uid = `cloudflare-qa-repository-${crypto.randomUUID()}`;
const client = new MongoClient(uri, { maxPoolSize: 1, serverSelectionTimeoutMS: 10_000 });
const users = client.db('dong_song_cloudflare_qa').collection<{ _id: string }>('users');
const databases: DatabaseSync[] = [], villages = new Map<string, Village>();
let queue = Promise.resolve(), stage = 'start';
const env = { MONGODB_QA_URI: uri, AUTH_DATABASE: 'dong_song_cloudflare_qa', VILLAGE_ENABLED: 'true', VILLAGE_EPOCH: QA_EPOCH,
  AUTH_SECRET: 'local-qa-repository-only-key-at-least-32-characters',
  VILLAGES: { idFromName: (id: string) => id, get(id: unknown) {
    const key = String(id);
    if (!villages.has(key)) {
      const db = new DatabaseSync(':memory:'); databases.push(db);
      const ctx: VillageContext = {
        blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T> { const result = queue.then(fn); queue = result.then(() => {}, () => {}); return result; },
        storage: {
          sql: { exec<T>(sql: string, ...args: (string | number | null)[]) { const rows = db.prepare(sql).all(...args) as T[]; return { toArray: () => rows }; } },
          transactionSync<T>(fn: () => T) { db.exec('BEGIN'); try { const value = fn(); db.exec('COMMIT'); return value; } catch (e) { db.exec('ROLLBACK'); throw e; } },
        },
      };
      villages.set(key, new Village(ctx, env));
    }
    return { fetch: (request: Request) => villages.get(key)!.fetch(request) };
  } },
};
let passed = false;
try {
  await withAuthRepository(env, async repo => {
    stage = 'create-account';
    const account = await repo.upsertGoogle({ sub: uid, email: 'migration-qa@example.invalid', email_verified: true, name: 'Disposable migration QA' });
    const first = await repo.startSession(account._id); assert.equal(first.sessionVersion, 1);
    stage = 'concurrent-reservation';
    const registrations = await Promise.all(Array.from({ length: 4 }, (_, n) => repo.reserveVillage(uid, 1, `Concurrent QA ${n}`)));
    assert.ok(registrations.every(r => r && r.id === registrations[0]!.id));
    const r = registrations[0]!;
    stage = 'provision-village';
    const provision = await villageRequest(env, r, 1, 'create', r);
    assert.equal(provision.status, 200, `Provision returned HTTP ${provision.status}: ${(await provision.json() as { code?: string }).code ?? 'validation'}`);
    stage = 'session-fence';
    const second = await repo.startSession(uid); assert.equal(second.sessionVersion, 2);
    assert.equal(await repo.findUser(uid, 1), null);
    assert.equal((await villageRequest(env, r, 1, 'read')).status, 401);
    assert.equal((await villageRequest(env, r, 2, 'read')).status, 200);
    stage = 'stale-logout';
    await repo.endSession(uid, 1);
    assert.ok(await repo.findUser(uid, 2));
    assert.equal((await villageRequest(env, r, 2, 'read')).status, 200);
    stage = 'logout-retry';
    await repo.endSession(uid, 2); await repo.endSession(uid, 2);
    assert.equal(await repo.findUser(uid, 2), null);
    assert.equal((await villageRequest(env, r, 2, 'read')).status, 401);
    stage = 'reservation-recovery';
    const third = await repo.startSession(uid); assert.equal(third.sessionVersion, 4);
    assert.equal(repo.registration(third)!.id, r.id);
    assert.equal((await repo.reserveVillage(uid, 4, 'Retry name'))!.id, r.id);
    assert.equal(await repo.reserveVillage(uid, 1, 'Stale creator'), null);
    passed = true;
  });
} catch (error) {
  console.error(JSON.stringify({ ok: false, stage, kind: error instanceof Error ? error.name : 'Error',
    actual: error && typeof error === 'object' && 'actual' in error && typeof error.actual === 'number' ? error.actual : undefined })); process.exitCode = 1;
} finally {
  // Exact synthetic ID created by this run; never enumerate/delete real users.
  await users.deleteOne({ _id: uid });
  assert.equal(await users.countDocuments({ _id: uid }), 0);
  await client.close(); for (const db of databases) db.close();
}
if (passed) console.log(JSON.stringify({ ok: true, database: 'dong_song_cloudflare_qa',
  checks: ['concurrent-reservation', 'retry-safe-provisioning', 'login-fence', 'stale-logout', 'logout-retry', 'identity-preserved'], syntheticAccountCleaned: true }));
