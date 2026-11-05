import { NextResponse } from "next/server";
import { finishBattle, workerAuthorized } from "@/lib/war";
export async function POST(req: Request) {
  if (!workerAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body.battleId !== "string" || !body.result) return NextResponse.json({ error: "Invalid result" }, { status: 400 });
  try { await finishBattle(body.battleId, body.result); return NextResponse.json({ ok: true }); }
  catch { return NextResponse.json({ error: "Retry later" }, { status: 409 }); }
}
