# Website và đăng nhập Cloudflare — staging

Ngày: 09/11/2026. **Không phải bản game production đã chuyển dữ liệu.**

## Địa chỉ và ranh giới

- Production đã đặt chỗ: `https://dongchaythoigian.phungthienphu.workers.dev`;
  hiện giữ trang Hello World. Không đụng namespace Battle hoặc Village prototype.
- Staging: `https://dong-song-game-staging.phungthienphu.workers.dev`.
- Database duy nhất được code auth staging chấp nhận: `dong_song_cloudflare_qa`.
  Không đọc/ghi làng thật. Secret kết nối được chủ dự án cho phép cấu hình vào
  Cloudflare Secrets; không xuất hiện trong repo/client bundle hoặc báo cáo.
- `gameReady:false`. Xây dựng, điều quân, market và city batch trả JSON 503,
  không ACK và không tạo dữ liệu giả để báo thành công. `/dev/*` trả 404.

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

**Chưa nghiệm thu M02 đầy đủ:** đăng nhập hai browser thật; rào phiên HTTP/socket
của Village/Battle sau migration. Không gọi M02 xong chỉ vì OAuth một browser qua.

## Lệnh sử dụng

```sh
bun run build:cloudflare
bun run type-check
bun test tests/cloudflare-router.test.ts tests/cloudflare-auth.test.ts
WRANGLER_LOG_PATH=/tmp/dong-song-wrangler.log worker/node_modules/.bin/wrangler deploy --config cloudflare/wrangler.staging.jsonc
node scripts/check-cloudflare-web.mjs https://dong-song-game-staging.phungthienphu.workers.dev --auth
```

Build mặc định lấy origin staging. Build cho origin khác truyền URL vào script,
không dùng artifact staging làm bản production mà quên đổi metadata:

```sh
node scripts/build-cloudflare-web.mjs https://dongchaythoigian.phungthienphu.workers.dev
```

Chưa có cấu hình deploy production. Không đổi tên staging config để bỏ qua các
gate M03–M10. `AUTH_ENABLED` chỉ mở bốn route auth/me, không mở city/gameplay.

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
