import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { users } from "@/lib/db";

const MAX_FRIENDS = 100;

/** Add a friend by invite code (friendship is mutual). */
export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "Cần đăng nhập để kết bạn." }, { status: 401 });
  const { code } = (await req.json().catch(() => ({}))) as { code?: unknown };
  const c = typeof code === "string" ? code.trim().toUpperCase() : "";
  if (!/^[A-Z0-9]{6}$/.test(c)) return NextResponse.json({ error: "Mã mời gồm 6 ký tự." }, { status: 400 });
  const col = await users();
  const other = await col.findOne({ friendCode: c }, { projection: { name: 1 } });
  if (!other) return NextResponse.json({ error: "Không tìm thấy mã mời này." }, { status: 404 });
  if (other._id === me._id) return NextResponse.json({ error: "Đây là mã của chính bạn." }, { status: 400 });
  if (me.friends.includes(other._id)) return NextResponse.json({ error: `Bạn và ${other.name} đã là bạn bè.` }, { status: 409 });
  if (me.friends.length >= MAX_FRIENDS) return NextResponse.json({ error: `Tối đa ${MAX_FRIENDS} bạn.` }, { status: 400 });
  await col.updateOne({ _id: me._id }, { $addToSet: { friends: other._id } });
  await col.updateOne({ _id: other._id }, { $addToSet: { friends: me._id } });
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
