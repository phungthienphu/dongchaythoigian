# Zombie control và giảm thời gian tính bù

## Thay đổi

- Bảng Tổng quan admin có điều khiển zombie toàn game, lý do bắt buộc, kiểm tra revision và audit trong cùng transaction.
- Server đính kèm quy tắc cho snapshot làng; cache snapshot kiểm tra cả revision quy tắc. Client không tự ghi quy tắc qua game action.
- Tắt xóa các mối đe dọa và đóng băng clock bệnh/cứu chữa; bật lại không dồn đợt cũ, có ít nhất 5 phút chuẩn bị. Thiệt hại cũ giữ nguyên.
- Duy trì tick chính xác 1 giây và giới hạn offline 14 ngày. Tăng lượng tick mỗi lần lưu checkpoint tối đa 4 lần, có giảm theo dân/công trình/zombie đang có. Giới hạn Node tăng từ 1,2 lên 4 giây; Cloudflare dùng hard tick cap vì clock CPU có thể đứng yên.
- Tạo bản đồ đi được trong một lượt và bỏ hash lookup trong BFS khi chỉ có một đích. Không đổi thứ tự duyệt hoặc cách chọn đường.

## Kiểm chứng

- Differential với HEAD trước thay đổi: 8.960 đường đi và 63 trạng thái làng trùng chính xác (`bun tests/engine-equivalence.mjs HEAD`).
- Test quy tắc: tắt khi đang có zombie/người nhiễm, giữ hư hại, bật lại, làng bỏ qua giai đoạn tắt, wrapper collection, cache revision, recovery chia lát qua JSON vẫn trùng mô phỏng một lượt.
- Test admin: từ chối người thường, schema command, stale revision, idempotency, rollback khi audit lỗi.
- Chromium E2E với Mongo fixture trong bộ nhớ: bật/tắt và đọc lại settings/audit; các chức năng admin cũ; desktop/mobile không tràn trang, không pageerror.
- Kiểm tra giới hạn recovery khi `performance.now()` đứng yên: fixture 1.389 dân, 359 công trình vẫn lưu một lát hữu hạn (khoảng 10 giây trên máy thử, không phải số đo CPU Cloudflare).

## Phép đo và giới hạn

Synthetic `syncFixture`, tính bù 2 giờ, quy tắc mặc định. Với hard tick cap trên Cloudflare: làng 50 dân giảm từ 2 xuống 1 lát; làng 200 dân giảm từ 6 xuống 2 lát. Đây là số checkpoint/request theo cap, không phải mức tăng tốc tổng thời gian.

Năm lượt CPU local cho mỗi bản (đảo thứ tự trước/sau): 50 dân median khoảng 1.055 → 967 ms; 200 dân khoảng 4.671 → 4.562 ms. Máy có tác vụ kiểm thử khác nên số này chỉ định hướng; không dùng làm SLA hoặc tuyên bố nhanh hơn nhiều lần. Phần lợi ích chính của lát lớn là giảm kết nối Mongo, round trip và dựng lại route cache giữa các request.

Chưa đo lại làng thật trên Cloudflare trong lượt này. Làng lớn/offline nhiều ngày vẫn phải mô phỏng đầy đủ, có thể còn chậm. Không bỏ tick, không cấp giả tài nguyên hoặc mở trạng thái chưa tính xong cho người chơi. Cần đo production sau khi phát hành để đánh giá thời gian chờ thực tế và CPU budget.

Không thay đổi database production, chưa bật/tắt zombie thật, chưa deploy thay đổi này. Thay đổi `.gitignore` có sẵn được giữ nguyên ngoài phạm vi.

## Kết quả kiểm tra cuối

- `bun run type-check`: pass.
- `bun test lib/*.test.ts --timeout 30000`: 617 pass, 0 fail.
- Admin store: 7 pass; admin auth/schema/handler: 8 pass; recovery API: 5 pass.
- `node worker/tests.mjs`: 18 pass.
- `bun run build`: pass; `bun run build:cloudflare -- https://dongchaythoigian.phungthienphu.workers.dev`: pass.
- Chromium admin E2E: pass cả off/on + audit, anonymous/player/stale session, các chức năng cũ và mobile.
- `git diff --check`: pass.

## Production release 2026-11-23

- Người dùng yêu cầu `release`; đã deploy từ detached worktree sạch tại source commit `22e68f4d13ea91fa83bdbe38f14b3549fca540df`, giữ nguyên `.gitignore` ngoài phạm vi.
- Release ID: `zombie-control-recovery-20261123`.
- Web/API version: `91aede03-bf26-4748-8d73-9fea57e4ff9f`.
- Combat Worker version: `1caf2266-164f-49ab-9ff9-aef3ed9d3abb`.
- Cả hai deploy dùng `--keep-vars`; không cập nhật setting zombie hoặc dữ liệu người chơi.
- Trong worktree release: type-check, 15 admin tests, 18 Worker tests và build Cloudflare đều pass. Kết quả 617 lib tests và differential ở trên thuộc cùng source implementation trước commit.
- Public smoke: health đúng release; homepage/admin 200; 10 JS/CSS asset đúng SHA-256 và MIME; `/dev/eras` 404; admin/city API và Combat Worker command đều từ chối ẩn danh 401.
- Chromium production: admin hiển thị cổng đăng nhập, mobile 390 px không tràn ngang và không pageerror. Thao tác toggle đã kiểm thử trên fixture; không toggle production trong smoke.
- Source commit đã push `origin/main`. Chưa benchmark recovery trên làng production thật trong lần phát hành này.
