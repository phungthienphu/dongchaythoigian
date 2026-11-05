import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { cities } from "@/lib/db";
import { newCity, score } from "@/lib/engine";
import { PID_COOKIE, playerId, withCity } from "@/lib/city-store";

export async function GET() {
  const pid = await playerId();
  if (!pid) return NextResponse.json({ needsName: true }, { status: 404 });
  const out = await withCity(pid, () => null, { readOnlyFallback: true });
  if (!out) return NextResponse.json({ needsName: true }, { status: 404 });
  return NextResponse.json({ name: out.doc.name, state: out.doc.state, serverNow: out.now });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { name?: unknown };
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 24) : "";
  if (name.length < 2) return NextResponse.json({ error: "Tên thành phố cần ít nhất 2 ký tự." }, { status: 400 });

  const existing = await playerId();
  const col = await cities();
  if (existing && (await col.findOne({ _id: existing }, { projection: { _id: 1 } }))) {
    return NextResponse.json({ error: "Bạn đã có thành phố." }, { status: 409 });
  }
  const pid = crypto.randomUUID();
  const now = Date.now();
  const state = newCity(now);
  await col.insertOne({
    _id: pid, name, state, score: score(state), era: state.era, pop: state.pop, templeAt: null,
    ver: 0, createdAt: new Date(now), updatedAt: new Date(now),
  });
  (await cookies()).set(PID_COOKIE, pid, {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 * 5,
    secure: process.env.NODE_ENV === "production",
  });
  return NextResponse.json({ name, state, serverNow: now });
}
