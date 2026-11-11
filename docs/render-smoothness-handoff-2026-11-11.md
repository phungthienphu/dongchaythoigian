# Làm mượt làng lớn — bàn giao 11/11/2026

## Vấn đề

Người chơi có làng lớn (nhiều dân, công trình, tài nguyên) bị giật khi kéo map,
zoom xa/gần, chọn công trình và tương tác nói chung. Mục tiêu: chơi mượt mà
**không đổi luật game, schema, server hay dữ liệu người chơi**.

## Nguyên nhân đã xác định

Mọi việc chạy trên main thread của trình duyệt; thao tác người chơi phải chờ
frame vẽ và tick xong mới được xử lý.

1. **Vẽ lại toàn bộ bản đồ mỗi frame** (`drawCity`, `components/draw.ts`).
   Zoom xa: 280–410 nghìn lệnh canvas/frame, ~55% là nền đất/nước tĩnh.
   Đây là nguyên nhân lớn nhất — **đã xử lý** (xem dưới).
2. **Tick mỗi giây** (`components/Game.tsx`, interval 1 s → `BatchedCityQueue.advance`
   trong `lib/batched-city.ts`): `settle` 1 s mô phỏng + `cloneCity` toàn bộ làng
   + `derive` + `crowd.sync` + `bump()` render lại cả `Game`. Chưa xử lý.
3. **React**: `Game.tsx` (~1600 dòng) không dùng `memo`/`useMemo`; mỗi `bump()`
   tính lại `stats`, thông báo, `villageAttention`, panel đang mở. Chưa đo trên browser.
4. Rê chuột từng gây render lại cả `Game` mỗi khi qua ô mới — **đã xử lý**.

## Đã làm và đã lên production

Commit trên `main`: `884c224`, `be7b306`. Production hiện là Cloudflare version
`c4f0bbc9` (một deploy sau đó, build từ `main` có chứa hai commit này; đã xác
nhận code mới có trong bundle production).

`components/draw.ts`
- `LayerCache` + `paintLayer`: canvas phụ cỡ viewport + lề 25% cạnh lớn, vẽ lại
  khi signature nội dung / mùa / góc xoay / kích thước / DPR đổi, camera ra khỏi
  lề, hoặc zoom đã dừng 150 ms (trong lúc zoom thì scale bitmap cũ, tỉ lệ 0.5–2).
  `maxAge` cho làm mới định kỳ.
- **Lớp nền** (`paintGround`): đất, sông, bờ, sương mù. Signature = hash
  `t`/`seen`/`D.fert`/`oldbed`. Zoom gần: gợn nước của ô đã khám phá vẽ live
  (`drawLiveRipples`) có clip `evenodd` bỏ phần ô phía trước che (nước thấp hơn 4 đơn vị).
  Zoom xa (`lod`, `TW < 26`): gợn nước đứng yên trong cache.
- **Lớp vật thể khi zoom xa** (`items`, chỉ khi `lod`, lúc đó không vẽ dân):
  công trình, cây, đá, cầu, trại vẽ bằng gọi đệ quy `drawCity(..., layer: "static", anim: 0)`.
  Zombie và bóng công trình đang đặt vẽ đè lên trên (không bị công trình phía trước che —
  chấp nhận ở zoom xa). Signature = JSON `b, camps, era, t, seen` bỏ `fertility`
  (đổi mỗi tick, không vẽ); `maxAge` 5 s. Khói/cờ/lửa đứng yên ở zoom xa.
- `tileOrder`/`visibleTiles`: thứ tự vẽ ô tính sẵn theo góc xoay, thay sort mỗi frame.
- Đá khi `lod`: một khối + chóp + một chấm quặng.
- `pickVillageTarget` nhận kết quả `pickBuilding` có sẵn (tham số cuối, tùy chọn).
- Khi **không** truyền cache (test, trang dev), output canvas giống hệt bản gốc
  ở mọi zoom không-lod và 4 góc xoay (đã so sánh từng lệnh canvas).

`components/Game.tsx`
- Truyền `ground`, `items`, `dpr` vào `drawCity`.
- ~30 FPS khi camera/chuột/khung chọn đứng yên > 1 s; 60 FPS khi thao tác.
- DPR tự hạ 0.5/bước (không dưới 1) khi 90 frame liên tiếp lúc thao tác trung bình > 28 ms.
- Hover: `hoverRef` cập nhật canvas ngay; state React `hover` (dòng trạng thái)
  chỉ commit khi chuột dừng 80 ms (`setHover(cell, true)`).
- Click dò công trình một lần.

## Số đo hiện tại

`bun tests/render-frame-benchmark.mjs` (Node, canvas giả không raster — chỉ là
chi phí JS; trên trình duyệt còn thêm tô màu, nhất là điện thoại DPR cao):

| Fixture | Zoom | Trực tiếp | Có cache |
|---|---|---|---|
| era 6, 300 dân | 1 (xa) | ~14–22 ms · 246k lệnh | ~0.4 ms · 19 lệnh |
| era 6, 300 dân | 3 (vừa) | ~10 ms · 142k | ~5–8 ms · 87k |
| 1500 dân, 776 công trình | 1 | ~22–25 ms · 414k | ~0.5 ms |
| 1500 dân, 776 công trình | 3 | ~10 ms · 184k | ~6 ms · 125k |
| cả hai | 8 (gần) | ~1.3 ms | ~0.5 ms |

Tick: 100 dân ~4.4 ms; 600 dân ~7 ms; 1500 dân ~14 ms (settle chiếm 2/3, cloneCity ~3 ms).
Số ms nhiễu theo tải máy; so sánh tương đối.

## Việc tiếp theo (ưu tiên)

1. **Đo trên trình duyệt thật trước khi sửa tiếp.** `/dev/eras` (`app/dev/eras/era-harness.tsx`)
   chạy `Game` thật với làng giả lập, fetch bị mock, không cần database. Chạy `next dev`,
   profile Performance panel lúc kéo/zoom ở zoom vừa và lúc đứng yên: tách thời gian
   raster canvas, React commit, tick (`settle`/`cloneCity`), GC. **Hỏi chủ dự án trước
   khi tự chạy dev server/browser.**
2. **Zoom vừa** (TW 26–60, có dân): chi phí rải đều — công trình, cây (~10–15% ở làng
   nhiều rừng), dân. Ý tưởng: sprite cây theo (pine, mùa, size lượng tử 0.05, TW, DPR) —
   chú ý offset bóng cây không scale theo size, cây đang bị chặt (`o.chopping`) phải
   vẽ live. Sprite công trình khó vì nhiều phụ thuộc (tường nối, kênh, mana, cháy, giàn giáo, anim).
3. **Tick mỗi giây**: chuyển `settle` + replay của queue sang Web Worker (đề xuất từ
   `docs/action-smoothness-audit-2026-11-10.md`). Phải giữ một chủ thể lệnh có thứ tự,
   timestamp gốc, lưu IndexedDB trước khi gửi, ACK fence, rollback, lease/session.
4. **React**: tách HUD/panel khỏi `bump()` mỗi giây; `memo` các panel nặng; chỉ cập nhật
   số liệu đang hiển thị. Cần profile React trước (bước 1).

## Bẫy đã biết

- **Đừng bỏ `cloneCity` trong `BatchedCityQueue.publish()`**: nhiều cache dùng
  `WeakMap<City,…>` theo identity (placement, staging, `itemSigs`); sửa tại chỗ
  sẽ trả dữ liệu cũ. Làng đang xem (`visitRef`) bị `settle` tại chỗ — vì vậy
  `itemsSignature` memo theo cả `city.last`.
- Đổi gì trong `drawGroundTile`/`grassColor`/`drawBankEdges` thì cập nhật
  `groundSignature` nếu phụ thuộc dữ liệu mới. Tương tự `itemsSignature` cho vật thể
  vẽ ở zoom xa; dữ liệu đổi theo thời gian mà không nằm trong signature chỉ cập nhật sau ≤ 5 s.
- `drawCity` vẫn phải chạy được không có `document` (test Node): cache tự tắt.
- Thứ tự `visible` ảnh hưởng thứ tự vật thể bằng depth (sort ổn định) — giữ
  `tileOrder` (depth rồi index).

## Kiểm tra và phát hành

```sh
bun run type-check
bun test lib/*.test.ts
node tests/render-performance.mjs
bun tests/render-frame-benchmark.mjs
```

Thư mục chính thường có thay đổi chưa commit của phiên khác (vd. `lib/engine.ts`).
Chỉ commit file của mình, và **deploy từ worktree sạch** để không đưa code dở lên production:

```sh
git worktree add ../dong-deploy <commit>
cd ../dong-deploy
ln -s ../dong-song-thoi-dai/node_modules node_modules
ln -s ../../dong-song-thoi-dai/worker/node_modules worker/node_modules
cp ../dong-song-thoi-dai/.env.local .env.local
bun run build:cloudflare https://dongchaythoigian.phungthienphu.workers.dev
worker/node_modules/.bin/wrangler deploy --config cloudflare/wrangler.production.jsonc
node scripts/check-cloudflare-production.mjs
cd ../dong-song-thoi-dai && git worktree remove --force ../dong-deploy
```

Chỉ đổi web thì không cần deploy Battle Worker. Rollback: `wrangler rollback <version>
--config cloudflare/wrangler.production.jsonc` về version đã xác nhận chạy tốt
(`wrangler deployments list` để xem).
