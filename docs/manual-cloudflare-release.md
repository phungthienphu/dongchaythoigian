# Tự release game lên Cloudflare

Production: https://dongchaythoigian.phungthienphu.workers.dev/

Chạy từ máy đã có Bun, Node.js, dependencies và quyền Cloudflare. Nếu Wrangler báo chưa đăng nhập, chạy một lần:

```bash
worker/node_modules/.bin/wrangler login
```

## Release

Đổi `vars.RELEASE_ID` trong `cloudflare/wrangler.production.jsonc` thành tên dễ nhận biết cho lần phát hành, ví dụ `balance-20261112-1`. Commit mã nguồn đã chốt trước khi deploy; không commit `.env.local` hoặc output build.

Chạy cả khối dưới trong một shell. Khối dùng `set -e` để dừng khi test/build/deploy lỗi.

```bash
cd /home/phungthienphu/Projects/dong-song-thoi-dai
set -e

bun run type-check
bun test lib/*.test.ts
bun test tests/cloudflare-bridge.test.ts tests/world-api.test.ts
node tests/render-performance.mjs
node worker/tests.mjs

bun run build:cloudflare https://dongchaythoigian.phungthienphu.workers.dev

WRANGLER_LOG_PATH=/tmp/dong-song-web-deploy.log \
  worker/node_modules/.bin/wrangler deploy --config cloudflare/wrangler.production.jsonc

WRANGLER_LOG_PATH=/tmp/dong-song-battle-deploy.log \
  worker/node_modules/.bin/wrangler deploy --config worker/wrangler.jsonc

node scripts/check-cloudflare-production.mjs
node scripts/reconcile-cloudflare-production.mjs

curl --fail --silent --show-error \
  https://dongchaythoigian.phungthienphu.workers.dev/api/health
```

`release` trong `/api/health` phải khớp `RELEASE_ID` vừa đặt. Ghi lại `Current Version ID` của cả hai lần deploy để rollback nếu cần. Sau đó mở game, tải lại trang và kiểm tra làng/tính năng vừa thay đổi.

- `build:cloudflare` tạo website production; chỉ `bun run build` chưa tạo đúng artifact Cloudflare để deploy.
- Web/API và Combat Worker dùng chung logic game. Thay engine/công trình/combat thì deploy cả hai như trên. Chỉ sửa UI/hình ảnh thì có thể bỏ bước deploy Combat Worker.
- `check-cloudflare-production.mjs` dùng `.env.local` trên máy và kiểm tra làng Nam Quốc Sơn Hà đã được chủ tài khoản cho phép; cần kết nối MongoDB. Không xây/mua/tấn công. Nếu thiếu cấu hình local thì phần kiểm tra này không chạy được dù deploy có thể đã thành công.
- `reconcile-cloudflare-production.mjs` gọi đối soát combat/chợ thật; kết quả cần `ok: true`, `failed: 0`.
- Secrets đã cấu hình trên Cloudflare được giữ lại; không cần chạy lại hosting setup hoặc upload secrets mỗi lần release.

## Xem lịch sử / rollback

```bash
worker/node_modules/.bin/wrangler deployments list --config cloudflare/wrangler.production.jsonc
worker/node_modules/.bin/wrangler deployments list --config worker/wrangler.jsonc
```

Thay hai giá trị ví dụ bằng version đã xác nhận hoạt động:

```bash
worker/node_modules/.bin/wrangler rollback WEB_VERSION_ID --config cloudflare/wrangler.production.jsonc
worker/node_modules/.bin/wrangler rollback BATTLE_VERSION_ID --config worker/wrangler.jsonc
node scripts/check-cloudflare-production.mjs
```

Rollback code dùng database hiện tại; không ghi backup đè lên MongoDB production.
