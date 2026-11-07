import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { users, type UserDoc } from "./db";
import { updateWorkerSession } from "./session-worker";

export const SESSION_COOKIE = "sid";
const SESSION_DAYS = 60;

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("Thiếu AUTH_SECRET (ít nhất 32 ký tự) trong .env.local");
  return s;
}
const sign = (data: string) => createHmac("sha256", secret()).update(data).digest("base64url");

/** Legacy cookies must sign in once again to acquire a revocable session. */
export function makeSession(uid: string, sessionVersion: number) {
  const data = Buffer.from(JSON.stringify({ uid, sessionVersion, exp: Date.now() + SESSION_DAYS * 86_400_000 })).toString("base64url");
  return `${data}.${sign(data)}`;
}

export function readSessionClaims(value: string | undefined): { uid: string; sessionVersion: number } | null {
  if (!value) return null;
  if (value.length > 4096) return null;
  const [data, sig, extra] = value.split(".");
  if (!data || !sig || extra !== undefined) return null;
  const want = Buffer.from(sign(data)), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const { uid, sessionVersion, exp } = JSON.parse(Buffer.from(data, "base64url").toString());
    return typeof uid === "string" && uid.length > 0 && Number.isSafeInteger(sessionVersion) && sessionVersion > 0 && typeof exp === "number" && exp > Date.now() ? { uid, sessionVersion } : null;
  } catch {
    return null;
  }
}

export function readSession(value: string | undefined): string | null {
  return readSessionClaims(value)?.uid ?? null;
}

/** Atomic increment makes concurrent sign-ins choose one winning session. */
export async function startSession(uid: string) {
  const user = await (await users()).findOneAndUpdate({ _id: uid }, { $inc: { sessionVersion: 1 }, $unset: { sessionRevokedFrom: "" } }, { returnDocument: "after" });
  if (!user?.sessionVersion) throw new Error("Không tạo được phiên đăng nhập.");
  if (user.cityId) await updateWorkerSession(user.cityId, user.sessionVersion);
  return makeSession(uid, user.sessionVersion);
}

export async function endSession() {
  const claims = readSessionClaims((await cookies()).get(SESSION_COOKIE)?.value);
  if (!claims) return;
  // Logging out a superseded browser must never revoke the new browser.
  const col = await users();
  const user = await col.findOneAndUpdate({ _id: claims.uid, sessionVersion: claims.sessionVersion }, { $inc: { sessionVersion: 1 }, $set: { sessionRevokedFrom: claims.sessionVersion } }, { returnDocument: "after" })
    ?? await col.findOne({ _id: claims.uid, sessionVersion: claims.sessionVersion + 1, sessionRevokedFrom: claims.sessionVersion });
  if (user?.cityId && user.sessionVersion) await updateWorkerSession(user.cityId, user.sessionVersion);
}

export const cookieOpts = (maxAgeSec: number) => ({
  httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: maxAgeSec, secure: process.env.NODE_ENV === "production",
});
export const SESSION_MAX_AGE = SESSION_DAYS * 86_400;

export async function currentUser(): Promise<UserDoc | null> {
  const claims = readSessionClaims((await cookies()).get(SESSION_COOKIE)?.value);
  if (!claims) return null;
  return (await users()).findOne({ _id: claims.uid, sessionVersion: claims.sessionVersion });
}

/** 6-character invite code without look-alike letters. */
export function newFriendCode() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(randomBytes(6), (b) => abc[b % abc.length]).join("");
}

export const appUrl = () => (process.env.APP_URL || "http://localhost:3457").replace(/\/$/, "");
