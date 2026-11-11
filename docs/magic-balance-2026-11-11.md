# Đo cân bằng thời 7–9 — 11/11/2026

Chạy lại: `bun tests/magic-balance.ts village 450 7 14` (P, thời, số ngày; thêm `--no-magic`, `--json=file`), và `bun tests/magic-balance.ts pvp`.

Làng mẫu dựng bằng nội dung game: Đình, 14 đại kho, chung cư, ruộng đủ ăn, tháp canh cấp 3 ở 8 trạm, lều trú/cứu thương ở 9 trạm, quân thời 6 (24–38 bộ binh, 8–10 lính súng, 2–3 thiết giáp) và đủ công trình phép của thời. Chạy `settle` thật của engine (gánh hàng, điện, mana, zombie), offline, không xây lại.

**Chưa đủ 14 ngày.** Người chơi muốn phát hành nên dừng sớm; dưới đây chỉ là ngày đầu và trận PvP. Mỗi ngày mô phỏng ở 950 dân tốn 15–20 phút CPU, chủ yếu do gánh hàng và tìm đường zombie.

## 1. Zombie, ngày đầu

| Làng | Bản | Nhà mất | Dân chết | Zombie bị giết | Do phép | % sát thương do phép | Mana thu / tiêu |
|---|---|---:|---:|---:|---:|---:|---:|
| 450 dân, thời 7 | trước | 3 | 1 | 244 | 11 | 10% | 12.569 / 1.907 |
| 450 dân, thời 7 | sau | 3 | 0 | 274 | 40 | 27% | 13.020 / 2.358 |
| 650 dân, thời 8 | trước | 4 | 0 | 578 | 24 | 7% | 23.987 / 6.828 |
| 650 dân, thời 8 | sau | 6 | 0 | 545 | 38 | 17% | 23.598 / 6.439 |

- Mana dư thừa: kho nguồn đầy suốt ngày. Phép yếu vì tầm với, không vì thiếu mana. Hỏa trận chỉ tiêu 67–300 mana/ngày, không hút cạn nguồn.
- Bản 650 dân chạy trên bố cục cũ, hết gỗ nên đói từ ngày đầu. Bố cục đã sửa (rừng rộng hơn, bỏ xưởng thủ công/nhà máy); chạy thử 12 giờ ở 650 và 950 dân thì thực phẩm dương, dân không giảm.
- Tường bao bị bỏ khỏi làng mẫu: zombie trồi ngoài tường phá 115 đoạn tường mỗi ngày, và tìm đường khi bị chặn làm mô phỏng chậm hơn 10 lần.

## 2. PvP, cùng chỗ quân

| Trận | Trước | Sau |
|---|---|---|
| 20 bộ binh đánh 8 hỏa + 2 thủy sư | bộ binh thắng, còn 96% | bộ binh thắng, còn 95% |
| Kỵ binh áp sát pháp sư | kỵ binh thắng 65% | kỵ binh thắng 28% |
| 4 golem đánh 24 kiếm sĩ | kiếm sĩ thắng 79% | golem thắng 44% |
| 4 golem đánh 12 kỵ binh | kỵ binh thắng 81% | golem thắng 7% |
| Golem tiến vào lính súng, cách 12 ô | lính súng thắng 100% | lính súng thắng 97% |
| 2 Thanh Long đánh 24 bộ binh | bộ binh thắng sau 2 giây, còn 100% | bộ binh thắng sau 3 giây, còn 98% |
| 2 Thanh Long đánh 12 hỏa sư | pháp sư thắng 55% | pháp sư thắng 20% |
| 2 Thanh Long đánh 24 kiếm sĩ | rồng thắng (cận chiến không đánh được bay) | như cũ |
| Thiên lôi vào 30 chiến binh gậy đứng cụm | giết 30 | giết 6 |

Không quân nào thắng tất cả: bộ binh hơn pháp sư, kỵ binh hơn pháp sư, golem hơn cận chiến, quân bắn xa hơn golem, bộ binh và pháp sư hơn thần thú bay, thần thú bay hơn cận chiến.

## 3. Còn rủi ro

- Chưa có số 14 ngày, chưa đo làng 850/950 với số mới, chưa đo nhịp gom hàng lên đời. Cần chạy lại 4 làng 14 ngày trước khi mở thời 7.
- Bộ binh hiện đại mạnh nhất mỗi chỗ quân, thắng cả thiết giáp. Đây là vấn đề thời 6, chưa sửa.
- Gỗ: rừng chặt rồi không mọc lại khi offline; làng 650+ dân hết gỗ trong vài ngày nếu không trồng cây hoặc mua.
- Tường rẻ bị zombie phá hàng loạt; tìm đường quanh tường rất tốn CPU.
