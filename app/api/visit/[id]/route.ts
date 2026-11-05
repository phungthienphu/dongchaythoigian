import { NextResponse } from "next/server";
import { playerId } from "@/lib/city-store";
import { cities, users } from "@/lib/db";
import { canVisit, settle } from "@/lib/engine";

/** Read-only view of another village, allowed while one of your envoys' visits is valid. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const pid = await playerId();
  if (!pid) return NextResponse.json({ error: "Chưa có thành phố." }, { status: 401 });
  const col = await cities();
  const now = Date.now();
  if (id !== pid) {
    const mine = await col.findOne({ _id: pid }, { projection: { "state.visits": 1 } });
    if (!mine || !canVisit(mine.state, id, now)) return NextResponse.json({ error: "Cần cử sứ giả tới nơi trước." }, { status: 403 });
  }
  const doc = await col.findOne({ _id: id });
  if (!doc) return NextResponse.json({ error: "Không tìm thấy nước này." }, { status: 404 });
  const state = doc.state;
  if (!state.battleId) settle(state, now); // bring it up to now for viewing only, never saved here
  const owner = doc.owner ? await (await users()).findOne({ _id: doc.owner }, { projection: { name: 1 } }) : null;
  return NextResponse.json({ id, name: doc.name, ownerName: owner?.name ?? null, state, serverNow: now, ver: doc.ver });
}
