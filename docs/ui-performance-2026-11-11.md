# Tối ưu thao tác bảng và quản lý công trình

Trạng thái: thay đổi local, chưa deploy. Production hiện là `c9ec755`, release `catchup-zombie-c9ec755`, Cloudflare version `30417b97-a65d-4059-a553-87c0a0e450c4`. Public health ready, tám asset trang chủ khớp SHA256 bản build; các route dev trả 404.

## Nguyên nhân và thay đổi

- Canvas vẫn vẽ liên tục dưới bảng. Giới hạn nền xuống tối đa 15 fps khi mở bảng/inspector/modal; nhường vẽ 150 ms sau thao tác trên UI, kể cả cuộn quán tính. Tương tác trực tiếp với canvas phục hồi nhịp vẽ bình thường. Không dừng tick mô phỏng hoặc lưu tiến trình. Nhịp nền chủ động không làm giảm độ phân giải thích nghi.
- Game tính lại stats, dân rảnh, sức chứa quân và bonus sinh dân khi đổi hover/lựa chọn. Cache theo revision của tick/action/snapshot, có tính đến việc City mutate tại chỗ. Chỉ cache các giá trị trình bày; bộ đếm thời gian vẫn hiển thị theo thời gian hiện tại.
- Danh mục công trình lọc/sắp xếp lại mỗi tick. Cache thứ tự theo tìm kiếm, nhóm và thời đại; giá/giới hạn/kho vẫn đọc state hiện tại.
- Danh sách dân không tính nhãn công việc của toàn bộ dân khi tìm kiếm trống. Phân trang hiện có vẫn giữ 30 người/trang.
- Danh sách người tại mục tiêu và bảng phá dỡ trước đây vẫn dựng khi disclosure đóng. Nay chỉ mount khi mở; danh sách mục tiêu chia 30 người/trang. Preview hoàn vật liệu chỉ tính sau khi bấm xem lại phá dỡ. Đóng disclosure hủy phần xem lại; không thực hiện phá dỡ tự động.

## Kiểm tra

- TypeScript, render regression và 33 test liên quan availability/quality/demolition/attention/batched queue đạt.
- Build Cloudflare production đạt.
- Browser local `/dev/magic-ui?perf=1&stress=1`: fixture giả lập 1.200 dân, không dùng tài khoản hoặc dữ liệu production. Đã mở/tìm/đọc chi tiết công trình, chọn công trình trên bản đồ, xác nhận nút phá dỡ chưa mount khi đóng và có khi mở.
- Mobile 390×844: bảng dân, tab từng người, cuộn drawer; DOM có 30 dòng cho tổng 1.200 người, không tràn ngang.
- Thêm metric HUD trong chế độ `?perf=1`. Dev StrictMode có thể tính memo hai lần; không suy ra số lần production từ số mẫu dev.

## Giới hạn

Số đo local ban đầu ở 300 dân: draw p50 khoảng 8,6 ms, p95 14,1 ms, có mẫu hơn 50 ms. Fixture 1.200 dân vẫn có draw p50 khoảng 26 ms. Đây là số đo dev trên máy kiểm tra, không phải benchmark production hoặc bằng chứng đạt 60 fps. Không có phép đo A/B ổn định để kết luận phần trăm cải thiện độ trễ thao tác. Tối ưu này giảm công việc lặp và nhường main thread; chưa xử lý hết chi phí vẽ từng actor. Đợt tiếp theo nên đo và tối ưu sprite batching/cache, rồi cân nhắc tách simulation khỏi main thread nếu tick vẫn tạo long task.
