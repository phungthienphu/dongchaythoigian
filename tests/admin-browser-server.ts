// Run only with Bun, bound to localhost. All accounts and writes live in memory.
// @ts-expect-error Bun test runtime module replacement.
import { mock } from "bun:test";
import { adminDatabase } from "./fixtures/admin-database";
import * as headers from "../cloudflare/bridge/headers";
import { withRequestContext } from "../cloudflare/bridge/context";
const db = adminDatabase();
mock.module("../lib/db", () => db.module);
mock.module("next/headers", () => headers);
process.env.AUTH_SECRET = "admin-browser-fixture-secret-minimum-32-characters";
process.env.ADMIN_USER_IDS = "admin-id";
process.env.APP_URL = "http://127.0.0.1:3469";
const { currentUser, makeSession } = await import("../lib/auth");
const { handleAdmin } = await import("../lib/admin-handler");
const { readAdmin, writeAdmin } = await import("../lib/admin-store");
// @ts-expect-error Bun-only localhost fixture server.
Bun.serve({
  hostname: "127.0.0.1",
  port: 3469,
  async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname === "/__test/session") {
      const as = url.searchParams.get("as");
      const cookie =
        as === "none"
          ? "sid=; Max-Age=0"
          : `sid=${makeSession(as === "player" ? "player-0" : "admin-id", as === "stale" ? 999 : as === "player" ? 7 : 1)}`;
      return new Response(null, {
        status: 302,
        headers: {
          location: "/admin",
          "set-cookie": cookie + "; HttpOnly; SameSite=Lax; Path=/",
        },
      });
    }
    if (url.pathname === "/__test/data") return Response.json(db.tables());
    if (url.pathname === "/api/admin")
      return withRequestContext(request, () =>
        handleAdmin(request, {
          user: currentUser,
          allowlist: () => process.env.ADMIN_USER_IDS,
          read: readAdmin,
          write: writeAdmin,
        }),
      );
    if (url.pathname.startsWith("/api/"))
      return new Response("No external API in fixture", { status: 404 });
    const upstream = new URL(request.url);
    upstream.port = "3468";
    const r = await fetch(upstream, {
      headers: { accept: request.headers.get("accept") ?? "*/*" },
    });
    const h = new Headers(r.headers);
    h.delete("content-encoding");
    h.delete("content-length");
    return new Response(r.body, { status: r.status, headers: h });
  },
});
console.log(
  "Admin browser fixture ready on http://127.0.0.1:3469 (in-memory database)",
);
