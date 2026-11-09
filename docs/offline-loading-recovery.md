# Tải làng và tính bù offline

## Lỗi được xử lý

Tài khoản đã có làng có thể bị đưa nhầm về form đặt tên khi GET `/api/city` timeout. Một làng khoảng 66 giờ offline cần 9 giây tính trên Node ở máy kiểm thử, có nguy cơ vượt CPU của Durable Object trên production. Dữ liệu làng vẫn hợp lệ.

## Luồng mới

- OAuth xác nhận đăng nhập, sau đó frontend hiển thị màn tải bản đồ riêng.
- Chỉ HTTP 404 với `needsName: true` (tài khoản không có cityId) mở form đặt tên. Không tìm được làng của tài khoản đã có cityId trả 409, giữ dữ liệu.
- Làng vắng hơn 30 phút được tính bù từng đoạn: tối đa 1 giờ mô phỏng hoặc khoảng 1,2 giây xử lý, kiểm tra ngân sách mỗi 64 tick. Đây là ngân sách mềm; khởi tạo, một tick nặng và I/O vẫn có thể mất thêm thời gian.
- Mỗi đoạn lưu trạng thái và mốc tiếp tục bằng Mongo CAS theo owner/revision. Thành công mới trả HTTP 202 với tiến trình. CAS thất bại trả 202 không công bố tiến trình chưa lưu, không lặp tính 5 lần trong cùng request.
- Frontend gọi tiếp tuần tự sau 250ms, không gọi song song. Lỗi kết nối hiện nút Thử tải lại; reload tiếp tục từ mốc đã lưu.
- Đích tính bù đầu tiên, kích hoạt luật cho dữ liệu cũ và giới hạn 14 ngày giữ nguyên qua các đoạn. Giữ tick một giây và cơ chế mang tài nguyên về kho.
- Trong lúc chưa hoàn tất, không cho các writer thông thường settle trạng thái dở; không chạy mutation, ghi action receipt hoặc tăng batch ACK. Outbox sứ giả được giữ cùng checkpoint; sẽ phát qua cơ chế outbox hiện có.
- Trận đánh đang hoạt động không bị tính bù kinh tế.

Không cần env mới, schema migration hoặc đổi AUTH_SECRET. Mongo vẫn là nguồn dữ liệu chính. Batching hành động vẫn 30 giây. Không deploy lại combat Worker vì không thay đổi mã trong worker/.

## Kiểm thử

- Full vs budgeted, JSON reload, thời đại 1–6, luật legacy, mốc lẻ, giới hạn 14 ngày.
- API 202, CAS conflict, xác thực/ownership, checkpoint tiếp tục sau reload; ACK và receipts không đổi trong recovery.
- Loader tuần tự, abort, mạng lỗi và phân biệt tài khoản chưa có làng.
- Bản sao chỉ đọc của tài khoản lỗi: 67 đoạn với giới hạn một giờ, kết quả toàn bộ trạng thái trùng với full settlement trên V8; lượt lâu nhất khoảng 0,27 giây trên máy kiểm thử. Thời gian này không phải số đo CPU Cloudflare.
- Workerd local + Mongo QA: khôi phục 12 giờ offline qua 14 phản hồi thành công; có một timeout kết nối và tiếp tục được từ checkpoint. Toàn bộ trạng thái cuối trùng full settlement, ACK giữ nguyên. Các phản hồi thành công lâu nhất khoảng 1,05 giây; đây không phải cam kết mọi request đều dưới mức đó.
- Trình duyệt dùng bản static build và API giả: tải lỗi không mở form, nút thử lại hoạt động, hiển thị phần trăm rồi vào map; tài khoản mới có form đặt tên.
