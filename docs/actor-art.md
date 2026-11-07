# Bộ hình actor và công nghệ tương lai

Ngày 07/11/2026. Preview: `/dev/art`, độc lập tài khoản và database.

## Phong cách và cách dùng

Canvas Isometric 2.5D, bóng tiếp đất, bỏ viền bao đen mặc định, mặt sáng phía trên và mặt tối bên hông. Vải đỏ đất, đồng vàng, thép xanh xám; công nghệ tương lai dùng xanh ngọc. Hình dạng và trang bị phải phân biệt được ngay cả khi không có tên.

Nguồn hình dùng chung nằm trong `components/actor-art.ts`, không có phụ thuộc React, engine, mạng hoặc ảnh bên ngoài:

- `drawSoldierArt(ctx, kind, x, y, scale, pose)` cho toàn bộ 14 loại quân hiện tại.
- `drawAnimalArt(...)` cho trâu, voi, hươu và lợn rừng.
- `drawFutureArt(...)` cho xe tăng, mỏ than và 9 mẫu công nghệ chuẩn bị.

Tọa độ `(x,y)` là điểm chạm đất. `scale=1` tương ứng hệ tọa độ gốc của ô rộng 64px. Tất cả entry point bọc save/restore Canvas để không rò màu, nét hoặc phép biến đổi sang actor tiếp theo. Hướng trái/phải dùng `face`. `time` là thời gian animation do renderer truyền vào; không đọc đồng hồ hoặc sinh số ngẫu nhiên trong module hình.

`walking`, `fighting`, `active`, `graze` và `antlers` chọn trạng thái hình. Hiệu ứng nổ đầu nòng chỉ là đồ họa khi có cờ tấn công; không quyết định sát thương hoặc thời điểm bắn trong engine/Worker.

## Hình đã gắn vào renderer game

- Binh lính: chiến binh gậy, lính ném đá, giáo binh, cung thủ, kiếm sĩ, lính nỏ, kỵ binh, lính súng, pháo, bộ binh hiện đại, xe thiết giáp, đoàn vận tải, quân y, voi chiến.
- Động vật: trâu trang trí tại ruộng, hươu sao có/không sừng, lợn rừng và voi có bành, quản tượng, ngà, tai và vòi.
- Mỏ than: hầm chống gỗ, vỉa đá, đường ray và xe goòng. Xe chỉ chuyển động khi công trình hoạt động.

`components/draw.ts` chuyển tọa độ làng sang tọa độ màn hình rồi gọi module hình. `components/battle-actors.ts` tiếp tục dùng cùng hàm `drawSoldier`, nên quân trong làng và trận đánh cùng nhận diện. Không sửa stat, collider, quyền tấn công hoặc mở khóa đơn vị.

## Mẫu chuẩn bị, chưa có gameplay

| Nhóm dự kiến | Mẫu | Chi tiết chuyển động |
|---|---|---|
| Hiện đại / mở rộng | Tiêm kích | Thân bay nhấp nhô, luồng phản lực |
| Hiện đại / mở rộng | Trực thăng | Cánh chính, cánh đuôi, càng đáp |
| Hiện đại / mở rộng | Radar | Chảo lưới xoay và đèn tín hiệu |
| Công nghiệp / hiện đại mở rộng | Mỏ dầu | Tháp giếng, bơm gật gù, đường ống, bồn chứa |
| Hậu hiện đại | Drone | Bốn cánh vòng, camera, thân nổi |
| Hậu hiện đại | Giáp cơ giới | Chân khớp trợ lực, buồng lái và cảm biến |
| Hậu hiện đại | Lò nhiệt hạch | Vòng từ trường, lõi và hạt sáng |
| Không gian | Vệ tinh | Hai cánh pin, thân phủ cách nhiệt và chảo thu |
| Không gian | Cảng không gian | Tháp dịch vụ, bệ phóng, tàu tái sử dụng |

Tên nhóm hậu hiện đại/không gian chỉ là hướng mỹ thuật, chưa chốt thời đại 7–8. Mỏ dầu chưa thêm tài nguyên dầu. Radar chưa mở quyền khám phá. Tiêm kích/trực thăng/drone chưa mở không chiến. Để kích hoạt các nội dung này cần spec kinh tế, di chuyển, chiến đấu và điều kiện mở khóa riêng; không tự thay phạm vi thời đại 4–6.

## Preview và kiểm tra

`/dev/art` có 27 thẻ hình: 12 mẫu quân, 4 động vật và 11 khí tài/công trình. Voi được xem trong nhóm động vật, xe thiết giáp được xem qua xe tăng để không lặp thẻ.

Có lọc nhóm, đứng yên/di chuyển/chiến đấu, tạm dừng, đổi hướng và thu phóng. Trạng thái chiến đấu chỉ có hiệu ứng tương ứng ở mẫu được hỗ trợ; công trình thể hiện trạng thái vận hành. Animation giới hạn 30 fps, ngừng khi thẻ ngoài màn hình hoặc trang bị ẩn; tôn trọng lựa chọn giảm chuyển động của hệ điều hành.

Chạy `bun run type-check` và `bun run test:render`. Render harness kiểm tra mọi loại quân, động vật và mẫu tương lai ở cả hai hướng, ba trạng thái, ba mốc thời gian; xác nhận tọa độ hữu hạn và Canvas state không rò. Cần xem trực tiếp trên trình duyệt để đánh giá hình ảnh; kiểm tra tự động không thay thế QA thẩm mỹ hoặc đo FPS trong làng đông quân.
