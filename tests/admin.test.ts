import { test } from "node:test";
import assert from "node:assert/strict";
import { handleAdmin, type AdminDependencies } from "../lib/admin-handler";
import {
  adminCommand,
  adminQuery,
  isAdmin,
  literalSearch,
} from "../lib/admin-policy";
import type { UserDoc } from "../lib/db";
const user = { _id: "admin-id" } as UserDoc;
const command = {
  action: "rename-city",
  target: "city-1",
  value: "Làng mới",
  expected: "Làng cũ",
  reason: "Yêu cầu hỗ trợ",
  requestId: "12345678-1234-1234-1234-123456789abc",
};
const req = (body: unknown = command, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/admin", {
    method: "POST",
    headers: {
      origin: process.env.APP_URL
        ? new URL(process.env.APP_URL).origin
        : "http://localhost",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
function deps(overrides: Partial<AdminDependencies> = {}) {
  let reads = 0,
    writes = 0;
  const d: AdminDependencies = {
    user: async () => user,
    allowlist: () => "other, admin-id",
    read: async (actor, tab, q, page) => {
      reads++;
      return { actor, tab, rows: [{ id: q }], page, at: "", hasMore: false };
    },
    write: async () => {
      writes++;
      return { ok: true };
    },
    ...overrides,
  };
  return { d, reads: () => reads, writes: () => writes };
}
test("admin access is exact ID, default denied, never email or substring", () => {
  assert.equal(isAdmin("admin-id", undefined), false);
  assert.equal(isAdmin("admin", "admin-id"), false);
  assert.equal(isAdmin("", ","), false);
  assert.equal(isAdmin("admin-id", " other, admin-id "), true);
});
test("anonymous and ordinary users cannot read or mutate admin data", async () => {
  for (const actor of [null, { _id: "player" } as UserDoc]) {
    const d = deps({ user: async () => actor });
    for (const request of [new Request("http://localhost/api/admin"), req()]) {
      const r = await handleAdmin(request, d.d);
      assert.equal(r.status, actor ? 403 : 401);
      assert.match(r.headers.get("cache-control")!, /no-store/);
    }
    assert.equal(d.reads(), 0);
    assert.equal(d.writes(), 0);
  }
});
test("authorized reads forward bounded filters and correct actor", async () => {
  const d = deps();
  const r = await handleAdmin(
    new Request("http://localhost/api/admin?tab=cities&q=abc&page=2"),
    d.d,
  );
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.actor, "admin-id");
  assert.equal(body.page, 2);
  assert.equal(body.rows[0].id, "abc");
});
test("mutations reject CSRF, missing origin, cross-site and non-JSON before writes", async () => {
  for (const headers of [
    { origin: "https://evil.example" },
    { origin: "" },
    { "sec-fetch-site": "cross-site" },
    { "content-type": "text/plain" },
  ] as Record<string, string>[]) {
    const d = deps();
    const r = await handleAdmin(req(command, headers), d.d);
    assert.ok([403, 415].includes(r.status));
    assert.equal(d.writes(), 0);
  }
});
test("server validates commands, maximum size and malformed JSON", async () => {
  for (const c of [
    { ...command, value: "X" },
    { ...command, reason: "bad" },
    { ...command, action: "grant-admin" },
    { ...command, expected: undefined },
    { ...command, value: "X".repeat(25) },
    { ...command, target: { $ne: null } },
    { ...command, value: "bad\nname" },
    { ...command, requestId: "bad" },
  ])
    assert.throws(() => adminCommand(c));
  assert.equal(
    (await handleAdmin(req({ ...command, value: "x".repeat(9000) }), deps().d))
      .status,
    413,
  );
  const malformed = req();
  const r = new Request(malformed.url, {
    method: "POST",
    headers: malformed.headers,
    body: "{bad",
  });
  assert.equal((await handleAdmin(r, deps().d)).status, 400);
  const d = deps();
  assert.equal((await handleAdmin(req(), d.d)).status, 200);
  assert.equal(d.writes(), 1);
});
test("search escapes regex metacharacters and rejects unbounded pages", () => {
  const value = "a.*[b]($)\\";
  assert.ok(new RegExp(literalSearch(value)).test(value));
  assert.equal(new RegExp(literalSearch(".*")).test("anything"), false);
  for (const query of [
    "tab=unknown",
    "page=0",
    "page=1.1",
    "page=1001",
    "q=" + "a".repeat(101),
  ])
    assert.throws(() => adminQuery(new URL("http://localhost?" + query)));
});
test("database errors return a fixed message without leaking credentials", async () => {
  const r = await handleAdmin(
    new Request("http://localhost/api/admin"),
    deps({
      read: async () => {
        throw new Error("mongodb://sensitive");
      },
    }).d,
  );
  assert.equal(r.status, 503);
  assert.ok(!(await r.text()).includes("sensitive"));
});
