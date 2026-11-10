# Khả năng giảm ô nhiễm — 10/11/2026

## Vấn đề

Trước bản này, 3 trạm xử lý (4 điểm/giờ mỗi trạm), 4 công viên (1 điểm/giờ mỗi công viên) và tự nhiên chỉ đạt tối đa 17 điểm/giờ. Trong khi đó số xưởng không bị giới hạn và công suất/phát thải tăng theo cấp. Đây là giới hạn cứng khiến làng công nghiệp lớn phải tắt nhiều xưởng để làm sạch, kể cả đã xây hết công trình xử lý.

Snapshot chỉ đọc của Bến Vân Đồng trong lần điều tra:

- Ô nhiễm 67,78/100; 3 trạm đủ thợ, 1 công viên hoạt động, 3 công viên ngập.
- Xử lý thực tế 14 điểm/giờ; phát thải tại thời điểm lưu 6,4 điểm/giờ.
- Nếu giữ nhịp tức thời: khoảng 1 giờ 2 phút xuống dưới 60; 6 giờ 17 phút về 20.
- Tuy nhiên các nguồn đang bật có trần phát thải cơ sở 30,2 điểm/giờ khi đủ thợ, nguyên liệu và điện; nhiều xưởng đang giao hàng/chờ nên snapshot thấp hơn trần.
- Vì vậy không thể hứa thời điểm hồi phục từ một ảnh chụp trạng thái. Hoạt động sản xuất, ngập và cấp điện thay đổi thì thời gian cũng đổi.

Không ghi/chỉnh trạng thái làng thật để tạo kết quả thử nghiệm.

## Thay đổi

| Công trình | Cấp 1 | Cấp 2 | Cấp 3 | Điều kiện |
|---|---:|---:|---:|---|
| Trạm xử lý nước | 4 | 8 | 12 | Điểm/giờ, 3 thợ đã tới, tối đa 3 trạm; thiếu thợ giảm theo tỷ lệ |
| Công viên cây xanh | 2 | 4 | 6 | Điểm/giờ, không thợ/điện, không giới hạn số công viên |

Công viên mở từ Công nghiệp, xây trên đất trống đã khám phá, bỏ điều kiện sát sông để có thể chọn khu đất an toàn hơn. Khóa `park` giữ nguyên nên công viên cũ và điều kiện kỳ quan được giữ. Cấp 1 được tăng từ 1 lên 2 điểm/giờ; không tự nâng cấp công trình cũ. Nâng cấp tuân theo phí, thời gian, thợ xây và giới hạn cấp thông thường. Công trình ngập/cháy/tắt/đang xây mới không xử lý.

3 trạm cấp 3 + 4 công viên cấp 3 + tự nhiên đạt 61 điểm/giờ. Với nguồn phát thải liên tục 30,2 điểm/giờ, mức giảm là 30,8 điểm/giờ: từ 67,78 về 20 khoảng 1 giờ 33 phút sau khi công trình xử lý đã sẵn sàng. Đây là ví dụ công suất, không bao gồm thời gian thi công và không bảo đảm nhịp tương lai.

Nếu mở rộng thêm công nghiệp, người chơi tiếp tục dành đất và tài nguyên cho công viên. Rừng khai thác/Vườn ươm vẫn là nguồn gỗ; hiệu ứng xử lý mới thuộc cây xanh trong công viên, không áp dụng cho toàn bộ địa hình rừng. Không quét địa hình hay thêm request để tính hiệu ứng.

UI hiển thị mục tiêu <60 và ≤20, cảnh báo trần phát thải của nguồn đang bật và các công trình xử lý đang ngập/cháy. Điều kiện kỳ quan Sông Xanh giữ ≤20 trong 12 giờ vẫn giữ nguyên.

## Kiểm chứng

- Xây công viên thứ 5 trên đất nội địa ở đời 5; đời 4 chưa được xây; xây mới chưa cho hiệu ứng.
- Nâng trạm/công viên trừ đúng chi phí; cấp mới chỉ có hiệu lực sau hoàn tất.
- Cấp, số thợ, ngập/cháy và không có điện cho đúng khả năng xử lý.
- Nguồn phát thải liên tục 30,2 điểm/giờ vẫn hạ được về ≤20 với hạ tầng mẫu; chia nhỏ thời gian tính cho cùng kết quả.
- Báo cáo và hướng dẫn dùng chung hàm với mô phỏng.
