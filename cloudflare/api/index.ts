import { authRoute, type AuthEnv } from './auth';
import { withAuthRepository, type AuthDatabaseEnv } from './auth-repository';

export interface WebEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
  RELEASE_ID: string;
  AUTH_ENABLED?: string;
  APP_URL?: string;
  AUTH_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  MONGODB_QA_URI?: string;
  AUTH_DATABASE?: string;
}

const unavailable = {
  error: 'Game đang được chuyển sang máy chủ mới. Anh/chị vui lòng quay lại sau.',
  code: 'MIGRATION_NOT_READY',
};

/** This bootstrap never reads production data or accepts game commands. */
export default {
  async fetch(request: Request, env: WebEnv): Promise<Response> {
    const { pathname } = new URL(request.url);
    const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
    if (pathname === '/api/health' && request.method === 'GET') {
      return Response.json({ status: 'preparing', release: env.RELEASE_ID, gameReady: false }, { headers });
    }
    if (env.AUTH_ENABLED === 'true' && ['/api/me', '/api/auth/login', '/api/auth/callback/google', '/api/auth/logout'].includes(pathname)) {
      const auth: AuthEnv & AuthDatabaseEnv = {
        APP_URL: env.APP_URL ?? '', AUTH_SECRET: env.AUTH_SECRET ?? '',
        GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID ?? '', GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET ?? '',
        MONGODB_QA_URI: env.MONGODB_QA_URI ?? '', AUTH_DATABASE: env.AUTH_DATABASE ?? '',
      };
      try { return await withAuthRepository(auth, repo => authRoute(request, auth, repo)); }
      catch { return Response.json({ error: 'Đăng nhập tạm gián đoạn. Vui lòng thử lại.' }, { status: 503, headers }); }
    }
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      return Response.json(unavailable, { status: 503, headers: { ...headers, 'retry-after': '300' } });
    }
    if (pathname === '/dev' || pathname.startsWith('/dev/')) {
      return new Response('Not found', { status: 404, headers });
    }
    return env.ASSETS.fetch(request);
  },
};
