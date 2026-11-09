# Sự cố Vercel tạm dừng team — 08/11/2026

## Trạng thái đã xác minh

Kiểm tra trực tiếp khoảng 01:05–01:10, UTC+7. Không đổi gói, cấu hình hosting,
ghi DB hoặc chạy tính bù làng production trong quá trình điều tra.

- Domain game trả HTTP **402**, nội dung `Payment required / DEPLOYMENT_DISABLED`.
- Dashboard Usage ghi **44 giờ 23 phút / 4 giờ Fluid Active CPU**, team Paused.
- Theo dự án: game **44 giờ 14 phút (99,7%)**, `ve-cung-toi` **8 phút 46 giây
  (0,3%)**. Các số làm tròn nên không cộng khớp tuyệt đối.
- MongoDB ping thành công, vẫn có **8 làng đã lưu**. Lần lưu gần nhất đọc được
  là `2026-11-07T17:59:11.467Z`. Chỉ đọc số lượng và thời điểm, không xuất danh
  tính hoặc nội dung làng.
- Email ghi tự mở lại 07/12; banner dashboard hiện 08/12. Hai nguồn đang lệch
  ngày; không coi một trong hai là cam kết thời điểm chính xác từ phía dự án.
- Usage báo dữ liệu có thể trễ một giờ. Cửa sổ Last 30 Days đang chọn không tự
  chứng minh ranh giới kỳ tính quota. Số 44 giờ là cộng dồn, chưa tách theo
  deployment, không được gán hết cho bản cân bằng vừa phát hành.

## Tải gần nhất

Dashboard Functions được reload, Production / Last 6 hours, khoảng 19:05 ngày
07/11 đến 01:05 ngày 08/11. Không lọc theo deployment; khoảng này chứa nhiều
phiên bản. Số CPU và lượt gọi làm tròn, không phải phép so trước/sau cùng tải.

| Endpoint | Lượt gọi | Active CPU |
|---|---:|---:|
| `/api/city/batch` | 1,2 nghìn | 7 phút |
| `/api/city` | 686 | 4 phút |
| `/api/market` | 608 | 2 phút |
| `/api/diplomacy` | 778 | 36 giây |
| `/api/battles` | 390 | 36 giây |
| `/api/me` | 515 | 25 giây |
| `/api/battles/reconcile` | 360 | 16 giây |
| `/api/visit/[id]` | 18 | 13 giây |
| `/api/city/checkpoint` | 22 | 12 giây |
| `/api/world` | 11 | 2,56 giây |

Tổng mười dòng trên khoảng **15,3 phút CPU / 6 giờ**. Nếu tốc độ đó giữ nguyên
cả tháng thì riêng chúng quy đổi khoảng **30,7 giờ / 30 ngày**; đây là phép
ngoại suy, không phải dự báo lưu lượng. So với bốn giờ free, vẫn cần giảm khoảng
87%. Chưa cộng các dòng trang sau và dự án khác dùng chung team.

Đối soát định kỳ đã rẻ hơn số lịch sử được ghi trong báo cáo cũ; hiện xử lý
làng là phần lớn nhất. Chưa có trace đủ để giải thích chính xác toàn bộ
44 giờ đã tiêu trong từng deployment.

## Nguyên nhân kiến trúc và giới hạn của bản tối ưu

Gom lệnh 10 giây giảm request và load/save lặp, nhưng MongoDB và các route
Next.js vẫn là đường xử lý chính của làng. `withCity`, Batch API, đọc làng và
chợ vẫn cần tính mô phỏng. Village Durable Object mới là prototype dữ liệu
giả, chưa được chuyển làng thật vào.

Tối ưu không hoàn lại quota đã dùng. Redeploy, rollback, đổi env batch hoặc
tăng delay không tự bỏ khóa team. Tăng delay cũng không loại bỏ tổng công
tính bù theo thời gian. Test chức năng và build qua không nghiệm thu ngân
sách CPU production.

## Các phương án khôi phục

| Phương án | Khả năng khôi phục | Chi phí và việc cần làm |
|---|---|---|
| Nâng Vercel Pro | Đường nhanh nhất giữ URL và Google callback hiện tại; xác minh lại sau khi nâng | Giá niêm yết từ 20 USD/tháng, có 20 USD usage credit; thuế, seat và sử dụng phát sinh tùy cấu hình. Chủ tài khoản tự xác nhận thanh toán |
| Chuyển toàn bộ app Next.js sang máy chủ Node/Bun | Giữ Mongo và Battle Worker hiện có, không bắt buộc đổi quyền ghi làng | Cần máy chủ, địa chỉ mới/custom domain, HTTPS, OAuth callback, lịch đối soát, deploy/rollback và giám sát. Chưa tạo máy chủ hoặc chốt giá |
| Hoàn tất hướng Cloudflare | Có thể giảm phụ thuộc Vercel sau khi kiểm thử, không phải bản thay tức thì | Phải có frontend + OAuth hoạt động ngoài Vercel hoặc Vercel được mở lại; hoàn tất quyền ghi một nơi, giao dịch liên làng, kết quả combat, backup/restore và đo quota DO |
| Chờ hết thời hạn khóa | Không tốn thêm hosting trong lúc chờ | Game tiếp tục gián đoạn; nếu tải giữ nguyên thì có nguy cơ bị khóa lại |

Khuyến nghị cho tính liên tục: mở lại bằng Pro nếu chấp nhận trả phí tạm,
đồng thời xử lý mô phỏng và kiểm thử migration. Nếu yêu cầu tuyệt đối miễn phí,
cần chấp nhận gián đoạn trong lúc kiểm tra giải pháp mới; không cam kết
Cloudflare Free đủ tải chỉ vì đã có Worker prototype.

Không tạo team/tài khoản mới để né quota. Chưa chuyển thông tin xác thực hoặc
dữ liệu làng production sang nơi lưu khác.

## Điều kiện xác nhận khôi phục

1. Hosting phục vụ domain thành công và đăng nhập Google hoạt động.
2. Tám làng được giữ nguyên, chỉ có một đường ghi chính; lệnh chờ không bị gửi
   lại thành giao dịch trùng. Không reset làng để giảm tải.
3. Batch, checkpoint, chợ, sứ giả và callback Battle Worker dùng đúng backend;
   kiểm tra kết nối không đồng nghĩa kiểm chứng toàn bộ gameplay.
4. Kiểm tra tải tính bù sau thời gian gián đoạn, tránh nhiều lượt đăng nhập
   đồng thời gây tính lại cùng khoảng thời gian hoặc timeout lặp.
5. Theo dõi CPU tăng thêm của deployment mới và các dự án trong team; đặt cảnh
   báo/ngân sách phù hợp. Không dùng tổng Usage vốn đã tiêu làm thước đo hồi phục.

Nguồn: dashboard Usage và Functions có đăng nhập; HTTP domain game; kiểm tra
MongoDB chỉ đọc; [giá Vercel chính thức](https://vercel.com/pricing).
Kế hoạch kỹ thuật tiếp tục ở [cloudflare-migration-tasks.md](./cloudflare-migration-tasks.md).
