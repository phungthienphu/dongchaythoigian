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


## Hotfix: đồng hồ Worker đứng trong vòng CPU (10/11/2026)

Sau release v2, Bến Vân Đồng tiếp tục lỗi 500 ở 69%. Đối chiếu Cloudflare trong
một giờ thấy 16 lượt GameApi `exceededResources`, CPU khoảng 30–32,5 giây/lượt.
Các bộ đếm memory/fatal của periodic dataset bằng 0; dữ liệu analytics có độ trễ.

Nguyên nhân: Cloudflare chỉ tăng `performance.now()`/`Date.now()` sau I/O. Lát
CPU đồng bộ không thấy thời gian trôi, nên guard 1.200 ms không ngắt được; cap
6 giờ có thể chạm giới hạn CPU trước khi ghi checkpoint. Đo local và fixture
600 dân chủ yếu rảnh trước đó không kiểm chứng được trường hợp này.
Tài liệu chính thức: https://developers.cloudflare.com/workers/runtime-apis/performance/

V3 bắt buộc giới hạn tick theo quy mô làng, tối đa 3.600 tick; ngân sách công
việc là 1.000.000 / (số dân + 4 × số công trình), lấy phần nguyên và tối thiểu
một tick. Bến Vân Đồng tương ứng khoảng 350 tick/lát. Guard thời gian vẫn giữ
làm chặn bổ sung ở runtime có đồng hồ chạy; không dùng nó làm giới hạn chính.
Không bỏ thời gian mô phỏng, không sửa luật tài nguyên hay dữ liệu schema.
Một tick có sự kiện địa hình quá đắt vẫn là giới hạn cần theo dõi.

Regression unit test khóa `performance.now()` bằng hằng số và xác nhận lát vẫn
kết thúc, ghi đúng revision/tiến trình; `scripts/check-heavy-recovery-qa.ts` tạo
làng QA 1.389 dân, 359 công trình, hơn 700 thợ khai thác, kiểm tra bốn lượt tải
Cloudflare liên tiếp và đối chiếu toàn bộ trạng thái với mô phỏng liền mạch.
Lượt QA đạt: bốn GET khoảng 3.130 / 1.915 / 1.209 / 1.595 ms; lưu đủ bốn
checkpoint, tiến 1.414 giây mô phỏng, trạng thái khớp hoàn toàn.

Đã chạy phục hồi có backup cho riêng Bến Vân Đồng bằng chính `recoverCity`,
không tạo phiên đăng nhập thay chủ làng: 73 checkpoint CAS thành công, không
xung đột; hoàn tất mục tiêu cũ rồi tính tiếp đến thời điểm bắt đầu phục hồi.
Không chỉnh tay tài nguyên, quân, người hay reset làng. File backup riêng nằm
trong `.wrangler/recovery-backups/` (bị Git ignore), không đưa dữ liệu làng vào repo.
