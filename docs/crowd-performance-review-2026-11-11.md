# Nghiên cứu dân tụ cùng chỗ

Trạng thái: đã triển khai ba mục đầu; xem kết quả bên dưới. Baseline trước thay đổi: `e396249`.

## Bằng chứng trong code

- `Crowd.sync` trong `components/villagers.ts`: dân rảnh không có mục tiêu dùng `city.camp`; cache `homeByTarget` và `nearestHome` chọn cùng nhà gần nhất, không phân bố theo số người. Wander quanh nhà trong bán kính nhỏ nên chỉ nới cụm, không phân tán khắp làng. Không phải mọi cụm đông đều là lỗi: người giao hàng hoặc cùng nhận lệnh có thể thật sự cùng tới một điểm.
- `Crowd.update` duyệt mọi actor mỗi frame. `haulVisual` của mỗi nông dân đang làm việc lại filter toàn bộ `city.people`, sort nhóm theo ID rồi tìm slot. Với N dân và F nông dân, phần lọc tốn O(F×N) mỗi frame, chưa kể sort lặp.
- `drawCity` trong `components/draw.ts`: mọi dân visible trên tile trong viewport đều thêm một item có closure, rồi được sort theo chiều sâu và vẽ riêng. Người che kín nhau vẫn chịu đầy đủ chi phí vẽ; chọn nhiều người còn vẽ tên/nền chữ riêng cho từng người.
- Hit testing (`pickVillager`/`pickVillageTarget`) dùng danh sách actor. Gom hiển thị phải cập nhật tương tác tương ứng; không được để người dùng click nhầm người bị ẩn.

## Thứ tự đề xuất

1. **Index vị trí làm ruộng một lần mỗi frame.** Tạo slot theo nhóm công trình và ID ổn định, dùng lookup O(1) khi cập nhật từng người. Phải hỗ trợ snapshot clone, đổi task tại chỗ, thêm/xóa dân và giữ nguyên bốn vị trí hiện tại. Không cache theo identity City vì state mutate tại chỗ. Mục tiêu là bỏ N lần quét lặp, không thay đổi hành vi.
2. **Hiển thị theo mật độ trên màn hình.** Với cụm chồng lấp, vẽ một số ít đại diện và badge tổng người; tăng chi tiết khi zoom vào. Chỉ gom những người có trạng thái tương thích. Người đang được định vị hoặc gặp nguy hiểm cần hiện rõ; badge mang thông tin số người chọn, mang hàng, bị bệnh/ngã và cảnh báo liên quan. Click badge mở danh sách chọn từng người. Chọn vùng và lệnh nhóm vẫn dùng đủ ID thật. Giới hạn nhãn tên khi chọn hàng trăm người. Dùng ngưỡng vào/ra khác nhau và đại diện ổn định để tránh nhấp nháy khi camera dịch chuyển.
3. **Phân bố dân rảnh về nhiều nhà hợp lệ.** Chỉ áp dụng hoạt ảnh trang trí cho idle không có lệnh đứng; phân bố ổn định theo ID, khả năng tiếp cận và sức chứa. Không dịch người mang hàng, đang giao chiến, trú ẩn hoặc có lệnh. Vị trí hiển thị phải khớp picking và không tạo sai lệch vị trí mục tiêu chiến đấu; cần kiểm tra ranh giới vị trí authoritative trước khi triển khai. Phân tán đẹp hơn nhưng tự nó không giảm số sprite phải vẽ.
4. **Cache sprite có giới hạn bộ nhớ nếu vẽ vẫn nặng.** Key gồm era/job/pose/hướng/màu/cargo và scale/DPR; chia pha hoạt ảnh có kiểm soát, cache hữu hạn với eviction. Giữ logic đi lại/giao hàng riêng khỏi sprite. Đo CPU và bộ nhớ để quyết định ngân sách thay vì cache mọi ID và mọi timestamp.

Ưu tiên bước 1 và 2: giải quyết công việc lặp và số hình chồng nhau. Chưa cần thay đổi gameplay hay thêm cron cho vấn đề vẽ cụm đông.

## Kiểm chứng cần có trước release tiếp

- So sánh cùng seed/state/camera, bản production build, 300/1.200/3.000 dân; cùng số dân nhưng phân tán so với tụ một chỗ.
- Đo riêng update, draw, frame p95, độ trễ click/scroll, long tasks và bộ nhớ; không suy ra cải thiện FPS chỉ từ ít draw calls.
- Kiểm tra mọi hướng camera, zoom qua ngưỡng gom, desktop/mobile; chọn một/chọn vùng/tất cả, định vị người, badge tổng khớp số người thật, bệnh/đói/chiến đấu/cargo không mất dấu.
- Simulation và số tài nguyên phải khớp trước/sau; client animation không được tự cộng tài nguyên hay đổi lệnh.

## Kết quả triển khai

- Index slot nông dân một lượt mỗi frame; lookup O(1) thay filter/sort toàn bộ dân cho từng actor. Đổi task tại chỗ và snapshot đảo thứ tự vẫn đúng.
- Cụm từ 9 người tương thích dùng 3 ID đại diện ổn định, ngưỡng rời cụm là 5. Giữ đủ ID thật, chọn vùng dùng toàn bộ người; badge và nút điều khiển mở danh sách phân trang. Người được định vị, bị thương/nhiễm bệnh/ngã/trú ẩn và thợ xây không bị gom. Tối đa 12 tên được chọn, ngoại lệ người đang định vị.
- Nhãn không có nền đen. Neo vào một đại diện đang vẽ, bỏ nhãn chồng/clipped thay vì đẩy ra đất trống. Hit test dùng đúng chữ nhật đã vẽ và từ chối camera/source cũ. Không vẽ badge khi zoom xa đã bỏ sprite.
- Dân rảnh không có lệnh phân bố theo ID và sức chứa nhà trong vùng đất đã khám phá nối được. Đường đi không bơi/xuyên tường; đổi fog/topology làm mới cache. Không sửa save/economy. Khi có raid/battle/zombie hoặc bị thương, hiển thị dùng vị trí authoritative.
- Sửa nút chọn cụm bị thừa hưởng chiều rộng icon 44px; các nút trong scope tự xuống dòng. Menu hướng dẫn giữ icon ? 28px, không giãn ép chữ.

CPU Node v24.14.1, cùng fixture nông dân, warm 5 frame, median 9 nhóm x 10 frame. Không phải FPS browser hoặc CPU Cloudflare:

| Dân | Update trước ms | Update sau ms | Giảm thời gian |
| --- | ---: | ---: | ---: |
| 300 | 1.246 | 0.161 | 87.1% |
| 1.200 | 8.349 | 0.356 | 95.7% |
| 3.000 | 53.007 | 0.794 | 98.5% |

Fixture mọi người cùng tọa độ/cùng trạng thái: 300/1.200/3.000 sprite còn 3, giảm 99.0%/99.75%/99.9% số sprite dân. Người phân tán hoặc khác trạng thái vẫn cần vẽ; không suy ra giảm tổng frame cùng tỷ lệ.

Kiểm chứng: TypeScript, renderer regression và 7 crowd tests đạt; lượt full trước test neo nhãn bổ sung: 581 tests / 95 files đạt. Browser local fixture 1.200 dân desktop và 390x844: nhãn không nền, click mở directory, chọn cụm 88 người giữ đủ 88 ID; đường đi/nhà cách nước/threat/manual order có regression. Mức FPS và độ trễ production chưa có A/B. Cache sprite còn là đề xuất.

## Production release

Đã phát hành Web/API Cloudflare từ commit `48f4be0`, release `crowd-zombie-48f4be0`, version `c60e9738-0730-4302-9c90-a0df94311707`. Build production đạt; TypeScript, 581 full game tests (trước test neo nhãn cuối), 7 crowd tests, 6 API tests và 18 Worker tests đạt. Combat Worker không deploy lại; không migration/reset/chỉnh dữ liệu làng.

Public smoke: health 200 / ready đúng release ID; 8 asset JS/CSS trang chủ khớp SHA256 bản build; `/dev/magic-ui` và `/dev/zombies` trả 404. Không dùng private-account smoke; chưa đo độ trễ/FPS trên làng production.
