import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { PID_COOKIE } from "@/lib/city-store";

// Forget both the session and the city on this browser, so the next person here starts fresh.
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(PID_COOKIE);
  return res;
}
