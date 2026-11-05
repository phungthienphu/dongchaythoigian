import { cities, users, type CityDoc } from "./db";
import { WORLD, type City } from "./engine";
import { completeDiscoveries, knowsNation } from "./world-discovery";

const MIN_GAP = 6; // cells between nations

export const worldDist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.round(Math.hypot(a.x - b.x, a.y - b.y));

/** Give a city a spot on the world map: near a friend if it has one, else anywhere with room. */
export async function ensureWorldPos(pid: string): Promise<{ x: number; y: number } | null> {
  const col = await cities();
  const me = await col.findOne({ _id: pid }, { projection: { world: 1, owner: 1 } });
  if (!me) return null;
  if (me.world) return me.world;
  const taken = (await col.find({ world: { $exists: true } }, { projection: { world: 1 } }).toArray()).map((d) => d.world!);
  const free = (p: { x: number; y: number }) => p.x >= 2 && p.y >= 2 && p.x < WORLD - 2 && p.y < WORLD - 2 && taken.every((t) => worldDist(t, p) >= MIN_GAP);

  let anchors: { x: number; y: number }[] = [];
  if (me.owner) {
    const u = await (await users()).findOne({ _id: me.owner }, { projection: { friends: 1 } });
    if (u?.friends.length) {
      const fs = await (await users()).find({ _id: { $in: u.friends } }, { projection: { cityId: 1 } }).toArray();
      const ids = fs.map((f) => f.cityId).filter((x): x is string => !!x);
      anchors = (await col.find({ _id: { $in: ids }, world: { $exists: true } }, { projection: { world: 1 } }).toArray()).map((d) => d.world!);
    }
  }
  let pos: { x: number; y: number } | null = null;
  for (let k = 0; k < 400 && !pos; k++) {
    const a = anchors.length ? anchors[k % anchors.length] : null;
    const p = a
      ? { x: Math.round(a.x + Math.cos(k) * (MIN_GAP + (k % 7))), y: Math.round(a.y + Math.sin(k) * (MIN_GAP + (k % 7))) }
      : { x: 10 + Math.floor(Math.random() * (WORLD - 20)), y: 10 + Math.floor(Math.random() * (WORLD - 20)) };
    if (free(p)) pos = p;
  }
  pos ??= { x: Math.floor(Math.random() * WORLD), y: Math.floor(Math.random() * WORLD) };
  // only set it if no concurrent request did first
  await col.updateOne({ _id: pid, world: { $exists: false } }, { $set: { world: pos } });
  return (await col.findOne({ _id: pid }, { projection: { world: 1 } }))?.world ?? pos;
}

export type Nation = { id: string; name: string; era: number; pop: number; score: number; x: number; y: number; me: boolean; friend: boolean; ownerName?: string; ownerPic?: string; shieldUntil?: number; registered?: boolean };

export async function listNations(pid: string, friendIds: string[], state: City): Promise<Nation[]> {
  // Only known cities can be placed/listed here. Unseen targets are resolved privately.
  const ids=[...new Set([pid,...(state.discoveries??[]),...Object.keys(state.visits??{})])];
  const unplaced = await (await cities()).find({ _id: { $in: ids }, world: { $exists: false } }, { projection: { _id: 1 } }).toArray();
  for (const city of unplaced) await ensureWorldPos(city._id);
  const docs = await (await cities()).find({ _id: { $in: ids }, world: { $exists: true } }, { projection: { name: 1, era: 1, pop: 1, score: 1, world: 1, owner: 1, "state.shieldUntil": 1 } }).toArray() as Pick<CityDoc, "_id" | "name" | "era" | "pop" | "score" | "world" | "owner" | "state">[];
  const owners = await (await users()).find({ _id: { $in: docs.map((d) => d.owner).filter((x): x is string => !!x) } }, { projection: { name: 1, picture: 1 } }).toArray();
  const om = new Map(owners.map((o) => [o._id, o]));
  return docs.map((d) => ({
    id: d._id, name: d.name, era: d.era, pop: d.pop, score: d.score, x: d.world!.x, y: d.world!.y,
    registered: !!d.owner, shieldUntil: d.state?.shieldUntil, me: d._id === pid, friend: !!d.owner && friendIds.includes(d.owner),
    ownerName: d.owner ? om.get(d.owner)?.name : undefined, ownerPic: d.owner ? om.get(d.owner)?.picture : undefined,
  }));
}

/** Resolve due explorations before settling; destinations exist only on the server until arrival. */
export async function resolveDiscoveries(pid: string, c: City, now: number) {
  const due = (c.trips ?? []).filter(t => t.scouting && !t.target && t.arrive <= now);
  if (!due.length) return;
  const own = await ensureWorldPos(pid); if (!own) return;
  const candidates = await (await cities()).find({ _id: { $ne: pid } }, { projection: { _id:1, name:1, world:1 } }).toArray();
  for (const d of candidates) if (!knowsNation(c,d._id) && !d.world) d.world=await ensureWorldPos(d._id) ?? undefined;
  completeDiscoveries(c,pid,own,candidates,now);
}
