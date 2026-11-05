import { NextResponse } from "next/server";
import { cities } from "@/lib/db";
import { playerId } from "@/lib/city-store";

export async function GET() {
  const pid = await playerId();
  const col = await cities();
  const rows = await col
    .find({}, { projection: { name: 1, score: 1, era: 1, pop: 1, templeAt: 1 } })
    .sort({ score: -1 })
    .limit(20)
    .toArray();
  return NextResponse.json({
    rows: rows.map((r) => ({ name: r.name, score: r.score, era: r.era, pop: r.pop, temple: !!r.templeAt, me: r._id === pid })),
  });
}
