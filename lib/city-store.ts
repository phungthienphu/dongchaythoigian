import { cookies } from "next/headers";
import { cities, type CityDoc } from "./db";
import { score, settle, type City } from "./engine";

export const PID_COOKIE = "pid";

export async function playerId() {
  return (await cookies()).get(PID_COOKIE)?.value ?? null;
}

/**
 * Load the player's city, let `mutate` change it (after settling to now), and save it back.
 * Uses the `ver` field for optimistic locking so two tabs can't overwrite each other.
 */
export async function withCity<T>(pid: string, mutate: (c: City, now: number) => T) {
  const col = await cities();
  for (let attempt = 0; attempt < 3; attempt++) {
    const doc = await col.findOne({ _id: pid });
    if (!doc) return null;
    const now = Date.now();
    const c = doc.state;
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
  }
  throw new Error("Thành phố đang được cập nhật ở nơi khác, thử lại.");
}
