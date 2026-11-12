# Bảo trì HP công trình — production 12/11/2026

- Source: `b0cd267`, đã push `origin/main`.
- Release ID: `building-maintenance-20261112`.
- Web/API: `557a7714-51c7-4b2f-ac07-ab5df7efb9fe`.
- Combat Worker: `7b541b5c-6a73-4c13-9a30-d9528c0768de`.
- Production: https://dongchaythoigian.phungthienphu.workers.dev/

## Phạm vi

Thêm action và nút Bảo trì cho công trình còn tồn tại nhưng mất HP do zombie; hiển thị HP hiện tại/tối đa và chi phí theo tỷ lệ hư hại. Phục hồi đầy HP sau khi backend kiểm tra vật liệu và thanh toán, không chữa cháy/ngập hay hồi sinh nhà đã bị phá. Chờ kết thúc PvP để bảo trì. Không thay dữ liệu người chơi bằng script/SQL.

Giữ toàn bộ bản bệnh viện và wall/rest đã phát hành trước; không đưa thay đổi chưa commit của task khác vào bản phát hành này.

## Kiểm chứng

Checkout riêng `/tmp/dong-maintenance-release-20261112` từ `8901e34`:

- 608/608 test logic; 9/9 API/Cloudflare bridge; 18/18 Combat Worker.
- TypeScript, renderer, `git diff --check` và Cloudflare production build qua.
- Browser synthetic desktop/mobile 390×844 trước phát hành: bệnh viện 12900/25800 HP bảo trì thành 25800/25800 HP, nút biến mất sau thành công; không tràn ngang hoặc lỗi console.
- Public production smoke sau deploy: health khớp release và `gameReady: true`; trang chủ HTTP 200; 8 JS/CSS (gồm chunk trang có mã Bảo trì) có SHA-256 khớp build; dev routes HTTP 404; city API và Combat Worker từ chối anonymous HTTP 401.

Không thực hiện bảo trì trên tài khoản production. Public smoke không có cookie/tài khoản và không gọi đối soát hoặc sửa dữ liệu làng.

Chi tiết quy tắc và test: `building-maintenance-2026-11-12.md`.
Log local: `/tmp/maintenance-release-{tests,types,api,render,worker,build,web-deploy,battle-deploy,smoke}.log`.
