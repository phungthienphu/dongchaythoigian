# Theo dõi gameplay

## Tự cải tạo ruộng từ Trung đại

Ghi nhận ngày 07/11/2026 theo yêu cầu người chơi. **Đã triển khai** cùng bộ kiểm thử tự cải tạo, chờ vật liệu và catch-up.

- Vấn đề: chăm lại từng ruộng bạc màu bằng tay tốn nhiều thao tác/thời gian.
- Phạm vi: từ sau thời đồ sắt, tức Trung đại trở đi (`era >= 4`).
- Khi ruộng bạc màu, tự bắt đầu cải tạo và trừ đúng tài nguyên như thao tác cải
  tạo thủ công, không cần người chơi bấm từng ruộng.
- Yêu cầu khi triển khai: không trừ lặp khi retry/offline, không âm tài nguyên;
  thiếu tài nguyên thì hiển thị lý do chờ. Kiểm tra hàng đợi đồng bộ và catch-up
  để việc cải tạo đã trả chi phí tiếp tục đúng tiến độ.
- Không có yêu cầu thay đổi chi phí hoặc rút ngắn thời gian cải tạo trong mục này.

## Dân đói và quản lý quân

Đã triển khai: đói tích lũy, dân bỏ làng/chết, hồi phục và thông báo; sa thải
quân ở nhà thành dân hoặc đuổi vĩnh viễn, có bảng số lượng và xác nhận.
Cho mượn lính để sau theo lựa chọn của chủ dự án.

Chi tiết và các vấn đề cân bằng chưa điều chỉnh:
[game-balance-report-2026-11-07.md](./game-balance-report-2026-11-07.md).
