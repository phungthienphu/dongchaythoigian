# Đời 4–6 và cân bằng phòng thủ — 2026-11-07

Người dùng yêu cầu phát hành phase 2 và giảm lợi thế quá lớn của trụ. `RELEASED_ERA` mở tới 6, không thay ENGINE_VER hoặc reset dữ liệu. Điều kiện lên đời vẫn yêu cầu dân, tài nguyên, Đình và kỳ quan tương ứng. `/dev/eras` tiếp tục 404 ở production; không đưa làng mẫu lên tài khoản thật.

## Tháp canh

| Cấp trụ | DPS cũ | DPS mới | Giảm |
|---|---:|---:|---:|
| 1 | 20 | 6 | 70% |
| 2 | 40 | 9 | 77,5% |
| 3 | 60 | 12 | 80% |

Tầm giảm từ 7 xuống 6 ô. Mỗi giây một phát thật; sát thương và hiệu ứng đạn dùng cùng nhịp. Chọn kẻ địch gần nhất trong tầm, không chia sát thương cho toàn quân. Nỏ/pháo đời mới có thể bắn xa hơn. Không đổi HP, giá, thời gian xây hoặc ngưỡng chiến thắng.

| Đời | Đá | Đồng | Sắt | Trung đại | Công nghiệp | Hiện đại |
|---|---:|---:|---:|---:|---:|---:|
| Trụ tối đa | 2 | 3 | 4 | 5 | 6 | 8 |

Giới hạn dùng chung cho API đặt nhà, gợi ý ô xây và cửa hàng. Trụ đang xây/cháy/ngập vẫn tính vào hạn mức; phá dỡ mới trả chỗ. Lên đời mở thêm chỗ.

Không xóa hoặc hạ cấp trụ ở làng cũ vượt hạn mức. Chỉ tối đa hạn mức được bắn trong trận: ưu tiên trụ hoạt động cấp cao, sau đó gần Đình hoặc điểm tập kết, cuối cùng theo ID ô để thứ tự ổn định. Chốt danh sách một lần khi trận bắt đầu mô phỏng; trụ dư không tự thay thế trụ bị phá giữa trận. Trận cũ không có danh sách sẽ nhận quy tắc này ở tick đầu tiên sau khi tải. Bảng từng trụ giải thích dự phòng/tham chiến. Cooldown và danh sách được lưu trong snapshot để reconnect/reload không tạo thêm phát bắn.

## Kiểm tra trước phát hành

- 250 test lõi qua; gồm lượng sát thương từng giây, đạn khi vào tầm giữa hai mốc giờ, serialize/catch-up giống nhau, trụ dự phòng, hạn mức đời 1–6 và không xóa trụ cũ.
- Mô phỏng 8 kiếm binh phá trụ cấp 3 thắng, còn quân nhưng có thương vong; đây là một tình huống hồi quy, không chứng minh mọi đội hình cân bằng.
- Các API mock chạy riêng từng file; render/path/hit test và 12 kiểm tra Worker qua. So sánh vận chuyển đời 1 với `f5c4dc6`: 6.400 tuyến và 24 thành phố giữ nguyên kết quả.
- TypeScript, build Next và Wrangler dry-run qua. Browser local hiện đúng hạn mức `0/6` ở đời Công nghiệp và chỉ số trụ mới. Kiểm tra tiến trình mặc định server cho phép 3→4→5→6, còn metadata giả trong action không vượt luật server.

## Giới hạn theo dõi sau phát hành

Benchmark offline và phần chưa QA được giữ trong `phase2-local-qa.md`: mẫu Hiện đại 24 giờ ~8,7 giây wall, 14 ngày ~32,6 giây trên máy local. Không suy diễn thành mức CPU Vercel; vẫn cần đo tải thật, thời gian bắt kịp save lớn, cân bằng từ làng nghèo và PvP đời mới hai tài khoản. Phát hành này không tự nâng gói hosting hoặc thay cơ chế thu thập/tiêu hao để che vấn đề CPU.
