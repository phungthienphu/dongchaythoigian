# Giảm áp lực zombie và bảo vệ tường — 13/11/2026

Release dự kiến `zombie-fortifications-20261113`, theo yêu cầu triển khai và phát hành ngay.

- Tổng số zombie đợt mới = round(tổng số theo công thức trước × 0,7), tối thiểu một con. Vì số lượng nguyên, mức giảm từng đợt nhỏ có thể lệch nhẹ 30%.
- Zombie phá hoại = floor(số phá hoại theo công thức trước / 2), làm tròn xuống. Phần còn lại chia thường/Super theo quy tắc hiện tại, tổng đúng bằng kích thước đợt mới. Ví dụ đợt cũ 84 con có 16 phá hoại → 59 con có 8 phá hoại.
- Mỗi đòn zombie lên `wall`/`gate` chỉ gây 50% sát thương công trình trước đây. Áp dụng cả nhánh đánh trực tiếp lẫn nhánh tới mục tiêu sau di chuyển, cho mọi loại zombie/mọi thời đại, kể cả actor trong save cũ.
- Không đổi HP/tốc độ/sát thương vào dân hoặc lính, sát thương lên loại công trình khác, nhịp đánh, lịch nghỉ giữa đợt, cảnh báo hay thời gian trồi.
- Không xóa bớt zombie đã tồn tại. Đợt mới dùng số lượng mới; tường/cổng hưởng giảm sát thương ở những đòn tiếp theo. Không hồi HP tường tự động, không dựng lại tường hoặc ghi bù dữ liệu production.
- Giữ các bản bệnh viện, bảo trì và city-loading đã phát hành.

Kiểm tra mới: toàn bộ thời đại/dải dân số, tổng và số loại nguyên không âm, hệ số giảm đúng trên wall/gate và giữ nguyên trên house/hospital/watchtower; combat thật ở cả hai khoảng tiếp cận và save/reload cho thường/phá hoại.

Checkout phát hành riêng từ `eb696ce`: 611/611 test logic, 9/9 API, 18/18 Combat Worker; TypeScript, renderer, diff-check và Cloudflare production build đều qua. Phiên bản production được bổ sung sau khi deploy và public smoke hoàn tất. Logs local `/tmp/zombie-fortifications-{tests,types,api,render,worker,build,web-deploy,battle-deploy,smoke}.log`.
