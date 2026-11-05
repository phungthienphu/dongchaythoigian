import { canVisit, ENVOY_NAMES, envoysAway, envoyCount, MIN, type City, type EnvoyTrip } from './engine';

export const SCOUT_MS = 2 * MIN;
/** Legacy envoy visits count as prior discoveries, even after their report expires. */
export function knowsNation(c: Pick<City, 'discoveries' | 'visits'>, id: string) {
  return !!c.discoveries?.includes(id) || Object.hasOwn(c.visits ?? {}, id);
}
export function canViewVillage(c: Pick<City, 'visits'>, id: string, friend: boolean, now: number) {
  return friend || canVisit(c as City, id, now);
}
export function beginDiscovery(c: City, now: number): string | null {
  if (!envoyCount(c)) return 'Cần xây Nhà sứ giả trước.';
  if (envoysAway(c) >= envoyCount(c)) return 'Tất cả sứ giả đang đi vắng.';
  const id = (c.trips ?? []).reduce((n,t) => Math.max(n,t.id),0)+1;
  // No hidden target ID, name, coordinate or distance is sent to the browser.
  const trip: EnvoyTrip = { id, target:'', targetName:'Vùng chưa biết', scouting:true, depart:now, arrive:now+SCOUT_MS, back:now+2*SCOUT_MS };
  c.trips = [...(c.trips ?? []),trip];
  c.log = [...c.log,{at:now,msg:`${ENVOY_NAMES[c.era]} lên đường dò tìm nước mới. Có tin sau 2 phút, trở về sau 4 phút.`}].slice(-100);
  return null;
}
/** Village visitors get the village itself, never its owner's world intelligence. */
export function villageView(c: City): City {
  const copy = structuredClone(c);
  delete copy.trips; delete copy.visits; delete copy.discoveries;
  if(copy.battleId) copy.battleId="active";
  delete copy.guardPosts;
  copy.log = [];
  return copy;
}

export type DiscoveryCandidate = { _id: string; name: string; world?: {x:number;y:number} };
/** Call only on the server, with private candidate positions. */
export function completeDiscoveries(c: City, pid: string, origin: {x:number;y:number}, candidates: DiscoveryCandidate[], now: number) {
  const reserved=new Set((c.trips??[]).filter(t=>t.target).map(t=>t.target));
  const distance=(d:DiscoveryCandidate)=>Math.hypot(origin.x-d.world!.x,origin.y-d.world!.y);
  for(const trip of c.trips??[]) {
    if(!trip.scouting||trip.target||trip.arrive>now) continue;
    const target=candidates.filter(d=>d._id!==pid && d.world && !knowsNation(c,d._id) && !reserved.has(d._id))
      .sort((a,b)=>distance(a)-distance(b)||a._id.localeCompare(b._id))[0];
    if(target){trip.target=target._id;trip.targetName=target.name;reserved.add(target._id);}
    else {trip.scouting=false;trip.arrived=true;trip.targetName='chuyến dò tìm';
      c.log=[...c.log,{at:trip.arrive,msg:'Sứ giả chưa tìm thấy nước mới trong chuyến này. Đang trở về.'}].slice(-100);}
  }
}
