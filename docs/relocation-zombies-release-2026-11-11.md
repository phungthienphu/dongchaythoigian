# Ty Dời dựng và kích hoạt zombie cho các làng hiện có

Release ID: `relocation-zombies-20261111`.

Theo yêu cầu chủ game ngày 11/11/2026:

- Ty Dời dựng mở từ Hiện đại (đời 6), tối đa một Ty; di dời có phí vật liệu, vàng, thời gian và một đội xây. Chi tiết tại [building-relocation.md](building-relocation.md).
- Bến cảng bình thường cần Ty; cảng mắc cạn vẫn được cứu hộ để tránh khóa làng cũ. Hai API di dời dùng chung phần thực hiện, giữ hàng dân đang vận chuyển.
- Kích hoạt zombie cho toàn bộ làng hiện có, thay cho chính sách tự bật trước đây. Làng chưa bật nhận năm phút chuẩn bị từ thời điểm migration, không có đợt tấn công hồi tố. Làng đã bật giữ nguyên lịch/thiệt hại và không reset báo cáo.
- Làng mới vốn đã tự bật zombie; không thay đổi quy tắc đó.

Script vận hành (chỉ chạy khi được chủ game yêu cầu bật toàn bộ):

```bash
# Xem số lượng, chưa ghi dữ liệu
bun scripts/activate-existing-zombies.ts
# Kích hoạt làng còn thiếu. Có thể chạy lại, không reset làng đã bật.
bun scripts/activate-existing-zombies.ts --apply
```

Script dùng cấu hình MongoDB local, không in thông tin đăng nhập. Chỉ cập nhật state.zombies, thêm cảnh báo vào nhật ký, updatedAt và tăng ver bằng CAS để yêu cầu đang chạy phải tải lại dữ liệu; không ghi đè toàn bộ save. Snapshot theo revision tự bị vô hiệu hóa. Không tắt zombie khi rollback code; migration dữ liệu tách khỏi rollback worker.

Kết quả preflight production: 7 làng, cả 7 chưa có trạng thái zombie.
