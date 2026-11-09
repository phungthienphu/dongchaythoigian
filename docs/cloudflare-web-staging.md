# Website và đăng nhập Cloudflare — staging

Ngày: 09/11/2026. **Không phải bản game production đã chuyển dữ liệu.**

**Cập nhật cuối ngày 09/11:** staging hiện chạy toàn bộ API qua cấu hình
`cloudflare/wrangler.bridge-qa.jsonc`, dùng Mongo QA và BattleRoom QA riêng.
Production đã chuyển hosting; xem [biên bản cutover](./cloudflare-production-cutover.md).
Phần dưới là bằng chứng giai đoạn M01–M03 trước cutover, không phải cấu hình
staging hiện tại. Không deploy lại `wrangler.staging.jsonc` như bản mới nhất.

## Địa chỉ và ranh giới

- Production đã đặt chỗ: `https://dongchaythoigian.phungthienphu.workers.dev`;
  hiện giữ trang Hello World. Không đụng namespace Battle hoặc Village prototype.
- Staging: `https://dong-song-game-staging.phungthienphu.workers.dev`.
- Database duy nhất được code auth staging chấp nhận: `dong_song_cloudflare_qa`.
  Không đọc/ghi làng thật. Secret kết nối được chủ dự án cho phép cấu hình vào
  Cloudflare Secrets; không xuất hiện trong repo/client bundle hoặc báo cáo.
- `gameReady:false`. M03 đã mở tạo/đọc làng QA, batch và checkpoint trên một
  namespace SQLite mới. Market, world, sứ giả và combat còn trả JSON 503;
  `/api/city/action` cũ không nhận ghi. `/dev/*` trả 404.

## M01 — Giao diện tĩnh

Dùng app Next static export riêng ở `cloudflare/web`, tái sử dụng nguyên Game,
layout/font/CSS và metadata assets. Giữ build Next hiện tại cho hệ thống cũ;
không bật export cho app có API và không thêm framework frontend mới.
`WEB_ORIGIN` được chốt lúc build để OG image không trỏ nhầm môi trường.

Cloudflare phục vụ HTML/chunk/font trực tiếp bằng Static Assets; chỉ `/api/*`
và `/dev/*` qua Worker. HTML không cache lâu, file có hash cache immutable.
Không cấu hình SPA fallback trả HTML cho URL JS/API không tồn tại.

Đã kiểm tra:

- Static build thành công: chỉ `/`, not-found và icon/OG metadata, không có API/dev.
- Type-check và 3 bài kiểm tra router qua; source bundle không chứa tên secret
  hoặc debug `__game` (không thay cho audit bảo mật toàn bộ).
- HTTP staging: 28 request kiểm tra 16 asset preload/chunk/CSS/font, đúng status,
  MIME, chữ ký font, cache, icon và ranh giới API/dev.
- Sau khi bật auth: 32 request qua, thêm anonymous `/me`, OAuth redirect/PKCE,
  callback sai state và logout không có Origin bị từ chối.
- Trình duyệt: màn đăng nhập hiện đúng, canvas minh họa hoạt động; bố cục tại
  viewport mặc định và 390×844 hiển thị được. Chưa xác minh gameplay Canvas.

Bản bootstrap M01 đã deploy với version
`992ff013-1720-4aa5-a9f9-6300e010e351`; các bản auth sau đó được ghi riêng bên dưới.

## M02 — MongoDB và native OAuth

Probe độc lập `dong-song-mongo-probe` chạy driver 7.8 và `nodejs_compat` trên
Workers thật, không import helper DB cũ vốn tạo index khi kết nối. Các lượt thử
chỉ tạo document/account với ID tổng hợp rồi xóa đúng ID đó.

- Connect, ping, insert/update/read/delete và transaction: qua; lần thử đầu
  connect 140 ms, tổng 223 ms.
- Repository auth thật: giữ ID, tăng phiên nguyên tử, phiên cũ hết hiệu lực,
  logout cũ không khóa phiên mới, logout hiện tại có hiệu lực: qua; connect
  163 ms, tổng 416 ms ở lượt thử này. Account tổng hợp đã dọn.
- Các số trên là **wall time**, không phải billed CPU hoặc benchmark tải Free.
- Tạo unique index `users.friendCode` một lần trong DB QA bằng script setup;
  không chạy tạo index trong request/cold start.
- Kết nối Mongo nằm trong lifetime request, đóng trong finally; không giữ socket
  global để dùng chéo request. Redirect login và anonymous `/me` không mở DB.

Native OAuth dùng Request/Response, signed state hết hạn 10 phút, PKCE S256,
cookie Secure/HttpOnly/SameSite=Lax, callback cùng origin và Google verified email.
`sid` giữ format HMAC hiện tại nhưng QA dùng AUTH_SECRET riêng. Không nhận/adopt
guest PID qua origin mới. Logout kiểm tra Origin và so sessionVersion.

Kiểm tra runtime đã tìm thấy `redirect:'error'` gây TypeError trên Workers:
probe metadata Google cho `alias-manual=200`, `bound-error=redirect-mode`,
`bound-manual=200`. Native OAuth dùng `manual` và từ chối 3xx để không gửi
client secret/access token sang địa chỉ khác.

Bảy bài unit test auth qua: PKCE/cookie, state sai, phiên hai máy và logout cũ,
CSRF/origin, token hết hạn/giả, email chưa xác minh và không theo redirect từ
endpoint Google. Google trong unit test
là giả lập; chỉ probe repository ở trên dùng Mongo thật.

Google thật đã hoàn tất trên browser với tài khoản được cho phép: sau callback
trang hiển thị “Chào Thiên Phú Phùng”; kiểm tra Mongo QA có một account, version
1, chưa có city. Đó là account QA riêng, không phải dữ liệu làng cũ bị reset.
Reload trang vẫn nhận đúng phiên và hiện tên tài khoản.
Bản auth đã kiểm tra: version `298cacf5-aeb6-4c9c-998b-1365f443dbe7`.

Worker probe tạm đã xóa sau kiểm tra; secrets của probe được xóa cùng Worker.
Các file secrets tạm dùng để upload cũng được dọn. Worker staging giữ secrets
đã được chủ dự án cho phép để tiếp tục kiểm thử; không dùng khóa QA cho production.

Login/logout đã nối rào phiên Village QA trong M03. **Chưa nghiệm thu M02 đầy
đủ:** đăng nhập hai browser độc lập thật và rào phiên Battle/socket sau migration.
Không gọi M02 xong chỉ vì OAuth một browser qua.

## M03 — Làng QA, lưu bền vững và batch 10 giây

`cloudflare/api/village.ts` là class mới `Village`, namespace riêng trong Worker
staging. Không dùng lại Village prototype/Battle. Chỉ nhận ID `qa-<uuid>` và
epoch cố định `cloudflare-qa-v1`; không có API seed, synthetic clock hoặc import.
Mongo chỉ giữ tài khoản và reservation tạo làng, không giữ bản state thứ hai.
State và ledger/receipt của làng QA được ghi vào một row SQLite trong transaction.

- Gateway kiểm tra sid, phiên Mongo, Origin cho mutation và quyền sở hữu. Tự
  dựng request nội bộ; không tin city ID/owner/session/epoch từ header client.
- Reservation gồm city pointer + tên/timestamp được ghi nguyên tử trong row
  account. Bốn yêu cầu tạo đồng thời cho cùng một tài khoản nhận cùng một ID.
  Nếu storage hoặc response tạo làng lỗi, GET/POST khôi phục cùng reservation.
- Batch giữ giao thức engine/anchor/sequence/digest hiện tại, giới hạn 32 lệnh,
  256 KiB trước parse; receipt giữ tối đa 256. Replay còn receipt trả snapshot
  đã commit, không chạy engine hoặc ghi lại. Payload đổi/sequence thiếu bị chặn.
- State + ACK chỉ xuất hiện trong response thành công sau commit. Lỗi storage
  rollback cả hai; không gửi ACK hoặc snapshot chưa lưu. Kết quả lệnh bị từ
  chối vẫn có receipt lỗi để client bỏ đúng thao tác, không báo đã thực hiện.
- Login tăng phiên Mongo rồi chờ fence Village trước khi cấp cookie. Logout
  CAS và retry fence không tăng phiên lần nữa; logout cũ không khóa login mới.
- Catch-up dài dùng work snapshot riêng, tối đa một lát dài 6 giờ mỗi request.
  Chưa hoàn tất trả 503 `CHECKPOINT_PENDING`, không ACK/không public state giữa
  chừng. GET hoặc retry tiếp tục từ SQLite sau restart. Fence phiên mới hủy
  work chưa ACK; state đã công bố được giữ nguyên.

Kiểm chứng ngày 09/11/2026:

- 43 bài auth/router/Village/gateway/batch/queue qua; type-check và diff check
  qua. Có parity với engine cũ, mất response/retry, SQL rollback, concurrent
  duplicate, fence, malformed/oversized, catch-up và restart adapter SQLite.
- Workerd + SQLite thật cục bộ: 9 request qua, gồm simultaneous duplicate,
  dừng/khởi tạo lại runtime giữ ACK, conflict và fence. Đây không phải soak cloud.
- Repository thật với Mongo QA + Village SQLite cục bộ: concurrent reservation,
  login fence, stale logout, retry logout và identity recovery qua. Tài khoản
  tổng hợp đã được xóa đúng ID; không đụng tài khoản người chơi thật.
- Browser staging đã tạo **Làng QA Cloudflare**, giao 2 dân chặt gỗ: UI phản hồi
  ngay, hiển thị Chờ lưu rồi Đã lưu; dân nộp gỗ về kho. Reload vẫn còn làng,
  phân công 2 dân và tiến trình. Đây là làng QA mới, không phải Nam Quốc Sơn Hà.
- HTTP staging: 33 request kiểm tra 16 asset, cache/MIME, auth/CSRF, legacy
  action vẫn khóa; không nhận lệnh ẩn danh. Nhãn QA được build riêng cho origin
  staging để tránh nhầm với bản đã chuyển production.

**Chưa xong toàn bộ M03:** ownership/cutover epoch và chặn mọi writer cũ,
inbox/outbox cho side effect M05, import/restore, khoá socket Battle, ngân sách
Free và soak cloud còn chờ các task liên quan. Với state ngoài cửa sổ 14 ngày,
QA trả `OFFLINE_MIGRATION_REQUIRED` thay vì sửa timestamp để giả lập cap; phải
giải quyết và differential-test boundary này trước import/cutover. Chia lát chỉ
giới hạn một lần tính, chưa chứng minh engine đã được tối ưu hoặc nằm trong quota.
Client phục hồi catch-up ban đầu/đường mất mạng dài còn cần nghiệm thu M06.

Bản M03 staging cuối đã deploy: `b25efdde-e4a6-4eff-b803-6127d05151ef`.
Worker production `dongchaythoigian` và các làng thật chưa được chuyển.

Game UI cũ vẫn thử tải battle/world/diplomacy; thông báo chưa kết nối combat
trên QA là giới hạn M05/M06 hiện tại. Không trả dữ liệu trận giả để che lỗi này.

## Lệnh sử dụng

```sh
bun run build:cloudflare
bun run type-check
bun test tests/cloudflare-*.test.ts lib/city-sync.test.ts lib/batched-city.test.ts
WRANGLER_LOG_PATH=/tmp/dong-song-wrangler.log worker/node_modules/.bin/wrangler deploy --dry-run --config cloudflare/wrangler.staging.jsonc --outdir /tmp/dong-song-m03-bundle
node scripts/check-cloudflare-village-runtime.mjs /tmp/dong-song-m03-bundle/index.js
bun scripts/check-cloudflare-village-repository.ts
WRANGLER_LOG_PATH=/tmp/dong-song-wrangler.log worker/node_modules/.bin/wrangler deploy --config cloudflare/wrangler.staging.jsonc
node scripts/check-cloudflare-web.mjs https://dong-song-game-staging.phungthienphu.workers.dev --auth --village
```

Build mặc định lấy origin staging. Build cho origin khác truyền URL vào script,
không dùng artifact staging làm bản production mà quên đổi metadata:

```sh
node scripts/build-cloudflare-web.mjs https://dongchaythoigian.phungthienphu.workers.dev
```

Chưa có cấu hình deploy production. Không đổi tên staging config để bỏ qua các
gate M03–M10. `AUTH_ENABLED` mở auth/me; `VILLAGE_ENABLED` chỉ mở ba route
city/batch/checkpoint QA khi binding/epoch/database đúng. Không đổi các biến này
thành cấu hình production để bỏ qua migrator và ownership cutover.

Setup secrets QA là thao tác riêng, cần quyền rõ ràng của chủ dự án. Script
`prepare-cloudflare-auth-qa.mjs` đọc dotenv production, chỉ tạo index QA và tạo
file secrets mode 0600 trong `.wrangler/` đã ignore. Chạy lại script sẽ tạo khóa
QA mới; không chạy như một bước build/deploy bình thường vì sẽ làm hết hạn sid.

Callback Google cần có cho QA:
`https://dong-song-game-staging.phungthienphu.workers.dev/api/auth/callback/google`.
Không đưa secret vào build command, browser URL, ảnh chụp hoặc commit.

## Còn lại trước mở game

M00 inventory/writer, M03 Village production/ownership fence, M04 engine nếu cần
để đạt quota, M05 coordinator, M06 client, M07 scheduler, M08 migrator/restore,
M09 tính đúng/tải/Free và M10 cutover vẫn theo kế hoạch chuyển nhà. Các thử nghiệm
nhỏ ở đây không chứng minh đã nằm trong ngân sách Free ở tải người chơi thật.
