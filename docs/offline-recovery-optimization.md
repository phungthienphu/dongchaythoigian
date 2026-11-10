# Tải làng sau thời gian offline dài

## Nguyên nhân đã xác nhận

Ngày 10/11/2026, bản sao chỉ đọc của Bến Vân Đồng có 1.389 dân,
359 công trình, khoảng 597 KB trạng thái và một tiến trình tính bù chưa xong.
Mỗi lát mô phỏng cũ mất khoảng 1,4 giây local nhưng chỉ tiến được 192–256 giây
trong game. Một giờ tính bù liên tục mất 22,4 giây trên máy đo.

Profiler chỉ ra việc tính thống kê sản lượng ước lượng gọi lại danh sách công
trình cho từng dân khai thác. Phần này không quyết định số tài nguyên nhập kho;
tài nguyên thực vẫn do các sự kiện thu thập, mang về và dỡ hàng quyết định.

Ngoài ra, loader dừng ngay ở lỗi mạng/503 và timeout request sau 15 giây.
Sau lỗi tải ban đầu, các hook ngoại giao, chợ và trận đánh có thể khởi động dù
chưa có trạng thái làng sử dụng được. Hai lần GET cùng tài khoản cũng có thể
mô phỏng trùng một revision rồi bỏ một kết quả khi CAS thất bại.

## Thay đổi

- Thống kê hiển thị lập chỉ mục điểm nộp theo tài nguyên một lần mỗi snapshot,
  dùng lại khoảng cách khi nhiều dân cùng khai thác một ô. Không giữ cache này
  qua tick hoặc thay đổi địa hình/công trình.
- Vòng settlement chỉ tính phần thống kê cần cho sức chứa, chi phí và tăng dân;
  bảng sản lượng ước lượng đầy đủ vẫn được cung cấp cho giao diện.
- Giữ tick cố định một giây, mục tiêu tính bù ban đầu, giới hạn offline 14 ngày,
  thứ tự sự kiện, CAS, outbox và checkpoint. Không bỏ thời gian hay cộng tài
  nguyên dựa vào số client gửi lên.
- Giữ ngân sách 1.200 ms mỗi lát nhưng kiểm tra sau 16 tick thay vì 64;
  làng nhỏ có thể tính tối đa 6 giờ/lát thay vì bị buộc ghi DB mỗi giờ.
  Đây là ngân sách mềm, một tick đắt vẫn có thể vượt mốc.
- Durable Object chỉ cho một GET tải làng chạy tại một thời điểm/tài khoản;
  các GET chồng nhau nhận 202 không chứa dữ liệu làng và chờ lại. Các kết nối
  MongoDB vẫn đóng ở cuối chính request đã mở chúng, không tái sử dụng socket
  giữa các request Cloudflare.
- Loader gửi tuần tự, timeout 30 giây, tự thử lại tối đa 5 lần liên tiếp khi lỗi
  mạng/timeout hoặc HTTP 408/429/500/502/503/504. Giãn cách 1/2/4/8/8 giây;
  checkpoint thành công đặt lại ngân sách retry. Hủy trang hủy cả thời gian chờ.
  Lỗi phiên đăng nhập, không có làng và khác phiên bản trả về ngay.
- Giữ tiến trình khi request chồng nhau chưa có progress; hiện trạng thái tự
  nối lại. Chưa bật API phụ khi chưa có làng hoặc còn khôi phục. Tạm dừng
  refresh nền định kỳ khi loader đang chạy.
- Không đổi đồng bộ lệnh 30 giây, luật kinh tế, đói, sản lượng hay combat.

## Bằng chứng kiểm thử

So sánh cùng bản sao Bến Vân Đồng, cùng 3.600 tick, engine trước/sau:
22.400 ms → 9.109 ms (giảm khoảng 59%). So sánh sâu toàn bộ trạng thái cho kết
quả giống nhau. Đây là thời gian mô phỏng local, không phải số CPU production
hay cam kết giảm 59% tổng hóa đơn.

Bộ kiểm thử bao gồm sáu thời đại, giới hạn offline 14 ngày, JSON checkpoint,
làng 600 dân, ngân sách 16 tick, retry có giới hạn, hủy giữa backoff và lỗi
401/404/409 không retry. Bản thử trình duyệt `/dev/recovery` chạy loader thật với
network/503 giả lập, giữ mốc 25% rồi tự hoàn tất. Route `/dev/*` bị chặn production.

`scripts/check-offline-recovery-qa.ts` chỉ dùng DB `dong_song_cloudflare_qa`:
làng tổng hợp 600 dân, 3 ngày offline; bốn GET đồng thời chỉ ghi một lát;
loader mới tiếp tục checkpoint qua lỗi mạng giả lập; toàn bộ trạng thái đã lưu
phải bằng một lượt mô phỏng liền mạch tới cùng mục tiêu. Chỉ xóa đúng bản ghi
QA mà lần chạy đó tạo, không sửa dữ liệu người chơi thật.

Lượt QA Cloudflare thực tế đã đạt: 72 giờ offline, 600 dân, 325 công trình;
13 checkpoint, 17 GET tải làng (gồm bốn GET cạnh tranh), khoảng 65 giây từ
lượt tải đầu đến khi đối chiếu hoàn tất. Không có thay đổi ở làng thật.

## Giới hạn còn lại

Làng đông/vắng lâu vẫn cần nhiều lát vì mô phỏng sự kiện theo từng giây.
Mỗi lát vẫn có chi phí kết nối Mongo và ghi checkpoint. Không thể suy ra thời
gian tải production chỉ từ benchmark local. Cần theo dõi tỷ lệ 202/503, độ trễ
GET và mức tiến triển trên các làng lớn sau release; nếu còn chậm, bước tiếp
là mô phỏng theo lịch sự kiện, cần đối chiếu đầy đủ với engine hiện tại.
