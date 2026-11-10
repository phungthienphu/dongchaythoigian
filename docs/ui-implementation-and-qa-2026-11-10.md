# UI làng: triển khai và kiểm thử ngày 10/11/2026

Đã tích hợp UI mới vào `Game`, kiểm thử local và build thành công cho Cloudflare. Trạng thái bản phát hành đang chạy được xác định qua release ID tại `/api/health`. Không cần env, migration hay cấu hình dịch vụ mới cho phần UI.

## Người chơi thấy gì thay đổi?

| Khu vực | Kết quả |
| --- | --- |
| Điều hướng | Năm mục cố định: Xây dựng, Dân làng, Quân đội, Thế giới, Quản lý. Một bảng chính; bảng nhỏ có nút mở rộng trên mobile. |
| Tài nguyên | Thanh vàng dưới mỗi tài nguyên thể hiện tỷ lệ đầy kho; đầy thì kín thanh, cạn thì rỗng. HUD mobile giữ thực, gỗ, dân; Tất cả mở các tài nguyên còn lại. Chạm từng tài nguyên xem kho, số thực nhận/đã chi, người chờ nộp. Công suất dự kiến nằm trong chi tiết riêng. |
| Cần chú ý | Gộp đồng bộ lỗi, bị đánh, đói, thiên tai, kho chật, ruộng bạc màu, nhà hỏng, ô nhiễm và tin mới. Có đường tới đối tượng liên quan. Đọc tin không xóa cảnh báo nguy hiểm còn hiệu lực. |
| Công trình | Tìm tên/công dụng không dấu, lọc thời đại/công dụng, tối đa 12 thẻ/trang. Xem giá, vật liệu còn thiếu, giới hạn, vị trí và thời gian trước khi đặt. Tên khớp tìm kiếm được ưu tiên. |
| Dân | Phân công và Từng người tách tab; danh sách tìm/lọc và tối đa 30 hàng/trang. Giữ số phân công đang nhập khi đổi tab; chi tiết vận chuyển chỉ mở khi cần. |
| Quân | Ở nhà, Tuyển quân, Hành quân; ảnh tĩnh dùng lại art actor hiện có. Chọn loại mới mở form; hàng tuyển và progress đứng trước danh sách loại quân. |
| Combat | Chọn nhanh loại quân, chọn vùng và số nhóm/quân giữ ở mặt trước. Bộ chọn chi tiết và hướng dẫn dài thu gọn. Phím Tab đi qua cả select/summary và giữ focus trong trận. |
| Thế giới | Khám phá/bạn bè, chuyến sứ giả và đoàn xe thu gọn. Thông tin phản hồi lệnh vẫn hiện ngoài phần thu gọn. Quyền xem vị trí không thay đổi. |
| Chợ | Mua hàng, Hàng của tôi, Vận chuyển; lọc hàng và tài nguyên thanh toán tại client. Giá ghi rõ cả lô; xác nhận mua tự đưa vào vùng nhìn thấy và nhận focus. |
| Phát triển | Các điều kiện chưa đạt và lượng còn thiếu hiện trước; điều kiện đạt thu gọn. Mục tiêu vận hành/kỳ quan và lộ trình vẫn mở được. Vận hành chứa nước, điện, ô nhiễm. |
| Tin và trợ giúp | Thông báo thiên tai/kết quả trận gom vào inbox, giữ khóa đã đọc cũ. Tóm tắt vắng mặt thu gọn. Cẩm nang tìm không dấu và tự mở chủ đề phù hợp; hướng dẫn trỏ theo điều hướng mới. |
| Khả năng đọc | Nền xanh trầm/giấy ngà/vàng đồng, nút chính có vùng chạm lớn, tùy chọn chữ lớn, tôn trọng reduced motion. |

## Kiểm thử đã thực hiện

- `bun run type-check`: đạt.
- `bun run test`: **432 pass, 0 fail**, 77 file; gồm 6 ca của adapter chú ý. Kiểm tra thứ tự khẩn, không mutate city, không nhầm người đang mang hàng với người chờ kho, không báo trận đã hủy, cảnh báo đói vẫn còn khi đọc tin, ruộng đang chăm không bị báo bạc màu.
- `bun run build`: đạt.
- `bun run build:cloudflare https://dongchaythoigian.phungthienphu.workers.dev`: đạt, tạo bản static production origin. Đây là build, chưa phải deploy.
- `git diff --check`: đạt.

Browser QA dùng `/dev/ui` và `/dev/selection`, dữ liệu giả lập local. `/dev/ui` chặn mọi `/api/` không được mock; lệnh tuyển chạy engine trên fixture dùng một lần. Mua hàng trong fixture chủ động trả lỗi để kiểm tra UX; không mua/bán trên dữ liệu thật.

| Ca trình duyệt | Kết quả quan sát |
| --- | --- |
| 375×812 | HUD, cả 5 mục điều hướng, nút đóng/mở rộng bảng truy cập được. Danh mục và chi tiết giá/giới hạn đọc được; thế giới và menu khám phá dùng được. |
| Thanh mức đầy kho | Khôi phục thanh vàng thay cho chấm sau phản hồi người chơi. Đo DOM: kho đầy 86/86px, kho cạn 0px; kho còn một phần có độ dài tương ứng. Thanh tự co theo ô tài nguyên trên mobile, kiểm tra ở 320px và 375px. |
| 1280×600 | HUD đủ tài nguyên, bảng phải và điều hướng không đè nhau; tên làng đọc được. |
| 844×390 | Cả 5 nút chính và nút đóng bảng nằm trong viewport; trang không tràn ngang. |
| 768×1024 | Bảng phải không che thanh chú ý: cạnh phải thanh chú ý 304px, cạnh trái bảng 322px. Trang không tràn ngang. |
| Đồ đá đang đói | Cảnh báo đói lên trước gợi ý; hướng “Xây nguồn thực” mở trực tiếp chi tiết Trại hái lượm dù phiên trước đang lọc công trình khác. |
| Kho chật / nhà hỏng | Fixture báo đúng 8 người chờ nộp gỗ khi không đủ chỗ; fixture hỏng báo 3 công trình bị ảnh hưởng. |
| Hơn 500 dân | DOM danh sách chỉ có 30 hàng, 17 trang. Tìm `dan thu 49` trả 10 người; nhập phân công 41, đổi tab rồi quay lại vẫn 41. |
| Request | Chọn tab dân, gõ hai từ khóa và đổi bộ lọc: bộ đếm cả 7 endpoint trước/sau giữ nguyên, **0 request phát sinh** trong chuỗi này. |
| Tuyển quân | Chọn 5 pháo tạo đúng 5 quân chờ, chia 3 hàng tuyển; tiến độ từng cơ sở và thời gian quân đầu/cả lô xuất hiện. |
| Chợ | Lọc gỗ trả 5 lô; chọn lô cuối đưa xác nhận vào vùng nhìn thấy và focus tiêu đề. API từ chối thì lý do hiện trong bảng, giữ được xác nhận. |
| Cẩm nang | `o nhiem` trả một chủ đề đang mở; Escape đóng hướng dẫn. |
| Combat tấn công | Chọn Kiếm sĩ, lệnh trái đổi vị trí từ x=46,5 về 44,5; loại không chọn giữ nguyên. Tab từ nút cuối quay về Đóng. Kết thúc trận khóa điều khiển và hiện kết quả. |
| Combat phòng thủ | Chọn Cung thủ chọn 10 nhóm/30 quân; lệnh di chuyển được áp dụng và tọa độ thay đổi. |

## Ranh giới và việc cần nghiệm thu thêm

- Các kiểm thử trên chưa thay thế trận PvP với WebSocket thật, reconnect giữa hai tài khoản, giao thương thành công/cướp xe thực và kiểm thử trực tiếp trên điện thoại.
- Chưa đo đối chiếu FPS/p95 frame với baseline, chưa làm đủ 20 vòng kiểm tra DOM, chưa đo contrast toàn bộ trạng thái hoặc tổ chức bài dùng thử với 5 người chơi. Không tuyên bố hoàn tất toàn bộ UI-14 trong roadmap.
- Chưa thêm minimap, lớp lọc bản đồ hay onboarding tự xuất hiện theo lần đầu gặp cơ chế. Cẩm nang và gợi ý đầu game đã có, nhưng không tương đương đầy đủ các mục tiêu mở rộng này.
- Không thay cơ chế kinh tế, quân số, pathfinding, server authority, batch/flush hoặc thời gian offline. Tìm kiếm, lọc, mở chi tiết và ảnh quân mới không tạo polling/timer/animation loop.
- Worktree có thay đổi tối ưu engine/villagers từ task khác và tài liệu thời đại 7–9. Chúng không thuộc commit UI; các kiểm thử trên chạy ở trạng thái worktree chung.

## Phát hành và quay lui

UI không đổi schema hay lưu game. Khi phát hành, dùng quy trình Cloudflare hiện hành; không cần deploy battle/village worker chỉ vì thay UI. Có thể quay lui riêng các commit UI và build lại web. Trước khi phát hành rộng nên kiểm tra PvP/giao thương qua tài khoản QA và các mục nghiệm thu còn thiếu ở trên.
