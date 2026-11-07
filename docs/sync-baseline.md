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
