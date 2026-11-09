# Điều chỉnh tháp canh ngày 09/11/2026

Người chơi phản ánh voi bị hạ quá nhanh và trụ có tầm bắn quá xa. Bản này giảm khả năng phủ bản đồ và sát thương duy trì của trụ trong trận xâm lược, đồng thời tạo vai trò chịu tên cho voi trước thời Công nghiệp.

| Chỉ số | Trước | Sau |
| --- | --- | --- |
| Tầm bắn từ tâm trụ, mọi cấp | 6 ô | 4 ô |
| Khoảng cách giữa hai phát | 1 giây | 1,5 giây |
| Sát thương/phát cấp 1/2/3 | 6/9/12 | 6/9/12 |
| Sát thương/giây duy trì cấp 1/2/3 | 6/9/12 | 4/6/8 |
| Sát thương tên trụ lên voi (đời phòng thủ 1–4) | 100% | 50% |
| Sát thương đạn trụ lên voi (đời phòng thủ 5–6) | 100% | 100% |

Giới hạn trụ theo đời giữ ở 2/3/4/5/6/8. Trụ dư của làng cũ không tham chiến vượt hạn mức. Quân phòng thủ vẫn gây sát thương bình thường. Một voi đủ 300 máu nhận ba phát từ một trụ cấp 3 còn 282 máu với tên hoặc 264 với đạn, nếu không chịu sát thương khác. Ba loạt của tám trụ súng cấp 3 là 288 sát thương: không nên nhầm một loạt bắn chụm với một phát từ một trụ.

Luật nằm trong `lib/tower-balance.ts`, dùng chung cho mô phỏng trận của frontend, API và battle Worker. Giao diện chi tiết trụ và hướng dẫn được cập nhật. Không thêm request, timer, tài nguyên hoặc thay đổi dữ liệu làng. Snapshot đang có giữ thời điểm bắn tiếp theo đã lưu; các phát sau dùng nhịp mới.

## Kiểm chứng

- Kiểm thử tầm tròn 4 ô, điểm biên và ngoài biên ở mọi cấp; nhịp bắn, hiệu ứng phát bắn, giới hạn trụ dư và lưu/tải giữa trận.
- Kiểm thử voi chịu ba phát ở cả sáu đời, cụm trụ gây sát thương từ từng nguồn, voi có thể áp sát phá trụ, cụm trụ vẫn có thể hạ voi đứng yên.
- Chạy lại `scripts/combat-balance-audit.ts`: 72 tình huống tổng hợp cho sáu đời, ba bố cục và hai chế độ online/offline. Kết quả bên tấn công thắng 70/72 trước và 72/72 sau. Tổng tổn thất quân tấn công giảm 662 xuống 414 trong cùng tập dữ liệu.

Tập mô phỏng này dùng ngân sách quy đổi các loại tài nguyên thành trọng số bằng nhau, đội hình đơn loại và chiến thuật cố định; không đại diện tỷ lệ thắng của người chơi. Kết quả cho thấy giảm áp lực phòng thủ trong tập thử, chưa chứng minh cân bằng toàn bộ game. Cần theo dõi trận thật có chênh lệch thời đại, quân phối hợp và bố trí trụ/tường. Không mở cuộc tấn công vào làng thật để thử bản này.

Phát hành cần cập nhật battle Worker trước, sau đó frontend/API Cloudflare để luật và thông tin hiển thị đồng nhất. Không cần thêm biến môi trường hoặc di chuyển dữ liệu.
