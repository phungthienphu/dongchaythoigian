// First start the production Next server on :3468 and `bun tests/admin-browser-server.ts`.
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN ?? "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
});
const page = await context.newPage();
const origin = "http://127.0.0.1:3469";
const screenshots = process.env.ADMIN_SCREENSHOTS ?? "/tmp/admin-browser";
await mkdir(screenshots, { recursive: true });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(`${origin}/__test/session?as=none`);
  await page.getByRole("heading", { name: "Đăng nhập để tiếp tục" }).waitFor();
  await page.goto(`${origin}/__test/session?as=player`);
  await page.getByRole("heading", { name: "Khu vực quản trị" }).waitFor();
  await page.goto(`${origin}/__test/session?as=stale`);
  await page.getByRole("heading", { name: "Đăng nhập để tiếp tục" }).waitFor();
  await page.goto(`${origin}/__test/session?as=admin`);
  await page.getByText("29", { exact: true }).first().waitFor();
  for (const [action, enabled] of [
    ["Tắt zombie", false],
    ["Bật zombie", true],
  ]) {
    await page.getByRole("button", { name: action, exact: true }).click();
    await page
      .getByLabel("Lý do thay đổi zombie")
      .fill("Kiểm tra điều khiển zombie toàn game");
    await page
      .getByRole("button", { name: "Xác nhận thay đổi zombie", exact: true })
      .click();
    await page
      .getByRole("heading", {
        name: `Zombie toàn game · ${enabled ? "Đang bật" : "Đang tắt"}`,
      })
      .waitFor();
    const saved = await (
      await context.request.get(`${origin}/__test/data`)
    ).json();
    assert.equal(saved.game_settings[0].policy.enabled, enabled);
    assert.equal(saved.admin_audit.at(-1).action, "zombie-system");
  }
  await page.screenshot({
    path: `${screenshots}/desktop-overview.png`,
    fullPage: true,
  });
  await page
    .getByRole("navigation", { name: "Quản trị game" })
    .getByRole("button", { name: "Làng & thành phố" })
    .click();
  await page.getByLabel("Tìm kiếm", { exact: true }).fill("Làng Ven Sông");
  await page.getByRole("button", { name: "Tìm kiếm", exact: true }).click();
  await page
    .getByRole("button", { name: "Chi tiết Làng Ven Sông", exact: true })
    .click();
  await page.getByRole("button", { name: "Đổi tên làng", exact: true }).click();
  await page.getByLabel("Tên mới").fill("Làng Bình Minh");
  await page.getByLabel("Lý do thực hiện").fill("Kiểm tra quản trị end to end");
  await page.screenshot({
    path: `${screenshots}/desktop-rename.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Xác nhận và lưu" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Đã lưu thành công" })
    .waitFor();
  const table = await (
    await context.request.get(`${origin}/__test/data`)
  ).json();
  assert.equal(table.cities[0].name, "Làng Bình Minh");
  assert.equal(table.admin_audit.length, 3);
  assert.equal(table.cities[0].ver, 10);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Người chơi" })
    .click();
  await page
    .getByLabel("Tìm kiếm", { exact: true })
    .fill("player0@example.test");
  await page.getByRole("button", { name: "Tìm kiếm", exact: true }).click();
  await page
    .getByRole("button", { name: "Chi tiết Người chơi 0", exact: true })
    .click();
  await page.getByRole("button", { name: "Thêm ghi chú hỗ trợ" }).click();
  await page
    .getByLabel("Nội dung ghi chú")
    .fill("Đã xác minh yêu cầu đổi tên làng.");
  await page.getByLabel("Lý do thực hiện").fill("Hỗ trợ người chơi");
  await page.getByRole("button", { name: "Xác nhận và lưu" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Đã lưu thành công" })
    .waitFor();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Nhật ký quản trị" })
    .click();
  await page
    .getByText("Đã xác minh yêu cầu đổi tên làng.", { exact: true })
    .waitFor();
  await page.screenshot({
    path: `${screenshots}/desktop-audit.png`,
    fullPage: true,
  });
  for (const name of ["Trận đánh", "Chợ giao thương"]) {
    await page.getByRole("navigation").getByRole("button", { name }).click();
    await page
      .getByRole("button", { name: /Chi tiết/ })
      .first()
      .waitFor();
  }
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Làng & thành phố" })
    .click();
  await page.getByRole("button", { name: "Sau →" }).click();
  await page.getByText("Trang 2", { exact: true }).waitFor();
  await page.waitForFunction(
    () => document.querySelectorAll("tbody tr").length === 3,
  );
  assert.equal(await page.locator("tbody tr").count(), 3);
  await page.getByLabel("Tìm kiếm", { exact: true }).fill("không có dữ liệu");
  await page.getByRole("button", { name: "Tìm kiếm", exact: true }).click();
  await page
    .getByRole("heading", { name: "Không có kết quả phù hợp" })
    .waitFor();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Tổng quan" })
    .click();
  await page.getByText("29", { exact: true }).first().waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: `${screenshots}/mobile-overview.png`,
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Người chơi" })
    .click();
  await page
    .getByRole("button", { name: /Chi tiết/ })
    .first()
    .click();
  await page.screenshot({
    path: `${screenshots}/mobile-detail.png`,
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  // A broken backend must show an actionable error, not stale or fabricated data.
  await page.route("**/api/admin?**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Kết nối thử nghiệm bị gián đoạn." }),
    }),
  );
  await page.getByRole("button", { name: "Làm mới" }).click();
  await page.getByRole("button", { name: "Thử lại", exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS admin browser E2E: anonymous/player/stale session, overview, zombie off/on+audit, search, rename+audit, note+audit, battles, market, pagination, empty/error, mobile, modal keyboard.",
  );
} finally {
  await browser.close();
}
