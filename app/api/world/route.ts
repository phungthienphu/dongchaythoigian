import { NextResponse } from "next/server";
import { playerId, withCity } from "@/lib/city-store";
import { currentUser } from "@/lib/auth";
import { ensureWorldPos, listNations } from "@/lib/world";

export async function GET() {
  const pid = await playerId();
  if (!pid) return NextResponse.json({ error: "Chưa có thành phố." }, { status: 401 });
  await ensureWorldPos(pid);
  const mine = await withCity(pid, () => null, { readOnlyFallback: true });
  if (!mine) return NextResponse.json({ error: "Chưa có thành phố." }, { status: 401 });
  const me = await currentUser();
  return NextResponse.json({ nations: await listNations(pid, me?.friends ?? [], mine.doc.state), serverNow: Date.now() });
}
