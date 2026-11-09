# Tường xoay hướng và nối góc

Tường trước đây luôn chạy theo trục x, kể cả khi xây một tuyến theo trục y hoặc quây góc. Bản này vẽ đúng đường nối cho cả sáu thời đại, kèm hướng cổng và vùng bấm chọn tương ứng.

- Mặc định **Tự nối**. Xét bốn ô sát cạnh để tạo đoạn cuối, đường thẳng, góc L, ngã ba, ngã tư. Không nối chéo hoặc vượt biên bản đồ. Đoạn rời mặc định chạy theo x.
- Nút **Xoay 90°** và phím **R** khi đặt chuyển sang đoạn thẳng cố định x/y. Có thể xoay lại công trình đã xây, hoặc chọn Tự nối để khôi phục ghép góc. Không mất tài nguyên, thời gian hay thợ. Phím R không hoạt động khi nhập chữ hoặc mở Thế giới/trận đánh/hướng dẫn.
- Cổng ở chế độ tự nối chọn trục có nhiều tường sát cạnh hơn, hòa chọn x. Chỉ hai bên trụ cổng tham gia nối tường; mặt lối đi không nối thành nhánh tường.
- Hướng cố định chỉ cho nối qua hai đầu của trục đó, được kiểm tra hai chiều. Tường cháy không nối; đoạn đang xây vẫn được tính để bố trí tuyến trước khi hoàn thành.
- Bản xem trước ghép cả đoạn mới và các đoạn bên cạnh. Đặt thêm, phá dỡ, cháy hoặc đổi hướng cập nhật hình từ bốn ô kề, không cần tính lại toàn bản đồ.
- Mô phỏng giữ ô va chạm hiện tại: tường chặn cả ô, cổng cho quân nhà qua như trước. Không thay HP, sát thương, giá, thời gian xây hay cơ chế tìm đường.

`Building.orientation` là trường tùy chọn x/y; không có nghĩa là Tự nối. Làng cũ tự nhận cách vẽ mới, không cần ghi đè hoặc migration. Lệnh `orientDefense` được kiểm tra đầu vào và đồng bộ theo hàng lệnh 30 giây hiện có; không thêm request định kỳ. BattleView và chế độ thăm làng dùng chung bản vẽ và metadata của làng.

Kiểm chứng: 386 kiểm thử engine và 16 Worker đạt. Kiểm tra render gồm 324 tổ hợp tường/cổng, thời đại, cấp và hướng; xác nhận cánh tường/trụ cổng bấm được và phép xoay không ảnh hưởng công trình kế tiếp. QA trình duyệt dùng `/dev/walls` với dữ liệu giả: góc L/T/X, xoay cổng, trở lại tự nối, hàng rào gỗ, tường đá và tường hiện đại. Đường dẫn QA bị chặn trên production.

Không cần ENV hay collection mới. Triển khai battle Worker cùng game/API để cùng hiểu lệnh và dữ liệu hướng mới.
