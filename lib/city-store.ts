import { cookies } from "next/headers";
import { cities, type CityDoc } from "./db";
import { ENGINE_VER, newCity, score, settle, type City } from "./engine";

export const PID_COOKIE = "pid";

export async function playerId() {
  return (await cookies()).get(PID_COOKIE)?.value ?? null;
}

/**
 * Load the player's city, let `mutate` change it (after settling to now), and save it back.
 * Uses the `ver` field for optimistic locking so two tabs can't overwrite each other.
 */
export async function withCity<T>(pid: string, mutate: (c: City, now: number) => T, opts: { readOnlyFallback?: boolean } = {}) {
  const col = await cities();
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 30 + Math.random() * 70));
    const doc = await col.findOne({ _id: pid });
    if (!doc) return null;
    const now = Date.now();
    // cities from an older engine are replaced by a fresh world (prototype stage, no migration)
    const c = doc.state.ver === ENGINE_VER ? doc.state : newCity(now);
    settle(c, now);
    const result = mutate(c, now);
    const res = await col.updateOne(
      { _id: pid, ver: doc.ver },
      {
        $set: { state: c, score: score(c), era: c.era, pop: c.pop, templeAt: c.templeAt, updatedAt: new Date(now) },
        $inc: { ver: 1 },
      },
    );
    if (res.modifiedCount === 1) return { doc: { ...doc, state: c } as CityDoc, result, now };
    // a plain load lost the race to another save: show the settled state without saving it
    if (opts.readOnlyFallback && attempt === 4) return { doc: { ...doc, state: c } as CityDoc, result, now };
  }
  throw new Error("Thành phố đang được cập nhật ở nơi khác, thử lại.");
}
