# Tối ưu engine và crowd — kết quả triển khai 10/11/2026

Đã triển khai phần có lợi ích đo được và có thể bảo toàn toàn bộ trạng thái
game. Baseline là commit `7a63720a0899b7a77505836d545cfcd1d900cb21`.
Không đổi schema, luật kinh tế, tick, thứ tự dân, giới hạn offline hay giao thức ACK.

## Thay đổi

`lib/engine.ts`:

- Phân công tự động đếm nhóm tài nguyên và người làm theo công trình một lần,
  sau đó cập nhật theo task thực tế sau mỗi lần phân công. Không đếm lại toàn
  bộ dân cho từng người rảnh, không duyệt toàn bộ dân cho từng slot ứng viên.
- Phân công tự động và bảng headcount thủ công dùng chung hauling context
  trong một lượt. Trước đây mỗi `setTask` dựng lại derived/context và BFS cache
  dù việc nhận thêm lao động sản xuất không đổi địa hình hay staffing dịch vụ.
- Headcount thủ công dùng cursor thay `pool.shift()` liên tục; lỗi vẫn bỏ toàn
  bộ draft, cargo và các nhóm bảo vệ giữ nguyên hành vi cũ.
- BFS dùng bảng ô kề cố định theo đúng thứ tự N8, bỏ chia tọa độ và kiểm tra biên
  lặp lại trên mỗi node. Bảng lazy dùng 147.456 byte, một bản cho mỗi instance
  module; không chứa trạng thái làng, không tăng theo số người chơi hoặc đường đi.
  Passability, fog, luật góc chéo và thứ tự predecessor vẫn xử lý như cũ.

`components/villagers.ts`:

- Dựng index Person tại sync; frame bình thường dùng lại Map. Sync luôn thay
  reference khi nhận snapshot mới có cùng ID. Thay array hoặc đổi dân số giữa
  các sync cũng làm mới index; mutation bên trong Person hiện tại được đọc trực tiếp.
- Explorer dùng lookup đã có, bỏ `people.find` riêng trong vòng từng actor.
- Mỗi sync dùng một danh sách công trình, cache nhà gần nhất theo đích trong
  chính lượt đó. Thợ xây chọn văn phòng gần nhất bằng lượt duyệt có tie-break
  giữ nguyên thay vì dựng/sort danh sách văn phòng cho mỗi actor mới.

Không giữ navigation cache xuyên topology revision, không bỏ clone snapshot
của queue và không thay scheduler trong đợt này. Những thay đổi đó cần ma trận
invalidation và đánh giá tương thích riêng theo bản audit.

## Benchmark ghép cặp

Chạy Node v24.14.1; Bun chỉ bundle. Mỗi phía warm-up một lần, đo năm lượt,
đảo thứ tự trước/sau qua từng lượt. Bảng là median wall time; không phải CPU
Cloudflare, FPS browser hoặc tỷ lệ giảm tổng hóa đơn. Mỗi lượt đều đối chiếu
toàn bộ City hoặc vị trí/cargo/visibility của crowd với baseline.

| Workload tổng hợp | Trước | Sau | Giảm thời gian |
| --- | ---: | ---: | ---: |
| Thời đại 4, mô phỏng 1 giờ | 417,86 ms | 347,70 ms | 16,8% |
| Thời đại 5, mô phỏng 1 giờ | 703,56 ms | 531,45 ms | 24,5% |
| Thời đại 6, mô phỏng 1 giờ | 1.185,02 ms | 911,47 ms | 23,1% |
| Auto phân công 100 dân rảnh | 138,08 ms | 7,25 ms | 94,7% |
| Auto phân công 600 dân rảnh | 954,01 ms | 37,43 ms | 96,1% |
| Headcount thủ công 600 dân rảnh | 902,97 ms | 37,24 ms | 95,9% |
| Crowd 600 người hauling, 600 frame | 92,12 ms | 77,67 ms | 15,7% |

Fixture crowd đo `Crowd.update`, không đo `drawCity`, GPU hoặc tốc độ khung hình
thực. Lượt đo chung máy với công việc phát triển khác nên số ms có nhiễu;
không dùng chúng làm SLA. Chi phí dựng/sync crowd không nằm trong phép đo frame.

Tái lập:

```sh
node tests/logic-performance.mjs 7a63720a0899b7a77505836d545cfcd1d900cb21 5
bun tests/engine-equivalence.mjs 7a63720a0899b7a77505836d545cfcd1d900cb21
```

Script benchmark chỉ đọc source/Git, bundle vào thư mục tạm, không đọc DB hoặc
thông tin đăng nhập. Cả hai engine chạy bằng Node trong cùng process.

## Kiểm chứng

- Differential: **8.960 đường đi chính xác**, gồm góc/biên map, fog,
  chướng ngại và land/ford; **63 trạng thái City** khớp sâu với baseline.
  Bao gồm ba era cao, tự động/thủ công, service staff và settlement sau phân công.
- **432 unit test đạt** trên worktree chung, gồm economy, workforce, hauling,
  combat, checkpoint, queue và các test UI đang có ở thời điểm chạy.
- **12 API test đạt**: action boundary, city batch, recovery, Cloudflare city.
- Trước khi commit riêng từ baseline chưa có UI mới: **438 test đạt** trên
  80 file (unit và bốn bộ API trên); type-check và render regression cũng đạt.
- Render regression đạt, gồm snapshot clone giữ nguyên ID, cargo thay đổi,
  thay array, dân rời làng, đường đi, picking và bốn góc xoay.
- TypeScript đạt; production build với `SYNC_QA=1` vào `.next-sync-qa` đạt.
- Browser thật ở `/dev/eras`: chọn era 6, 300 dân; +1 giờ thành công lên 378 dân;
  Canvas/crowd tiếp tục cập nhật sau snapshot. Console không có error/warn được
  ghi nhận. Không đo FPS, heap plateau hoặc thiết bị mobile trong lượt này.

## Phối hợp và phạm vi bàn giao

Đã theo dõi và báo phạm vi với task **Implement envoy house visuals**. Task UI
xác nhận giữ `lib/engine.ts`, `components/villagers.ts` và tài liệu audit cho
task tối ưu. Không sửa `Game.tsx`, `draw.ts`, UI/CSS hay component mới của task đó.
Build/QA dùng thư mục riêng; server QA tạm đã dừng sau kiểm tra.

Phần tối ưu được bàn giao riêng khỏi các commit UI. Chưa deploy hoặc sửa dữ liệu production.
Scheduler theo sự kiện, tách subscriber React, cache nền Canvas và thay backend
vẫn là các hạng mục tiếp theo trong audit, chưa được tính là hoàn thành.
