// MongoDB owns reservations/results; the Durable Object owns live battle ticks.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { ClientSession } from "mongodb";
import { battles, cities, mongoClient, type CityDoc } from "./db";
import { normalizeResources, pruneHomeOrders, RES, UKEYS, W, MARCH_TILES_PER_MIN, MIN, canVisit, derive, stats, score, settle, updateRefuges, troopPower, troopCount, type City, type Troops, type Res } from "./engine";
import { createBattle, type BattleState, type BattleResult } from "./battle";
import { knowsNation } from "./world-discovery";
import { reserveMarchFood, marchLogistics } from "./march-supplies";
import { worldDist } from "./world";
import { battleReport } from "./battle-report";

export type BattleDoc = {
  _id: string; attackerId: string; defenderId: string; attackerName: string; defenderName: string;
  from: { x: number; y: number }; to: { x: number; y: number };
  logisticsVersion?: number; marchSurvivors?: Troops; marchLosses?: number;
  suppliesFood?: number; troops: Troops; depart: number; arrive: number; duration: number; back?: number;
  status: "marching" | "fighting" | "returning" | "completed" | "cancelled";
  createdAt: Date; updatedRecoveryAt?: Date; snapshot?: BattleState; result?: BattleResult; endedAt?: number;
};
export const SHIELD_MS = 6 * 60 * MIN;
export function warConfigured() { return !!process.env.BATTLE_WORKER_URL && (process.env.BATTLE_SERVER_SECRET?.length ?? 0) >= 32; }
const workerOrigin = () => {
  const url = new URL(process.env.BATTLE_WORKER_URL || "http://localhost:8787");
  if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("BATTLE_WORKER_URL cần dùng HTTPS.");
  return url.origin;
};
export async function workerRequest<T = unknown>(path: string, body?: unknown): Promise<T> {
  if (!warConfigured()) throw new Error("Chưa cấu hình máy chủ trận đánh.");
  const res = await fetch(`${workerOrigin()}${path}`, {
    method: body === undefined ? "GET" : "POST", cache: "no-store", signal: AbortSignal.timeout(12_000),
    headers: { authorization: `Bearer ${process.env.BATTLE_SERVER_SECRET}`, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!res.ok) throw new Error("Máy chủ trận đánh chưa sẵn sàng. Thử lại sau.");
  return await res.json() as T;
}
export function workerAuthorized(req: Request) {
  const want = process.env.BATTLE_SERVER_SECRET;
  if (!want || want.length < 32) return false;
  const got = req.headers.get("authorization") ?? "";
  const a = Buffer.from(`Bearer ${want}`), b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function socketUrl(roomId: string, playerId: string, side: "attacker" | "defender") {
  const payload = Buffer.from(JSON.stringify({ roomId, playerId, side, exp: Math.floor(Date.now() / 1000) + 300 })).toString("base64url");
  const sig = createHmac("sha256", process.env.BATTLE_SERVER_SECRET!).update(payload).digest("base64url");
  return `${workerOrigin().replace(/^http/, "ws")}/rooms/${encodeURIComponent(roomId)}/socket?ticket=${payload}.${sig}`;
}
async function notify(w: Pick<BattleDoc, "attackerId" | "defenderId">) {
  await Promise.allSettled([w.attackerId, w.defenderId].map((id) => workerRequest(`/rooms/player-${id}/notify`, { type: "update" })));
}
async function transaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = (await mongoClient()).startSession();
  try { return (await session.withTransaction(() => fn(session)))!; } finally { await session.endSession(); }
}
function cityUpdate(c: City, now: number) {
  return { state: c, score: score(c), era: c.era, pop: c.pop, templeAt: c.templeAt, updatedAt: new Date(now) };
}
function addArmy(a: Troops, b: Troops, sign = 1) {
  for (const u of UKEYS) a[u] = Math.max(0, (a[u] ?? 0) + sign * (b[u] ?? 0));
}
export function validateTroops(input: unknown, available: Troops): Troops {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Chọn quân hợp lệ.");
  const values = input as Record<string, unknown>;
  if (Object.keys(values).some((k) => !UKEYS.includes(k as typeof UKEYS[number]))) throw new Error("Loại quân không hợp lệ.");
  const out: Troops = {};
  for (const u of UKEYS) {
    const n = values[u] ?? 0;
    if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 0 || n > (available[u] ?? 0)) throw new Error("Không đủ quân ở nhà.");
    if (n) out[u] = n;
  }
  if (!troopCount(out) || troopCount(out) > 300) throw new Error("Mỗi đoàn cần từ 1 đến 300 lính.");
  if(!troopPower(out))throw new Error("Cần có chiến binh đi cùng hậu cần và quân y.");
  return out;
}
export function attackRestriction(a: City, d: City, target: string, now: number) {
  if (a.battleId) return "Làng đang có trận đánh, hãy chỉ huy phòng thủ.";
  if (!knowsNation(a,target)) return "Cần sứ giả dò tìm vị trí nước này trước.";
  if (!canVisit(a, target, now)) return "Cần sứ giả thăm nước này trong 3 ngày gần nhất.";
  if (a.era - d.era > 1) return "Không được đánh nước kém mình quá một thời đại.";
  if ((d.shieldUntil ?? 0) > now) return "Nước này đang có khiên bảo vệ.";
  return null;
}
export async function launchAttack(pid: string, target: unknown, input: unknown) {
  if (!warConfigured()) throw new Error("Chưa cấu hình máy chủ trận đánh.");
  if (typeof target !== "string" || target === pid || target.length > 100) throw new Error("Nước không hợp lệ.");
  const col = await cities(), wars = await battles();
  const w = await transaction(async (session) => {
    const a = await col.findOne({ _id: pid }, { session }), d = await col.findOne({ _id: target }, { session });
    if (!a?.owner || !d?.owner) throw new Error("Cả hai nước cần đăng nhập Google để tham gia trận đánh.");
    if (!a?.world || !d?.world) throw new Error("Không tìm thấy vị trí nước này trên bản đồ.");
    const now = Date.now(); settle(a.state, now); if (!d.state.battleId) settle(d.state, now);
    const restriction = attackRestriction(a.state, d.state, target, now);
    if (restriction) throw new Error(restriction);
    if (a.incomingBattleId) throw new Error("Làng đang có quân địch tiến tới, hãy chuẩn bị phòng thủ.");
    if (d.outboundBattleId) throw new Error("Nước này đang xuất chinh, hãy chờ đoàn quân trở về.");
    if (a.outboundBattleId) throw new Error("Đã có một đoàn quân đang xuất chinh.");
    if (d.incomingBattleId || d.state.battleId) throw new Error("Nước này đã có đoàn quân tiến đánh.");
    const troops = validateTroops(input, a.state.army);
    const duration = Math.max(MIN, worldDist(a.world, d.world) / MARCH_TILES_PER_MIN * MIN);
    const suppliesFood = reserveMarchFood(a.state,troops,duration);
    a.state.provisionedSoldiers=(a.state.provisionedSoldiers??0)+troopCount(troops);
    const w: BattleDoc = { _id: crypto.randomUUID(), attackerId: pid, defenderId: target, attackerName: a.name, defenderName: d.name,
      from: a.world, to: d.world, troops, suppliesFood, logisticsVersion:1, depart: now, arrive: now + duration, duration, status: "marching", createdAt: new Date(now) };
    addArmy(a.state.army, troops, -1); pruneHomeOrders(a.state); a.state.deployedArmy ??= {}; addArmy(a.state.deployedArmy, troops);
    a.state.log.unshift({at:now,msg:`Xuất ${troopCount(troops)} lính tới ${d.name}, mang ${suppliesFood} lương thực đủ cho đi và về.`,cls:"good"});
    // Attacking gives up your own protection.
    delete a.state.shieldUntil;
    await col.updateOne({ _id: pid }, { $set: { ...cityUpdate(a.state, now), outboundBattleId: w._id }, $inc: { ver: 1 } }, { session });
    await col.updateOne({ _id: target }, { $set: { incomingBattleId: w._id }, $inc: { ver: 1 } }, { session });
    await wars.insertOne(w, { session });
    return w;
  });
  try { await workerRequest(`/rooms/${w._id}/schedule`, { arrive: w.arrive }); }
  catch (e) { await cancelMarch(w._id); throw e; }
  await notify(w);
  return w;
}
async function cancelMarch(id: string) {
  const col = await cities(), wars = await battles();
  await transaction(async (session) => {
    const w = await wars.findOne({ _id: id, status: "marching" }, { session }); if (!w) return;
    const a = await col.findOne({ _id: w.attackerId }, { session }); if (!a) throw new Error("Không tìm thấy làng.");
    if(!a.state.battleId)settle(a.state,Date.now());
    if(w.suppliesFood!==undefined){
      a.state.provisionedSoldiers=Math.max(0,(a.state.provisionedSoldiers??0)-troopCount(w.troops));
      const cap=stats(a.state,derive(a.state),Date.now()).storage;
      const refund=Math.min(w.suppliesFood,Math.max(0,cap-a.state.res.food));a.state.res.food+=refund;
      a.state.log.unshift({at:Date.now(),msg:`Hủy xuất quân vì máy chủ trận chưa sẵn sàng; quân đã về, hoàn ${refund} lương thực vào kho.`,cls:"warn"});
    }
    addArmy(a.state.army, w.troops); addArmy(a.state.deployedArmy ??= {}, w.troops, -1);
    await col.updateOne({ _id: a._id }, { $set: cityUpdate(a.state, Date.now()), $unset: { outboundBattleId: "" }, $inc: { ver: 1 } }, { session });
    await col.updateOne({ _id: w.defenderId, incomingBattleId: id }, { $unset: { incomingBattleId: "" }, $inc: { ver: 1 } }, { session });
    await wars.updateOne({ _id: id }, { $set: { status: "cancelled" } }, { session });
  });
}
export async function startBattle(id: string) {
  if (id.endsWith("-return")) return returnArmy(id.slice(0, -7));
  const col = await cities(), wars = await battles();
  const w = await transaction(async (session) => {
    const w = await wars.findOne({ _id: id }, { session });
    if (!w || w.status === "cancelled" || w.status === "completed" || w.status === "returning") return w;
    if (w.status === "fighting") return w;
    const now = Date.now(); if (now < w.arrive) throw new Error("Đoàn quân chưa tới nơi.");
    const a = await col.findOne({ _id: w.attackerId }, { session }), d = await col.findOne({ _id: w.defenderId }, { session });
    if (!a || !d || d.incomingBattleId !== id || d.state.battleId) throw new Error("Làng đang bận.");
    settle(d.state, now);
    const march=w.logisticsVersion ? marchLogistics(w.troops,w.duration) : null;
    if(march){w.marchSurvivors=march.survivors;w.marchLosses=march.losses;}
    if(march?.losses){
      if(!a.state.battleId)settle(a.state,now);
      a.state.log.unshift({at:now,msg:`Đoàn tới ${w.defenderName}: hao ${march.losses} chiến binh do đường xa. Bổ sung vận tải và quân y cho chuyến sau.`,cls:"warn"});
      await col.updateOne({_id:a._id},{$set:cityUpdate(a.state,now),$inc:{ver:1}},{session});
    }
    // A shield or an era change since departure must be checked at arrival too.
    if ((d.state.shieldUntil ?? 0) > now || a.state.era - d.state.era > 1) {
      w.status = "returning"; w.back = now + w.duration;
      await col.updateOne({ _id: d._id }, { $unset: { incomingBattleId: "" }, $inc: { ver: 1 } }, { session });
      await wars.updateOne({ _id: id }, { $set: { status: w.status, back: w.back, ...(march?{marchSurvivors:march.survivors,marchLosses:march.losses}:{}) } }, { session });
      return w;
    }
    d.state.battleId = id;
    updateRefuges(d.state,now);
    const snapshot = createBattle({ id, attackerId: a._id, defenderId: d._id, attacker: a.state, defender: d.state, troops: w.marchSurvivors??w.troops, now, defenderOnline: false });
    d.state.battleId = id;
    await col.updateOne({ _id: d._id }, { $set: cityUpdate(d.state, now), $inc: { ver: 1 } }, { session });
    await wars.updateOne({ _id: id }, { $set: { status: "fighting", snapshot, ...(march?{marchSurvivors:march.survivors,marchLosses:march.losses}:{}) } }, { session });
    return { ...w, status: "fighting" as const, snapshot };
  });
  if (w?.status === "fighting" && w.snapshot) await workerRequest(`/rooms/${id}`, { battle: w.snapshot });
  if (w?.status === "returning") await workerRequest(`/rooms/${id}-return/schedule`, { arrive: w.back });
  if (w) await notify(w);
  return w;
}
export async function finishBattle(id: string, result: BattleResult) {
  const col = await cities(), wars = await battles();
  const w = await transaction(async (session) => {
    const w = await wars.findOne({ _id: id }, { session }); if (!w || w.status !== "fighting") return w;
    const d = await col.findOne({ _id: w.defenderId }, { session });
    if (!d || d.state.battleId !== id || !w.snapshot) throw new Error("Trạng thái trận đánh không khớp.");
    validateResult(w, d.state, result);
    const now = Date.now(), c = d.state; normalizeResources(c);
    for (const tile of result.burnedTiles) if (c.b[tile]) { c.b[tile].burned = true; c.b[tile].doneAt = null; }
    c.army = result.defenderSurvivors;
    // The simulation chooses the losses, bounded again at the persistence boundary.
    const lost = Math.min(Math.floor(c.people.length / 2), Math.max(0, Math.floor(result.populationLoss)));
    c.people.splice(Math.max(0, c.people.length - lost), lost); c.pop = c.people.length;
    for (const r of RES) c.res[r] = Math.max(0, c.res[r] - (result.loot[r] ?? 0));
    delete c.battleId; c.shieldUntil = now + SHIELD_MS;
    // Pause hauling clocks during the combat freeze, preserving carried cargo.
    const frozenFor = Math.max(0, now - c.last);
    for (const person of c.people) if (person.haul && !person.refuge) {
      person.haul.at += frozenFor; person.haul.nextAt += frozenFor; person.haul.routeStart += frozenFor;
    }
    updateRefuges(c,now);
    c.haulAt = now;
    c.last = now; // battle simulation owns the frozen interval
    c.log.unshift({ at: now, msg: battleReport(result,"defender",w.attackerName)+" Khiên bảo vệ có hiệu lực trong 6 giờ.", cls: result.winner === "attacker" ? "warn" : "good" });
    await col.updateOne({ _id: d._id }, { $set: cityUpdate(c, now), $unset: { incomingBattleId: "" }, $inc: { ver: 1 } }, { session });
    const a=await col.findOne({_id:w.attackerId},{session});
    if(a){
      normalizeResources(a.state);
      a.state.log.unshift({at:now,msg:battleReport(result,"attacker",w.defenderName),cls:result.winner==='attacker'?'good':'warn'});
      await col.updateOne({_id:a._id},{$set:cityUpdate(a.state,now),$inc:{ver:1}},{session});
    }
    const back = now + w.duration;
    await wars.updateOne({ _id: id }, { $set: { status: "returning", result, endedAt: now, back }, $unset: { snapshot: "" } }, { session });
    return { ...w, status: "returning" as const, result, back };
  });
  if (w?.status === "returning") await workerRequest(`/rooms/${id}-return/schedule`, { arrive: w.back });
  if (w) await notify(w);
  return w;
}
function validateResult(w: BattleDoc, defender: City, r: BattleResult) {
  if (!r || !["attacker", "defender"].includes(r.winner) || !Array.isArray(r.burnedTiles)) throw new Error("Kết quả không hợp lệ.");
  for (const [survivors, baseline] of [[r.attackerSurvivors, w.marchSurvivors??w.troops], [r.defenderSurvivors, defender.army]] as [Troops, Troops][]) {
    if (!survivors || Object.keys(survivors).some((key) => !UKEYS.includes(key as typeof UKEYS[number]))) throw new Error("Quân sống sót không hợp lệ.");
    for (const u of UKEYS) if (!Number.isInteger(survivors[u] ?? 0) || (survivors[u] ?? 0) < 0 || (survivors[u] ?? 0) > (baseline[u] ?? 0)) throw new Error("Quân sống sót không hợp lệ.");
  }
  if (!Number.isInteger(r.populationLoss) || r.populationLoss < 0 || r.populationLoss > Math.floor(defender.people.length / 2) || !r.loot) throw new Error("Thiệt hại không hợp lệ.");
  for (const k of RES) if (!Number.isFinite(r.loot[k] ?? 0) || (r.loot[k] ?? 0) < 0 || (r.loot[k] ?? 0) > defender.res[k] * 0.25 + 0.001) throw new Error("Chiến lợi phẩm vượt giới hạn.");
  if (r.burnedTiles.some((tile) => !Number.isInteger(tile) || tile < 0 || tile >= W * W || !defender.b[tile])) throw new Error("Công trình không hợp lệ.");
}
export async function returnArmy(id: string) {
  const col = await cities(), wars = await battles();
  const w = await transaction(async (session) => {
    const w = await wars.findOne({ _id: id, status: "returning" }, { session }); if (!w) return null;
    const now = Date.now(); if (now < (w.back ?? Infinity)) throw new Error("Đoàn quân chưa về tới làng.");
    const a = await col.findOne({ _id: w.attackerId }, { session }); if (!a) throw new Error("Không tìm thấy làng.");
    const c = a.state; normalizeResources(c);
    if (!c.battleId) settle(c, now);
    if(w.suppliesFood!==undefined)c.provisionedSoldiers=Math.max(0,(c.provisionedSoldiers??0)-troopCount(w.troops));
    addArmy(c.army, w.result?.attackerSurvivors ?? w.marchSurvivors ?? w.troops); addArmy(c.deployedArmy ??= {}, w.troops, -1);
    const cap = stats(c, derive(c), now).storage;
    for (const k of RES) c.res[k] = Math.min(cap, c.res[k] + (w.result?.loot[k] ?? 0));
    c.log.unshift({ at: now, msg: `Đoàn quân từ ${w.defenderName} đã trở về.`, cls: "good" });
    await col.updateOne({ _id: a._id }, { $set: cityUpdate(c, now), $unset: { outboundBattleId: "" }, $inc: { ver: 1 } }, { session });
    await wars.updateOne({ _id: id }, { $set: { status: "completed" } }, { session });
    return { ...w, status: "completed" as const };
  });
  if (w) await notify(w);
  return w;
}
