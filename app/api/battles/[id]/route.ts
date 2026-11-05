import { NextResponse } from "next/server";
import { battlePlayerId } from "@/lib/city-store";
import { battles, cities } from "@/lib/db";
import { warView } from "@/lib/war-view";
import { villageView } from "@/lib/world-discovery";
import { socketUrl, workerRequest, warConfigured } from "@/lib/war";
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const pid = await battlePlayerId(), { id } = await ctx.params;
  if (!pid) return NextResponse.json({ error: "Cần đăng nhập Google và sở hữu thành phố để tham chiến." }, { status: 401 });
  const w = await (await battles()).findOne({ _id: id, $or: [{ attackerId: pid }, { defenderId: pid }] });
  if (!w) return NextResponse.json({ error: "Không tìm thấy trận đánh." }, { status: 404 });
  const side = w.attackerId === pid ? "attacker" : "defender";
  try {
    const live = warConfigured() && w.status === "fighting" ? await workerRequest<{ battle: unknown }>(`/rooms/${id}`) : null;
    const defender = w.status === "fighting" ? await (await cities()).findOne({ _id: w.defenderId }, { projection: { state: 1 } }) : null;
    const mine=await (await cities()).findOne({_id:pid},{projection:{state:1}});
    if(!mine) return NextResponse.json({error:"Chưa có thành phố."},{status:401});
    return NextResponse.json({ war: warView(w,pid,mine.state), battle: live?.battle ?? null, village: defender ? villageView(defender.state) : null,
      side, socket: w.status === "fighting" && warConfigured() ? socketUrl(id, pid, side) : null });
  } catch { return NextResponse.json({ error: "Không kết nối được phòng trận. Thử lại sau." }, { status: 503 }); }
}
