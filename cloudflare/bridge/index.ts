import { MongoClient } from 'mongodb';
import { withRequestDatabase } from '../../lib/db-context';
import { authRoute, sessionClaims, type AuthEnv } from '../api/auth';
import type { VillageNamespace } from '../api/runtime';
import { withRequestContext } from './context';
import { dispatch, resolveRoute } from './routes';
import { repository } from './auth-repository';
import { BATCH_DELAY_MS } from '../../lib/city-sync';

export interface BridgeEnv extends AuthEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
  GAME_API: VillageNamespace;
  MONGODB_URI: string;
  MONGODB_DB: string;
  BATTLE_SERVER_SECRET: string;
  RELEASE_ID: string;
  GAME_ENABLED?: string;
}
const response = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
const authPaths = new Set(['/api/auth/login', '/api/auth/callback/google', '/api/auth/logout']);
export const workerCallback = (path: string) => path === '/api/battles/result' || path === '/api/battles/reconcile' || /^\/api\/battles\/[^/]+\/start$/.test(path);

/** Heavy engine work executes here, outside the HTTP Worker's 10ms CPU budget.
 * Mongo remains the sole durable game authority during the hosting cutover.
 * Instances are sharded by authenticated account; cross-account writes retain
 * the existing Mongo transactions, CAS revisions and durable recovery outboxes.
 */
export class GameApi {
  constructor(_context: unknown, private env: BridgeEnv) {}
  async fetch(request: Request): Promise<Response> {
    const env = this.env;
    if (!env.MONGODB_URI || !env.MONGODB_DB) return response({ error: 'Máy chủ chưa sẵn sàng.' }, 503);
    const client = new MongoClient(env.MONGODB_URI, { appName: 'dong-song-cloudflare-game', maxPoolSize: 4, minPoolSize: 0,
      serverSelectionTimeoutMS: 10_000, connectTimeoutMS: 8_000, socketTimeoutMS: 20_000 });
    try {
      return await withRequestDatabase(client, env.MONGODB_DB, () => withRequestContext(request, async () => {
        const path = new URL(request.url).pathname;
        const result = authPaths.has(path) ? await authRoute(request, env, repository) : await dispatch(request);
        result.headers.set('cache-control', 'no-store');
        result.headers.set('x-content-type-options', 'nosniff');
        result.headers.set('x-game-release', env.RELEASE_ID);
        return result;
      }));
    } catch (error) {
      // Driver errors may contain connection details: emit a fixed diagnostic.
      console.error('cloudflare_game_request_failed', error instanceof Error ? error.name : 'Error');
      return response({ error: 'Kết nối máy chủ tạm gián đoạn. Thao tác chưa xác nhận sẽ được thử lại.' }, 503);
    } finally { await client.close().catch(() => {}); }
  }
}

export default {
  async fetch(request: Request, env: BridgeEnv): Promise<Response> {
    const url = new URL(request.url), path = url.pathname;
    if (path === '/api/health' && request.method === 'GET') return response({ status: env.GAME_ENABLED === 'true' ? 'ready' : 'maintenance',
      gameReady: env.GAME_ENABLED === 'true', release: env.RELEASE_ID, storage: 'mongodb', compute: 'durable-objects', syncSeconds: BATCH_DELAY_MS / 1000 });
    if (path === '/dev' || path.startsWith('/dev/')) return new Response('Not found', { status: 404 });
    if (path !== '/api' && !path.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (env.GAME_ENABLED !== 'true') return response({ error: 'Game đang chuyển máy chủ. Vui lòng quay lại sau ít phút.' }, 503);
    if (url.origin !== env.APP_URL) return response({ error: 'Địa chỉ không hợp lệ.' }, 400);
    if (!authPaths.has(path) && !resolveRoute(path)) return response({ error: 'Không tìm thấy đường dẫn.' }, 404);
    // Browser mutations are same-origin only. Server callbacks authenticate in
    // the shared handler, independently of any browser cookie.
    if (!['GET', 'HEAD'].includes(request.method) && !workerCallback(path)
      && (request.headers.get('origin') !== env.APP_URL || request.headers.get('sec-fetch-site') === 'cross-site'))
      return response({ error: 'Yêu cầu không hợp lệ.' }, 403);
    const raw = request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith('sid='))?.slice(4);
    const claims = sessionClaims(raw, env.AUTH_SECRET);
    // Rejected anonymous traffic never opens Mongo or allocates per-input DOs.
    if (!claims && path === '/api/me') return response({ user: null, friends: [] });
    if (!claims && !authPaths.has(path) && !workerCallback(path)) return response({ error: 'Đăng nhập Google để vào làng.', needsLogin: true, sessionEnded: !!raw }, 401);
    if (workerCallback(path) && request.headers.get('authorization') !== `Bearer ${env.BATTLE_SERVER_SECRET}`) return response({ error: 'Unauthorized' }, 401);
    if (request.body) {
      const reader = request.body.getReader(), chunks: Uint8Array[] = []; let length = 0;
      while (true) {
        const part = await reader.read(); if (part.done) break;
        length += part.value.byteLength;
        if (length > 256 * 1024) { await reader.cancel(); return response({ error: 'Yêu cầu quá lớn.' }, 413); }
        chunks.push(part.value);
      }
      const data = new Uint8Array(length); let at = 0;
      for (const chunk of chunks) { data.set(chunk, at); at += chunk.length; }
      request = new Request(request.url, { method: request.method, headers: request.headers, body: data });
    }
    const shard = workerCallback(path) ? 'system-recovery' : claims ? `account:${claims.uid}` : 'oauth';
    return env.GAME_API.get(env.GAME_API.idFromName(shard)).fetch(request);
  },
};
