# Báo cáo phát hành — 07/11/2026

## Người chơi nhận được gì?

**Đồng bộ 10 giây áp dụng cho tất cả làng**, không chỉ Nam Quốc Sơn Hà.
Giao lệnh vẫn phản hồi ngay trên máy; máy chủ kiểm tra và lưu theo đợt.
“Chờ lưu” nghĩa là lệnh đang chờ xác nhận; “Đã lưu” chỉ xuất hiện sau khi máy chủ
xác nhận. Vào chợ, ngoại giao, xuất quân hoặc combat sẽ chờ lưu các lệnh trước.
Combat vẫn chạy realtime trên Cloudflare.

Ba tính năng gameplay trong đợt tiếp theo sau bản đồng bộ:

| Tính năng | Luật người chơi cần biết |
|---|---|
| Ruộng tự phục hồi | Từ **Trung đại, sau thời đồ sắt**, ruộng và nông trang bạc màu tự trả phí cải tạo, hoàn tất sau **30 giây**. Giá giống nút thủ công. |
| Thiếu vật liệu cải tạo | Ruộng còn nguyên, nông dân giữ công việc và chờ. Khi đủ thực và gỗ sẽ tự thử lại. Đã trả phí thì hoàn tất dù sau đó kho cạn. |
| Dân bỏ đi/chết vì đói | Sau 1 phút thiếu khẩu phần có cảnh báo. Cứ 10 phút thiếu ăn mất 1 dân; trước mức đói 30 phút họ bỏ làng, từ 30 phút có thể chết đói. Ưu tiên dân rảnh, giữ tối thiểu 3 dân để phục hồi. |
| Hồi phục sau đói | Dân vẫn kiếm ăn. Mỗi giây ăn đủ giảm 2 giây mức đói; một chuyến thức ăn nhỏ không xóa ngay cơn đói kéo dài. Trong cơn đói không sinh thêm dân. |
| Quản lý quân | **Quân đội → Quản lý quân**: xem quân ở nhà, đi xa, đang tuyển; chọn số lượng và xác nhận. |
| Sa thải | Mỗi quân thành **1 dân rảnh**, phải còn chỗ ở. Vẫn ăn khẩu phần dân, không hoàn phí tuyển. |
| Đuổi khỏi làng | Quân rời làng vĩnh viễn, không tăng dân, không hoàn phí tuyển. |

Không giải ngũ quân đang xuất chinh/hộ tống, quân đang tuyển hoặc lính đang qua
sông. Khi làng bị đánh/sắp tiếp địch, việc giải ngũ bị chặn. Thuyền trống vẫn phải
trở về đúng thời gian; giải ngũ không tạo thêm thuyền rảnh. Cho mượn quân **để sau**
theo lựa chọn của chủ dự án. Hướng dẫn trong game đã được bổ sung.

Với làng cũ, tự cải tạo và hậu quả đói mới bắt đầu sau lần tải bản mới; không
áp dụng ngược các quy tắc mới cho quãng offline trước đó. Luật bỏ làng vốn có
vẫn áp dụng khi tính thời gian cũ. Sau phát hành nên tải lại tab để dùng UI và
mô phỏng mới; số liệu được máy chủ quyết định, không nhận số tài nguyên tự khai
báo từ trình duyệt.

## Hệ thống đã thay đổi thế nào?

- Lệnh được ghi cục bộ trước khi chờ gửi; retry có ID/sequence và receipt để
  không xây, trả tiền hoặc giải ngũ hai lần.
- Tab/phiên cũ không được tiếp tục phát lệnh sau khi mất quyền điều khiển.
- Làng đứng yên không gửi batch rỗng; có checkpoint 5 phút khi cần. Đọc làng
  thường dùng projection/cache, tránh ghi cả làng mỗi lần xem.
- Luật mới dùng chung engine ở client/server; kiểm thử xác nhận kết quả offline
  và polling không đều giống nhau.
- Tự cải tạo duyệt danh sách ruộng được giữ trong context, không dò lại toàn bộ
  công trình hay tạo thông báo lặp ở từng giây thiếu vật liệu. Chỉ hoàn tất
  cải tạo mới làm mới context kinh tế cần thiết.

**MongoDB vẫn là nơi giữ làng chính.** Village Worker hiện là prototype trên
làng giả, chưa tiếp quản dữ liệu người chơi thật. Phát hành đồng bộ 10 giây
không có nghĩa là hoàn thành toàn bộ migration sang Cloudflare.

## Kiểm thử đã hoàn thành

- 309 kiểm thử thư viện/engine, 62 kiểm thử API trong 17 process riêng, 16 kiểm
  thử Worker; type-check và build production đều qua.
- So với bản tối ưu trước, 6.400 đường đi và 24 so sánh làng ngắn hạn không đổi
  ngoài các luật mới được kiểm thử riêng.
- Bộ kiểm tra render/actor/picking qua; có 522 tư thế actor và 440 tư thế dân.
- Browser local: chọn số quân, quay lại bước xác nhận, sa thải, đuổi, chặn thiếu
  chỗ ở; modal không tràn chiều rộng 390px. Dữ liệu thử là dữ liệu giả.
- Browser local: ruộng tự cải tạo, hết thực sau thanh toán vẫn hoàn tất; dân bỏ
  làng rồi chết khi đói kéo dài và thông báo hiện đúng.
- HTTP + Mongo replica set local: giải ngũ lưu đúng; replay cùng batch giữ
  nguyên document; thiếu quân trả lỗi mà không mất quân/dân.
- Trước đợt gameplay: soak đồng bộ **2 giờ thực, 100/100 vòng** HTTP + retry +
  WebSocket reconnect đã qua. P95 HTTP 39ms là số local, không phải CPU Vercel.
- Bản đồng bộ toàn bộ `87a2cf0` đã được xác minh Vercel Ready và thử trên tài
  khoản thật: “Chờ lưu” chuyển thành “Đã lưu”. Không dùng tài khoản thật để thử
  đuổi quân, mất dân hoặc tiêu vật liệu.
- Production gameplay đã kiểm tra trên tài khoản đăng nhập thật: mở Quân đội,
  bảng quản lý hiện đúng quân/chỗ ở và hai cách giải ngũ; đóng mà không gửi lệnh.
  Trang chủ 200, hai API chưa đăng nhập 401, trang QA population 404.

Các commit gameplay tách riêng: `da07ee3` ruộng, `36c5a5d` đói,
`ccfcb18` quản lý quân. Báo cáo cân bằng ở
[game-balance-report-2026-11-07.md](./game-balance-report-2026-11-07.md).

## Anh có phải cấu hình gì thêm?

**Không.** Vercel Production đã có `CITY_BATCH_ENABLED=true` và đã bỏ
`CITY_BATCH_CANARY_IDS`, nên áp dụng toàn bộ. Các tính năng gameplay không cần
thêm env, collection hay namespace. Giữ Mongo/OAuth/Worker secret hiện có.
Combat Worker không có luật chiến đấu mới trong đợt này; không cần deploy lại.

## Chưa thể kết luận điều gì?

Chưa đủ dữ liệu cùng tải ít nhất 48 giờ để khẳng định hết nguy cơ chạm CPU gói
free. Bài thử làng giả lớn tính bù 24 giờ vẫn dùng khoảng 11–23 giây CPU Node
local; đây là giới hạn còn lại, xem báo cáo cân bằng mục 8. Batch giảm request,
ghi DB và công việc lặp; không làm phần CPU đã tiêu
thụ được hoàn lại. Soak không chứng minh không có memory leak. Google OAuth
đổi máy và vòng đời app trên điện thoại vẫn cần nghiệm thu riêng.
