# T05 — Village Durable Object SQLite prototype

Ngày 07/11/2026. **Đang thử local; chưa chuyển làng thật, chưa nghiệm thu quota
Cloudflare.** Code ở `worker/prototype`, config tách riêng
`worker/wrangler.village-prototype.jsonc`. Config combat production không đổi.

## Phạm vi đã làm

- Router chỉ kiểm tra quyền và chuyển request tới DO; không import engine nặng
  vào đường thực thi router. DO dùng engine chung, không sao chép luật gameplay.
- Namespace/class `VillagePrototype` riêng, chỉ cho ID `qa-*` và fixture server
  định sẵn. Không nhận City/số tài nguyên từ client, không có Mongo binding.
- Config mặc định `PROTOTYPE_ENABLED=false`, thiếu secret >=32 ký tự thì từ chối.
  Không deploy config này thay cho `worker/wrangler.jsonc`.
- SQLite giữ checkpoint, revision, ledger/ACK/256 receipt trong một row. Write
  nằm trong `transactionSync`; trả ACK sau ghi. Không giữ City trong RAM giữa
  request; restart phải đọc lại SQLite. Chữ ký anchor WebCrypto tương thích
  định dạng HMAC phía Node, nhưng secret thử tách biệt với production.
- Kiểm tra thứ tự sequence/thời gian, anchor, phiên, engine, digest, payload
  <=256 KiB và <=32 lệnh/batch. Retry đã ACK không ghi lại, kể cả receipt đã compact.
- Không interval, socket hoặc alarm không cần thiết: lúc hết request đủ điều kiện
  ngủ. Chưa đo bill/hibernation trên Cloudflare thật.

Đây là API thử nội bộ bằng bearer secret và thời gian logic tổng hợp. Nó **không**
phải token theo người chơi/epoch của T07, không có writer router/coordinator
T06/T08 và không được nhận quyền ghi làng production.

## Catch-up dài có checkpoint từng đoạn

Thử trực tiếp 50 dân offline 14 ngày mất khoảng 18 giây local. Reference 200 dân
14 ngày quá nặng cho vòng test ngắn, nên tách bài worst-case riêng. Không lấy
wall time local làm CPU Cloudflare hoặc mặc định cho rằng event chắc chắn đủ quota.

Prototype chia catch-up thành tối đa 6 giờ logic/request; lưu cả target chưa
hoàn tất và state đã tính được trong cùng transaction. HTTP 202 trả tiến độ;
request tiếp theo tiếp tục tới đúng target. Trong khi tính bù, batch mới bị từ
chối 409 và **không** tăng ACK. Target không được đổi giữa chừng. Khi xong trả 200;
retry checkpoint đã hoàn tất không ghi. Engine và tốc độ tài nguyên không đổi.

Đã đối chiếu state hash cuối với một lần `settle` cho tám workload, bao gồm
50 và 200 dân/14 ngày. Thêm nhiều checkpoint làm tăng row writes và requests;
phải tính khoản này vào budget. Prototype từ chối khoảng ban đầu >14 ngày; xử lý save
cũ hơn cap cần thiết kế riêng, không sửa timestamp bằng tay để giả lập tương đương.

## Chạy thử an toàn

Không cần Mongo, Next, Google OAuth, API key hoặc namespace production. Dùng
Wrangler local với storage riêng. Trong thư mục `worker`:

```sh
WRANGLER_SEND_METRICS=false node node_modules/wrangler/bin/wrangler.js dev --config wrangler.village-prototype.jsonc --local --ip 127.0.0.1 --port 8789 --persist-to /tmp/dong-song-village-prototype --var PROTOTYPE_ENABLED:true --var PROTOTYPE_SECRET:local-prototype-secret-at-least-32-characters
```

Ở thư mục repo:

```sh
PROTOTYPE_SECRET=local-prototype-secret-at-least-32-characters bun scripts/village-prototype.ts run
PROTOTYPE_SECRET=local-prototype-secret-at-least-32-characters bun scripts/village-prototype.ts worst
PROTOTYPE_SECRET=local-prototype-secret-at-least-32-characters bun scripts/village-prototype.ts pause
```

Dừng **đúng tiến trình prototype** rồi chạy lại cùng config, secret và
`--persist-to`. Không dừng dev game/Worker combat. Sau restart:

```sh
PROTOTYPE_SECRET=local-prototype-secret-at-least-32-characters bun scripts/village-prototype.ts resume
PROTOTYPE_SECRET=local-prototype-secret-at-least-32-characters bun scripts/village-prototype.ts resume-catchup
```

Runner chỉ cho HTTP loopback và secret prefix local. `run`/`worst` tạo UUID fixture
mới, không reset/drop SQLite. `pause` lưu marker hash/ACK trong `/tmp` để kiểm tra
catch-up đang dở; marker không có token hoặc snapshot. `resume` kiểm tra checkpoint
đã ACK và replay read-only qua restart thật. Không dùng `--remote` trong các lệnh QA.

## Bằng chứng hiện có

- 9 scenario HTTP/SQLite thực qua: router/auth/body; seed; batch 20 + duplicate;
  gap/conflict/anchor/session; lỗi domain; concurrent; SQL rollback sau write;
  compact receipt; thay phiên. Catch-up các workload khớp hash với engine chung.
- Restart workerd thật: checkpoint, revision, ACK và retry giữ nguyên. Kiểm tra
  restart trong catch-up đang dở đã qua: target/tiến độ giữ nguyên, hoàn tất ra
  đúng state tham chiếu, ACK không bị tiêu thụ. Worst-case cũng qua kiểm tra lại
  hash/ACK sau restart. Một lượt test bị ngắt bởi Wrangler hot reload; runner đã
  bổ sung retry đúng payload, không sinh ID mới khi kết quả chưa rõ.
- 3 test Node/WebCrypto anchor qua; type-check app/prototype và combat regression
  qua. Wrangler dry-run bundle ~209 KiB (~58 KiB gzip), không tạo resource cloud.
- Các số thời gian là wall time trên máy dev có tác vụ QA song song; không phải
  CPU billed, percentile hay benchmark cloud. SQL cursor thực ghi nhận một batch
  thường 2 rows read (SELECT và UPSERT lookup), 1 row written; duplicate 1 read/0 write.

| Workload | Số đoạn checkpoint | Wall tối đa một đoạn | Tổng HTTP checkpoint | Hash cuối |
|---|---:|---:|---:|---|
| Mới | 1 | 4 ms | 28 ms | `043078ac6a8978a1` |
| 50 dân | 1 | 75 ms | 98 ms | `0d67ea126b542f25` |
| 200 dân | 1 | 98 ms | 118 ms | `dff11f4231c6090b` |
| Kho đầy | 1 | 61 ms | 81 ms | `5299a158e6015a91` |
| Offline 1h | 1 | 151 ms | 177 ms | `5973be72bc379a01` |
| Offline 24h | 4 | 387 ms | 1.575 ms | `2b0e158df5b83700` |
| Offline 14 ngày / 50 dân | 56 | 503 ms | 23.603 ms | `5576908e194fd00e` |
| Offline 14 ngày / 200 dân | 56 | 5.979 ms | 197.871 ms | `9924dd1fe04cd260` |

Worst-case giảm thời gian mỗi request bằng checkpoint, không giảm tổng công CPU
tính bù. Bài này cần 112 rows read / 56 rows written, storage 98.304 bytes. Chưa
được dùng số wall local này để kết luận CPU/request hay GB-s trên Cloudflare.

## Limits đã đối chiếu và phần còn thiếu

Nguồn chính thức đọc ngày 07/11/2026:
[DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/),
[DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/),
[SQLite storage API](https://developers.cloudflare.com/durable-objects/api/storage-api/).

| Khoản | Free công bố | Lưu ý |
|---|---:|---|
| DO requests | 100.000/ngày | Chung account, gồm combat, session, alarm; Worker request quota tính riêng |
| DO duration | 13.000 GB-s/ngày | Wall time * memory phân bổ, không phải CPU; idle đủ điều kiện ngủ không bị tính duration |
| SQLite reads | 5 triệu rows/ngày | Tính cả lookup của UPSERT, inbox/outbox và coordinator tương lai |
| SQLite writes | 100.000 rows/ngày | Checkpoint từng đoạn tăng số ghi; setAlarm và delete cũng được tính |
| SQLite storage | 5 GB/account | JSON row có giới hạn 2 MB, không gửi snapshot vô hạn |
| CPU mỗi DO request | 30 giây mặc định | Không áp nhầm Worker Free 10 ms lên DO; không suy ra từ wall time local |

Đọc subscriptions của account bằng phiên Wrangler hiện có bị API trả 403; chưa
xác minh được plan/override qua API đó. Không xin thêm scope hoặc tự nâng gói.
Cố gắng deploy namespace prototype tách riêng đã bị auto-review từ chối vì quyền
deploy Worker combat trước đó chưa bao gồm tạo Worker/namespace mới. Đã hỏi chủ
dự án quyền cho phép cụ thể; chưa tạo resource cloud bằng lệnh bị từ chối.
Còn cần namespace cloud thử được phép dùng, đo CPU router/DO riêng, duration,
rows, eviction, workload chuẩn và stress gấp đôi, cộng usage combat hiện có.

**T05 chưa hoàn thành** cho tới khi có số cloud đủ chứng minh <=50% quota ở tải
chuẩn và <=80% ở stress. Không dùng prototype local này để bỏ qua G-A/G-B hoặc
chuyển làng production. T06–T10 vẫn phải bảo toàn chợ, chiến tranh, outbox và restore.
