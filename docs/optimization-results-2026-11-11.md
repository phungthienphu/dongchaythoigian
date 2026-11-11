# Thống kê tối ưu đến 11/11/2026

Tỷ lệ = (trước − sau) / trước × 100%. Các hàng đo những tác vụ khác nhau, không cộng hoặc lấy trung bình thành phần trăm mượt toàn game. Số đo lịch sử là local synthetic, không phải telemetry production.

| Đợt / tác vụ | Trước → sau | Kết quả |
| --- | --- | --- |
| Engine 10/11: mô phỏng đời 4/5/6 trong 1 giờ | 417,86→347,70 / 703,56→531,45 / 1.185,02→911,47 ms | giảm 16,8% / 24,5% / 23,1% |
| Phân công tự động 600 dân | 954,01→37,43 ms | giảm 96,1% |
| Headcount thủ công 600 dân | 902,97→37,24 ms | giảm 95,9% |
| Crowd hauling 600 người / 600 frame | 92,12→77,67 ms | giảm 15,7% |
| Cache bản đồ: đời 6, 300 dân, zoom xa, cache ổn định | khoảng 14–22→0,4 ms vẽ/frame | giảm khoảng 97–98%; không tính dựng lại cache |
| Tính bù: 100 người có việc không tới được, 1 phút | 27,5→10,6 ms | giảm 61,4% |
| Tính bù bình thường, đời 4–6 / 1 giờ | 381,5→372,4 / 617,9→588,2 / 1.035,3→978,2 ms | giảm 2,4% / 4,8% / 5,5%; đời 3 chậm hơn 3,1% |
| UI bảng/modal/scroll | nền tối đa 15fps, nhường vẽ 150ms sau thao tác; directory 30 dòng | giảm công việc lặp; chưa có % độ trễ A/B |
| Index nông dân mới: 300 / 1.200 / 3.000 người | 1,246→0,161 / 8,349→0,356 / 53,007→0,794 ms update | giảm 87,1% / 95,7% / 98,5% |
| Cụm cùng vị trí/trạng thái: 1.200 người | 1.200→3 sprite đại diện | giảm 99,75% số sprite dân; giữ đủ ID |
| Phân bố dân rảnh về nhà hợp lệ; sửa nhãn/nút | không sửa economy/save; không nhãn lạc ra đất trống | cải thiện trình bày; chưa định lượng % |

Bản release này còn gồm sửa zombie kẹt mục tiêu và cân bằng áp lực đời 6–9 theo task zombie. Đây là thay đổi gameplay, không tính là phần trăm tối ưu; wave mạnh hơn có thể tăng chi phí mô phỏng.

Nguồn kiểm chứng chi tiết: `logic-performance-implementation-2026-11-10.md`, `render-smoothness-handoff-2026-11-11.md`, `catchup-optimization-2026-11-11.md`, `ui-performance-2026-11-11.md`, `crowd-performance-review-2026-11-11.md`. Chưa có phép đo hợp lệ cho % cải thiện toàn game hay p95 login/thao tác production.

## Production release

Đã phát hành Web/API Cloudflare từ commit `48f4be0`, release `crowd-zombie-48f4be0`, version `c60e9738-0730-4302-9c90-a0df94311707`. Build production đạt; TypeScript, 581 full game tests (trước test neo nhãn cuối), 7 crowd tests, 6 API tests và 18 Worker tests đạt. Combat Worker không deploy lại; không migration/reset/chỉnh dữ liệu làng.

Public smoke: health 200 / ready đúng release ID; 8 asset JS/CSS trang chủ khớp SHA256 bản build; `/dev/magic-ui` và `/dev/zombies` trả 404. Không dùng private-account smoke; chưa đo độ trễ/FPS trên làng production.
