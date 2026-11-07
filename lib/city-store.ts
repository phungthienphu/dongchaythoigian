import { cookies } from "next/headers";
import { cities, type CityDoc } from "./db";
import { SESSION_COOKIE, readSession, currentUser } from "./auth";
import { ENGINE_VER, score, settle, enrichCopperDeposits, enrichPreciousDeposits, normalizeResources, type City } from "./engine";

import { registerEnvoyVisits } from "./diplomacy";
import { resolveDiscoveries } from "./world";
import type { CommandMetrics } from "./command-metrics";
import { ownerSnapshots } from './village-snapshot';

export const PID_COOKIE = "pid";
export class UnsupportedCityVersionError extends Error {
  constructor() { super("Làng đang dùng phiên bản dữ liệu khác. Tiến trình được giữ nguyên; hãy thử lại sau khi máy chủ cập nhật xong."); }
}

/** Playing requires a signed session and independently verified city ownership.
 * The legacy pid cookie is retained only for first-login adoption in the OAuth callback.
 */
export async function playerId() {
  const user = await currentUser();
  if (!user?.cityId) return null;
  const owned = await (await cities()).findOne({ _id: user.cityId, owner: user._id }, { projection: { _id: 1 } });
  return owned?._id ?? null;
}

/** PvP requires a signed Google session and independently verified city ownership. */
export async function battlePlayerId(): Promise<string | null> {
  const user = await currentUser();
  if (!user?.cityId) return null;
  const owned = await (await cities()).findOne({ _id: user.cityId, owner: user._id }, { projection: { _id: 1 } });
  return owned?._id ?? null;
}

/**
 * Load the player's city, let `mutate` change it (after settling to now), and save it back.
 * Uses the `ver` field for optimistic locking so two tabs can't overwrite each other.
 */
export async function withCity<T>(pid: string, mutate: (c: City, now: number) => T, opts: { readOnlyFallback?: boolean; requestId?: string; metrics?: CommandMetrics } = {}) {
  const col = await cities();
  const uid = readSession((await cookies()).get(SESSION_COOKIE)?.value);
  for (let attempt = 0; attempt < 5; attempt++) {
    if (opts.metrics) opts.metrics.attempts++;
    if (attempt) await new Promise((r) => setTimeout(r, 30 + Math.random() * 70));
    const doc = await col.findOne({ _id: pid });
    if (!doc || (doc.owner && doc.owner !== uid)) return null;
    if (doc.state.ver !== ENGINE_VER) throw new UnsupportedCityVersionError();
    const now = Date.now();
    const receipt = opts.requestId && doc.actionReceipts?.find((r) => r.id === opts.requestId);
    if (receipt) {
      if (opts.metrics) opts.metrics.replayed = true;
      return { doc, result: receipt.result as T, now };
    }
    normalizeResources(doc.state);
    // Most reads need only a deterministic projection. Persist only the rare
    // bootstrap/discovery work which has side effects outside the village.
    const s=doc.state;
    const needsCheckpoint=s.upkeepStartsAt===undefined || s.wheelFuelStartsAt===undefined || s.gatherFoodStartsAt===undefined
      || !s.copperDepositsVersion || !s.preciousDepositsVersion
      || (s.era>=4&&!s.medieval) || (s.era>=5&&!s.industry) || (s.era>=6&&!s.modern)
      || (s.trips??[]).some(t=>t.scouting&&!t.target&&t.arrive<=now);
    if(opts.readOnlyFallback && !needsCheckpoint) {
      if(doc.envoyOutbox?.length) {
        try {
          await registerEnvoyVisits(pid,doc.name,doc.envoyOutbox.map(entry=>entry.trip));
          await col.updateOne({_id:pid},{$pull:{envoyOutbox:{key:{$in:doc.envoyOutbox.map(entry=>entry.key)}}}});
        } catch { /* Keep the durable outbox for the next request. */ }
      }
      return {doc:{...doc,state:ownerSnapshots.checkpoint(doc,now)},result:null as T,now};
    }
    if (doc.state.battleId) {
      if (opts.readOnlyFallback) return { doc, result: null as T, now };
      throw new Error("Làng đang trong trận đánh. Hãy dùng bảng chỉ huy trận.");
    }
    // Version changes require an explicit migration; never replace a saved village.
    const c = doc.state;
    await resolveDiscoveries(pid, c, now);
    const arrivals = structuredClone(c.trips ?? []);
    if (opts.metrics) {
      const started = performance.now();
      try { settle(c, now); }
      finally { opts.metrics.settleMs += performance.now() - started; }
    } else settle(c, now);
    const addedOre=enrichCopperDeposits(c);
    if(addedOre)c.log.unshift({at:now,msg:`Bổ sung ${addedOre} mỏ đồng trên các đồi đá chưa khai thác. Mỗi mỏ đồng còn hoạt động có trữ lượng tối đa 1.200; hãy khám phá thêm quanh làng.`,cls:"good"});
    const precious=enrichPreciousDeposits(c);
    if(precious)c.log.unshift({at:now,msg:`Phát hiện thêm ${precious} mỏ vàng và kim cương trên các đồi chưa khai thác. Vàng mở ở đời đồng; kim cương mở ở đời sắt.`,cls:"good"});
    const started = opts.metrics ? performance.now() : 0;
    let result: T;
    try { result = mutate(c, now); }
    finally { if (opts.metrics) opts.metrics.commandMs += performance.now() - started; }
    const envoyOutbox=[...new Map([...(doc.envoyOutbox??[]),...[...arrivals,...(c.trips??[])].filter(tr=>tr.target).map(({id,depart,target,targetName,arrive})=>({key:`${pid}:${depart}:${id}`,trip:{id,depart,target,targetName,arrive}}))].filter(entry=>entry.trip.arrive+7*24*60*60_000>now).map(entry=>[entry.key,entry])).values()];
    const res = await col.updateOne(
      { _id: pid, ver: doc.ver },
      {
        $set: { envoyOutbox, state: c, score: score(c), era: c.era, pop: c.pop, templeAt: c.templeAt, updatedAt: new Date(now), ...(opts.requestId ? { actionReceipts: [...(doc.actionReceipts ?? []).slice(-63), { id: opts.requestId, result }] } : {}) },
        $inc: { ver: 1 },
      },
    );
    if (res.modifiedCount === 1) {
      try {
        await registerEnvoyVisits(pid,doc.name,envoyOutbox.map(entry=>entry.trip));
        if(envoyOutbox.length)await col.updateOne({_id:pid},{$pull:{envoyOutbox:{key:{$in:envoyOutbox.map(entry=>entry.key)}}}});
      } catch { /* Durable outbox retries on the next successful city load. */ }
      return { doc: { ...doc, state: c, ver:doc.ver+1 } as CityDoc, result, now };
    }
    // a plain load lost the race to another save: show the settled state without saving it
    if (opts.readOnlyFallback && attempt === 4) return { doc: { ...doc, state: c } as CityDoc, result, now };
  }
  throw new Error("Thành phố đang được cập nhật ở nơi khác, thử lại.");
}
