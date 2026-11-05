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
bun run test:render
bun run test:worker
bun run build
```

Các bài kiểm tra mô phỏng không thay thế QA hai tài khoản trên Worker/Vercel đã deploy.
