import { NextResponse } from "next/server";
import { applyAction } from "@/lib/engine";
import { isActionInput } from "@/lib/action-input";
import { playerId, withCity } from "@/lib/city-store";

export async function POST(req: Request) {
  const pid = await playerId();
  if (!pid) return NextResponse.json({ error: "Chưa có thành phố." }, { status: 401 });
  const action: unknown = await req.json().catch(() => null);
  if (!isActionInput(action)) return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
  const requestId = req.headers.get("x-action-id") ?? undefined;
  if (requestId && !/^[a-zA-Z0-9_-]{1,100}$/.test(requestId)) return NextResponse.json({ error: "Mã yêu cầu không hợp lệ." }, { status: 400 });
  try {
    const out = await withCity(pid, (c, now) => applyAction(c, action, now), { requestId });
    if (!out) return NextResponse.json({ error: "Chưa có thành phố." }, { status: 401 });
    return NextResponse.json({ error: out.result, state: out.doc.state, serverNow: out.now });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }
}
