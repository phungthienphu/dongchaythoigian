import { NextResponse } from "next/server";
import { playerId, withCity } from "@/lib/city-store";
import { cities } from "@/lib/db";
import { sendEnvoy } from "@/lib/engine";
import { ensureWorldPos, worldDist } from "@/lib/world";

/** Send an envoy to another nation. */
export async function POST(req: Request) {
  const pid = await playerId();
  if (!pid) return NextResponse.json({ error: "Chưa có thành phố." }, { status: 401 });
  const { target } = (await req.json().catch(() => ({}))) as { target?: unknown };
  if (typeof target !== "string" || target === pid) return NextResponse.json({ error: "Nước không hợp lệ." }, { status: 400 });
  const other = await (await cities()).findOne({ _id: target }, { projection: { name: 1, world: 1 } });
  if (!other?.world) return NextResponse.json({ error: "Không tìm thấy nước này." }, { status: 404 });
  const mine = await ensureWorldPos(pid);
  if (!mine) return NextResponse.json({ error: "Chưa có thành phố." }, { status: 401 });
  try {
    const out = await withCity(pid, (c, now) => sendEnvoy(c, target, other.name, worldDist(mine, other.world!), now));
    if (!out) return NextResponse.json({ error: "Chưa có thành phố." }, { status: 401 });
    return NextResponse.json({ error: out.result, state: out.doc.state, serverNow: out.now });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }
}
