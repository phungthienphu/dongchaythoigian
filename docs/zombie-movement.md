# Zombie tản quanh ổ nứt và đi lệch nhịp

Release ID: `zombie-spread-20261111`.

Nguyên nhân bầy cũ co cụm: cả đợt xuất hiện tại một ô, cùng loại có cùng tốc độ, cùng thứ tự chọn đường ngắn nhất và cập nhật đường mỗi hai giây. Hoạt ảnh cũng dùng chung pha và luôn quay một hướng.

Điều chỉnh:

- Trồi ở các ô đất trống nối được quanh điểm cảnh báo, tối đa hai bước theo cạnh. Con đầu vẫn ở điểm báo; lần lượt dùng các ô còn lại trước khi dùng lại. Không sinh xuyên tường, sông, sương, công trình hoặc dân/quân đang đứng. Ổ bị bao kín vẫn phải phá vây, không tự xuất hiện ngoài vòng tường.
- Giữa các con lệch 1,4–2,6 giây; mỗi con có hệ số tốc độ cố định 0,92–1,08 theo seed và ID.
- A* thêm ưu tiên đường ít đông và sở thích đường riêng từng con. Tất cả vẫn đi trên địa hình hợp lệ, qua cầu nếu cần. Giữ giới hạn bốn con cùng cận chiến một mục tiêu và giới hạn mật độ ô hiện có; phân tán bớt mục tiêu nhà/lính khi có lựa chọn gần nhau.
- Lệch thời gian tính lại đường, tránh kéo ngược về tâm ô đang đứng mỗi lần đổi đường. Hoạt ảnh lệch pha và quay theo hướng tiến/đánh.
- Không đổi tổng số lượng đợt, thành phần, máu hoặc sát thương. Đây là thay đổi hành vi nên áp lực thực tế có thể khác do tiếp cận từ nhiều hướng hơn. Cửa hẹp vẫn khiến bầy tụ lại theo địa hình.
- Không dùng random theo frame/wall clock. Các trường hướng là tùy chọn nên save cũ đọc được; không reset lịch zombie, quân hay làng.

Kiểm tra: 562 test game, 9 test API, 18 test Worker, TypeScript, render regression và build Cloudflare đạt. Test mới gồm sinh rải có vật cản/người/sương, ổ bao kín, đa dạng đường/né đông/qua cầu, lưu-tải lại và online/offline khớp. Browser local `/dev/zombies` có tùy chọn xem bầy 17 zombie không phòng thủ, nút tiến từng giây và chế độ phòng thủ 9 zombie cũ.
