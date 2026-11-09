# Phát hành Cloudflare ngày 09/11/2026

## Kết quả

- Game production: https://dongchaythoigian.phungthienphu.workers.dev/
- Website và toàn bộ API chạy Cloudflare. Không dùng Vercel để phục vụ game.
- MongoDB vẫn là nguồn lưu duy nhất cho làng, người chơi và giao dịch.
- GameApi DO chia theo tài khoản có chữ ký hợp lệ, chạy engine phía server;
  không chạy engine trong HTTP Worker bị giới hạn CPU 10ms của Free.
- Client phản hồi ngay, gom thao tác 30 giây cho tất cả tài khoản (cập nhật
  sau cutover; bản cutover ban đầu là 10 giây). Khi rảnh,
  checkpoint 5 phút như bản trước; giao thương và combat giữ đường xử lý riêng.
- Giữ `dong-song-battles` và namespace BattleRoom hiện có. Callback/cron chạy
  về origin mới, không còn gọi Vercel. Cấu hình QA dùng worker combat riêng.
- Không thay cân bằng, tốc độ game, luật offline, tài sản hoặc ID khi chuyển.

Chủ dự án duyệt bỏ mốc chờ 48 giờ. Đây là **hoàn tất chuyển hosting**, không
phải hoàn tất kiến trúc Village SQLite/coordinator trong kế hoạch dài hạn.

## Artifact đã phát hành

| Thành phần | Version Cloudflare |
|---|---|
| Web + API production | `4cd73dae-8b3d-4edc-bb7d-22aa55c4a2f9` |
| Battle Worker production | `26f7e8dc-04b1-4149-a96b-b678ebb420ff` |
| API staging đầy đủ | `d426637a-e70a-435f-b2f1-59081b4bbd2e` |

## Dữ liệu và backup

Snapshot MongoDB nhất quán bằng transaction `readConcern: snapshot`, trước
cutover. Tất cả bản ghi đã giải mã BSON kiểm tra số lượng/ranh giới; manifest
ghi SHA-256 từng collection. File backup quyền 0600, thư mục 0700, không commit.

Backup trên máy: `.wrangler/backups/cutover-1794196511253/`.

| Collection | Bản ghi |
|---|---:|
| cities | 8 |
| users | 5 |
| market_orders | 11 |
| caravans | 3 |
| battles | 4 |
| envoy_visits | 15 |
| online_command_stats | 34 |

Tất cả làng ở engine version 3. Sau cutover smoke vẫn có 8 làng/5 tài khoản.
Không import QA vào production; không đổi các pointer hay sao chép database.
Làng tiếp tục mô phỏng thời gian offline theo luật hiện có, nên số tài nguyên
hiển thị khi trở lại có thể khác checkpoint trong backup.

Vercel vẫn đang bị pause; không bật lại bản cũ làm máy chủ game. Nếu cần mở
lại Vercel trong tương lai, phải thay bản cũ bằng redirect/static trước để
không tạo đường ghi cũ hoặc callback trỏ ngược về Vercel.

## Kiểm chứng

- 321 regression engine/gameplay; 16 test Battle Worker; 5 test adapter,
  gồm cô lập cookie/client Mongo/after khi request chạy đồng thời.
- 29 request QA thật: account, tạo làng, batch đồng thời/ACK một lần,
  checkpoint, tìm/kết bạn/xem làng/gỡ bạn, world, envoy, diplomacy,
  market transaction/retry không mua hai lần, PvP start/live/retreat và
  callback kết quả thực sự từ QA BattleRoom; session cũ bị từ chối.
- 30 request production, 19 assets: kiểm tra MIME JS/CSS, login PKCE,
  anonymous 401, dev 404, API làng/world/diplomacy/leaderboard/combat.
- Google OAuth thật trong browser đưa về đúng **Nam Quốc Sơn Hà** của
  **Thiên Phú Phùng**, hiển thị làng và kết quả các trận cũ.
- Mở bản đồ thế giới trong game thật thành công. Reconcile sau cutover trả
  `checked: 0, failed: 0`, market cũng không có lỗi hoặc job đang chờ đến hạn.
- Type-check và static production build thành công. Secrets chỉ lưu ở
  Cloudflare Secrets, không vào asset hoặc chat.

QA script tự dọn đúng các account/làng synthetic mà nó tạo. Không test giao
dịch, tuyển quân hay tấn công thật trên tài khoản người chơi.

## Deploy những lần tiếp theo

```sh
bun run type-check
bun test tests/cloudflare-bridge.test.ts
bun test lib/*.test.ts
node worker/tests.mjs
bun run build:cloudflare https://dongchaythoigian.phungthienphu.workers.dev
WRANGLER_LOG_PATH=/tmp/dong-song-wrangler.log worker/node_modules/.bin/wrangler deploy --config cloudflare/wrangler.production.jsonc
WRANGLER_LOG_PATH=/tmp/dong-song-wrangler.log worker/node_modules/.bin/wrangler deploy --config worker/wrangler.jsonc
node scripts/check-cloudflare-production.mjs
node scripts/reconcile-cloudflare-production.mjs
```

Không cần nhập lại secrets mỗi deploy. `cloudflare-hosting-setup.mjs` chỉ dùng
khi thiết lập/luân chuyển secrets có chủ đích. File secrets tạm phải xóa sau
upload. Không chạy lại setup QA cũ vì nó sinh AUTH_SECRET khác.

## Khôi phục

1. Nếu phát hành mới lỗi, quay lại version Cloudflare **đã xác nhận hoạt động**
   với `wrangler rollback <version> --config cloudflare/wrangler.production.jsonc`.
   Không rollback về Worker Hello World trước cutover; nó không phục vụ game.
2. Khi cần bảo trì dữ liệu, đặt `GAME_ENABLED=false` trong cấu hình production
   và deploy. Mutation và callback trả 503; BattleRoom giữ kết quả để retry.
   Sau khi phục hồi, đặt lại true và reconcile các job đang chờ.
3. Database không bị di chuyển trong lần cutover này; rollback code vẫn dùng
   dữ liệu hiện tại. **Không** ghi backup đè lên database đang mở, vì sẽ xóa
   giao dịch hợp lệ phát sinh sau snapshot.
4. Khi có hỏng dữ liệu thật, dừng ghi, chụp backup hiện tại, kiểm tra manifest,
   phục hồi vào database tách biệt, đối chiếu tài sản/escrow/quan hệ rồi mới
   chuyển cấu hình. Cần bảo toàn các giao dịch sau backup bằng journal/đối soát;
   chưa có bài kiểm thử restore toàn database production nên không tự ghi đè.

## Giới hạn cần tiếp tục đo

- Chưa stress 2 giờ hoặc soak 48 giờ theo yêu cầu mở ngay. Các kiểm tra trên
  không chứng minh đủ quota Free khi lượng người chơi tăng.
- Mongo kết nối theo request để không dùng socket thuộc request khác trong
  Workers; handshake có thể tăng thời gian ACK. Mọi transaction dùng cùng client
  trong request. Không chạy tạo indexes ở mỗi cold start.
- Router/API/DO/battle vẫn dùng quota Cloudflare; chuyển nhà không làm CPU và
  request miễn phí vô hạn. Đo thực tế CPU, DO duration, reconnect/cron và Mongo
  rồi quyết định tối ưu tiếp; không tự đăng ký gói trả phí.
- Cookie/queue cũ trên Vercel không tự chuyển origin. Người chơi đăng nhập
  Google lại, vào làng đã được server xác nhận. Không replay thao tác chưa ACK
  từ origin cũ như giao dịch mới để tránh chi hai lần.
- Village SQLite QA cũ vẫn được giữ nguyên namespace; chưa nhập làng thật
  vào SQLite, chưa thay coordinator Mongo bằng coordinator mới.
