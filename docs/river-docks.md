# Cảng sau khi sông đổi dòng

Cảng phải ở trên đất và kề sông theo cạnh ô, không chéo; kênh không thay thế được sông. Cảng mất bờ sông sẽ mắc cạn: ngừng đóng thuyền, không hỗ trợ chuyến qua sông mới. Giữ nguyên đội thuyền, cấp cảng và hàng chờ đóng. Chuyến đã xuất phát giữ nguyên đặt chỗ, không xóa quân hay thuyền giữa đường.

Chọn cảng → **Chuyển bến** → bấm ô trống sát sông → xem và xác nhận phí. Một đội thợ xây làm việc; phí trả một lần lúc xác nhận, không yêu cầu giữ đủ kho trong suốt tiến trình:

- Khoảng cách `d` là số ô Chebyshev; cấp hiện tại là `L`.
- Gỗ: `(40 + 20d) × L`; lương thực: `(20 + 10d) × L`.
- Thời gian: `30 + 10d` giây.

Chuyển bến giữ cấp, thuyền và phần đóng dở; ngừng hoạt động trong thời gian di chuyển. Tại bờ mới, cháy/ngập cũ vẫn cần sửa riêng. Nếu sông lại đổi trong lúc đang chuyển, công trình hoàn tất nhưng còn mắc cạn nếu không còn bờ sông. Cảng bị dòng mới tràn lên được giữ lại ở trạng thái ngập/mắc cạn để cứu, các công trình khác vẫn theo quy tắc thiên tai hiện có.

## Phòng ngừa

Đê hoàn tất và đang hoạt động bảo vệ vùng 2 ô và vùng bao kín giống lớp bảo vệ lũ hiện có. Dòng sông mới tránh phần đất được bảo vệ (không biến đất đó thành lòng sông). Dự báo được tính lại khi đê xây/sửa xong và lúc sự kiện xảy ra; dữ liệu làng cũ có tuyến dự báo sẵn cũng được kiểm tra. Nếu không tìm được tuyến hợp lệ, sông giữ dòng cũ. Đê cháy/ngập/chưa xây xong không bảo vệ; động đất vẫn là nguy cơ riêng. Cảng ngoài vùng này vẫn có thể mất bờ sông.

Đoạn lòng sông hiện có nằm trong vùng đê che cũng được giữ nước: hướng mới không được làm khô đoạn đó. Vì vậy có thể gia cố bờ sông quanh cảng trước sự kiện để giữ bến.

## Thông báo thiên tai

Lũ, động đất, đổi dòng và cảng mắc cạn có hộp thư riêng lưu trong dữ liệu làng, giới hạn 30 thông báo gần nhất; không bị các dòng nhật ký sản xuất đẩy mất. Có cảnh báo trước và báo cáo kết quả, nêu tên công trình/cách sửa cùng nút tới vị trí (tối đa 24 vị trí mỗi thông báo). Banner không hiện cảnh báo đếm ngược cũ khi đã có báo cáo kết quả của cùng loại thiên tai mới hơn. Khi vào lại, sự kiện offline chưa đọc vẫn xuất hiện. Bấm Đã đọc để ẩn; trạng thái đọc được nhớ trên trình duyệt, lịch sử vẫn xem được trong Thông báo.

Thử giao diện an toàn: `/dev/river` (404 trên production). Toàn bộ API trong bản thử được mô phỏng bằng engine thật, không truy cập tài khoản hoặc MongoDB.
