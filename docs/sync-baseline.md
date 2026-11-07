# Baseline đồng bộ — local synthetic

Commit nguồn `af463b9`, Node.js, ngày 07/11/2026. Một warm-up rồi median ba lượt.
Dữ liệu tổng hợp, không kết nối DB. Mỗi workload có 20 lệnh trong 10 giây,
sau đó catch-up đến mốc ghi trong tên. CPU gồm engine, clone và serialize;
không gồm xác thực, mạng, DB, telemetry. DB ops là mô hình 20 load / 20 save,
không phải số đo Vercel. Không suy ra tiết kiệm CPU production từ bảng này.

| Workload | Median CPU ms | CPU range ms | Response bytes | State hash |
|---|---:|---|---:|---|
| fresh | 40.37 | 39.76–43.30 | 838950 | `043078ac6a8978a1` |
| 50 workers | 205.88 | 187.78–240.47 | 1170498 | `0d67ea126b542f25` |
| 200 workers | 380.52 | 342.64–391.85 | 1607922 | `dff11f4231c6090b` |
| full storage | 180.19 | 178.57–181.93 | 1170498 | `5299a158e6015a91` |
| offline 1h | 207.50 | 201.59–245.02 | 1170498 | `5973be72bc379a01` |
| offline 24h | 1113.89 | 1086.96–1164.65 | 1170498 | `2b0e158df5b83700` |

Chạy lại:

```sh
bun build scripts/sync-baseline.ts --target=node --outfile=/tmp/dong-song-sync-baseline.mjs
node /tmp/dong-song-sync-baseline.mjs
```

T00 còn thiếu workload tích hợp DB/HTTP, trace chợ/sứ giả/combat và baseline
production 24h cùng tải. Không đánh dấu T00 hoặc G-A hoàn thành chỉ với microbenchmark.

## So sánh cùng workload sau batch

Đo ngày 07/11, cùng process Node, cùng fixture, warm-up và median ba lượt.
Batch mô hình 1 load / 1 save thay cho 20; số DB ops này chưa đo production.
Response bytes chỉ tính City, chưa cộng ACK/anchor/receipt.

| Workload | Từng lệnh CPU ms | Batch CPU ms | Giảm CPU local | City bytes trước → sau |
|---|---:|---:|---:|---:|
| fresh | 63.44 | 8.02 | 87.4% | 838950 → 41953 |
| 50 workers | 237.12 | 130.07 | 45.1% | 1170498 → 58684 |
| 200 workers | 398.28 | 296.34 | 25.6% | 1607922 → 80555 |
| full storage | 169.10 | 125.99 | 25.5% | 1170498 → 58684 |
| offline 1h | 233.47 | 166.21 | 28.8% | 1170498 → 58684 |
| offline 24h | 1218.62 | 1149.46 | 5.7% | 1170498 → 58684 |

Cả sáu hash trạng thái trước/sau giống nhau. Giảm response City khoảng 95%,
nhưng CPU engine giảm ít hơn ở làng đông dân và catch-up dài: batching không xóa
chi phí mô phỏng cần thiết. Chưa đủ bằng chứng để hứa vừa quota Vercel free.
T00 vẫn còn phần workload tích hợp và production; G-A chưa được nghiệm thu.

## Dashboard production đọc ngày 07/11/2026, khoảng 16:40–16:49 UTC+7

Quan sát trực tiếp dashboard Vercel, filter Production, trước khi phát hành các
commit Chặng A. Không pin deployment hash, không phải so sánh cùng workload.
Số liệu UI làm tròn và các cửa sổ chồng nhau, không cộng với nhau.

| Cửa sổ | Invocations | CPU P75 | Error / timeout | Ghi chú |
|---|---:|---:|---|---|
| 1h | 256 | 128 ms | 0% / 0% | Memory avg 299 MB; throttle P75 12%; cold start 1.2% |
| 6h | 3.9K | 421 ms | 0% / 0% | Memory avg 341 MB; throttle P75 4.5%; cold start 1.4% |
| 12h | 4.3K | 1 phút | Timeout tổng 27% | Reconcile hiển thị 762 calls, CPU 16h và row lỗi/timeout 31% |

12h chứa một khoảng bất thường ngoài cửa sổ 6h gần nhất, hoặc bất thường tổng
hợp dashboard. Chưa có deployment/time trace để xác định nguyên nhân; không coi
16h là billed CPU đã xác minh, không gán cho code chưa release. Cần đối chiếu
Usage và deployment trước khi quy đổi ngân sách tháng. Dashboard 24h bị khóa
`Upgrade to Pro` trên account này; không có dữ liệu 24h từ giao diện free.

| Route | Calls / 6h | CPU UI / 6h | Calls / 1h | CPU UI / 1h |
|---|---:|---:|---:|---:|
| city/action | 1.5K | 9 phút | Không có trong bảng 1h | — |
| city | 434 | 3 phút | 9 | 1.83 giây |
| market | 458 | 2 phút | 94 | 9 giây |
| battles/reconcile | 372 | 1 phút | 63 | 15 giây |
| visit | 23 | 26 giây | — | — |
| diplomacy | 454 | 22 giây | 7 | 210 ms |
| me | 360 | 18 giây | 2 | 550 ms |
| battles | 298 | 16 giây | 86 | 1.34 giây |
| world | 7 | 1.71 giây | — | — |
| leaderboard | 13 | 515 ms | — | — |

## Browser local

Harness `/dev/sync` dùng dữ liệu tổng hợp localStorage làm server giả; queue,
IndexedDB và khóa tab là code thật. Không gọi API/DB/tài khoản production.
Browser: Codex in-app, desktop Linux; Node 24.14.1, Intel i5-11400H cho benchmark.

- Deadline 10 giây; 20 thao tác liên tiếp → 1 gói, ACK 5 → 25.
- Thao tác local 5.3–15.7 ms trong lượt 20 thao tác, P95 khoảng 8.2 ms. Đây là
  làng mới nhỏ trên desktop, chưa chứng minh SLO cho full Game/200 dân/mobile.
- Reload giữ nguyên IDs; mất ACK khôi phục bằng đọc server, không gửi lại gói đã
  commit. Offline giữ queue rồi gửi sau reconnect.
- Web Locks: một tab điều khiển, tab kia chỉ xem. IndexedDB lease dự phòng:
  đóng controller với một lệnh chưa gửi, tab mới tiếp quản → ACK 1, đúng 1 gói.
- 100 reconnect trong 2 giờ **thời gian giả** qua unit test; chưa chạy soak thật
  2 giờ hoặc vòng đời tab nền trên điện thoại.

Chưa QA Game + Google OAuth + Mongo thật, chợ/combat hai tài khoản qua browser,
Mongo restart hay canary 48h. API tests mock DB/Next độc lập với browser harness.
