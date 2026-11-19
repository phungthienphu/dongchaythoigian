# Bàn giao kiểm chứng admin — 19/11/2026

## Kết quả

- `bun run type-check`: pass.
- `bun run build`: pass, có `/admin` tĩnh và `/api/admin` động.
- `bun run build:cloudflare -- https://dongchaythoigian.phungthienphu.workers.dev`: pass, export `/admin` vào web Cloudflare.
- Wrangler `deploy --dry-run` với config production: bundle Web/API pass, không upload/deploy. Còn warning từ dependency `unenv/whatwg-url` về default export; không phải lỗi admin.
- 28 test admin/auth/bridge: pass (7 policy/handler, 6 store, 8 OAuth, 7 bridge).
- 611 test game trong `lib/`: pass, 0 fail.
- Format check cho file mới và `git diff --check`: pass.

## Browser E2E

Chromium thật, frontend production Next, session ký thật, `currentUser`, handler và store thật; database fixture trong RAM. Đã kiểm tra:

1. Chưa đăng nhập: 401 và nút đăng nhập.
2. Người chơi thường: 403; phiên admin cũ: 401.
3. Tổng quan đọc số liệu database fixture.
4. Tìm làng, mở chi tiết, đổi tên, xác nhận; tên mới và audit cùng được lưu, revision và state giữ nguyên.
5. Tìm người chơi bằng email, ghi chú kèm lý do; đọc lại nội dung trong nhật ký.
6. Danh sách trận đánh và chợ giao thương.
7. Phân trang, tìm không có kết quả, phản hồi 503 và nút thử lại.
8. Desktop 1440 px và mobile 390 px, không tràn chiều ngang toàn trang; dialog hỗ trợ Escape.
9. Không có lỗi JavaScript `pageerror` trong suốt lượt E2E.

Ảnh QA: overview desktop/mobile, xác nhận đổi tên, audit, chi tiết người chơi trên mobile. Dữ liệu trong ảnh hoàn toàn là fixture.

## Ranh giới và cấu hình trước khi phát hành

- Kiểm chứng không deploy và không thay đổi database production hay tài khoản người chơi thật.
- Chưa xác minh Google OAuth thật hoặc transaction trên Mongo thật trong lượt này. OAuth được test với Google response giả lập; transaction được test theo Mongo contract có rollback.
- Đặt `ADMIN_USER_IDS` bằng Google user ID đã xác minh trên runtime Web/API trước khi dùng admin thật. Chưa cấu hình thì mọi tài khoản đều bị từ chối quyền admin.
- Hướng dẫn và tiêu chí chi tiết nằm ở `docs/admin-spec.md`.
- Thay đổi `.gitignore` đã có trước khi bắt đầu, được giữ nguyên và không thuộc phần admin.
