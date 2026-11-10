# Rà soát ba thời tiếp theo — công nghệ kế thừa, phép thuật tăng dần

Ngày: 10/11/2026. Bản này thay đánh giá v1 Kết nối/Cộng hưởng/Tinh tú sau khi người dùng yêu cầu ma pháp rõ hơn, giữ base và tăng dần mức ảnh hưởng. Đọc `eras-7-9-spec.md` và `zombie-spec.md`. Đây là phân tích thiết kế, chưa có kết quả chơi thử.

## 1. Độ hấp dẫn và nhịp phát triển

| Thời | Điều hấp dẫn | Nền cũ tiếp tục hữu ích | Rủi ro cần kiểm chứng |
|---|---|---|---|
| 7 — Thức tỉnh | Khám phá mana, pháp sư đầu tiên, Hỏa cầu và Thanh tẩy tác động rõ | Đại học nghiên cứu, forge/xưởng chế vật dẫn; lính súng/thiết giáp che pháp sư; bệnh viện chữa số đông | Mở quá nhiều hệ cùng lúc; phải giới thiệu nguồn → vật liệu → một phép → quân hỗ trợ theo thứ tự |
| 8 — Nguyên tố | Bốn trường phái khác cách phối hợp, golem/linh thú, lựa chọn chuyên tu | Cơ khí/than nuôi tinh chất, dân và quân cũ giữ hậu cần, bốn cụm cần mạng đường và vị trí | Nếu ấn chỉ là bốn icon mở khóa thì không đủ thú vị; phải thực sự hỗ trợ công trình trong vùng và tạo đánh đổi công suất |
| 9 — Thần thoại | Khế ước Long/Quy/Phượng, đại phép báo trước, cổng vận tải và lãnh địa | Tổ hợp nuôi thiên luyện; điện, kho và đường vẫn là đầu chuỗi; quân đất giữ mục tiêu | Thần thú/đại phép có thể lấn át quân cũ; phải cân bằng theo ngân sách/chỗ và chống bay, không chỉ thêm HP |

Giữ hướng **làng hiện đại khám phá ma pháp**, không chuyển tức thì thành toàn bộ fantasy. Art cũ, nhà dân, ruộng, trâu/voi, phố hiện đại vẫn tồn tại bên cụm phép. Dầu/chip/xe tăng/tiêm kích/quỹ đạo vẫn là nhánh công nghệ đã dự kiến, chưa xóa hoặc coi đã triển khai; khi làm nhánh đó phải hòa vào cùng kinh tế, không thay lại toàn bộ tiến trình.

## 2. Liên kết và lựa chọn có ý nghĩa

- Cụm phép cần công trình thường hoạt động thật, không chỉ yêu cầu từng xây một lần. Mất forge/xưởng/đại học đúng trường hợp thì có hậu quả rõ, nhưng có đường xây lại từ tài nguyên cũ.
- Tập trung giảm đường giao hàng, phân tán giúp sống sót khi zombie trồi nội thành. Relay không tạo mana; dự phòng phải có đầu tư nguồn và tuyến hợp lệ.
- Mana phải chia cho sản xuất, cứu dân và đánh zombie. Một giếng + một tháp C1 tạo 180/h; sau viện 20/h còn 160, trong khi Thanh tẩy mỗi 20 phút dùng 180/h. Đây là thiếu hụt thật cần mở rộng hoặc giảm tần suất, không ghi “tự chữa vô hạn”.
- Phép thời 7 tác động cục bộ, thời 8 có lựa chọn đội hình/cụm công trình, thời 9 tác động chiến trường/lãnh địa. Không dùng tỉ lệ phần trăm trang trí để gọi là tăng ảnh hưởng.

## 3. Zombie và áp lực vĩnh viễn

Luật chi tiết chuyển sang `zombie-spec.md` để tránh hai bảng chỉ số lệch nhau. Có thêm Super Zombie từ Trung đại: nhanh và nhiều HP, dùng cùng tổng N với thường/phá hoại. Từ Công nghiệp, cả ba loại còn biết né vùng hỏa lực đã phát hiện; cần thử vùng bắn chồng nhau và lính cơ động để việc né không vô hiệu hóa tháp. Cần thử riêng lính/tường đời 4 chống Super khi chưa có phép; không thiết kế đối trọng chỉ mở từ đời 7. Từ P=450 đến 850, dân tăng 1,89 lần nhưng lượng zombie/giờ tăng 18→66, khoảng 3,67 lần. Phải đo phí phòng thủ và xây lại, không chỉ số trận thắng. Thiệt hại HP không sửa được nên một lỗ hổng nhỏ lặp lại sẽ phá nhà sau nhiều đợt.

Mục tiêu trải nghiệm: người bố trí đúng không cần có mặt mỗi 15 phút; người bỏ phòng thủ có thiệt hại rõ; zombie không thành nguồn farm tiền. Phép thêm lựa chọn, không hồi nhà để lách yêu cầu phá vĩnh viễn.

## 4. Cần chứng minh trước phát hành

1. Từ save cuối đời 6 của cả hai nhánh kỳ quan có thể khởi động chuỗi phép không vòng khóa; hết mana/hàng vẫn phục hồi từ chuỗi cũ được.
2. Năm phút đầu Đồ đá đủ dựng phòng thủ tối thiểu bằng giá/thời gian runtime; không đòi hoàn thành y tế và tường toàn thành trong năm phút.
3. HP dân/nhà được lưu bền vững; PvP không cấp lại đầy HP nhà từng bị zombie đánh; sửa cháy/ngập không hồi phần zombie gây mất.
4. Tối đa 1.344 đợt zombie/14 ngày ở P=1.100, cộng caster/đường/relay, không vượt CPU runtime. Cần checkpoint chính xác, không bỏ đợt để qua benchmark.
5. Cấu hình sát thương mới phải nói rõ DPS hay sát thương/đòn. `lib/battle.ts` hiện nhân `atk` với thời gian nhịp ở nhiều quân; không đưa số mỗi đòn của spec vào rồi nhân lần nữa.
6. Đội hình hỗn hợp thường–phép có đối trọng; thần thú không thắng mọi mục tiêu. Kiểm tra dân bị bệnh, công nghiệp bị phá, nguồn mana mất và caster chết cùng tick.
7. Một phiên chơi có quyết định xây/mở rộng thú vị, không chủ yếu xếp hàng xây lại các nhà vừa mất. Nếu phần lớn thời gian là dọn hậu quả, cân bằng số zombie/khả năng phòng vệ, giữ nguyên luật mất nhà.

Ba thời ma pháp hiện vẫn là đặc tả; các chỉ số là baseline, chưa triển khai hay phát hành. Zombie được triển khai và phát hành thành đợt riêng trước.
