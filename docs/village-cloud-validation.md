# Kiểm thử prototype làng trên Cloudflare

Ngày 07/11/2026. Chủ dự án tạo Worker qua dashboard, cho phép deploy prototype,
SQLite, secret riêng và kiểm thử dữ liệu giả. **Đây chưa phải migration làng thật
hoặc nghiệm thu gói Free.**

## Bản đã chạy

- Worker: `dong-song-village-prototype.phungthienphu.workers.dev`.
- Class SQLite: `VillagePrototype`, binding `VILLAGES`; tách khỏi combat.
- Secret remote được sinh ngẫu nhiên, không dùng key local hoặc AUTH_SECRET.
- Bản kiểm tra đầu: `1090bdc2-9196-44f8-b80d-506047772f86`.
- Redeploy sửa tên chỉ số clock, kiểm tra phục hồi:
  `8d3738f3-68ef-4599-81f7-c4322a3c162d`.
- Config trong Git mặc định tắt; chỉ bật bằng flag deploy cho các lượt QA.
  Không có Mongo binding, tài khoản thật, public client routing hoặc lịch quét.

## Tính đúng và độ bền

267 HTTP attempts thực, 432 rows read và 181 rows written theo response metrics;
SQL rollback chủ động không tính được qua response lỗi nên không coi đây là
chính xác số billed. Một response 503 là lỗi SQL cố ý để kiểm tra rollback;
400/401/404/409/413 còn lại đều là bài negative có assertion. Không có lỗi ngoài
dự kiến trong các lượt này.

- 9 scenario quyền/sequence/session/SQL rollback/retention qua trên cloud.
- 8 workload khớp hash engine: làng mới, 50 dân, 200 dân, kho đầy, offline 1 giờ,
  24 giờ, 14 ngày/50 dân và 14 ngày/200 dân.
- 2 làng 200 dân, mỗi làng 200 lệnh; hai bản sao batch/làng gửi đồng thời
  (tổng 4 request đồng thời), mỗi batch đúng một write, mọi hash đều khớp.
- Sau redeploy, instance ID mới khác instance cũ. Checkpoint/ACK/revision đã lưu
  giữ nguyên, retry không ghi lại. Catch-up đang dở tiếp tục đúng hash; checkpoint
  cuối 200 dân/14 ngày giữ nguyên qua thay instance.

| Workload | Đoạn checkpoint | Tổng HTTP wall | SQLite bytes/làng | Hash |
|---|---:|---:|---:|---|
| Mới | 1 | 99 ms | 57.344 | `043078ac6a8978a1` |
| 50 dân | 1 | 385 ms | 73.728 | `0d67ea126b542f25` |
| 200 dân | 1 | 415 ms | 94.208 | `dff11f4231c6090b` |
| Kho đầy | 1 | 202 ms | 73.728 | `5299a158e6015a91` |
| Offline 1h | 1 | 424 ms | 73.728 | `5973be72bc379a01` |
| Offline 24h | 4 | 2.237 ms | 73.728 | `2b0e158df5b83700` |
| Offline 14 ngày/50 | 56 | 31.525 ms | 77.824 | `5576908e194fd00e` |
| Offline 14 ngày/200 | 56 | 198.587 ms | 98.304 | `9924dd1fe04cd260` |

Đây là một lượt synthetic qua mạng từ máy dev; không phải P95 gameplay/CPU.
SQLite lớn nhất trong cả suite (gồm receipt retention) là 122.880 bytes/làng.
Thời gian tính bù dài vẫn lớn; chunking chỉ giới hạn mỗi event, không giảm tổng
chi phí engine. `performance.now()` trên cloud trả clock delta 0 khi tính toán,
nên đã đổi tên metric thành `handlerClockDeltaMs`; không báo đó là CPU 0 ms.

## Metrics Cloudflare gốc

GraphQL schema xác nhận đơn vị CPU là microseconds, duration là GB*s. Snapshot
query cửa sổ **12:23:00–12:43:49 UTC** (19:23–19:43 UTC+7):

| Chỉ số | Kết quả |
|---|---:|
| Router requests được tổng hợp | 264 |
| Router CPU tổng / startup CPU riêng | 300,082 ms / 154,371 ms |
| Router CPU P50 / P95 / P99 | 1,010 / 2,080 / 2,705 ms |
| DO invocations được tổng hợp | 223 |
| DO CPU P50 / P95 / P99 | 208,933 / 6.516,208 / 8.388,657 ms |
| DO periodic CPU tổng | 216,099343 giây |
| DO duration | 29,760083072 GB*s |
| DO exceeded CPU / memory / fatal internal | 0 / 0 / 0 |
| Isolate memory lớn nhất được sample | 50.464.214 bytes (~48,1 MiB) |
| SQL rows read / written theo periodic | 421 / 187 |

Metrics có độ trễ/sampling: các dataset không phủ cùng toàn bộ attempts, query
account-wide trả CPU prototype 158,521197 giây và duration 21,8300832 GB*s khác
query namespace. Không cộng hai dataset này hoặc coi là bill đã chốt. Dataset
storage trả rỗng lúc query, **chưa có số storage account**, không phải 0 byte.
Router duration không dùng thay DO duration và không cộng mù vào quota DO.

Lần introspection đầu vượt GraphQL budget; đã chờ hơn 5 phút, thay bằng query
aggregate có giới hạn và thêm cooldown trong runner. Không polling mỗi request.
Phiên Wrangler đọc analytics được; đọc subscriptions trước đó bị 403, trường
`usageModel: standard` không đủ xác nhận account đang dùng Free hay Paid.

## Những gì chưa được nghiệm thu

- Fixture lớn nhất **đã thử** có 200 dân; làng canary của chủ dự án hiện 281 dân.
  Cần thêm workload lớn/đủ đặc trưng trước khi cho làng đó chạy trên DO.
- Chưa có tải chuẩn theo số người/giờ chơi và peak đại diện; bài 4 request đồng
  thời không thay thế stress gấp đôi peak production. Chưa đạt gate <=50%/80%
  quota Free hoặc chứng minh tổng account đủ ngân sách dài hạn.
- Giới hạn save >14 ngày, migration owner/fence, giao dịch nhiều làng, scheduler,
  backup/restore và G-B vẫn còn. Không chuyển quyền ghi production từ kết quả này.
- Chặng A: chủ dự án đã đăng nhập, chỉ định làng canary và đồng ý thử 10 giây.
  **Chưa bật delay**; còn gate soak/mobile và đo cùng tải >=48 giờ.
- Soak cũ mất tiến trình/log, không có kết quả pass. Đã dựng lại Mongo/Next/Worker
  loopback riêng, lưu DB/log trong `.wrangler/sync-qa-infra`; lượt hai giờ thực mới
  bắt đầu **12:44:37 UTC**, chỉ có thể hoàn tất từ **14:44:37 UTC (21:44 UTC+7)**.
  Tiến độ không thay cho `soak-pass`; không dùng log /tmp làm bằng chứng duy nhất.

Runbook: [village-prototype.md](./village-prototype.md),
[sync-release.md](./sync-release.md), [sync-integration.md](./sync-integration.md).
