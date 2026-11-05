import { NextResponse } from "next/server";
import { battles } from "@/lib/db";
import { returnArmy, startBattle, workerAuthorized, workerRequest } from "@/lib/war";
// Durable recovery for the cross-service handoff: database reservation and Worker
// scheduling cannot participate in one transaction. The Worker cron retries it.
export async function POST(req: Request) {
  if (!workerAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await (await battles()).find({ status: { $in: ["marching", "fighting", "returning"] } }).sort({ updatedRecoveryAt: 1, createdAt: 1 }).limit(100).toArray();
  const results = await Promise.allSettled(rows.map(async (w) => {
    if (w.status === "marching") {
      if (w.arrive <= Date.now()) await startBattle(w._id);
      else await workerRequest(`/rooms/${w._id}/schedule`, { arrive: w.arrive });
    } else if (w.status === "fighting") await startBattle(w._id);
    else if ((w.back ?? Infinity) <= Date.now()) await returnArmy(w._id);
    else await workerRequest(`/rooms/${w._id}-return/schedule`, { arrive: w.back });
    await (await battles()).updateOne({ _id: w._id }, { $set: { updatedRecoveryAt: new Date() } });
  }));
  const failed = results.filter((r) => r.status === "rejected").length;
  return NextResponse.json({ checked: rows.length, failed }, { status: failed ? 503 : 200 });
}
