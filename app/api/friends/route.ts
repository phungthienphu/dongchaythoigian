import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { cities, mongoClient, users } from "@/lib/db";

const MAX_FRIENDS = 100;

/** Public profile search deliberately excludes email, invite codes and world coordinates. */
export async function GET(req: Request) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "Cần đăng nhập để tìm bạn." }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2 || q.length > 60) return NextResponse.json({ error: "Nhập từ 2 đến 60 ký tự." }, { status: 400 });
  const pattern = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const col = await users(), cityCol = await cities();
  const namedCities = await cityCol.find({ name: { $regex: pattern, $options: "i" }, owner: { $exists: true } }, { projection: { _id: 1 }, maxTimeMS: 2000 }).limit(20).toArray();
  const found = await col.find({ _id: { $ne: me._id }, $or: [
    { name: { $regex: pattern, $options: "i" } },
    { friendCode: q.toUpperCase() },
    { cityId: { $in: namedCities.map(c => c._id) } },
  ] }, { projection: { name: 1, cityId: 1 }, maxTimeMS: 2000 }).sort({ name: 1, _id: 1 }).limit(20).toArray();
  const summaries = await cityCol.find({ _id: { $in: found.flatMap(u => u.cityId ? [u.cityId] : []) } }, { projection: { name: 1, era: 1 } }).toArray();
  return NextResponse.json({ players: found.map(u => {
    const c = summaries.find(c => c._id === u.cityId);
    return { id: u._id, name: u.name, friend: me.friends.includes(u._id), city: c ? { name: c.name, era: c.era } : null };
  }) });
}

/** Existing mutual friendship semantics, shared by invite, search and world map. */
export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "Cần đăng nhập để kết bạn." }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Thông tin kết bạn không hợp lệ." }, { status: 400 });
  const { code, id, cityId } = body;
  const c = typeof code === "string" ? code.trim().toUpperCase() : "";
  if (!(typeof id === "string" && id.length > 0 && id.length <= 128) && !(typeof cityId === "string" && cityId.length > 0 && cityId.length <= 128) && !/^[A-Z0-9]{6}$/.test(c))
    return NextResponse.json({ error: "Chọn người chơi hoặc nhập mã mời 6 ký tự." }, { status: 400 });
  const col = await users();
  const other = await col.findOne(typeof id === "string" ? { _id: id } : typeof cityId === "string" ? { cityId } : { friendCode: c });
  if (!other) return NextResponse.json({ error: "Không tìm thấy tài khoản này. Người chơi cần đăng nhập Google trước." }, { status: 404 });
  if (other._id === me._id) return NextResponse.json({ error: "Không thể kết bạn với chính mình." }, { status: 400 });
  const session = (await mongoClient()).startSession();
  let error: string | null = null;
  try {
    await session.withTransaction(async () => {
      error = null;
      const a = await col.findOne({ _id: me._id }, { session });
      const b = await col.findOne({ _id: other._id }, { session });
      if (!a || !b) { error = "Không tìm thấy tài khoản."; return; }
      if (a.friends.includes(b._id)) return; // idempotent on repeated clicks
      if (a.friends.length >= MAX_FRIENDS || b.friends.length >= MAX_FRIENDS) { error = `Một trong hai người đã đủ ${MAX_FRIENDS} bạn.`; return; }
      await col.updateOne({ _id: a._id }, { $addToSet: { friends: b._id } }, { session });
      await col.updateOne({ _id: b._id }, { $addToSet: { friends: a._id } }, { session });
    });
  } finally { await session.endSession(); }
  if (error) return NextResponse.json({ error }, { status: 409 });
  return NextResponse.json({ ok: true, name: other.name });
}

/** Remove a friend (both sides). */
export async function DELETE(req: Request) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "Cần đăng nhập." }, { status: 401 });
  const { id } = (await req.json().catch(() => ({}))) as { id?: unknown };
  if (typeof id !== "string") return NextResponse.json({ error: "Thiếu người cần xoá." }, { status: 400 });
  const col = await users();
  await col.updateOne({ _id: me._id }, { $pull: { friends: id } });
  await col.updateOne({ _id: id }, { $pull: { friends: me._id } });
  return NextResponse.json({ ok: true });
}
