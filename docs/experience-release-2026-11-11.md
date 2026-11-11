# Release trải nghiệm và công trình — 11/11/2026

## Bản đầu

- Commit `8f363b2`, đã push `main`.
- Release `experience-expansion-20261111`.
- Web/API `03e85bb2-574b-4efa-8bec-6306084e046d`.
- Combat `37124734-26f1-4be2-a173-15c8ac50c20f`.
- Production: https://dongchaythoigian.phungthienphu.workers.dev/
- 547 test game, typecheck, render regression, build Cloudflare, 9 test API và 18 test Worker qua.
- Smoke production: 41 request, 19 asset; hash 8 JS/CSS khớp artifact; `/dev/expansion`, `/dev/magic-ui`, `/dev/eras` đều 404; anonymous Combat 401.
- Browser mở đúng Nam Quốc Sơn Hà, Hiện đại, trạng thái Đã lưu. Không gửi lệnh xây/mua/tấn công bằng tài khoản thật.
- Reconcile: combat checked 0 / failed 0; market checked 0 / failed 0.

## Rà soát và cập nhật cân bằng

Commit `288debe`: hai công thức xưởng có đánh đổi hữu ích hơn, tầm bắn và ưu tiên mục tiêu của ba tháp, số thu chi tài nguyên ma pháp. Không tăng giá xây hoặc phạt thiên tai thêm. Có mốc kích hoạt giữ lịch sử offline và replay save cũ.

Phương pháp, sản lượng thực nhận và các giới hạn ở [building-expansion-2026-11-11.md](building-expansion-2026-11-11.md). Benchmark dùng fixture riêng, đầu vào/mana/điện có sẵn; không phải playtest đô thị tự nuôi toàn chuỗi.

Rollback bản đầu trước phiên này: Web/API `5dbf5856-0f44-45bb-b373-de9b228a0a53`, Combat `b804fab2-2215-4e49-b524-b1acf652c993`. Rollback cân bằng có thể quay về hai version trong phần Bản đầu; không ghi backup đè database.

Trạng thái bản cân bằng: **đã deploy sau khi người dùng xác nhận**.

- Release `experience-balance-20261111`.
- Web/API `4c07949d-b659-4c57-9f8b-383e34e95afd`.
- Combat `7a942f80-db74-4277-a3f7-1f024deb379d`.
- Smoke sau cập nhật: 30 request / 19 asset qua, 8 JS/CSS khớp hash artifact, 3 dev route 404, anonymous Combat 401.
- Reconcile combat/market: 0 lỗi. Browser mở đúng Nam Quốc Sơn Hà, 990 dân, trạng thái Đã lưu.
- Hướng dẫn lệnh chạy tay: [manual-cloudflare-release.md](manual-cloudflare-release.md).

Kiểm chứng bản cân bằng: 551 test game / 0 fail; 9 test API; 18 test Worker; typecheck và build Cloudflare qua. Browser local: phù văn đã nộp +0, đã chi −10, không còn NaN. Có test thực tế bảo toàn công thức cũ khi catch-up, chuyển công thức sau mốc kích hoạt, ưu tiên zombie phá nhà ngoài tầm Pháp trận và trừ mana đúng.
