# Gameplay chờ thực hiện

## Tự cải tạo ruộng từ Trung đại

Ghi nhận ngày 07/11/2026 theo yêu cầu người chơi. **Chưa triển khai; làm sau công
việc tối ưu hệ thống và kiểm thử migration đang chạy.**

- Vấn đề: chăm lại từng ruộng bạc màu bằng tay tốn nhiều thao tác/thời gian.
- Phạm vi: từ sau thời đồ sắt, tức Trung đại trở đi (`era >= 4`).
- Khi ruộng bạc màu, tự bắt đầu cải tạo và trừ đúng tài nguyên như thao tác cải
  tạo thủ công, không cần người chơi bấm từng ruộng.
- Yêu cầu khi triển khai: không trừ lặp khi retry/offline, không âm tài nguyên;
  thiếu tài nguyên thì hiển thị lý do chờ. Kiểm tra hàng đợi đồng bộ và catch-up
  để việc cải tạo đã trả chi phí tiếp tục đúng tiến độ.
- Không có yêu cầu thay đổi chi phí hoặc rút ngắn thời gian cải tạo trong mục này.
