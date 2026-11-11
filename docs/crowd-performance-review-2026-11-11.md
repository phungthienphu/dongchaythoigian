# Nghiên cứu dân tụ cùng chỗ

Trạng thái: đề xuất, chưa triển khai. Nghiên cứu sau khi đã release UI + sinh than `572923a`.

## Bằng chứng trong code

- `Crowd.sync` trong `components/villagers.ts`: dân rảnh không có mục tiêu dùng `city.camp`; cache `homeByTarget` và `nearestHome` chọn cùng nhà gần nhất, không phân bố theo số người. Wander quanh nhà trong bán kính nhỏ nên chỉ nới cụm, không phân tán khắp làng. Không phải mọi cụm đông đều là lỗi: người giao hàng hoặc cùng nhận lệnh có thể thật sự cùng tới một điểm.
- `Crowd.update` duyệt mọi actor mỗi frame. `haulVisual` của mỗi nông dân đang làm việc lại filter toàn bộ `city.people`, sort nhóm theo ID rồi tìm slot. Với N dân và F nông dân, phần lọc tốn O(F×N) mỗi frame, chưa kể sort lặp.
- `drawCity` trong `components/draw.ts`: mọi dân visible trên tile trong viewport đều thêm một item có closure, rồi được sort theo chiều sâu và vẽ riêng. Người che kín nhau vẫn chịu đầy đủ chi phí vẽ; chọn nhiều người còn vẽ tên/nền chữ riêng cho từng người.
- Hit testing (`pickVillager`/`pickVillageTarget`) dùng danh sách actor. Gom hiển thị phải cập nhật tương tác tương ứng; không được để người dùng click nhầm người bị ẩn.

## Thứ tự đề xuất

1. **Index vị trí làm ruộng một lần mỗi frame.** Tạo slot theo nhóm công trình và ID ổn định, dùng lookup O(1) khi cập nhật từng người. Phải hỗ trợ snapshot clone, đổi task tại chỗ, thêm/xóa dân và giữ nguyên bốn vị trí hiện tại. Không cache theo identity City vì state mutate tại chỗ. Mục tiêu là bỏ N lần quét lặp, không thay đổi hành vi.
2. **Hiển thị theo mật độ trên màn hình.** Với cụm chồng lấp, vẽ một số ít đại diện và badge tổng người; tăng chi tiết khi zoom vào. Chỉ gom những người có trạng thái tương thích. Người đang được định vị hoặc gặp nguy hiểm cần hiện rõ; badge mang thông tin số người chọn, mang hàng, bị bệnh/ngã và cảnh báo liên quan. Click badge mở danh sách chọn từng người. Chọn vùng và lệnh nhóm vẫn dùng đủ ID thật. Giới hạn nhãn tên khi chọn hàng trăm người. Dùng ngưỡng vào/ra khác nhau và đại diện ổn định để tránh nhấp nháy khi camera dịch chuyển.
3. **Phân bố dân rảnh về nhiều nhà hợp lệ.** Chỉ áp dụng hoạt ảnh trang trí cho idle không có lệnh đứng; phân bố ổn định theo ID, khả năng tiếp cận và sức chứa. Không dịch người mang hàng, đang giao chiến, trú ẩn hoặc có lệnh. Vị trí hiển thị phải khớp picking và không tạo sai lệch vị trí mục tiêu chiến đấu; cần kiểm tra ranh giới vị trí authoritative trước khi triển khai. Phân tán đẹp hơn nhưng tự nó không giảm số sprite phải vẽ.
4. **Cache sprite có giới hạn bộ nhớ nếu vẽ vẫn nặng.** Key gồm era/job/pose/hướng/màu/cargo và scale/DPR; chia pha hoạt ảnh có kiểm soát, cache hữu hạn với eviction. Giữ logic đi lại/giao hàng riêng khỏi sprite. Đo CPU và bộ nhớ để quyết định ngân sách thay vì cache mọi ID và mọi timestamp.

Ưu tiên bước 1 và 2: giải quyết công việc lặp và số hình chồng nhau. Chưa cần thay đổi gameplay hay thêm cron cho vấn đề vẽ cụm đông.

## Kiểm chứng cần có trước release tiếp

- So sánh cùng seed/state/camera, bản production build, 300/1.200/3.000 dân; cùng số dân nhưng phân tán so với tụ một chỗ.
- Đo riêng update, draw, frame p95, độ trễ click/scroll, long tasks và bộ nhớ; không suy ra cải thiện FPS chỉ từ ít draw calls.
- Kiểm tra mọi hướng camera, zoom qua ngưỡng gom, desktop/mobile; chọn một/chọn vùng/tất cả, định vị người, badge tổng khớp số người thật, bệnh/đói/chiến đấu/cargo không mất dấu.
- Simulation và số tài nguyên phải khớp trước/sau; client animation không được tự cộng tài nguyên hay đổi lệnh.
