# Cải thiện trải nghiệm sau bàn giao render — 11/11/2026

## Phạm vi đã làm

- Cache tán cây ở zoom vừa, lượng tử kích thước theo bước 0,05; tối đa 256 bitmap và 12 MiB dữ liệu pixel. Bóng cây giữ kích thước/vị trí gốc; cây đang rung khi chặt vẽ trực tiếp. Thứ tự depth và hit testing giữ nguyên. Không có cache/document thì vẽ trực tiếp.
- Ghi nhớ chữ ký nền theo snapshot, Derived và đồng hồ làng; làng đang thăm được settle tại chỗ vẫn làm mới khi dữ liệu đổi.
- DPR giảm khi tương tác chậm kéo dài, phục hồi từng bước sau ít nhất 15 giây tương tác có dư thời gian và 20 giây kể từ lần đổi trước. Không lấy nhịp 30 FPS lúc nghỉ làm bằng chứng máy chậm.
- Ngưỡng chi tiết có vùng đệm: xuống chi tiết thấp dưới TW 24, trở lại chi tiết đầy đủ tại TW 28. Renderer độc lập không truyền tùy chọn vẫn giữ ngưỡng TW 26.
- Bỏ tick trình bày ở tab ẩn; giữ queue, lưu lệnh, foreground refresh và mô phỏng theo timestamp. Không bỏ cloneCity, không thay luật mô phỏng.
- Bổ sung mô tả công dụng cho đủ 52 công trình thời 7–9; bảng công trình giải thích cách dùng/phòng thủ; bảng Ma pháp và Cách chơi có hướng dẫn ba thời và thuật ngữ.

## Đo lại được

Mở game với `?perf=1` để xem bảng số đo cục bộ; nút **Đo lại** xóa mẫu. Không gửi telemetry hoặc dữ liệu làng ra ngoài. Mỗi loại giữ tối đa 600 mẫu:

- `frame`: khoảng cách giữa các frame đã vẽ, gồm nhịp nghỉ có chủ đích.
- `activeFrame`: khoảng cách khi đang thao tác; chuyển từ nghỉ sang thao tác và giới hạn lịch chạy của browser có thể ảnh hưởng số đo.
- `crowd`: thời gian JS cập nhật chuyển động.
- `draw`: thời gian gọi renderer/submit lệnh canvas, không tách được GPU raster/compositor.
- `tick`: cập nhật queue, derive, Crowd sync và yêu cầu cập nhật React; không bao gồm React commit bất đồng bộ.
- `cache`: thời gian dựng lại một lớp nền/vật thể.
- `input`: từ timestamp sự kiện canvas đến khi submit xong frame kế tiếp; không phải thời điểm pixel thực sự xuất hiện trên màn hình, không phải ACK máy chủ.
- `longTask`: task trên main thread, nếu trình duyệt hỗ trợ PerformanceObserver longtask.

`/dev/eras?perf=1` có nút mẫu 1.500 dân, 776 công trình. `/dev/magic-ui?perf=1` chạy Game thật với API giả lập cho thời 7–9. Hai route chỉ phục vụ phát triển.

Trong development, thêm `&trees=0` để tắt riêng sprite cây khi so sánh. Production bỏ qua công tắc này. Nên dùng cùng fixture, viewport, DPR, góc xoay, TW và cảnh nhìn; không so số đo khi tab nền, HMR, build hoặc test đang chạy.

## Bằng chứng và giới hạn

Benchmark canvas giả, fixture thời 6 / 300 dân / zoom 3:

| Cấu hình | Lệnh canvas/frame | JS trung vị trong một lượt chạy |
|---|---:|---:|
| Chỉ cache lớp | 87.105 | 7,80 ms |
| Cache lớp + tán cây | 62.472 | 5,36 ms |

Giảm khoảng 28% số lệnh so với cache lớp trước đó. Thời gian JS có nhiễu; đây không phải số FPS hay phần trăm cải thiện trên production. Benchmark bổ sung cold frame, p95, max và thời gian dựng cache để tránh chỉ nhìn cache đã nóng.

Browser local đã chạy mẫu 1.500 dân, kéo bản đồ, mở camera, zoom và xoay, cùng mẫu thời 9 mở bảng Ma pháp và hướng dẫn. Trong lần đo mẫu 1.500 dân, `crowd` trung vị khoảng 1 ms, `draw` có lúc hàng chục ms; renderer vẫn cần được ưu tiên trước khi chuyển toàn bộ queue sang Worker. Browser tự động có các khoảng lịch chạy gần 1 giây; không suy ra FPS production từ các khoảng frame đó.

Đã quan sát đúng tài khoản được người dùng cho phép trên production. Màn hình báo chưa lấy được quyền điều khiển/cần kiểm tra đồng bộ; chưa xác định nguyên nhân, không gán cảnh báo này cho renderer. Không gửi lệnh xây dựng, điều quân, sửa nhà hoặc thay tài nguyên trên tài khoản thật. Chưa có số đo trước/sau của tài khoản này với bundle mới vì chưa triển khai production.

## Kết luận về tài nguyên và thiên tai

`renewWilderness` không phụ thuộc việc người chơi đã khám phá hết bản đồ để quyết định có tạo địa hình hay không. Mỗi 30 phút, vùng không được bảo vệ vẫn che sương và tái tạo. Công trình + vùng đệm 2 ô, trại ban đầu và các tuyến/nguồn đang dùng được giữ lại. Làng phủ nhiều công trình có thể còn ít ô đủ điều kiện; điều đó chưa được định lượng trên tài khoản thật.

Test đối chiếu hai bản đồ cùng seed và timestamp, chỉ khác toàn bộ `seen`, xác nhận khám phá sáng toàn bản đồ không chặn tái tạo. Theo yêu cầu mở rộng sau đó, cùng chu kỳ 30 phút còn gieo 1–4 nguồn ngẫu nhiên trong khoảng trống nối liền từ 4 ô; lớp này chỉ giữ ô công trình và các tuyến/người cần bảo vệ, nên vẫn sinh được trong vùng đệm 2 ô của lớp tái tạo cũ. Không chặn cổ chai hoặc thay dòng sông.

Động đất: 20% mỗi nhà thực sự trúng bị mất vĩnh viễn và chuyển thành tài nguyên. Lũ: 10% mỗi nhà thực sự bị ảnh hưởng. Nhà còn lại giữ vị trí và cấp để sửa. Vật liệu sửa nhà hư cấp 1/2/3: 50/70/90%; nhà ngập: 25/40/60%. Nhà mất không hoàn vốn; hủy hàng tuyển ở nhà đó, giữ hàng dân đang mang. Công trình trên sông giữ dòng nước và sinh gỗ trên bờ gần đó nếu có chỗ.

Mỏ tự nhiên mới: tinh thạch/phù văn từ thời 7, tinh chất thời 8, thiên thạch thời 9. Mỗi chu kỳ có 2% cơ hội thêm tối đa một mỏ; toàn bản đồ tối đa 4. Trữ lượng lần lượt 80/40/30/20, khai thác 12 đơn vị/người/giờ trước thưởng và vận chuyển. Thiên tai có xác suất 0,2% chọn mỏ ma pháp thay nguồn thường. Xưởng/lò vẫn là nguồn ổn định chính.

Có mốc kích hoạt trên save cũ, không áp dụng mất công trình hoặc cơ chế gieo mới ngược vào thời gian offline trước khi tải bản cập nhật. Thiết kế 28 công trình mới và bảng giá ở [building-expansion-2026-11-11.md](building-expansion-2026-11-11.md).

## Kiểm tra

HUD tài nguyên: bỏ ép các ô về flex-basis 0; dùng container query theo chiều rộng header để giữ lương thực, gỗ, dân số và nút Tất cả khi thiếu chỗ. Đã kiểm tra trình duyệt ở 375, 749, 1280 và 1600 px; nút Tất cả vẫn mở đủ 11 tài nguyên. Màn rộng hiển thị đầy đủ, màn hẹp không chồng nhãn/số.

- `bun run type-check`
- `bun test lib/*.test.ts`: xem kết quả chạy cuối trong bàn giao; các kiểm tra bao gồm công trình mới, tài nguyên tự nhiên và tăng tốc.
- `node tests/render-performance.mjs`: thêm kiểm tra giới hạn sprite, xoay, chặt cây trực tiếp, không đổi state, invalidation terrain/fog.
- `bun tests/render-frame-benchmark.mjs`
- `bun run build`
- `git diff --check`

Chưa deploy bản đang kiểm tra. Thay đổi `.gitignore` đã tồn tại trước phiên này, không thuộc bản sửa.

## Phần còn lại

Cache lớp vẫn dựng đồng bộ và lớp vật thể zoom xa vẫn làm mới tối đa mỗi 5 giây. Chưa chuyển sang cache theo vùng, chưa tách React HUD và chưa chuyển queue sang Worker. Các thay đổi lớn này cần profile có kiểm soát và test riêng cho invalidation, thứ tự lệnh, ACK/replay và rollback.
