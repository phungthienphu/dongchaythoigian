import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { users, type UserDoc } from "./db";

export const SESSION_COOKIE = "sid";
const SESSION_DAYS = 60;

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("Thiếu AUTH_SECRET (ít nhất 32 ký tự) trong .env.local");
  return s;
}
const sign = (data: string) => createHmac("sha256", secret()).update(data).digest("base64url");

/** Cookie value: base64url(JSON {uid, exp}) + "." + HMAC signature. */
export function makeSession(uid: string) {
  const data = Buffer.from(JSON.stringify({ uid, exp: Date.now() + SESSION_DAYS * 86_400_000 })).toString("base64url");
  return `${data}.${sign(data)}`;
}

export function readSession(value: string | undefined): string | null {
  if (!value) return null;
  if (value.length > 4096) return null;
  const [data, sig, extra] = value.split(".");
  if (!data || !sig || extra !== undefined) return null;
  const want = Buffer.from(sign(data)), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(data, "base64url").toString());
    return typeof uid === "string" && typeof exp === "number" && exp > Date.now() ? uid : null;
  } catch {
    return null;
  }
}

export const cookieOpts = (maxAgeSec: number) => ({
  httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: maxAgeSec, secure: process.env.NODE_ENV === "production",
});
export const SESSION_MAX_AGE = SESSION_DAYS * 86_400;

export async function currentUser(): Promise<UserDoc | null> {
  const uid = readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!uid) return null;
  return (await users()).findOne({ _id: uid });
}

/** 6-character invite code without look-alike letters. */
export function newFriendCode() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(randomBytes(6), (b) => abc[b % abc.length]).join("");
}

export const appUrl = () => (process.env.APP_URL || "http://localhost:3457").replace(/\/$/, "");
