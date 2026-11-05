import { NextResponse } from "next/server";
import { applyAction, type Action } from "@/lib/engine";
import { playerId, withCity } from "@/lib/city-store";

export async function POST(req: Request) {
  const pid = await playerId();
  if (!pid) return NextResponse.json({ error: "Chưa có thành phố." }, { status: 401 });
  const action = (await req.json().catch(() => null)) as Action | null;
  if (!action || typeof action !== "object") return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
  try {
    const out = await withCity(pid, (c, now) => applyAction(c, action, now));
    if (!out) return NextResponse.json({ error: "Chưa có thành phố." }, { status: 401 });
    return NextResponse.json({ error: out.result, state: out.doc.state, serverNow: out.now });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }
}
