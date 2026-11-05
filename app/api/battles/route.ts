import { NextResponse } from "next/server";
import { battlePlayerId } from "@/lib/city-store";
import { warView } from "@/lib/war-view";
import { battles, cities } from "@/lib/db";
import { launchAttack, socketUrl, warConfigured, returnArmy, startBattle } from "@/lib/war";

export async function GET() {
  const pid = await battlePlayerId();
  if (!pid) return NextResponse.json({ error: "Cần đăng nhập Google và sở hữu thành phố để tham chiến." }, { status: 401 });
  const col = await battles();
  let rows = await col.find({ $or: [{ attackerId: pid }, { defenderId: pid }], status: { $ne: "cancelled" } }).sort({ createdAt: -1 }).limit(20).toArray();
  // Recovery if an alarm callback was interrupted; no combat ticks run on Vercel.
  if (warConfigured()) {
    await Promise.allSettled(rows.filter((r) => r.status === "marching" && r.arrive <= Date.now() || r.status === "returning" && (r.back ?? Infinity) <= Date.now()).map((r) => r.status === "marching" ? startBattle(r._id) : returnArmy(r._id)));
    rows = await col.find({ $or: [{ attackerId: pid }, { defenderId: pid }], status: { $ne: "cancelled" } }).sort({ createdAt: -1 }).limit(20).toArray();
  }
  const mine=await (await cities()).findOne({_id:pid},{projection:{state:1}});
  if(!mine) return NextResponse.json({error:"Chưa có thành phố."},{status:401});
  return NextResponse.json({ enabled: warConfigured(), playerId: pid, socket: warConfigured() ? socketUrl(`player-${pid}`, pid, "defender") : null,
    battles: rows.map((r) => ({ ...warView(r,pid,mine.state), side: r.attackerId === pid ? "attacker" : "defender" })) });
}
export async function POST(req: Request) {
  const pid = await battlePlayerId();
  if (!pid) return NextResponse.json({ error: "Cần đăng nhập Google và sở hữu thành phố để tham chiến." }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
  try { return NextResponse.json({ battle: await launchAttack(pid, body.target, body.troops) }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 409 }); }
}
