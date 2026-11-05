import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { appUrl, cookieOpts } from "@/lib/auth";

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: "Thiếu GOOGLE_CLIENT_ID trong .env.local" }, { status: 500 });
  const state = randomBytes(16).toString("base64url");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${appUrl()}/api/auth/callback/google`,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  }).toString();
  const res = NextResponse.redirect(url);
  res.cookies.set("oauth_state", state, cookieOpts(600));
  return res;
}
