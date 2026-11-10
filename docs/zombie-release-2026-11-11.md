# Zombie — phát hành nền tảng ngày 11/11/2026

- Code: `a7cc706`, đã push `main`.
- Web/API: release `zombies-a7cc706`; Cloudflare version `a58f523b-bba9-49de-bde2-3c975197d48f`.
- Combat Worker: `deaa5b28-0499-47af-8fdc-6ee78f2cfb4e`.
- Production: https://dongchaythoigian.phungthienphu.workers.dev

Làng mới có zombie từ Đồ đá, đợt đầu sau 5 phút; làng cũ đọc/xác nhận tại Zombie & cứu hộ để bắt đầu, không truy thu đợt. Thường/Super/phá hoại, né hỏa lực quan sát từ Công nghiệp, dân chạy trú/nhiễm/gục/cứu, thiệt hại công trình không hồi và phá nhà vĩnh viễn. Có lều trú, y tế, mõ; dùng quân/tháp hiện có và lệnh điều quân. Giữ vị trí/tự phản ứng quanh điểm gác hiện có; giao diện tổ hộ tống và tuyến nhiều điểm trong spec chưa hoàn thiện, không coi đã nghiệm thu toàn bộ spec zombie.

## Bằng chứng kiểm tra

- Typecheck, build Cloudflare; 447 test game, 18 test Worker, 9 test bridge/world API qua.
- 13 test zombie tập trung vào lịch/reload, thành phần đợt, đường đi/tường/vùng hỏa lực, mốc Công nghiệp, phục hồi dân, cứu hộ/thợ, đỉnh dân 6h, giữ ô báo trồi, lệnh lính, HP khi PvP và sản lượng thực tế khi nhiễm.
- Browser `/dev/zombies`: tạo hình/hoạt ảnh và cảnh giả lập riêng; tiến 60 giây tiêu diệt 9 zombie, không mất công trình ở cấu hình thử. Không thao tác làng người chơi.
- Public production smoke: release/health khớp; SHA-256 8 JS/CSS khớp build; `/dev/zombies` cùng dev routes bị chặn; Battle Worker từ chối anonymous. Chưa kiểm tra luồng kích hoạt trên tài khoản người chơi production.
- Fixture PvE riêng 1.100 dân, 14 ngày, 1.344 đợt: hoàn tất khoảng 227,46 giây wall trên máy local, còn 1.091 dân. Đây là đo mô-đun PvE, không gồm kinh tế/hauling/Mongo/network và không phải benchmark CPU Cloudflare hoặc chứng minh cân bằng. Mẫu chạy lại ở `tests/zombie-performance.ts`; số liệu có thể khác khi đổi logic/cấu hình máy.

Ba đời 7–9 trong `eras-7-9-spec.md` vẫn chưa được mở ở production.
