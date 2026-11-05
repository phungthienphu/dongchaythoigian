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
- Người chơi nhận diện bằng cookie `pid` (chưa có đăng nhập).

## Nhịp game

- 1 mùa = 6 giờ thật, 1 năm = 1 ngày. Lũ có thể đến đầu mỗi mùa thu.
- Offline vẫn sản xuất, tối đa 14 ngày, giới hạn bởi sức chứa kho.
- Lên Thời đồ đồng thì khoảng 1–2 ngày sau sông đổi dòng, có báo trước một ngày.
