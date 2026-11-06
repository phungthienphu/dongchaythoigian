import { NextResponse } from "next/server";
import { playerId } from "@/lib/city-store";
import { cities, users } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { canViewVillage } from "@/lib/world-discovery";
import { villageSnapshots } from "@/lib/village-snapshot";

/** Read-only view of another village, allowed while one of your envoys' visits is valid. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const pid = await playerId();
  if (!pid) return NextResponse.json({ error: "Chưa có thành phố." }, { status: 401 });
  const col = await cities();
  const now = Date.now();
  const doc = await col.findOne({ _id: id });
  const me = await currentUser();
  if (id !== pid) {
    const mine = await col.findOne({ _id: pid }, { projection: { "state.visits": 1 } });
    if (!mine || !canViewVillage(mine.state, id, !!doc?.owner && !!me?.friends.includes(doc.owner), now)) return NextResponse.json({ error: "Chỉ được xem làng bạn bè hoặc nước có tin sứ giả còn hiệu lực." }, { status: 403 });
  }
  if (!doc) return NextResponse.json({ error: "Không tìm thấy nước này." }, { status: 404 });
  const owner = doc.owner ? await (await users()).findOne({ _id: doc.owner }, { projection: { name: 1 } }) : null;
  return NextResponse.json({ id, name: doc.name, ownerName: owner?.name ?? null, state: villageSnapshots.view(doc, now), serverNow: now, ver: doc.ver });
}
