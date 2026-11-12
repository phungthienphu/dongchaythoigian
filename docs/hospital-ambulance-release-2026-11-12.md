# Bệnh viện và xe cứu thương — production 12/11/2026

- Source commit: `6ff2baa` (`feat: add hospital ambulances and remote civilian rescue`), đã push `origin/main`.
- Release ID: `hospital-ambulance-20261112`.
- Web/API version: `f0929480-717f-4672-ad8c-3295271c6e39`.
- Combat Worker version: `5f8cb19e-1d12-40ca-a0b5-0a795f7e70f7`.
- Production: https://dongchaythoigian.phungthienphu.workers.dev/

## Phạm vi

Phát hành riêng bệnh viện/xe cứu thương, bảng cứu hộ, hiển thị xe, lưu tiến trình và bảo vệ tuyến vận chuyển. Không kèm thay đổi tường/cổng, tỷ lệ thiên tai, nhịp nghỉ zombie hoặc sửa serialization guard của task khác. Các sửa đổi đó vẫn nguyên trong workspace và chưa phát hành trong đợt này. Không thay đổi dữ liệu làng production bằng script hoặc SQL.

## Kiểm tra

Checkout tách riêng `/tmp/dong-hospital-release-20261112` từ `566d1f3`, chỉ áp dụng thay đổi bệnh viện trước khi kiểm tra và commit:

- 597/597 test logic, bao gồm 15 test y tế.
- 9/9 test Cloudflare bridge/world API.
- 18/18 test Combat Worker.
- TypeScript, renderer và Cloudflare production build qua.
- Browser local synthetic: tự đón 3 bệnh nhân, nhập viện/giải phóng xe, định vị, bật/tắt; desktop và mobile 390×844 không tràn ngang.
- Public production: `/api/health` trả đúng release, `gameReady: true`; trang chủ HTTP 200; SHA-256 của 8 JS/CSS tham chiếu từ trang chủ khớp checkout build; dev routes HTTP 404; API city và Battle Worker từ chối anonymous HTTP 401.

Chưa chạy ca cứu thương trên tài khoản người chơi production. Smoke chỉ dùng truy cập public không có cookie/tài khoản, không gọi reconcile hoặc thực hiện tác vụ trong làng.

## Log local

`/tmp/hospital-release-{tests,types,api,render,worker,build,web-deploy,battle-deploy,smoke}.log`.

Chi tiết thiết kế/triển khai và số đo CPU synthetic: `hospital-ambulance-implementation-2026-11-12.md`.
