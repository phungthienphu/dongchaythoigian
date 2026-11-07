# Phát hành Chặng A và rollback

Ngày 07/11/2026. Code giữ MongoDB làm nguồn chính, combat tiếp tục ở Worker.
Đã phát hành Chặng A với delay off. Sau soak đạt, chủ dự án yêu cầu phát hành
gom 10 giây cho **tất cả người chơi**, thay cho canary riêng một làng. Không
đánh dấu T00/G-A hoàn thành khi chưa có so tải production đại diện.

## Đợt phát hành toàn bộ sau soak

- Code đang ở `main`, gồm bản vẽ dân/hoạt cảnh `2a1a73f`; không đổi luật engine.
- Soak local đã đạt **2 giờ thực, 100/100 batch/retry/WebSocket reconnect**, ACK
  liên tục; P95 HTTP batch 39 ms. Chi tiết và giới hạn memory nằm trong
  [sync-integration.md](./sync-integration.md).
- Theo chỉ đạo phát hành mới của chủ dự án, cấu hình Vercel **Production**:
  `CITY_BATCH_ENABLED=true`, xóa `CITY_BATCH_CANARY_IDS`. Không có danh sách
  canary nghĩa là bật cho mọi làng. Env chỉ có hiệu lực trong deployment mới.
- Phạm vi phát hành toàn bộ thay thế bước canary trước đó; không coi đây là
  bằng chứng đã qua mọi gate. Google OAuth trên hai browser, mobile background,
  memory dài hạn và theo dõi cùng tải >=48 giờ vẫn chưa nghiệm thu.
- MongoDB vẫn là nguồn chính. Combat Worker không có thay đổi cần deploy lại;
  Village Worker vẫn là prototype synthetic riêng, chưa nhận làng thật.
- Ruộng tự cải tạo và quản lý sa thải/đuổi lính thuộc các đợt sau.

## Mốc phát hành ban đầu đã xác minh (lịch sử)

- `main` code: `7ced7e9da277fe3a229bdd51677c00ad39e2c673`, đã push GitHub.
- Vercel production: `dpl_4LWYKezTQPcnnm8do5qvPU3cQxaR`, **Ready**, tạo
  07/11/2026 lúc 17:23 UTC+7; alias `https://dongchaythoigian.vercel.app`.
- Worker: `9e73ae84-83a0-4e73-81de-0c90f814ef09`, đã deploy. Probe endpoint
  phiên không quyền trả 401. Bản sửa close không đổi engine hay luật combat.
- CLI kiểm tra tên env production: chưa có `CITY_BATCH_ENABLED` hoặc
  `CITY_BATCH_CANARY_IDS`, nên delay mặc định off. Không đổi Mongo/OAuth/secret.
- Sau deploy: trang chủ 200, GET `/api/city` và POST `/api/city/batch` không có
  phiên đều 401. Đây là kiểm tra routing/auth, không chứng minh luồng chơi đã QA
  production. Cần Google login chủ dự án để chọn làng canary.
- Ở mốc ban đầu, soak local hai giờ/100 reconnect chưa hoàn tất và kế hoạch là
  mở canary trước. Kết quả mới và chỉ đạo phát hành thay thế nằm ở mục phía trên.

## Những gì thay đổi

- Giao diện phản hồi ngay; queue IndexedDB ghi lệnh/ID/sequence trước khi báo đã
  nhận local. “Đã lưu” chỉ sau ACK server; lỗi domain hiện rõ.
- API batch xác thực, kiểm tra anchor HMAC, timeline, CAS và receipt cùng một
  commit; retry không cộng/trừ lại. Lệnh combat vẫn dùng Worker realtime hiện có.
- GET làng thường trả projection/cache có revision, không ghi cả City. Các sự
  kiện bootstrap/scouting/outbox vẫn được xử lý; ranking cập nhật metadata khi đổi.
- Controller idle/visible checkpoint mỗi 5 phút để tránh catch-up dài lặp lại.
- Chợ, ngoại giao, sứ giả, xuất quân và vào combat chờ flush trước tương tác.
- Mỗi session chỉ một tab phát lệnh, Web Locks hoặc lease IndexedDB có fence.

## Cấu hình

Không thêm database, namespace Cloudflare hoặc secret mới. Giữ nguyên
`AUTH_SECRET` tối thiểu 32 ký tự, các env Mongo/OAuth/Worker đang dùng. Không đổi
secret trong lúc đo vì anchor của queue đang chờ phải còn kiểm chứng được.

| Biến server | Giá trị | Ý nghĩa |
|---|---|---|
| `CITY_BATCH_ENABLED` | mặc định/`false` | Vẫn queue + API batch, gửi ngay; không gom chờ 10 giây |
| `CITY_BATCH_ENABLED` | `true` | Gom tối đa 10 giây, đủ 32 lệnh/256 KiB thì gửi sớm |
| `CITY_BATCH_CANARY_IDS` | ID làng cách nhau dấu phẩy | Chỉ các làng này có delay; rỗng/bỏ biến là mọi làng |

Flag chỉ điều khiển **delay**, không hoàn tác read cache/checkpoint hay đổi về
API cũ. Server luôn nhận in-flight batch hợp lệ. Bootstrap/GET/ACK cập nhật flag
cho tab đang mở; thay env Vercel cần deployment mới. Client không nhận danh sách
canary hoặc secret, chỉ nhận boolean của làng mình.

## Trước khi mở delay

1. Chạy lib tests, từng API suite trong process riêng vì Bun module mocks không
   được dùng chung; type-check, diff check và production build.
2. QA trên môi trường Mongo riêng, không dùng `.env.local` production để thử ghi:
   xây/tuyển quân, giao/nghỉ dân, kho đầy, reload giữa deadline, mất mạng/mất ACK,
   hai tab, hai Google browser thay phiên; cả session HTTP và WebSocket cũ.
3. Chợ hai làng, convoy, sứ giả/scouting, xuất quân và bị tấn công giữa batch:
   kiểm tra tài nguyên/quân không trùng, lệnh được reschedule/từ chối có thông báo.
4. Kiểm tra lifecycle điện thoại và soak thật 2 giờ/100 reconnect, giới hạn memory.
   Unit test thời gian giả và browser harness không thay cho bước này.
5. Pin deployment hash/cửa sổ/tải. Phương án ban đầu là deploy với delay off rồi
   bật canary; chủ dự án đã yêu cầu bật toàn bộ sau soak như mục phát hành ở
   trên. Chặng A không đổi engine Worker; bản sửa cleanup WebSocket `d169657`
   đã được phát hành trong Worker ở mốc ban đầu.

Theo dõi >=48 giờ với >=24 giờ workload đủ luồng; so cùng tải, tính tổng Vercel
(batch/checkpoint/GET/reconcile/telemetry), Mongo và Worker. Chưa có số sau
release thì không khẳng định giảm CPU production hoặc đủ gói free.

## Dừng và rollback

Mất/nhân đôi state, sai sequence, queue mất sau ACK, 5xx/timeout bất thường hoặc
quota vượt ngưỡng: dừng mở rộng. Đặt `CITY_BATCH_ENABLED=false` và deploy lại
**cùng phiên bản code tương thích queue**. Tab lấy flag mới sẽ gửi ngay, IDs và
receipt giữ nguyên; hàng đang bay vẫn được server xử lý. Không xóa IndexedDB,
ledger hoặc dùng snapshot client đè DB để “sửa” lệch.

Không rollback frontend về bundle trước queue trong khi còn lệnh uncertain.
Nếu buộc hạ cả code, cần chặn thao tác mới, đối chiếu/flush hàng đợi và kiểm tra
ACK trước; giữ bản tương thích để người offline quay lại phục hồi. Không đổi
engine/session hay compact high-water ACK nhằm làm lệnh cũ được nhận lại.

## Bằng chứng hiện có và phần còn thiếu

Các commit backend: `5868039`, `807c18c`; protocol `658ec20`, runner `3abc684`.
Canary/receipt: `db97877`; client/IndexedDB/Game: `f4f7dc6`; báo cáo lệnh con:
`5cce7d3`. Bộ QA thật: `56b107f`; merge với đồ họa đã publish: `7ced7e9`.
Các commit này đã push và phát hành với delay off như mốc phía trên.
API tests chứng minh load/write thường 1/1 bằng mock, duplicate không ghi,
CAS/replay/body/auth được chặn. Lib tests kiểm tra engine tương đương timeline,
queue, checkpoint, offline và reconnect. Xem [sync-baseline.md](./sync-baseline.md)
cho số local, browser và dashboard production cùng giới hạn phép đo.

Lần kiểm tra cuối: **296 lib tests + 50 API tests + 16 Worker tests qua**, `npm run build` qua
(bao gồm TypeScript), `git diff --check` qua. Các API suite chạy riêng từng
process: single-session, city-auth, online-command-telemetry, city-batch-api,
city-read, city-version, world-api, friends-api, envoy-outbox, diplomacy-api, market-api,
naval-war-api, battle-result, action-boundary. Không tính đây là QA Mongo thật.

QA tích hợp riêng đã qua **8 scenario Next HTTP/Mongo replica set, 4 scenario
Worker WebSocket/combat/callback và 1 regression close handshake**. Game browser
qua giao dân, tuyển quân/reload, đăng chợ và chuyển controller giữa hai tab.
Profiler thật xác nhận batch 20 lệnh = 1 find/1 update; duplicate và GET =
1 find/0 update. Setup, bảng đo và giới hạn ở [sync-integration.md](./sync-integration.md).
Soak hai giờ thực đã hoàn tất và đạt ngày 07/11; mobile, Google OAuth hai browser
và memory dài hạn vẫn cần QA. Không thay các gate còn thiếu bằng kết quả
mock/benchmark hoặc kết quả soak local.

T05 đã có prototype local/cloud riêng và metrics đầu tiên, chưa đạt gate quota;
T06 có preflight chỉ đọc, chưa có bàn giao owner. Xem
[village-cloud-validation.md](./village-cloud-validation.md). T07–T12 chưa triển khai.
Chỉ quyết định Village Durable Object nếu G-A vẫn không đạt ngân sách; không
chuyển user production chỉ từ kết quả synthetic.
