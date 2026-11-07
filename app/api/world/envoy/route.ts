import { NextResponse } from "next/server";
import { playerId, withCity } from "@/lib/city-store";
import { cities } from "@/lib/db";
import { sendEnvoy } from "@/lib/engine";
import { beginDiscovery, knowsNation } from "@/lib/world-discovery";
import { ensureWorldPos, worldDist } from "@/lib/world";
import { trackOnlineCommand } from "@/lib/online-commands";

/** Send an envoy to another nation. */
export async function POST(req: Request) {
  const pid = await playerId();
  if (!pid) return NextResponse.json({ error: "Chưa có thành phố." }, { status: 401 });
  return trackOnlineCommand(pid, 'envoy', async metrics => {
    const body = await req.json().catch(() => null) as { target?: unknown; explore?: unknown } | null;
    if (!body) return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
    if (body.explore === true) {
      metrics.command = 'envoy.explore';
      try {
        const out = await withCity(pid, (c,now) => beginDiscovery(c,now), {metrics});
        if (!out) return NextResponse.json({ error: "Chưa có thành phố." }, { status: 401 });
        metrics.rejected = !!out.result;
        return NextResponse.json({error:out.result,state:out.doc.state,serverNow:out.now}, {status:out.result?409:200});
      } catch (e) { return NextResponse.json({error:(e as Error).message},{status:409}); }
    }
    const target = body.target;
    if (typeof target !== "string" || target.length>100 || target === pid) return NextResponse.json({ error: "Nước không hợp lệ." }, { status: 400 });
    metrics.command = 'envoy.visit';
    const state = await (await cities()).findOne({_id:pid},{projection:{state:1}});
    if (!state || !knowsNation(state.state,target)) return NextResponse.json({error:"Chưa biết vị trí nước này. Hãy cử sứ giả dò tìm trước."},{status:403});
    const other = await (await cities()).findOne({ _id: target }, { projection: { name: 1, world: 1 } });
    if (!other?.world) return NextResponse.json({ error: "Không tìm thấy nước này." }, { status: 404 });
    const mine = await ensureWorldPos(pid);
    if (!mine) return NextResponse.json({ error: "Chưa có thành phố." }, { status: 401 });
    try {
      const out = await withCity(pid, (c, now) => knowsNation(c,target) ? sendEnvoy(c, target, other.name, worldDist(mine, other.world!), now) : "Chưa biết vị trí nước này.", {metrics});
      if (!out) return NextResponse.json({ error: "Chưa có thành phố." }, { status: 401 });
      metrics.rejected = !!out.result;
      return NextResponse.json({ error: out.result, state: out.doc.state, serverNow: out.now });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 409 });
    }
  });
}
