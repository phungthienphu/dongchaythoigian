import { NextResponse } from "next/server";
import { playerId } from "@/lib/city-store";
import { currentUser } from "@/lib/auth";
import { ensureWorldPos, listNations } from "@/lib/world";

export async function GET() {
  const pid = await playerId();
  if (!pid) return NextResponse.json({ error: "Chưa có thành phố." }, { status: 401 });
  await ensureWorldPos(pid);
  const me = await currentUser();
  return NextResponse.json({ nations: await listNations(pid, me?.friends ?? []), serverNow: Date.now() });
}
