import { sessionClaims } from './auth';
import type { VillageRepository } from './auth-repository';
import { BATCH_BYTES, validBatch } from '../../lib/city-sync';
import { boundedJSON, InputError, json, villageRequest, type VillageEnv } from './runtime';

export async function cityRoute(request: Request, env: VillageEnv & { APP_URL: string; AUTH_SECRET: string }, repo: VillageRepository) {
  const path = new URL(request.url).pathname;
  try {
    if (new URL(request.url).origin !== env.APP_URL) return json({ error: 'Địa chỉ máy chủ không hợp lệ.' }, 403);
    if (request.method !== 'GET' && (request.headers.get('origin') !== env.APP_URL || request.headers.get('sec-fetch-site') === 'cross-site'))
      return json({ error: 'Yêu cầu không hợp lệ.' }, 403);
    const sid = request.headers.get('cookie')?.split(';').map(p => p.trim()).find(p => p.startsWith('sid='))?.slice(4);
    const claims = sessionClaims(sid, env.AUTH_SECRET);
    const user = claims ? await repo.findUser(claims.uid, claims.sessionVersion) : null;
    if (!user) return json({ error: 'Đăng nhập Google để vào làng.', needsLogin: true, sessionEnded: !!sid }, 401);
    let r = repo.registration(user);
    if (path === '/api/city' && request.method === 'POST') {
      const body = await boundedJSON(request, 2048) as { name?: unknown };
      const name = typeof body?.name === 'string' ? body.name.trim() : '';
      if (name.length < 2 || name.length > 24) throw new InputError('Tên làng cần từ 2 đến 24 ký tự.', 400);
      r = await repo.reserveVillage(user._id, claims!.sessionVersion, name);
      if (!r) throw new InputError('Phiên chơi hoặc quyền sở hữu làng đã thay đổi.', 409);
      return villageRequest(env, r, claims!.sessionVersion, 'create', r);
    }
    if (!r) {
      if (user.cityId) throw new InputError('Làng chưa được chuyển sang backend mới.', 503, 'OWNERSHIP_NOT_READY');
      return json({ needsName: true }, 404);
    }
    if (path === '/api/city' && request.method === 'GET') {
      // Retry-safe provisioning after a lost creation response or storage error.
      const response = await villageRequest(env, r, claims!.sessionVersion, 'read');
      return response.status === 404 ? villageRequest(env, r, claims!.sessionVersion, 'create', r) : response;
    }
    if (path === '/api/city/checkpoint' && request.method === 'POST') return villageRequest(env, r, claims!.sessionVersion, 'checkpoint');
    if (path === '/api/city/batch' && request.method === 'POST') {
      const batch = await boundedJSON(request, BATCH_BYTES);
      if (!validBatch(batch)) throw new InputError('Lệnh đồng bộ không hợp lệ.', 400);
      if (batch.session !== claims!.sessionVersion) throw new InputError('Phiên chơi này đã được thay thế.', 401);
      return villageRequest(env, r, claims!.sessionVersion, 'batch', batch);
    }
    return json({ error: 'Phương thức không được hỗ trợ.' }, 405);
  } catch (error) {
    if (error instanceof InputError) return json({ error: error.message, code: error.code }, error.status);
    return json({ error: 'Máy chủ làng tạm gián đoạn. Tiến trình đã lưu được giữ nguyên.' }, 503);
  }
}
