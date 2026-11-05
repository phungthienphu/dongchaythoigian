import { NextResponse } from "next/server";
import { startBattle, workerAuthorized } from "@/lib/war";
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!workerAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { await startBattle((await ctx.params).id); return NextResponse.json({ ok: true }); }
  catch { return NextResponse.json({ error: "Retry later" }, { status: 409 }); }
}
