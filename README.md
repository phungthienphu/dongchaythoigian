# Dòng Sông Thời Đại

Game xây thành phố ven sông, cày lâu dài theo giờ thật. Next.js (App Router) + MongoDB.

## Chạy

```bash
cp .env.example .env.local   # điền MONGODB_URI
bun install
bun run dev
```

## Cấu trúc

- `lib/engine.ts`: luật chơi, dùng chung server và client. Server là nguồn sự thật; client chạy cùng engine để số nhảy theo giây.
- `lib/city-store.ts`: tải thành phố, tính tiếp tới hiện tại (`settle`), lưu lại với khóa lạc quan (`ver`).
- `app/api/city`: GET tải / POST tạo thành phố. `app/api/city/action`: xây, nâng cấp, sửa, phá, lên thời đại. `app/api/leaderboard`: top 20.
- Đăng nhập Google, kết bạn bằng mã mời; tài khoản sở hữu làng. PvP yêu cầu cả hai nước có tài khoản Google.
- `lib/war.ts`, `app/api/battles`: đặt chỗ quân, hành quân và ghi kết quả bằng transaction MongoDB (cần Atlas/replica set).
- `lib/battle.ts`, `worker/`: phòng chiến đấu Cloudflare Durable Objects, WebSocket 10 Hz. Cấu hình/deploy: [docs/battle-worker.md](docs/battle-worker.md).

## Nhịp game

- 1 mùa = 6 giờ thật, 1 năm = 1 ngày. Lũ có thể đến đầu mỗi mùa thu.
- Dân thu thập tại nguồn, mang tối đa 10 tài nguyên về nơi nhận phù hợp rồi mới cộng kho. Kho đầy thì giữ hàng; online/offline cùng một engine, tối đa 14 ngày.
- Tường, cổng, tháp canh đổi hình theo thời đại; đặt điểm gác trong bảng Quân đội. Nhà bị đốt ngừng hoạt động tới khi sửa.
- Mỗi nước tham gia một cuộc xuất chinh/phòng thủ tại một thời điểm. Sứ giả phải thăm trong 3 ngày gần nhất; không đánh nước thấp hơn quá một thời đại. Khiên sau trận: 6 giờ, tự bỏ khi xuất quân.
- Thao tác xây/giao việc hiển thị ngay, lưu tuần tự và đối chiếu server; lỗi mạng tải lại trạng thái, không tự gửi lại mutation.
- Lên Thời đồ đồng thì khoảng 1–2 ngày sau sông đổi dòng, có báo trước một ngày.
# dongchaythoigian

## Kiểm tra

```bash
bun run type-check
bun run test
bun run test:world # API khám phá/bạn bè với database giả lập, chạy riêng
bun run test:render
bun run test:worker
bun run build
```

Các bài kiểm tra mô phỏng không thay thế QA hai tài khoản trên Worker/Vercel đã deploy.

### Khám phá thế giới và bạn bè

- Bạn bè xem làng qua danh sách mà không cần sứ giả. API xem làng không gửi thông tin khám phá, chuyến đi hoặc nhật ký của chủ làng.
- Bản đồ/API thế giới chỉ trả nước mình và các nước đã khám phá. Những chuyến sứ giả cũ được giữ lại như kiến thức đã có, kể cả báo cáo hết hạn.
- “Dò tìm nước mới” có kết quả sau 2 phút và trở về sau 4 phút. Server chọn một nước chưa biết khi đến hạn; trước đó không trả ID, tên hay tọa độ mục tiêu. Nếu không còn nước mới, sứ giả trở về bình thường.
- Vị trí đã khám phá được giữ lâu dài. Báo cáo cho phép xem làng người lạ và xuất quân có hiệu lực 3 ngày; cần thăm lại khi hết hạn. Kết bạn không tự cấp quyền tấn công.
- Cảnh báo quân địch không làm lộ gốc hành quân của một nước chưa khám phá.
- `/dev/world` là bản thử giao diện bằng dữ liệu cố định, không gọi API hay thay đổi tài khoản thật.

Kho chật: dân giữ hàng chờ nộp thay vì làm mất tài nguyên. “Cho nghỉ” ngừng công việc ngay và vẫn cho di chuyển; hàng đang giữ chỉ được nộp lại khi kho có đủ chỗ. Bảng dân và thanh tài nguyên giải thích trạng thái này. Trại gỗ tự tìm nguồn còn khai thác được trong 6 ô khi cây gần nhất hết; bãi đá cho nộp từ ô đứng cạnh mỏ.
