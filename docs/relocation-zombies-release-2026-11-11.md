# Ty Dời dựng và kích hoạt zombie cho các làng hiện có

Release ID: `relocation-zombies-20261111`.

Theo yêu cầu chủ game ngày 11/11/2026:

- Ty Dời dựng mở từ Hiện đại (đời 6), tối đa một Ty; di dời có phí vật liệu, vàng, thời gian và một đội xây. Chi tiết tại [building-relocation.md](building-relocation.md).
- Bến cảng bình thường cần Ty; cảng mắc cạn vẫn được cứu hộ để tránh khóa làng cũ. Hai API di dời dùng chung phần thực hiện, giữ hàng dân đang vận chuyển.
- Kích hoạt zombie cho toàn bộ làng hiện có, thay cho chính sách tự bật trước đây. Làng chưa bật nhận năm phút chuẩn bị từ thời điểm migration, không có đợt tấn công hồi tố. Làng đã bật giữ nguyên lịch/thiệt hại và không reset báo cáo.
- Làng mới vốn đã tự bật zombie; không thay đổi quy tắc đó.

Script vận hành (chỉ chạy khi được chủ game yêu cầu bật toàn bộ):

```bash
# Xem số lượng, chưa ghi dữ liệu
bun scripts/activate-existing-zombies.ts
# Kích hoạt làng còn thiếu. Có thể chạy lại, không reset làng đã bật.
bun scripts/activate-existing-zombies.ts --apply
```

Script dùng cấu hình MongoDB local, không in thông tin đăng nhập. Chỉ cập nhật state.zombies, thêm cảnh báo vào nhật ký, updatedAt và tăng ver bằng CAS để yêu cầu đang chạy phải tải lại dữ liệu; không ghi đè toàn bộ save. Snapshot theo revision tự bị vô hiệu hóa. Không tắt zombie khi rollback code; migration dữ liệu tách khỏi rollback worker.

Kết quả preflight production: 7 làng, cả 7 chưa có trạng thái zombie.

## Kết quả phát hành

- Commit tính năng: `873908a`, đã push `origin/main`.
- Web/API: `41cb9b30-f6bc-422d-99a0-1962b48ab02d`.
- Combat Worker: `0e621d25-8728-4208-abbc-141e552a7c0a`.
- TypeScript, 558 test game, 9 test API, 18 test worker, render regression và build Cloudflare: đạt.
- Production smoke: 30 request / 19 assets đạt, giữ làng Nam Quốc Sơn Hà, batch, đăng nhập, world, diplomacy và leaderboard. Combat/chợ reconcile: `ok: true`, `failed: 0`.
- Migration production: bật 7 làng, tổng 7/7 đã bật, còn thiếu 0. Đọc lại sau smoke vẫn 7 đã bật / 0 còn thiếu.
- Nam Quốc Sơn Hà kích hoạt lúc 15:00:34 ngày 11/11/2026 (UTC+7); đợt đầu được lên lịch 15:05:34. Lịch có thể được cơ chế PvP tạm hoãn nếu làng giao chiến.
- Browser production hiện về màn đăng nhập do phiên đã hết hiệu lực; kiểm tra làng sau deploy qua API có xác thực như smoke nêu trên. Luồng di dời đã kiểm tra trên trình duyệt local trước release.

Log vận hành trên máy: `/tmp/relocation-release-{tests,api,render,worker,build,web-deploy,battle-deploy,production-smoke,reconcile}.log` và `/tmp/relocation-zombies-activation.log`.
