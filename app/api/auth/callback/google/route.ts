import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, SESSION_MAX_AGE, appUrl, cookieOpts, makeSession, newFriendCode } from "@/lib/auth";
import { cities, users } from "@/lib/db";
import { PID_COOKIE } from "@/lib/city-store";

type GoogleUser = { sub: string; email: string; email_verified?: boolean; name?: string; picture?: string };

export async function GET(req: NextRequest) {
  const fail = (why: string) => NextResponse.redirect(`${appUrl()}/?auth=${encodeURIComponent(why)}`);
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state || state !== req.cookies.get("oauth_state")?.value) return fail("state");

  // exchange the code for an access token, then read the profile
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: `${appUrl()}/api/auth/callback/google`,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return fail("token");
  const { access_token } = (await tokenRes.json()) as { access_token?: string };
  const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${access_token}` } });
  if (!infoRes.ok) return fail("profile");
  const g = (await infoRes.json()) as GoogleUser;
  if (!g.sub || !g.email) return fail("profile");

  const col = await users();
  const now = new Date();
  let user = await col.findOne({ _id: g.sub });
  if (!user) {
    for (let k = 0; k < 5 && !user; k++) {
      try {
        const doc = { _id: g.sub, email: g.email, name: g.name || g.email.split("@")[0], picture: g.picture, cityId: null, friendCode: newFriendCode(), friends: [], createdAt: now, lastSeen: now };
        await col.insertOne(doc);
        user = doc;
      } catch { /* friend code collision: try another */ }
    }
    if (!user) return fail("user");
  } else {
    await col.updateOne({ _id: g.sub }, { $set: { name: g.name || user.name, picture: g.picture, email: g.email, lastSeen: now } });
  }

  // first sign-in: adopt the city this browser has been playing as a guest
  let cityId = user.cityId;
  const guest = req.cookies.get(PID_COOKIE)?.value;
  if (!cityId && guest) {
    const claimed = await (await cities()).updateOne({ _id: guest, owner: { $exists: false } }, { $set: { owner: g.sub }, $inc: { ver: 1 } });
    if (claimed.modifiedCount === 1) {
      cityId = guest;
      await col.updateOne({ _id: g.sub }, { $set: { cityId } });
    }
  }

  const res = NextResponse.redirect(`${appUrl()}/`);
  res.cookies.delete("oauth_state");
  res.cookies.set(SESSION_COOKIE, makeSession(g.sub), cookieOpts(SESSION_MAX_AGE));
  if (cityId) res.cookies.set(PID_COOKIE, cityId, cookieOpts(SESSION_MAX_AGE));
  else res.cookies.delete(PID_COOKIE);
  return res;
}
