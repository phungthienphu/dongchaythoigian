import * as city from '../../app/api/city/route';
import * as action from '../../app/api/city/action/route';
import * as batch from '../../app/api/city/batch/route';
import * as checkpoint from '../../app/api/city/checkpoint/route';
import * as me from '../../app/api/me/route';
import * as friends from '../../app/api/friends/route';
import * as world from '../../app/api/world/route';
import * as envoy from '../../app/api/world/envoy/route';
import * as visit from '../../app/api/visit/[id]/route';
import * as leaderboard from '../../app/api/leaderboard/route';
import * as diplomacy from '../../app/api/diplomacy/route';
import * as market from '../../app/api/market/route';
import * as battles from '../../app/api/battles/route';
import * as battle from '../../app/api/battles/[id]/route';
import * as start from '../../app/api/battles/[id]/start/route';
import * as result from '../../app/api/battles/result/route';
import * as reconcile from '../../app/api/battles/reconcile/route';

type Handler = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
type Route = { GET?: Handler; POST?: Handler; DELETE?: Handler };
const routes: Record<string, Route> = {
  '/api/city': city, '/api/city/action': action, '/api/city/batch': batch, '/api/city/checkpoint': checkpoint,
  '/api/me': me, '/api/friends': friends, '/api/world': world, '/api/world/envoy': envoy,
  '/api/leaderboard': leaderboard, '/api/diplomacy': diplomacy, '/api/market': market,
  '/api/battles': battles, '/api/battles/result': result, '/api/battles/reconcile': reconcile,
};
export function resolveRoute(path: string): { route: Route; id: string } | null {
  if (routes[path]) return { route: routes[path], id: '' };
  const dynamic = /^\/api\/(visit|battles)\/([^/]+)(\/start)?$/.exec(path);
  if (!dynamic || dynamic[2].length > 200 || (dynamic[1] === 'visit' && dynamic[3])) return null;
  try {
    return { route: dynamic[1] === 'visit' ? visit : dynamic[3] ? start : battle, id: decodeURIComponent(dynamic[2]) };
  } catch { return null; }
}
export async function dispatch(request: Request) {
  const found = resolveRoute(new URL(request.url).pathname);
  if (!found) return Response.json({ error: 'Không tìm thấy đường dẫn.' }, { status: 404 });
  const method = request.method;
  const handler = found.route[method as keyof Route];
  if (!handler) return Response.json({ error: 'Phương thức không hợp lệ.' }, { status: 405, headers: { allow: Object.keys(found.route).filter(key => ['GET', 'POST', 'DELETE'].includes(key)).join(', ') } });
  return handler(request, { params: Promise.resolve({ id: found.id }) });
}
