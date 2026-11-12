# Xe cứu thương — triển khai 12/11/2026

Bản phát hành riêng theo `hospital-ambulance-spec-2026-11-11.md`; không kèm thay đổi tường, tỷ lệ thiên tai hoặc lịch zombie của task khác. Release ID: `hospital-ambulance-20261112`. Kết quả deploy được ghi riêng sau khi xác minh production.

## Hành vi

- Bệnh viện cấp 1/2/3 có 1/2/3 xe; mỗi xe cần một thợ tại viện và một giường giữ chỗ. Thu 80 thực + 10 vàng một lần khi nhận ca.
- Xe tìm đường trên đất đã khám phá, qua cầu/cổng, đón dân ngoài bán kính 6 ô. Ưu tiên người ngã sắp hết hạn; cơ sở đủ điều kiện có ETA thấp hơn được chọn trước.
- Đi đón → sơ cứu 30 giây → chở về → điều trị. Tài xế và xe rảnh khi nhập viện. Bệnh nhân/driver trên xe không được vẽ thành dân đứng riêng và không là mục tiêu zombie.
- Mất điện không hủy xe đang đi, nhưng dừng tiến độ điều trị. Tắt tự điều xe chỉ ngừng nhận ca mới.
- Mất đường trước đón 60 giây: hủy ca, xe quay về. Kẹt sau đón tối đa 20 phút: trả bệnh nhân với thời gian sống còn lại, không cấp lại 10 phút. Ngân sách ổn định lưu trên bệnh nhân để đổi tài xế/reload không cấp lại 20 phút.
- Ca `Vital.care` cũ giữ nguyên; save mới lưu state optional `medical` version 1. Building instance bị thay thế không nhận lại ca cũ. PvP pause dịch chuyển các mốc thời gian.
- Bảng viện có xe, thợ, giường, bật/tắt tự điều xe, danh sách ca, định vị, thời gian còn lại và lý do chờ. Cảnh báo khẩn không tính dân đã lên xe/nhập viện như dân còn nằm chờ ngoài đường.

## Kiểm chứng

- Bộ logic 597/597, API 9/9, Combat Worker 18/18 đều qua trên checkout phát hành riêng.
- 15 test riêng về y tế: cứu xa, triage, điều kiện nhận ca, deadline chính xác, thu phí một lần, JSON reload, offline settlement/checkpoint, phá/thay viện, power pause, PvP pause, tắc đường, legacy, backend assignment, ngân sách ổn định.
- TypeScript và build Cloudflare production thành công; build chỉ tạo artifact local.
- Bộ renderer hiện hữu qua; thêm bốn hướng xe × hai trạng thái sơ cứu để kiểm tra tọa độ hữu hạn và Canvas state cân bằng.
- Browser synthetic: 3 xe tự đón 3 người, chuyển sang 3 ca điều trị và giải phóng xe; định vị bệnh nhân; bật/tắt tự điều xe. Desktop và mobile 390×844; document width = viewport width = 390, không lỗi console trong lần kiểm tra.
- Không dùng tài khoản hoặc dữ liệu production để QA. Các tình huống cầu/tường chiến đấu thực tế và độ mượt trên thiết bị yếu cần thêm playtest; test tự động không thay thế trải nghiệm trên thiết bị đó.

## Số đo CPU local

Chạy lại bằng `bun tests/medical-performance.ts`. Synthetic 1.500 dân, 3 bệnh viện, tối đa 9 xe, 120 lượt y tế (mỗi giây mô phỏng một lượt): trung vị 0,67 ms, p95 2,19 ms, tối đa 9,04 ms, tổng 110,56 ms. Chỉ đo `stepMedical`, không gồm renderer/HTTP hoặc toàn bộ settlement. Không có baseline FPS tương đương nên không suy ra phần trăm tối ưu toàn game.

BFS dùng lại cây đường từ viện cho nhiều bệnh nhân; WeakMap theo City, tối đa 8 cây, đổi topology/fog thì bỏ cache. Không thêm cronjob hoặc request nền mới.
