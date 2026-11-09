# So sánh hosting miễn phí và hướng giảm tính toán server

Ngày kiểm tra: 09/11/2026. Đây là đánh giá và đề xuất, **chưa thay đổi production,
chưa triển khai kiến trúc mới**. Game hiện giữ làng thật trong MongoDB; Village
Durable Object vẫn là prototype. Không coi các số dưới đây là sức chứa người
chơi đã nghiệm thu.

## 1. Hạn mức liên quan trực tiếp đến game

Đối chiếu tài liệu chính thức trong phiên kiểm tra:

| Hạng mục | Vercel Hobby | Cloudflare Workers Free + Durable Objects SQLite |
|---|---|---|
| CPU | 4 giờ Active CPU theo hạn mức tháng | Worker thông thường: 10 ms CPU mỗi invocation. DO có giới hạn CPU riêng; tài liệu DO ghi mặc định 30 giây mỗi invocation |
| API requests | 1 triệu Function Invocations theo hạn mức tháng | 100.000 Worker requests/ngày; DO có quota riêng 100.000 requests/ngày |
| Thời gian chạy DO | Không có sản phẩm tương ứng trong kiến trúc Vercel hiện tại | 13.000 GB-s/ngày cho tổng DO trong account |
| Dữ liệu làng | MongoDB bên ngoài, quota riêng | Có SQLite trong DO: tổng 5 GB; 5 triệu rows read/ngày và 100.000 rows written/ngày |
| Phục vụ giao diện | 100 GB Fast Data Transfer; 1 triệu CDN requests theo hạn mức tháng | Static Assets phục vụ trực tiếp có request miễn phí, không giới hạn theo bảng pricing; request đi qua Worker/cache có cơ chế tính riêng |
| Combat game hiện tại | Vẫn cần Battle Worker Cloudflare bên ngoài | Battle DO và Village DO có thể ở cùng nền tảng, chia sẻ các quota account liên quan |
| Next.js hiện tại | Tương thích đường deploy đang dùng | Cần adapter và kiểm tra Next.js 16.4.5, MongoDB driver 7.8, OAuth, API và build |
| Khi hết quota | Tính năng/dự án có thể bị dừng; tài liệu Hobby nêu thường phải chờ 30 ngày | Các thao tác vượt quota Free lỗi; hạn mức theo ngày reset 00:00 UTC, tức 07:00 Việt Nam. Quota storage không tự xóa/reset mỗi ngày |

Không cộng 100.000 Worker requests và 100.000 DO requests thành 200.000 lượt
chơi. Một HTTP request có thể tiêu cả quota Worker lẫn DO, và nhiều lệnh gọi DO
có thể phát sinh cho cùng một tương tác. Quota cũng không nhân lên bằng cách
tạo thêm Worker trong cùng account.

**13.000 GB-s không phải 13.000 giây CPU.** Theo cách quy đổi 128 MB = 0,128 GB
trong ví dụ pricing của Cloudflare, quota tương đương khoảng 28,2 giờ hoạt động
DO cộng dồn/ngày. DO chờ I/O hoặc không đủ điều kiện ngủ cũng có thể tiêu duration.
Một DO luôn thức 24 giờ dùng khoảng 11.059 GB-s, gần 85% quota ngày; hai DO như
vậy đã vượt quota. Vì thế không giữ vòng lặp làng chạy liên tục khi không cần.
Không dùng con số này để tuyên bố Cloudflare có CPU gấp bao nhiêu lần Vercel.

## 2. Đã tính cả các tối ưu hiện có

Đã có trong code/báo cáo phát hành:

- Queue và gom lệnh tối đa 10 giây, gửi sớm khi cần; 32 lệnh hoặc 256 KiB là
  ngưỡng batch. Báo cáo phát hành ghi đã bật toàn bộ; default code vẫn yêu cầu
  `CITY_BATCH_ENABLED=true`. Không kiểm tra lại env production trong lượt này.
- Một batch thường 1 load/1 save làng; duplicate không ghi lại; GET thông thường
  không ghi cả City. Profiler Mongo local đã kiểm chứng các đường này.
- Projection/cache đọc, giới hạn cache tìm đường, tối ưu BFS và lịch xử lý đoàn
  xe; dừng refresh chính khi tab ẩn, hợp nhất các request đọc đang trùng nhau.
- Client đã mô phỏng dự đoán, chạy cập nhật làng mỗi giây trên máy người chơi;
  không phải mỗi frame hay mỗi giây đều gửi toàn bộ trạng thái lên server.

Chạy lại `scripts/sync-baseline.ts` trên HEAD `4e56adf` ngày 09/11, một warm-up,
median ba lượt, Node local. Cả hai nhánh đều dùng engine đã tối ưu hiện tại;
chỉ so gửi từng lệnh với gom batch, không so toàn bộ bản trước tối ưu với bản mới.
Không gọi Mongo hoặc production.

| Workload | Từng lệnh, CPU ms | Batch, CPU ms | Chênh lệch |
|---|---:|---:|---:|
| Làng mới | 38,896 | 6,422 | giảm 83,5% |
| 50 dân | 166,763 | 106,116 | giảm 36,4% |
| 200 dân | 294,214 | 231,869 | giảm 21,2% |
| Kho đầy | 131,112 | 95,074 | giảm 27,5% |
| Offline 1 giờ | 220,852 | 177,561 | giảm 19,6% |
| Offline 24 giờ | 1.388,775 | 1.356,094 | khoảng 2,4%, nằm trong dao động giữa các lượt |

Hash kết quả từng cặp giống nhau. Payload City giảm khoảng 95%; mô hình DB giảm
20 load/save xuống 1. CPU trên đây gồm engine/clone/serialize, chưa gồm OAuth,
DB, network và telemetry. Mỗi workload có 20 lệnh trong 10 giây rồi settle đến
1 phút hoặc mốc offline tương ứng; **không lấy CPU một dòng nhân 360 để suy ra
CPU một giờ chơi**. Không quy đổi CPU Node trực tiếp thành billed CPU Cloudflare.

Các tối ưu đường đi trước đó cũng đã nằm trong engine này, không lấy tỷ lệ
97,8% của fixture cũ nhân tiếp với tỷ lệ giảm batch để dự báo production.

## 3. Tải production đã quan sát và giới hạn của phép ngoại suy

Snapshot ngày 08/11 gồm nhiều deployment, 10 endpoint làm tròn:

- Khoảng 4.588 calls / 6 giờ, tương đương 18.352/ngày hoặc 550.560/30 ngày
  **nếu giữ nguyên tải**. Đây mới là tổng các dòng đã ghi, không phải đầy đủ mọi
  request static, socket hoặc route bị thiếu.
- Khoảng 15,34 phút Active CPU / 6 giờ, tương đương 30,69 giờ/30 ngày nếu giữ
  nguyên tải. Cần giảm khoảng 87% so với mức này để xuống 4 giờ Vercel.
- Request của các dòng này chưa chạm cả quota Function tháng lẫn Worker ngày;
  nút thắt Vercel là CPU. Cửa sổ trộn nhiều phiên bản nên không coi đây là số đo
  sạch của bản mới nhất đã bật batch toàn bộ.
- Tổng 44 giờ 23 phút trên Usage là cộng dồn; không gán cho một deployment và
  không trừ thêm phần trăm benchmark local vào số đó như một khoản hoàn quota.

Chi tiết: [incident-vercel-pause-2026-11-08.md](./incident-vercel-pause-2026-11-08.md).

## 4. Request vẫn còn sau tối ưu

Từ timer trong code hiện tại, ví dụ tab hiển thị, hai socket feed hoạt động tốt,
chưa cộng startup/reconnect/các sự kiện và thao tác ngoài mẫu:

| Chế độ | API app / người / giờ |
|---|---:|
| Đứng yên, tab hiện | khoảng 210 |
| Có thao tác liên tục, thường gom mỗi 10 giây | khoảng 510–570 |
| Tab ẩn nhưng socket còn sống | khoảng 30, cộng sự kiện |
| Xem làng khác liên tục | thêm khoảng 720 |

Nguồn: `components/Game.tsx` vòng 60 giây gọi city/checkpoint, me và diplomacy;
`components/useWars.ts`, `components/useMarket.ts` gia hạn socket mỗi 240 giây.
Checkpoint 5 phút **thay** một lần đọc trong vòng 60 giây đó, không làm idle
chỉ còn 12 API/giờ. Tick mô phỏng client 1 giây không tính vào bảng API.

Mô hình thường: `R ≈ 150 + C + B + E`, trong đó C là 0–60 city/checkpoint,
B là số batch và E là request sự kiện/màn hình. Khi thường xuyên gom đủ một
gói mỗi 10 giây, B khoảng 360/giờ, **không phải trần cứng**: full batch, flush,
retry và lệnh tới khi đang drain có thể thêm request.

Ngoài API, hai feed có thể thêm khoảng 30 WebSocket upgrades/giờ. Mở Chợ/world
làm mới mỗi 30 giây, còn caravan đang giao chiến có timer 2 giây gọi market và
callback đọc làng; số thực tế phụ thuộc hợp nhất và latency. Đây là nơi cần
thay polling bằng thông báo sự kiện, không giả định tối ưu batch đã bao phủ.

Ví dụ **chỉ theo request**, mọi người chơi 2 giờ/ngày và tương tác liên tục theo
mẫu trên; cộng gia hạn WS, chưa cộng các tác vụ phụ và DO fan-out:

| Người hoạt động/ngày | Worker requests/ngày mô hình | So với 100.000/ngày |
|---|---:|---|
| 10 | 10.800–12.000 | khoảng 11–12% |
| 50 | 54.000–60.000 | khoảng 54–60% |
| 100 | 108.000–120.000 | đã vượt |

Đây **không phải sức chứa game**: CPU/DO duration/rows write có thể hết trước;
cũng không phải dự báo traffic. Dùng mô hình để chọn workload load-test.

## 5. Chia luồng backend: lợi ích và giới hạn

Chia nhiều Worker/DO giúp cô lập nghẽn và chạy các làng độc lập đồng thời.
Nếu cùng một lượng công vẫn phải làm, tổng CPU không tự giảm; clone/serialize,
RPC và tranh chấp ghi có thể làm tăng chi phí. DO là mô hình actor có trạng thái,
không phải cách lấy thêm CPU miễn phí bằng `worker_threads` của Node.

Đề xuất ranh giới:

1. Worker nhẹ: xác thực, giới hạn input và định tuyến; không chạy engine làng.
2. Một Village DO mỗi làng: xử lý tuần tự các lệnh và sự kiện ảnh hưởng state,
   checkpoint/receipt cùng transaction. Các làng khác nhau chạy độc lập.
3. Một Battle DO mỗi trận như hiện tại: vòng lặp realtime chỉ trong trận đang
   diễn ra, tắt khi kết thúc; kết quả nhận lại phải chống trùng.
4. Điều phối giao thương/sứ giả bằng escrow + inbox/outbox có ID; phần này không
   có transaction chung tự động giữa các DO. Không cho market tự ghi đè làng.
5. Tính bù/checkpoint theo đợt có giới hạn, không chạy hai lượt tính bù cùng làng.
   Tác vụ phụ không chặn thao tác chính nhưng kết quả đã ACK phải lưu bền vững.

Không chia mỗi dân/tài nguyên thành một DO rồi giao tiếp liên tục: sẽ tăng
requests, đồng bộ và chi phí. Chuyển ownership và xử lý liên làng vẫn là task
chưa làm trong kế hoạch migration hiện tại.

## 6. Đẩy tính toán sang client

Client hiện đã chạy engine để phản hồi ngay. Có thể đẩy thêm hình ảnh, đường đi
hiển thị, nội suy di chuyển, âm thanh và bảng tổng hợp sang client. Nhờ đó server
không cần tính mọi bước chuyển động chỉ để vẽ.

**Bỏ hoàn toàn kiểm chứng tài nguyên/quân trên server là một lựa chọn đổi mô
hình tin cậy, không chỉ là tối ưu hosting.** Người dùng có thể sửa JS/request,
đồng hồ hoặc save để khai thêm tài nguyên/quân. Với giao thương và PvP, dữ liệu
đó ảnh hưởng trực tiếp người khác. Hash/checksum do client tự tạo không chứng
minh kết quả đúng. Nhật ký lệnh/seed chỉ giúp kiểm chứng nếu có replay hoặc
validation thực sự; replay vẫn tốn CPU.

| Cách làm | Công việc server | Hệ quả cho game |
|---|---|---|
| Client quyết định toàn bộ, server chỉ lưu save | Thấp | Không bảo vệ được kinh tế/PvP hiện tại trước save hoặc request bị sửa |
| Client tính, server replay toàn bộ định kỳ | Vẫn đáng kể | Giảm tần suất overhead; phần công mô phỏng vẫn còn, xung đột liên làng cần xử lý |
| Client hiển thị/dự đoán, server tính theo sự kiện | Có tiềm năng giảm nhiều hơn | Giữ quyền xác nhận ở server, cần viết/đối chiếu engine theo sự kiện |

Hướng đề xuất là phương án cuối. Ví dụ server tính và kiểm chứng các mốc nhận
việc, hết chu kỳ thu thập, về điểm nộp, hết thời gian xây/tuyển, tiêu hao, kho
đầy, thay đổi đường và thiên tai. Client dựng diễn biến giữa các mốc. Tài nguyên
vẫn chỉ vào kho khi **mốc mang về nộp hợp lệ đã tới**, không đổi sang cộng kho
theo giờ. Mốc có thể bị hủy/tính lại nếu việc, đường, công trình hoặc chiến sự đổi.

Server có thể xử lý các mốc đến hạn cùng một lượt khi nhận batch/sự kiện; không
cần một API hay alarm cho mỗi bước đi hoặc mỗi lượt vác đồ. Một số deadline
liên quan người chơi khác cần điều phối chủ động. Đây là thiết kế mới, chưa có
số đo để hứa giảm CPU theo phần trăm hoặc đủ Free.

## 7. Khuyến nghị và điều kiện quyết định

Với mục tiêu miễn phí, Cloudflare có nền tảng DO phù hợp game hơn kiến trúc
Vercel hiện tại, nhưng phải hoàn tất migration và đo thực tế. Chuyển nguyên API
nặng vào Worker Free 10 ms không phù hợp. Ngay cả prototype DO đã qua thử cloud
cũng chưa chứng minh tổng quota account đủ vận hành dài hạn.

Ưu tiên: giảm polling còn sót bằng sự kiện có reconnect/foreground recovery;
loại tính bù lặp và lập lịch đúng hạn; thử engine theo sự kiện bằng fixture;
sau đó hoàn tất một nơi ghi mỗi làng, giao dịch liên làng, backup/restore và
kiểm thử migration. Tách các phần độc lập để giảm nghẽn, giữ tuần tự trong làng.

Nghiệm thu bằng cùng workload trên cùng phiên bản engine: không lệch tài nguyên,
thời gian và tổn thất; mất ACK/retry/restart không nhân đôi; có số requests,
duration, CPU, rows và storage của cả game lẫn combat. Đạt <=50% quota tại tải
chuẩn và <=80% khi stress gấp đôi peak trước khi gọi là phù hợp gói Free.

## Nguồn

- [Vercel Hobby](https://vercel.com/docs/plans/hobby)
- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/)
- [Next.js trên Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)
- [Các tối ưu và số đo lịch sử](./runtime-stability.md)
- [Phát hành batch toàn bộ](./sync-release.md)
- [Kiểm chứng prototype cloud và giới hạn](./village-cloud-validation.md)
