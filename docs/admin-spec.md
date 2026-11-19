# Trang quản trị Dòng Chảy Thời Gian

## Mục tiêu

Trang `/admin` dành cho người vận hành: nắm tình hình game, tra cứu người chơi/làng, theo dõi trận đánh và giao thương, xử lý yêu cầu đổi tên và lưu ghi chú hỗ trợ. Giao diện tiếng Việt, cùng phong cách xanh rừng và vàng của game, dùng được trên desktop và điện thoại.

## Quyền truy cập

- Dùng phiên Google hiện tại (`sid`), xác minh chữ ký, hạn dùng và `users.sessionVersion` trên mỗi yêu cầu.
- Server cấp quyền bằng biến `ADMIN_USER_IDS`: danh sách Google user ID (`users._id`) phân cách bởi dấu phẩy. So khớp toàn bộ ID; không dựa email, tên, header hay dữ liệu client.
- Không cấu hình danh sách đồng nghĩa không có admin. Không có đường dẫn tự cấp quyền và không chọn người chơi đầu tiên làm admin.
- API trả 401 khi chưa đăng nhập/phiên cũ, 403 khi tài khoản không được cấp quyền. HTML tĩnh chỉ chứa giao diện, không chứa dữ liệu quản trị.
- Đăng nhập từ admin quay lại `/admin`; đích chuyển hướng chỉ cho phép `/admin` hoặc `/`.
- POST bắt buộc Origin cùng APP_URL, JSON và body tối đa 8 KiB; không cho cross-site. Mọi phản hồi admin đặt private/no-store.

## Phạm vi chức năng

| Mục              | Nội dung                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tổng quan        | Tổng tài khoản, hoạt động 24 giờ theo lastSeen, tổng làng, trận đang diễn ra, lệnh bán mở, đoàn buôn chưa hoàn tất; 8 thao tác quản trị mới nhất |
| Người chơi       | Tìm theo ID, tên, email, mã làng; xem ngày tạo/lần truy cập; thêm ghi chú nội bộ kèm lý do                                                       |
| Làng & thành phố | Tìm theo ID, tên, chủ làng; xem thời đại, dân số, điểm, lần lưu, revision; đổi tên 2–24 ký tự kèm lý do                                          |
| Trận đánh        | Tìm theo ID, tên/ID các bên, trạng thái; xem hành quân/giao chiến/trở về và thời gian                                                            |
| Chợ giao thương  | Tìm theo ID, người bán, tài nguyên, trạng thái; xem số lượng, giá, loại thanh toán                                                               |
| Nhật ký          | Tìm theo actor, đối tượng, lý do, thao tác; xem thời gian, trước/sau và nội dung ghi chú                                                         |

Danh sách phân trang 25 dòng, sắp xếp có `_id` làm khóa phụ, tìm chuỗi literal không thực thi regex người dùng. Giới hạn từ khóa 100 ký tự và trang 1–1000. Có loading, empty, denied, lỗi kèm thử lại, thông báo lưu thành công. Bấm chi tiết mở dialog; hỗ trợ Escape, giữ focus và khôi phục focus.

## Ghi dữ liệu và tính nhất quán

- MongoDB hiện tại là nguồn dữ liệu. Admin không gọi `settle`, không chạy mô phỏng khi xem, không ghi `state`, `ver`, receipt hoặc sync ledger.
- Đổi tên chỉ cập nhật `cities.name`; yêu cầu tên cũ (`expected`) và kiểm tra lại trong transaction. Tên bị thay đổi đồng thời trả 409, người vận hành phải tải lại.
- Ghi chú lưu dưới dạng nhật ký bất biến, chỉ dành cho tài khoản tồn tại. Không đổi profile hay gửi tin nhắn tới người chơi.
- Thay đổi và audit nằm cùng Mongo transaction: audit lỗi thì rollback toàn bộ. Mongo deployment phải hỗ trợ transactions (replica set/Atlas).
- `admin_audit`: `_id=actor:requestId`, actor, action, target, reason, before, after, at. `_id` mặc định unique đảm bảo một biên nhận. Gửi lại cùng requestId và nội dung trả thành công mà không ghi lại; dùng cùng ID cho nội dung khác trả 409.
- Lý do 5–500 ký tự, ghi chú tối đa 2.000 ký tự. Không ghi token, cookie, chuỗi kết nối hoặc lỗi driver vào phản hồi/nhật ký.
- Mọi danh sách dùng projection rõ ràng: không trả sessionVersion, friendCode, trạng thái mô phỏng, battle snapshot hay vé WebSocket. Email chỉ hiển thị cho admin đã xác thực.
- Tên mới áp dụng cho các lần đọc làng tiếp theo. Tên đã chụp trong trận đánh, đoàn buôn và báo cáo lịch sử giữ nguyên.

## Ngoài phạm vi

Chưa có cấp tài nguyên, chỉnh clock/game state, xóa làng, mạo danh, khóa tài khoản, thay đổi balance, hủy trận/đoàn buôn, broadcast hay phân quyền admin qua UI. Các chức năng này cần hợp đồng riêng với engine và Combat Worker. Không deploy hoặc thay đổi production trong đợt xây trang admin này.

## Tích hợp và vận hành

1. Route Next: `/admin`, `/api/admin`. Cloudflare static app export `/admin`; bridge dispatch `/api/admin` vào cùng handler, giữ auth, origin gate và request-scoped Mongo.
2. Cấu hình `ADMIN_USER_IDS` trên đúng runtime: `.env.local` cho Next, Worker secret/variable cho Cloudflare Web/API. Dùng ID đã xác minh trong `users._id`, không dùng email hoặc friendCode. Không commit ID thật hay secrets.
3. Local ví dụ cấu hình: `ADMIN_USER_IDS=<google-user-id-1>,<google-user-id-2>` và APP_URL đúng origin. Các biến Mongo/auth đang có được tái sử dụng.
4. Production: trước hoặc cùng lúc phát hành Web/API, đặt `ADMIN_USER_IDS` qua hệ thống cấu hình hiện có. Chưa đặt biến thì game vẫn chạy bình thường và admin từ chối toàn bộ tài khoản.
5. Không cần thay schema, không có migration phá dữ liệu. Collection admin_audit tự được tạo khi ghi lần đầu. Với lịch sử lớn, nên bổ sung index `{at:-1,_id:-1}` và `{target:1,at:-1}` theo quy trình vận hành database.
6. Rollback code không xóa audit; bỏ allowlist để thu hồi quyền. Phiên game và dữ liệu mô phỏng không bị thay đổi bởi thu hồi quyền admin.

## Tiêu chí nghiệm thu

- Người lạ, người chơi thường, cookie giả và phiên đã thay thế không đọc/ghi được admin.
- Thiếu allowlist không mở quyền; không thể tự nâng quyền bằng request.
- Các mục tìm kiếm, phân trang, chi tiết, làm mới hoạt động; dữ liệu private không lọt qua projection.
- Đổi tên có xác nhận, lý do, audit; bảo vệ tên cũ, replay, rollback khi audit lỗi.
- Ghi chú có audit và tra cứu lại được; đối tượng không tồn tại bị từ chối.
- Build Next và Cloudflare thành công; browser desktop/mobile không tràn viewport và không phát sinh lỗi JavaScript.

## Kiểm chứng có thể chạy lại

Chạy các file test có mock trong process riêng để tránh Bun chia sẻ module registry:

```sh
bun test tests/admin.test.ts
bun test tests/admin-store.test.ts
bun test tests/cloudflare-auth.test.ts tests/cloudflare-bridge.test.ts
bun run type-check
bun run build
bun run build:cloudflare -- https://dongchaythoigian.phungthienphu.workers.dev
```

Browser E2E dùng production frontend, session ký thật, currentUser, API handler và admin store thật; thay Mongo bằng fixture trong RAM. Không kết nối Mongo production, không gọi Google thật:

```sh
# Sau bun run build, chạy ở terminal riêng:
bun run start -- --hostname 127.0.0.1 --port 3468
bun tests/admin-browser-server.ts
# Playwright được cung cấp từ runtime hoặc cài sẵn ngoài dependency production:
PLAYWRIGHT_MODULE=/path/to/playwright node tests/admin-browser.mjs
```

`CHROME_BIN` có thể chỉ định Chromium; mặc định `/usr/bin/google-chrome`. Ảnh QA mặc định trong `/tmp/admin-browser`, đổi bằng `ADMIN_SCREENSHOTS`. Khởi động lại fixture server trước mỗi lần E2E để reset dữ liệu. Hai cổng chỉ dành cho máy local, không public test server.

Giới hạn bằng chứng: kiểm thử transaction dựa trên Mongo contract trong RAM; chưa xác minh ghi Mongo thật, OAuth Google thật, cấu hình allowlist hay triển khai production. Cần smoke tài khoản admin thật sau khi phát hành.
