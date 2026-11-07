# Kiểm thử HTTP, MongoDB và Worker thật cho Chặng A

Ngày 07/11/2026. Runner: `scripts/sync-integration.ts`. Không mock Next/Mongo,
không thêm route bỏ qua đăng nhập vào ứng dụng. Account và SID đều tổng hợp,
chỉ dùng trên loopback với secret thử. Google OAuth vẫn cần kiểm thử riêng.

## Môi trường riêng

Cần MongoDB replica set local (transaction của chợ cần replica set), Node/Bun,
Next và Wrangler đã cài trong repository. Lần chạy ghi nhận dùng MongoDB Community
8.0.16 chính thức, replica set `syncqa`, cổng 27028, Next 3110, Worker 8788.
Không dùng Mongo standalone hoặc dữ liệu thật.

**Bun tự đọc `.env.local` của repository.** Phải ghi đè tất cả biến dưới đây trong
mỗi terminal chạy thử; không sao chép hay in file env production. Các chuỗi secret
trong hướng dẫn là dữ liệu công khai dành riêng cho local, không dùng production.

```sh
export MONGODB_URI='mongodb://127.0.0.1:27028/?replicaSet=syncqa'
export MONGODB_DB=sync_qa_20261107_e2e
export AUTH_SECRET=local-sync-qa-secret-at-least-32-characters
export APP_URL=http://127.0.0.1:3110
export BATTLE_WORKER_URL=http://127.0.0.1:8788
export BATTLE_SERVER_SECRET=local-worker-sync-secret-at-least-32-characters
export CITY_BATCH_ENABLED=true
export SYNC_QA=1
```

Runner từ chối Mongo không có địa chỉ loopback, tên DB ngoài `sync_qa_*`, HTTP/
Worker ngoài loopback và secret không có prefix local. Guard không bảo vệ một
Next server khởi động sai env: phải kiểm tra đúng command/env của cả ba tiến trình.

Khởi động MongoDB với data directory dành riêng, rồi initiate một lần:

```sh
mkdir -p /tmp/dong-song-sync-mongo/data
/tmp/dong-song-sync-mongo/bin/mongod --bind_ip 127.0.0.1 --port 27028 --replSet syncqa --dbpath /tmp/dong-song-sync-mongo/data
```

Ở terminal khác đã đặt env thử, dùng Mongo client chạy
`replSetInitiate` với member `127.0.0.1:27028`, chờ primary. Không re-init nếu đã
có replica set. Không xóa hoặc drop database để chạy lại.

Next dùng `.next-sync-qa` khi `SYNC_QA=1`, tránh đụng dev server đang mở:

```sh
npm run dev -- --hostname 127.0.0.1 --port 3110
```

Worker chạy local với storage riêng (từ thư mục `worker`):

```sh
WRANGLER_SEND_METRICS=false node node_modules/wrangler/bin/wrangler.js dev --local --ip 127.0.0.1 --port 8788 --persist-to /tmp/dong-song-sync-worker --var APP_URL:http://127.0.0.1:3110 --var BATTLE_SERVER_SECRET:local-worker-sync-secret-at-least-32-characters
```

Không dùng `--remote`, không deploy trong quá trình thử. Kiểm tra không có
`.dev.vars` ghi đè các biến thử trước khi gọi Next/Worker.

## Thứ tự chạy

```sh
bun scripts/sync-integration.ts seed
bun scripts/sync-integration.ts run
bun scripts/sync-integration.ts combat
bun scripts/sync-integration.ts close
bun scripts/sync-integration.ts profile
bun scripts/sync-integration.ts soak
```

`seed` yêu cầu DB chưa có làng. `run` và `combat` thay session/ACK/quân của fixture,
không chạy lặp hai mode đó trên cùng fixture. Muốn chạy toàn bộ từ đầu, chọn DB
`sync_qa_*` mới và thư mục persist Worker mới, restart Next/Worker với env tương
ứng. Giữ nguyên ID fixture trong DB mới nhưng không dùng lại session fence Worker
cũ. `profile` và `soak` tạo probe UUID riêng nên chạy lại được trong DB hiện tại.

`profile` bật Mongo profiler chỉ trong DB local và tắt trong `finally`, đối chiếu
đúng ID probe; MongoDB 8 có thể rút gọn query update lớn. Chỉ in số lần thao tác,
byte và wall time, không in snapshot, SID hay ticket WebSocket.

`soak` chạy **hai giờ thực**, 100 vòng batch/retry/reconnect WebSocket; mỗi retry
phải giữ nguyên city document. Có log tiến độ và chỉ in `soak-pass` sau đủ thời
gian. Log chưa kết thúc không phải kết quả pass. Không thay thế kiểm tra vòng đời
browser/điện thoại hoặc theo dõi memory của Next/Worker.

UI: chạy `bun scripts/sync-integration.ts login`, mở
`http://127.0.0.1:3111/`, chọn “Open QA village”. Server phụ chỉ bind loopback,
đặt SID tổng hợp rồi chuyển tới Next. Dừng helper sau QA; không triển khai helper
lên Vercel hoặc thêm vào auth production.

## Kết quả đã kiểm chứng

- 8 scenario HTTP qua: auth, GET không ghi, batch 20 + duplicate, lỗi từng lệnh,
  CAS đồng thời, chợ Mongo transaction + retry, sứ giả, thay phiên HTTP.
- 4 scenario Worker qua: incoming combat chặn/ACK lệnh chờ, move WebSocket thực
  sự đổi vị trí, thay phiên chặn socket đang mở lẫn HTTP, retreat/callback/retry
  lưu báo cáo một lần và giữ ledger. Chỉ mốc đến của cuộc hành quân tổng hợp được
  đưa về hiện tại để khỏi chờ; combat và callback dùng đường thực tế.
- Regression WebSocket close không có status qua. Phát hiện và sửa lỗi Worker
  echo close code dành riêng 1005/1006/1015 làm bỏ qua cleanup (`d169657`).
- Game trên browser: giao 2 dân làm thực phản hồi “Chờ lưu” rồi ACK; tuyển 1 quân
  và reload giữ lệnh/quân; đăng bán 50 gỗ giá 10 vàng chỉ trừ một lần; tab thứ hai
  chỉ xem, đóng tab chủ thì tab còn lại tiếp quản.
- Profiler MongoDB thật, Next dev local (không phải Vercel CPU):

| Scenario | Find làng | Update làng | HTTP wall time | Response JSON bytes |
|---|---:|---:|---:|---:|
| 20 lệnh một batch | 1 | 1 | 41 ms | 41.580 |
| Gửi lại đúng batch | 1 | 0 | 23 ms | 41.580 |
| GET làng | 1 | 0 | 16 ms | 41.598 |

Số đo đơn lẻ sau warm-up, không phải percentile hay so sánh production cùng tải.

### Soak hai giờ đã hoàn tất ngày 07/11/2026

- Thời gian thực: 19:44:37–21:44:37 UTC+7, `elapsedMs=7200000`.
- `soak-pass`, đủ 100/100 vòng; sequence và ACK liên tục từ 1 đến 100.
- Mỗi vòng gửi batch HTTP, gửi lại đúng batch và đối chiếu Mongo document không
  đổi, sau đó mở/đóng WebSocket Worker. Không có assertion thất bại.
- P95 HTTP batch: **39 ms**, đo local Next dev + Mongo replica set + Worker local;
  không phải Vercel CPU, độ trễ Internet hay kết quả mobile.
- Monitor ghi 233 mẫu RSS từ 19:49:03 đến 21:45:04 UTC+7, không phủ vài phút đầu.
  RSS tối đa của cả cây process: Next 487.224 KiB, Worker dev 575.940 KiB,
  runner 77.696 KiB, Mongo 240.832 KiB. RSS có tăng; chưa chứng minh không rò rỉ
  bộ nhớ và không quy đổi thành memory một isolate Cloudflare production.
- Bằng chứng local được giữ trong `.wrangler/sync-qa-infra/soak.log` và
  `memory.jsonl`, không đưa dữ liệu phiên hay secret vào Git.

Chưa nghiệm thu: Google OAuth trên hai browser, mobile background, đánh giá
memory dài hạn và quan sát production >=48h. Chủ dự án yêu cầu phát hành toàn
bộ thay cho canary; không coi đó là bằng chứng các gate đã đạt. Không dùng
fixture/cookie tổng hợp ở production. Soak đạt không thay thế các gate còn thiếu.
