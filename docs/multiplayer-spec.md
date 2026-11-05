# Chế độ nhiều người chơi: thiết kế đã chốt

Ghi lại các quyết định đã thống nhất với người làm game (2026-11-05). Con số đánh dấu *(tạm)* là đề xuất mặc định, chỉnh khi cân bằng game.

## 1. Tài khoản và bạn bè
- Đăng nhập bằng tài khoản Google.
- Thành phố đang chơi theo cookie được gắn vào tài khoản ở lần đăng nhập đầu tiên, không mất dữ liệu.
- Kết bạn bằng mã mời.

## 2. Bản đồ thế giới
- Hai lớp bản đồ: làng của mình (96×96, chỉ mình thấy chi tiết) và bản đồ thế giới (mỗi nước là một điểm cố định).
- Thấy và đánh được mọi nước trong tầm. Bạn bè được xếp gần nhau và đánh dấu nổi bật.
- Trên bản đồ thế giới hiện các sứ giả và đoàn quân đang đi.

## 3. Sứ giả
- Phải xây nhà sứ giả mới có sứ giả. Tên và dáng đổi theo thời đại *(tạm)*:
  - Thời đồ đá: Người đưa tin, ở Lều đưa tin.
  - Thời đồ đồng: Sứ giả, ở Nhà sứ giả.
  - Thời đồ sắt: Sứ thần, ở Sứ quán.
- Sứ giả đi trên bản đồ thế giới, mất thời gian theo khoảng cách.
- Tới nơi thì xem được làng đối phương đang chạy trực tiếp: máy người xem tự tính bằng engine tất định, khoảng 5 giây hỏi server một lần xem làng có thay đổi không.
- Lần thăm là điều kiện để đánh: chỉ đánh được nước mà sứ giả đã thăm trong 3 ngày gần nhất *(tạm)*.

## 4. Phòng thủ
- Tường thành, tháp canh, cổng theo thời đại.
- Lính ở nhà đứng gác các điểm do chủ làng đặt.

## 5. Trận đánh realtime
- Quân hành quân trên bản đồ thế giới. Bên bị đánh nhận cảnh báo ngay (đẩy qua kênh realtime).
- Trận diễn ra trên bản đồ làng bị đánh, trong một phòng Cloudflare Durable Object. Phòng mở khi quân tới và đóng khi trận kết thúc. Server tính trận khoảng 10 lần mỗi giây.
- Cả hai bên điều khiển từng nhóm lính kiểu Đế chế: chọn nhóm, kéo đi, chỉ định mục tiêu.
- Bên vắng mặt do máy điều khiển: giữ vị trí gác, đánh kẻ địch ở gần, bảo vệ Đình và kho.
- Kết thúc trận, phòng ghi kết quả về cả hai làng.

## 6. Giới hạn thiệt hại
- **Thiệt hại bên thua:** mất tối đa một nửa dân, mất lương thực và tài nguyên, nhà bị cháy. Nhà cháy có lửa và khói, không hoạt động cho tới khi sửa (tốn tài nguyên).
- **Mức tàn phá** là một con số cộng gộp *(trọng số tạm)*:
  - 50% × (giá trị công trình bị đốt / tổng giá trị công trình)
  - 30% × (dân bị mất / một nửa dân số)
  - 20% × (tài nguyên bị cướp / phần tối đa được cướp)
- **Ngưỡng xử thua cho bên thủ:** 40% nếu bên thủ không online, 50% nếu bên thủ đang online chỉ huy.
- **Bên thủ thua (chạm ngưỡng):**
  - Ngừng chiến ngay. Quân bên thủ không được đánh nữa.
  - Quân bên đánh mang chiến lợi phẩm hành quân về an toàn.
  - Hiện banner: "Thí chủ hãy giữ cho mình chút nhân tánh, hãy cho những người lương thiện một con đường sống…"
- **Bên đánh thua** (toàn quân ngã, ra lệnh rút lui, hoặc hết giờ trận 3 phút *(tạm)* mà chưa chạm ngưỡng):
  - Không cướp được gì thêm.
  - Bên thủ được truy kích: quân còn lại vẫn bị đánh cho tới khi rút ra khỏi bản đồ làng.
- Luật thêm *(tạm)*: khiên bảo vệ vài giờ sau khi bị đánh, không đánh người kém mình quá 1 thời đại.

## Thứ tự làm
1. Tài khoản Google và bạn bè.
2. Bản đồ thế giới và sứ giả.
3. Phòng thủ.
4. Phòng trận realtime trên Cloudflare.
5. Luật công bằng (khiên, chênh lệch thời đại).
