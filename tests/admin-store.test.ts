import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Bun isolates module replacement in this test process.
import { mock } from "bun:test";
import { adminDatabase } from "./fixtures/admin-database";
const fixture = adminDatabase();
mock.module("../lib/db", () => fixture.module);
const { readAdmin, writeAdmin } = await import("../lib/admin-store");
const command = {
  action: "rename-city" as const,
  target: "city-0",
  value: "Làng Bình Minh",
  expected: "Làng Ven Sông",
  reason: "Người chơi yêu cầu sửa tên",
  requestId: "12345678-1234-1234-1234-123456789abc",
};
test("overview returns persisted counts without loading or settling game state", async () => {
  const d = await readAdmin("admin-id", "overview", "", 1);
  assert.deepEqual(
    d.metrics?.map((m) => m.value).filter((_, i) => i !== 1),
    [29, 28, 1, 1, 1],
  );
});
test("lists are bounded, searchable and exclude private/session/game data", async () => {
  for (const tab of [
    "players",
    "cities",
    "battles",
    "market",
    "audit",
  ] as const) {
    const d = await readAdmin("admin-id", tab, "", 1);
    assert.ok(d.rows.length <= 25);
    assert.doesNotMatch(
      JSON.stringify(d),
      /PRIVATE|sessionVersion|friendCode|citySync|snapshot/,
    );
  }
  const first = await readAdmin("admin-id", "cities", "", 1),
    second = await readAdmin("admin-id", "cities", "", 2);
  assert.equal(first.hasMore, true);
  assert.equal(second.hasMore, false);
  assert.equal(second.rows.length, 3);
  assert.ok(!second.rows.some((r) => first.rows.some((f) => f.id === r.id)));
  assert.equal(
    (await readAdmin("admin-id", "cities", "Làng Ven Sông", 1)).rows[0].id,
    "city-0",
  );
  assert.equal((await readAdmin("admin-id", "cities", ".*", 1)).rows.length, 0);
});
test("rename and audit commit atomically, retries are idempotent, state and revisions stay intact", async () => {
  const before = structuredClone(fixture.tables().cities[0]);
  await writeAdmin("admin-id", command);
  await writeAdmin("admin-id", command);
  assert.equal(fixture.tables().admin_audit.length, 1);
  assert.equal(fixture.tables().cities[0].name, command.value);
  const { name: _oldName, ...oldFields } = before,
    { name: _newName, ...newFields } = fixture.tables().cities[0];
  assert.deepEqual(newFields, oldFields);
  assert.equal(fixture.tables().admin_audit[0].before, command.expected);
  await assert.rejects(
    () => writeAdmin("admin-id", { ...command, value: "Conflicting" }),
    /đã được dùng/,
  );
});
test("stale rename fails without audit or overwritten data", async () => {
  await assert.rejects(
    () =>
      writeAdmin("admin-id", { ...command, requestId: crypto.randomUUID() }),
    /đã thay đổi/,
  );
  assert.equal(fixture.tables().admin_audit.length, 1);
});
test("failed audit rolls back rename", async () => {
  fixture.failAudit(true);
  await assert.rejects(() =>
    writeAdmin("admin-id", {
      ...command,
      target: "city-1",
      expected: "Làng 1",
      requestId: crypto.randomUUID(),
    }),
  );
  assert.equal(fixture.tables().cities[1].name, "Làng 1");
  assert.equal(fixture.tables().admin_audit.length, 1);
  fixture.failAudit(false);
});
test("support notes require existing player and are searchable in audit", async () => {
  const note = {
    ...command,
    action: "note" as const,
    target: "player-1",
    value: "Đã hướng dẫn người chơi phục hồi phiên.",
    requestId: crypto.randomUUID(),
  };
  await writeAdmin("admin-id", note);
  await writeAdmin("admin-id", note);
  assert.equal(fixture.tables().admin_audit.length, 2);
  assert.equal(
    (await readAdmin("admin-id", "audit", "player-1", 1)).rows[0].after,
    note.value,
  );
  await assert.rejects(
    () =>
      writeAdmin("admin-id", {
        ...note,
        target: "missing",
        requestId: crypto.randomUUID(),
      }),
    /Không tìm thấy/,
  );
});

test("global zombie toggle is audited, idempotent and protected by expected rule revision", async () => {
  const disable = {
    action: "zombie-system" as const,
    target: "global",
    value: "false",
    expected: "0",
    reason: "Giảm áp lực zombie toàn game",
    requestId: crypto.randomUUID(),
  };
  await writeAdmin("admin-id", disable);
  await writeAdmin("admin-id", disable);
  assert.equal(fixture.tables().game_settings[0].policy.enabled, false);
  assert.equal(fixture.tables().game_settings[0].policy.revision, 1);
  assert.equal(
    (await readAdmin("admin-id", "overview", "", 1)).zombiePolicy!.enabled,
    false,
  );
  await assert.rejects(
    () =>
      writeAdmin("admin-id", {
        ...disable,
        value: "true",
        requestId: crypto.randomUUID(),
      }),
    /đã thay đổi/,
  );
  const enable = {
    ...disable,
    value: "true",
    expected: "1",
    requestId: crypto.randomUUID(),
  };
  fixture.failAudit(true);
  await assert.rejects(() => writeAdmin("admin-id", enable));
  fixture.failAudit(false);
  assert.equal(fixture.tables().game_settings[0].policy.enabled, false);
  await writeAdmin("admin-id", enable);
  assert.equal(fixture.tables().game_settings[0].policy.enabled, true);
  assert.equal(fixture.tables().game_settings[0].policy.revision, 2);
});
