import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { cities, users } from "@/lib/db";

const ONLINE_MS = 3 * 60_000;

/** Signed-in user, their invite code and friends (with a short city summary). Also marks them as online. */
export async function GET() {
  const me = await currentUser();
  if (!me) return NextResponse.json({ user: null, friends: [] });
  const now = Date.now();
  const ucol = await users();
  await ucol.updateOne({ _id: me._id }, { $set: { lastSeen: new Date(now) } });
  const fr = await ucol.find({ _id: { $in: me.friends } }, { projection: { name: 1, picture: 1, cityId: 1, lastSeen: 1 } }).toArray();
  const cs = await (await cities()).find({ _id: { $in: fr.map((f) => f.cityId).filter((x): x is string => !!x) } }, { projection: { name: 1, era: 1, pop: 1, score: 1 } }).toArray();
  const byId = new Map(cs.map((c) => [c._id, c]));
  return NextResponse.json({
    user: { id: me._id, name: me.name, picture: me.picture, email: me.email, friendCode: me.friendCode, hasCity: !!me.cityId },
    friends: fr.map((f) => {
      const c = f.cityId ? byId.get(f.cityId) : undefined;
      return {
        id: f._id, name: f.name, picture: f.picture, online: now - new Date(f.lastSeen).getTime() < ONLINE_MS,
        city: c ? { name: c.name, era: c.era, pop: c.pop, score: c.score } : null,
      };
    }),
  });
}
