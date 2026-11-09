# Chặng A: giao thức và nơi ghi dữ liệu

Ngày 07/11/2026, baseline từ `af463b9`. Production chưa bật batch ở thời điểm lập
tài liệu này. Giữ MongoDB là nơi ghi chính; chưa có migration Village DO.

## Nơi ghi và trách nhiệm

| Nơi ghi | Dữ liệu / cách chống ghi đè | Phối hợp batch |
|---|---|---|
| `city-store.ts` / city action | City, enrichment, discovery, envoy outbox; CAS `ver` | Batch cùng CAS, một load/save thường; giữ metadata sync ngoài City |
| GET city / world | Trước đây settle và ghi cả City | Đọc thường dùng cache có revision; không ghi full City. Bootstrap/discovery checkpoint hiếm; retry outbox chỉ pull đúng key; ranking chỉ cập nhật metadata khi đổi |
| POST city/checkpoint | Mốc bền vững cho làng đang xem nhưng không có lệnh | Client điều khiển gửi tối đa một lần/5 phút khi idle/visible; cùng CAS, giữ ACK; không tạo batch rỗng |
| `market.ts` action / caravan reconcile | Escrow, hàng, tài nguyên, quân, journey; Mongo transaction và `ver++` | Flush client trước action; writer bên kia vẫn có thể thắng, batch không rewind |
| `war.ts` launch/start/result/return/cancel | Quân, tài nguyên, battle lock, thiệt hại; transaction và `ver++` | Flush trước xuất quân/chuyển combat; batch gặp battle lock thì từ chối lệnh, vẫn ACK kết quả |
| `diplomacy.ts` accept | Thêm discovery; transaction và `ver++` | Flush trước quyết định; revision làm mất hiệu lực cache |
| `world.ts` placement | Vị trí world một lần, không sửa City | Giữ nguyên conditional update |
| create city / OAuth adoption | City mới / owner; `ver++` khi nhận làng cũ | Chỉ bootstrap phiên sau khi xác thực owner |
| Worker combat | Snapshot trận, callback thông qua `war.ts` | Không đưa lệnh combat realtime vào batch làng |

Không writer nào thay full CityDoc; metadata sync ngoài `state` sống qua các
transaction chợ/war. Việc chuyển tất cả writer sang ownership router thuộc Chặng B.

## Thời gian và quyền hạn

GET city và ACK cấp anchor HMAC gắn `cityId`, session version, engine, revision,
server time và hạn nhận thời điểm lệnh. Client gửi **lệnh**, không gửi tổng tài nguyên.
Mỗi lệnh có ID, sequence liên tục trong phiên, anchor và thời điểm dựa trên anchor.
Server chặn tương lai, thời điểm ngoài anchor, payload >256 KiB, batch >32 lệnh.
Queue tối đa 256 lệnh / 1 MiB và tuổi 30 phút; dữ liệu cũ không tự thực thi sau
đổi phiên/engine. Khi không có anchor còn hạn, cần lấy checkpoint trước thao tác.

Luồng thường: load checkpoint đã commit → apply lệnh theo thời điểm → settle đến
giờ nhận → CAS state, ACK và kết quả trong **cùng một write**. Không settle đến giờ
nhận trước rồi áp lại lệnh quá khứ. Chuỗi này phải tương đương gửi từng lệnh.

Nếu một writer khác đã tiến checkpoint qua lệnh chờ, không rewind: áp tại thời
điểm checkpoint/hiện tại và báo lệnh được đổi thời điểm. Nếu đang combat hoặc lệnh
quá tuổi thì trả lỗi từng lệnh và ACK, không âm thầm mất lệnh hoặc trừ hai lần.
Đây là giới hạn có chủ đích khi người chơi mất mạng và có sự kiện bên ngoài.

## Request / ACK và retry

Request `POST /api/city/batch` có `engine`, `session`, `commands` gồm
`{seq,id,at,anchor,action}`. Response có `state`, `serverNow`, `sync` (anchor mới,
revision, session, high-water ACK và kết quả gần đây). Lỗi domain vẫn trả 200 với
kết quả riêng cho từng sequence. Lỗi cấu trúc trả 400, gap/xung đột ID trả 409,
phiên hết hiệu lực trả 401. Không lưu payload riêng tư trong telemetry.

ACK chỉ xuất hiện sau CAS thành công. Receipt cùng CityDoc; duplicate <=ACK không
chạy lại, kể cả receipt chi tiết đã compact. Cùng seq khác ID/nội dung bị từ chối
khi receipt còn giữ. Mất ACK: đọc checkpoint/ACK rồi gửi lại đúng phần chưa ACK;
không tạo ID mới. CAS conflict tải lại và tính lại trên checkpoint mới.
ACK batch chỉ gửi receipt thuộc range được hỏi, không gửi digest nội bộ. GET
checkpoint gửi tối đa 256 receipt để khôi phục mất ACK. `checkpointAt` là mốc đã
ghi DB, tách khỏi thời gian của snapshot mô phỏng để đọc.

Client hiển thị ngay; Promise enqueue biểu thị nhận local, không chờ 30 giây.
IndexedDB ghi trước khi báo nhận local bền vững. Deadline 30 giây từ lệnh đầu,
không debounce. Đủ batch thì gửi sớm; idle không gọi API batch.
Một tab giữ Web Lock cho làng; các tab còn lại chỉ xem và có thể nhận quyền sau
khi tab cũ đóng. Trình duyệt không có Web Locks dùng cùng một khóa IndexedDB có
fence theo chủ; không dựa vào localStorage check-then-set.

Trạng thái: `queued → sending → persisted/rejected`; mất kết nối thành `offline`,
giữ payload chưa rõ kết quả và đối chiếu ACK trước retry. IndexedDB lỗi thì báo rõ,
gửi ngay và không hứa phục hồi sau đóng trang. Đổi phiên khóa controller, giữ
queue cũ riêng để không tự gửi bằng phiên mới. Engine mismatch khóa queue để đọc
checkpoint tương thích; không tự xóa hàng đợi.
Nếu không đọc được hoặc hàng đợi local sai cấu trúc, khóa controller và giữ dữ
liệu nguyên vẹn để thử đọc lại; không chuyển sang ghi đè rỗng. Nếu đã đọc được
nhưng lần ghi mới lỗi, báo rõ và gửi ngay. Trình duyệt không có IndexedDB nhưng
có Web Locks dùng memory/gửi ngay, không hứa phục hồi sau đóng trang.

`CITY_BATCH_ENABLED=true` bật delay 30 giây, `CITY_BATCH_CANARY_IDS` giới hạn
làng thử. Mặc định/tắt flag vẫn dùng queue/receipt bền vững và API batch, gửi
ngay; không quay lại API cũ. Server luôn nhận in-flight batch hợp lệ.

## Đo và nghiệm thu

`scripts/sync-baseline.ts` dùng dữ liệu tổng hợp 50/200 dân, kho đầy, 1h/24h offline,
20 lệnh/10 giây; warm-up rồi median ba lượt. Đo process CPU, wall, response bytes;
DB read/write là số mô hình, không phải Mongo/Vercel đo thật. Hash trạng thái dùng
đối chiếu trước/sau. Thêm API/browser tests cho conflict, retry, tab, reload, IDB.
Không kết luận đáp ứng free trước khi có >=48h production và tải đại diện.
