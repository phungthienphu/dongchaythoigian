# Phase 2: bản chơi thử local

Ba thời đại mới được triển khai trên nhánh `codex/eras-phase2`, từ bản ổn định `f5c4dc6`. Production tiếp tục dùng `RELEASED_ERA = 3`; không đổi cấu hình triển khai và không dùng MongoDB production để thử.

## Chạy thử

Worktree: `/tmp/dong-song-phase2`. Chạy `bun run dev -- --port 3103`, mở `http://localhost:3103/dev/eras`. Route trả 404 khi build production. Không sao chép dotenv production vào worktree.

Trang này dùng Game thật với luật local tối đa đời 6. API game được thay bằng dữ liệu trong trình duyệt; API không được giả lập trả 403. Có mẫu đời 3–6, mẫu đủ điều kiện kỳ quan, bước nhảy 10 phút/1 giờ/12 giờ và lưu localStorage. Đổi mẫu thay bản thử, không đụng tài khoản thật. Bước nhảy dài chạy trong Web Worker, khóa thao tác sửa thành phố cho đến khi có kết quả để tránh ghi đè thay đổi đồng thời.

Mẫu cho nhiều tài nguyên/kho và dựng sẵn công trình để kiểm tra hành vi. Đây không phải bằng chứng người chơi mới tự đi được hết chuỗi kinh tế. Ruộng có thể bạc màu, thiên tai phá nhà, hết thực và dân rời đi khi bỏ mặc mẫu nhiều giờ.

## Phạm vi đã có

- Trung đại: Đình 4, Đại kho với từng ngăn riêng, nhà ngói, giếng, hồ chứa, nông trang, trường, thủ công, Văn Miếu; dự báo hạn và tích nước.
- Công nghiệp: Đình 5, than, lò than củi dự phòng khi hết mỏ, cơ khí, nhà máy, vận tải, nhà ở, xử lý nước, vườn ươm và Cầu Sắt. Đầu vào trừ lúc đóng kiện, đầu ra chỉ vào kho khi giao hàng.
- Hiện đại: Đình 6, điện có ưu tiên và chia tỷ lệ, nhiệt/thủy/mặt trời, chung cư, tổ hợp, bệnh viện, đại học, công viên, hồ điều hòa; hai kỳ quan có điều kiện và đánh đổi riêng.
- Công trình và quân mới có hình isometric, dụng cụ/xe/vũ khí, tầm bắn và đạn. Cùng cấu hình quân được dùng trong engine và Worker trận đánh.
- Migration bổ sung trạng thái tùy chọn, không reset save, không tính ngược nhiên liệu/ô nhiễm trước khi tính năng được kích hoạt. Công trình đã trả tiền tiếp tục xây dù dân hoặc thực giảm.
- Checklist, tình trạng nguồn điện, bật/tắt nhà, ưu tiên điện, thông báo hạn/lũ, recap sau khi vắng mặt và hướng dẫn mới chỉ xuất hiện trong luật tương ứng.

## Bằng chứng kiểm tra

- TypeScript và production build chạy qua; chạy `next start` ở cổng 3104 và gọi HTTP `/dev/eras` xác nhận 404.
- 245 test lõi, gồm tiến trình 3→4→5→6, an toàn migration, chi phí từng kiện, điện thiếu nhiên liệu, số thợ nâng cấp, hai kỳ quan, lũ và tính tương đương giữa settle một lần/đọc chia nhỏ.
- Render/path/hit testing, 12 kiểm tra Worker, 12 kiểm tra market API chạy qua. Market test giả lập hai tài khoản và giao than một lần; chưa phải QA hai trình duyệt có đăng nhập.
- So sánh engine với `f5c4dc6`: 6.400 tuyến và 24 thành phố đời 1 giống hoàn toàn trong bộ fixture kiểm tra.
- Browser thật: chọn/bật nhiệt điện, bảng nguồn/thiếu điện; desktop và mobile 390×844; modal kỳ quan có focus, hủy bằng Esc, xác nhận rồi đặt lên ô gợi ý; trừ đúng chi phí, mô phỏng 24 giờ khánh thành Thành Phố Sông Xanh dù lương thực/dân đã giảm; reload giữ bản thử. Không tràn ngang ở viewport mobile đã đo.

## Quân mới: baseline để chơi thử

`atk` là sát thương danh nghĩa/giây; mỗi phát lấy sát thương theo nhịp, không cộng thêm DPS do tốc độ tick.

| Quân | Đời | HP | DPS | Tầm ô | Nhịp giây | Tốc độ ô/giây | Chỗ | Tuyển giây | Chi phí |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Nỏ | 4 | 90 | 24 | 7 | 1,3 | 0,9 | 1 | 240 | 250 thực, 100 gỗ, 80 đồng, 10 vàng |
| Kỵ binh | 4 | 180 | 46 | 1,5 | 1 | 1,6 | 2 | 420 | 500 thực, 140 gỗ, 180 đồng, 30 vàng |
| Lính súng | 5 | 120 | 32 | 8 | 1,8 | 0,9 | 1 | 360 | 380 thực, 130 đồng, 35 vàng |
| Pháo | 5 | 260 | 62 | 10 | 2,8 | 0,5 | 4 | 900 | 900 thực, 300 gỗ, 700 đồng, 180 vàng, 100 than |
| Bộ binh | 6 | 165 | 43 | 8 | 0,8 | 1,1 | 1 | 480 | 600 thực, 220 đồng, 70 vàng |
| Thiết giáp | 6 | 850 | 100 | 7 | 2 | 0,65 | 5 | 1500 | 1600 thực, 1800 đồng, 500 vàng, 300 than |

Nỏ áp sát còn 60%, pháo còn 45%. Pháo đánh nhà ×3, thiết giáp ×1,5. Giáo đánh kỵ ×1,8; súng ×1,2; bộ binh ×1,4. Đánh thiết giáp: pháo ×1,4, bộ binh ×0,6, súng ×0,45, quân cũ ×0,3. Số chỗ vận tải/hậu cần lấy theo cấu hình quân. Tuyển quân mở theo đời; đây là giá cơ sở trước luật chi phí đang áp dụng.

## Hiệu năng và giới hạn phát hành

Snapshot công trình và mạng vận tải chỉ tồn tại trong một lần settle, không thêm cache toàn cục tăng vô hạn. Tick vận chuyển một giây vẫn được giữ để không đổi kết quả theo tần suất gọi API.

Đo Node trên máy local bằng `tests/era-benchmark.ts`: mẫu Hiện đại 300 dân, settle 24 giờ mất 8.728 ms wall / 10.439 ms CPU, save 69.186 byte. Settle 14 ngày mất 32.562 ms wall / 34.459 ms CPU, save 56.580 byte; sau đó còn 3 dân do bỏ mặc hết thực. Cả hai giữ tài nguyên hữu hạn và không âm. Đây là mẫu tổng hợp, không phải đo Vercel production và không chứng minh cân bằng kinh tế. Nhiều giờ offline vẫn là tác vụ nặng; cần giải quyết ngân sách CPU này trước khi mở đời 4–6 trên production.

Chưa xác nhận PvP đời 4–6 bằng hai tài khoản thật, mạng reconnect, thị trường live, cân bằng từ save nghèo đến đời 6, hoặc tải đồng thời nhiều làng. Không coi pass build/unit test là đạt các điều kiện đó. Bản này là mốc local để chơi thử và hiệu chỉnh; không đẩy lên main hoặc triển khai Worker production.
