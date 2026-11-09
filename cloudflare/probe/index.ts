import { timingSafeEqual } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { withAuthRepository } from '../api/auth-repository';

interface ProbeEnv {
  PROBE_SECRET?: string;
  MONGODB_QA_URI?: string;
}
const QA_DATABASE = 'dong_song_cloudflare_qa';

// Short-lived compatibility probe. Never imports db.ts (which creates indexes
// on connection), never queries user/city data, and cannot select a DB via HTTP.
export default {
  async fetch(request: Request, env: ProbeEnv): Promise<Response> {
    const headers = { 'cache-control': 'no-store' };
    const credential = Buffer.from(request.headers.get('authorization') ?? '');
    const expected = Buffer.from(`Bearer ${env.PROBE_SECRET ?? ''}`);
    if (!env.PROBE_SECRET || env.PROBE_SECRET.length < 32 || credential.length !== expected.length
      || !timingSafeEqual(credential, expected)) {
      return new Response('Not found', { status: 404, headers });
    }
    if (new URL(request.url).pathname !== '/probe' || request.method !== 'POST') {
      return new Response('Not found', { status: 404, headers });
    }
    if (!env.MONGODB_QA_URI) return Response.json({ ok: false, stage: 'configuration' }, { status: 503, headers });
    const started = performance.now();
    const client = new MongoClient(env.MONGODB_QA_URI, {
      appName: 'dong-song-cloudflare-compatibility-probe',
      maxPoolSize: 1, minPoolSize: 0, retryReads: false, retryWrites: false,
      serverSelectionTimeoutMS: 10_000, connectTimeoutMS: 8_000, socketTimeoutMS: 10_000,
    });
    const id = `qa-${crypto.randomUUID()}`;
    const authId = `${id}-auth`;
    let stage = 'connect';
    try {
      await client.connect();
      const connectWallMs = Math.round(performance.now() - started);
      const db = client.db(QA_DATABASE);
      stage = 'ping';
      await db.command({ ping: 1 });
      const col = db.collection<{ _id: string; value: number }>('worker_compatibility_probe');
      stage = 'crud';
      await col.insertOne({ _id: id, value: 1 });
      await col.updateOne({ _id: id }, { $inc: { value: 1 } });
      if ((await col.findOne({ _id: id }))?.value !== 2) throw new Error('CRUD mismatch');
      stage = 'transaction';
      const session = client.startSession();
      try {
        await session.withTransaction(async () => {
          await col.updateOne({ _id: id }, { $inc: { value: 1 } }, { session });
        });
      } finally { await session.endSession(); }
      if ((await col.findOne({ _id: id }))?.value !== 3) throw new Error('Transaction mismatch');
      stage = 'auth-repository';
      await withAuthRepository({ MONGODB_QA_URI: env.MONGODB_QA_URI, AUTH_DATABASE: QA_DATABASE }, async repo => {
        const user = await repo.upsertGoogle({ sub: authId, email: 'synthetic@example.invalid', email_verified: true, name: 'Synthetic Worker QA' });
        if (user._id !== authId || user.cityId !== null) throw new Error('Account mismatch');
        const first = await repo.startSession(authId), second = await repo.startSession(authId);
        if (await repo.findUser(authId, first.sessionVersion!)) throw new Error('Old session still active');
        await repo.endSession(authId, first.sessionVersion!);
        if (!await repo.findUser(authId, second.sessionVersion!)) throw new Error('Stale logout revoked current session');
        const profile = await repo.profile(second) as { user: { id: string } };
        if (profile.user.id !== authId) throw new Error('Profile mismatch');
        await repo.endSession(authId, second.sessionVersion!);
        if (await repo.findUser(authId, second.sessionVersion!)) throw new Error('Logout did not revoke session');
      });
      stage = 'cleanup';
      await col.deleteOne({ _id: id });
      await db.collection<{ _id: string }>('users').deleteOne({ _id: authId });
      const fetchChecks: Record<string, string | number> = {};
      const url = 'https://accounts.google.com/.well-known/openid-configuration';
      const unbound = fetch;
      for (const [name, invoke] of [
        ['alias-manual', () => unbound(url, { redirect: 'manual', signal: AbortSignal.timeout(12_000) })],
        ['bound-error', () => globalThis.fetch(url, { redirect: 'error', signal: AbortSignal.timeout(12_000) })],
        ['bound-manual', () => globalThis.fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(12_000) })],
      ] as const) {
        try { const response = await invoke(); fetchChecks[name] = response.status; await response.arrayBuffer(); }
        catch (error) {
          const message = error instanceof Error ? error.message : '';
          fetchChecks[name] = /illegal invocation|incorrect.*this/i.test(message) ? 'illegal-invocation'
            : /redirect/i.test(message) ? 'redirect-mode' : /abort/i.test(message) ? 'abort' : 'other';
        }
      }
      return Response.json({ ok: true, database: QA_DATABASE, checks: ['connect', 'ping', 'crud', 'transaction', 'auth-repository', 'single-session', 'stale-logout', 'cleanup'],
        connectWallMs, totalWallMs: Math.round(performance.now() - started), fetchChecks }, { headers });
    } catch (error) {
      // Driver messages may contain hostnames, URI or credentials. Only report
      // a small allowlisted diagnostic; detailed errors are never logged.
      const name = error instanceof Error && /^[A-Za-z]+Error$/.test(error.name) ? error.name : 'Error';
      return Response.json({ ok: false, stage, error: name, totalWallMs: Math.round(performance.now() - started) }, { status: 503, headers });
    } finally {
      // A failed transaction may leave the synthetic document; clean only its
      // exact generated ID, and always close sockets in the request lifetime.
      if (stage !== 'connect' && stage !== 'cleanup') {
        await client.db(QA_DATABASE).collection<{ _id: string }>('worker_compatibility_probe').deleteOne({ _id: id }).catch(() => {});
        await client.db(QA_DATABASE).collection<{ _id: string }>('users').deleteOne({ _id: authId }).catch(() => {});
      }
      await client.close().catch(() => {});
    }
  },
};
