# Mở rộng tuyển quân

Trước bản này, làng chỉ có tối đa 90 chỗ quân dù lên đời cao. Voi, pháo, hậu cần cùng chiếm chỗ, mọi cơ sở dùng chung một hàng tuyển nối đuôi nhau. Giao diện chỉ có nút +1/+5.

## Sức chứa

Vẫn tối đa 3 trại; nâng cấp trại theo Đình làng, tối đa cấp 3.

| Thời đại | Trại cấp 1 | Cấp 2 | Cấp 3 | Ba trại cấp 3 |
| --- | ---: | ---: | ---: | ---: |
| Đá | 10 | 20 | 30 | 90 lý thuyết; thực tế tối đa 30 khi chưa có Đình |
| Đồng | 10 | 20 | 30 | 90 |
| Sắt | 20 | 40 | 60 | 180 |
| Trung đại | 30 | 55 | 80 | 240 |
| Công nghiệp | 40 | 70 | 100 | 300 |
| Hiện đại | 50 | 85 | 120 | 360 |

Quân ở nhà, đi xa, đang tuyển và quân hỗ trợ đều tính chỗ. Trại cháy/ngập không đóng góp sức chứa; nếu đang vượt trần thì giữ quân đã có, chỉ chặn tuyển thêm. Mỗi đoàn xâm lược vẫn tối đa 300 người, không phải 300 chỗ; có thể để phần còn lại giữ nhà.

## Hàng tuyển độc lập

Mỗi lệnh tự chia tối đa 50 quân vào các cơ sở có thời điểm hoàn thành sớm nhất, hòa thì chọn ô nhỏ hơn. Mỗi cơ sở tuyển tuần tự; các cơ sở tuyển song song. Hậu cần dùng Trạm hậu cần, quân y dùng Quân y viện, không chặn lính chiến. Tốc độ mỗi cơ sở theo cấp 1/2/3: ×1/×1,5/×2. Thời gian được chốt khi nhận lệnh, không thay ngược đơn đã trả.

Đây là tốc độ từng trại, thay cho hệ số cộng cấp của cả làng trước đây. Một đơn vị đầu tiên có thể ra chậm hơn khi làng có nhiều trại; bù lại nhiều trại ra quân cùng lúc. Ví dụ 3 trại cấp 3 tuyển 6 kiếm sĩ: 3 người xong ở giây 90, cả 6 xong ở giây 180; hệ cũ lần lượt 36/72/108/144/180/216 giây. Tổng công suất của ba trại cấp 3 tăng từ hệ số ×5 lên ×6. Không cộng hệ số toàn làng vào từng hàng, tránh nhân tốc độ ba lần ngoài dự kiến.

`City.queue` vẫn là mảng có thứ tự theo ngày hoàn thành; đơn mới có thêm `source` là ô cơ sở đào tạo. Các đơn cũ không có `source` giữ nguyên thời gian và cách hoàn tất, không thu lại phí. Đơn mới của cùng loại cơ sở đợi hết hàng cũ trước khi bắt đầu.

Trại cháy/ngập chỉ tạm dừng hàng mới tại trại đó; thời gian được dời theo các tick mô phỏng đã lưu, tiếp tục khi sửa/hết ngập. Không dời ngày trong khoảng hàng đó còn đang đợi hàng cũ. Quân hoàn thành chờ mở lối nếu cửa cơ sở bị bịt, không xuất hiện ở trại khác. Cơ sở có đơn mới đang tuyển chưa được phá dỡ để tránh mất quân đã trả tiền. Quân hoàn thành ra từ đúng cơ sở rồi đi đến điểm gác như trước.

## Giao diện và chi phí

- Nhập số lượng hoặc chọn 1/5/10/Tối đa; Tối đa xét chỗ, tài nguyên và hạn mức 50 quân/lệnh.
- Xem tổng vật liệu, số chỗ cần, thời điểm quân đầu và cả lô hoàn tất. Thiếu tài nguyên ghi rõ số còn thiếu, khóa nút xác nhận.
- Mỗi hàng có tên cơ sở, tọa độ, số đang tuyển, thanh tiến độ và thông báo tạm dừng/chờ lối.
- Giá từng quân, khẩu phần và chi phí hành quân giữ nguyên. Phí tuyển trừ đúng một lần khi nhận lệnh; quân chờ tuyển vẫn dùng khẩu phần như trước.
- Hướng dẫn trong game cập nhật toàn bộ quy tắc.

## Kiểm chứng và giới hạn

Kiểm thử sức chứa sáu đời, quân đi xa/đang chờ, phân hàng không chồng thời gian, cơ sở hỗ trợ độc lập, phí/giới hạn nguyên tử, ra đúng cửa, trại cháy/ngập/bịt cửa, bảo toàn đơn cũ, chặn phá cơ sở đang tuyển, JSON reload, đồng bộ 30 giây và online/offline cho cùng kết quả. QA trình duyệt dùng `/dev/recruitment` với dữ liệu giả; đường dẫn này bị chặn trên production.

Kết quả trước phát hành: 379 kiểm thử engine và 16 kiểm thử Worker đạt; kiểm tra render, TypeScript và build Cloudflare đạt. Trình duyệt đã xác nhận chia 6 kiếm sĩ vào ba trại, tiến độ riêng, tạm dừng/tiếp tục sau cháy và báo thiếu tài nguyên; toàn bộ dùng dữ liệu giả.

Đo local cùng engine với làng giả không có dân, 3 trại cấp 3 và lần lượt 90/360 đơn đang chờ: tính bù 30 giây mất trung vị khoảng 14,8/17,8 ms (5 mẫu sau warm-up). Đây chỉ là phép đo hàng tuyển, không phải CPU production hay toàn bộ làng. Không tạo timer, request hay Worker riêng cho mỗi trại; vẫn dùng vòng mô phỏng và batch 30 giây hiện tại. Khi không có hàng tuyển, bỏ qua xử lý hàng ngay.

Quân số cao làm tăng nhu cầu lương thực và số actor trên bản đồ; chưa điều chỉnh kinh tế hoặc chỉ số pháo/trụ thêm trong bản này. Không tuyển hay giải ngũ bằng tài khoản thật để kiểm thử.

Phát hành cập nhật game/API và battle Worker cùng engine. Không cần ENV, collection hoặc migration DB mới.
