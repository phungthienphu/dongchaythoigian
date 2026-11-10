# Xoay bản đồ

Phím **Q/E** hoặc hai nút ↶/↷ trong nhóm điều khiển bản đồ đổi góc camera theo 90°: 0, 90, 180, 270. Giữ chính xác điểm thế giới ở tâm màn hình và mức zoom; resize, zoom theo con trỏ, kéo, chọn ô và nút về trại dùng chung phép chiếu/nghịch đảo. Hướng camera được nhớ bằng localStorage `map-rotation`; không thay đổi save hay gửi action server.

Mỗi lần xoay lưu một bitmap của canvas hiện tại, rồi hòa ảnh với cảnh mới trong 260 ms bằng smoothstep. Chỉ render một cảnh mỗi frame và thêm một drawImage; không render hai bản đồ, dùng blur hay xoay cả canvas. Bấm liên tiếp bắt đầu từ ảnh đang thấy. Kéo/zoom/resize hủy bitmap ngay để tương tác không bị trễ. `prefers-reduced-motion` bỏ chuyển cảnh.

Địa hình, bờ sông, fog, vùng xây dựng, kênh, tường, cổng, cầu và đường đi giữ tọa độ thế giới. Thứ tự vẽ và chọn công trình tính theo độ sâu camera. Dân giữ hướng di chuyển thực từ vị trí renderer trước/sau; quân nhà, đoàn viễn chinh và đàn thú dùng hướng hành trình ở camera xoay.

## Phạm vi hình vẽ

Đây là camera bốn hướng cho renderer 2.5D hiện có. Hình nhà và trại là billboard đặt tại tâm ô đã xoay, giữ nét vẽ thẳng và dùng cùng footprint khi chọn. Chưa có bộ mặt sau riêng cho từng nhà, không phải mô hình 3D xoay liên tục. Hạ tầng nối ô dùng hình học thế giới, không billboard, để mối nối và hướng cổng luôn đúng. Không thay đổi hướng công trình hay topology khi xoay camera.

## Kiểm tra

- `bun run type-check`, `bun run test:render`, `bun run build`.
- Renderer kiểm tra 96 tổ hợp viewport/zoom/tâm/góc; vét toàn bộ ô để kiểm tra culling và phép chiếu ngược; giữ tâm, zoom anchor, hướng đi, chọn nhà/cổng/kênh và render không đổi city.
- `/dev/rotation` là làng mẫu độc lập dùng cùng renderer, camera và chuyển cảnh như Game; chọn công trình/ô đất và đổi zoom sau khi xoay.

Phím tắt bỏ qua khi nhập liệu/contenteditable, đang ghép chữ IME, giữ Ctrl/Alt/Meta, giữ phím lặp hoặc sự kiện đã được xử lý. Trong Game, chỉ nhận phím khi map đang sẵn sàng và không bị màn hình khác che tạm dừng render. Phím R để đổi hướng tường/cổng giữ nguyên.
