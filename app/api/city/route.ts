import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { cities } from "@/lib/db";
import { newCity, score } from "@/lib/engine";
import { PID_COOKIE, playerId, withCity, UnsupportedCityVersionError } from "@/lib/city-store";
import { currentUser, SESSION_COOKIE } from "@/lib/auth";
import { users } from "@/lib/db";
import { citySync } from '@/lib/sync-anchor';
import { batchDelayEnabled } from '@/lib/city-sync-config';

export async function GET() {
  const user=await currentUser();
  if(!user)return NextResponse.json({error:'Đăng nhập Google để vào làng.',needsLogin:true,sessionEnded:!!(await cookies()).get(SESSION_COOKIE)?.value},{status:401});
  const pid=user.cityId;
  if(!pid)return NextResponse.json({needsName:true},{status:404});
  try {
    const out = await withCity(pid, () => null, { readOnlyFallback: true });
    if (!out) return NextResponse.json({ needsName: true }, { status: 404 });
    return NextResponse.json({ name: out.doc.name, state: out.doc.state, serverNow: out.now, ...(user.sessionVersion?{sync:citySync(out.doc,user.sessionVersion,out.now,out.checkpointAt??out.doc.state.last),batchEnabled:batchDelayEnabled(pid)}:{}) });
  } catch (error) {
    if (error instanceof UnsupportedCityVersionError) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Đăng nhập Google để tạo làng.", needsLogin: true }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { name?: unknown };
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 24) : "";
  if (name.length < 2) return NextResponse.json({ error: "Tên thành phố cần ít nhất 2 ký tự." }, { status: 400 });

  const existing = await playerId();
  const col = await cities();
  if (existing && (await col.findOne({ _id: existing }, { projection: { _id: 1 } }))) {
    return NextResponse.json({ error: "Bạn đã có thành phố." }, { status: 409 });
  }
  if (user.cityId) return NextResponse.json({ error: "Tài khoản này đã có thành phố." }, { status: 409 });
  const pid = crypto.randomUUID();
  const now = Date.now();
  const state = newCity(now);
  await col.insertOne({
    _id: pid, name, state, score: score(state), era: state.era, pop: state.pop, templeAt: null,
    ver: 0, createdAt: new Date(now), updatedAt: new Date(now), owner: user._id,
  });
  await (await users()).updateOne({ _id: user._id }, { $set: { cityId: pid } });
  (await cookies()).set(PID_COOKIE, pid, {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 * 5,
    secure: process.env.NODE_ENV === "production",
  });
  return NextResponse.json({ name, state, serverNow: now, ...(user.sessionVersion?{sync:citySync({_id:pid,ver:0},user.sessionVersion,now),batchEnabled:batchDelayEnabled(pid)}:{}) });
}
