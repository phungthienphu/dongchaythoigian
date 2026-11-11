# Ba thời ma pháp — trạng thái triển khai

11/11/2026. **Chưa mở gameplay thời 7–9 trên production.** `RELEASED_ERA` và `LOCAL_ERA` vẫn là 6; thời 7–9 chạy được trong engine khi truyền `{maxEra:7|8|9}` (`ENGINE_MAX_ERA=9`). Không dùng bảng dữ liệu mới để tuyên bố đã làm xong ba đời.

## Thời 7–9 đã nối engine (chỉ bật khi `EngineRules.maxEra>=7` / `>=8` / `>=9`)

- `lib/magic-buildings.ts` đưa 10 công trình + 2 pháp sư thời 7 và 9 công trình + golem, linh lộc thời 8 vào `DEFS`/`UNITS`; `lib/magic.ts` là adapter (mạng mana, sản xuất, nghiên cứu, tuyển quân, phép zombie); `lib/magic-elements.ts` giữ luật thời 8, `lib/magic-myth.ts` giữ luật thời 9. Vào thời 9 cần Đại Trận Tứ Linh, Đình 8, 850 dân; Đình 8→9 60.000Đ + 20.000K + 10.000V + 200E, 18h.
- Bộ đệm học viện/tháp/trạm ấn/đài điều hòa do thợ của chính nhà đó mang từ kho gần nhất (haul `supply`), hàng đang đi giữ chỗ; bước phút không rút kho.
- Bình mana: `pourFlask` tối đa 100/pháp sư từ nguồn chọn (API `manaSource {x,y}`), phòng thủ chụp bình từ nguồn nhà khi trận bắt đầu; Hỏa cầu/Thủy hồi PvP trừ bình theo đội, cùng phí/hồi; phần chưa dùng hoàn tối đa phần đã rót và chỗ trống nguồn.
- Thời 8: tinh chất (ngăn kho cấp 1, chợ khi cả hai ≥8), lò tinh chất (cần xưởng cơ khí, 30 mana/12E trả theo mỗi chuyến hàng), ấn cục bộ 6 ô/3 nhà nhận, đài điều hòa (chọn hai ấn; −8 ô nhiễm/h; +1 chỗ/nguồn trong 6 ô), Đại Trận (+20% sức chứa), Tứ nguyên/Khế ước, chuyên tu (lần đầu miễn phí, đổi 6h + 100P + 40E), Bão lửa, Tịnh hóa, Mưa sinh trưởng, Thạch bích (chỉ chặn zombie, server kiểm tra còn đường tới Đình), linh mộc vận tải (mang 30 vào bộ đệm phép), golem/linh lộc ở zombie và PvP.
- Thời 9: thiên thạch (ngăn kho cấp 1), lò thiên luyện (cần tổ hợp sản xuất 6 ô, 60 mana/24C trả theo chuyến), đài thiên văn (Thiên nhãn 20 mana/h, cần Khai giới: báo zombie trước 180 giây), cổng linh giới (ấn Thủy + Thổ, 24 chỗ), đài khế ước (4 chỗ thần thú, tối đa 2 con), trận đồ (hai ấn khác loại + nguồn; tối đa 2 gói Thiên lôi/Hộ giới, hết hạn 24h không hoàn, mất khi trận đồ bị phá), bến dịch chuyển (ghép cặp, ≤60 hàng/30 giây, 20 mana + 1P, hồi 2 phút/cặp; hàng vào bộ đệm phép trong 6 ô bến đích rồi về kho; mất đích thì về bến gốc, mất cả hai thì mất kiện), Thiên Cung (Đình 9, 950 dân, khế ước, cổng + trận đồ) và ba lãnh địa 40 mana/h (đổi 6h + 100P + 40C, không cộng dồn; Bách Nghệ hoàn 10% mana sản xuất thường giờ trước, không tính phần hoàn).
- Khai giới và ba nghiên cứu khế ước (400 tri thức + 100C + 60E, cần đài khế ước, chỉ một lần); đổi khế ước: thu hồi thần thú trước, 12h + 200C + 100E, không có khế ước trong lúc đổi.
- Thanh Long (bay, 3 mục tiêu, phụ 50%, nhà ×0,5), Huyền Quy (che 4 quân trong 2 ô −15%), Phượng Hoàng (bay, mỗi 10 giây +30 HP tối đa 4 quân trong 3 ô) trong zombie AI và PvP. Zombie cắn được quân bay. PvP: chỉ cung/nỏ/súng/pháp sư/tháp và thần thú bay đánh được quân bay, pháp sư ×1,5, bộ binh hiện đại ×1,25; quân bay qua vật cản; chỉ có quân bay thì không cướp/không thắng bằng tàn phá. Giảm sát thương khác tên cộng tối đa 30%.
- Gói phép PvP: quân xuất chinh mang theo khi gửi `spells`, phòng thủ tự mang khi trận bắt đầu, một gói mỗi loại/phía; gói chưa dùng về làng, gói đã dùng mất.
- Còn hoãn: UI/art riêng, ngưỡng phép người chơi chỉnh, bình mana cho trận trại PvE (không có phép), linh mộc chưa bị zombie tấn công, ấn chưa đòi đường dân sự (chỉ khoảng cách 6 ô).

## Đã có mô-đun riêng (thời 9 chưa nối engine/UI)

- `lib/magic-data.ts`: 26 công trình, bốn hàng mới, sáu nghiên cứu, giá lên đời/Đình, bảy đơn vị và mười phép theo spec.
- `lib/mana-network.ts`: đường nối phải được bộ chỉ mục dân sự cho phép; tối đa ba relay; nguồn 4/6/8 chỗ, ưu tiên y tế/phòng thủ, nguồn dự phòng trừ đúng một lần và chuyển đúng một slot. Relay không phát mana.
- `lib/magic-production.ts`: input/output buffer hai giờ theo instance; xưởng không rút thẳng hàng trong kho làng; dừng khi thiếu điều kiện/bộ đệm đầy; mất nhà mất buffer/mana; tick phút tuyệt đối cho replay/reload nhất quán.
- `lib/magic-research.ts`: hàng chờ trả phí atomically; cần học viện, Dẫn linh cần đại học; hoàn thành đã trả không mất khi viện bị phá; hủy hoàn 50%, không hoàn hai lần.
- 14 test cho các mô-đun: topology, slot/fallback, recipe/buffer/giới hạn, reload/chia mốc, mất instance, phí nghiên cứu và trace nguyên liệu. Trace bootstrap mới kiểm tra tính sẵn có dữ liệu, chưa chứng minh throughput/thợ/ấn hay cân bằng thực tế.

## Còn phải hoàn thiện trước khi mở đời

1. Schema và migration bốn hàng kho; định danh instance công trình, kho/chợ/cướp/thu chi; giới hạn Đình/nhà/kho riêng và yêu cầu kỳ quan.
2. Adapter engine cho staffing, power, đường dân sự, hỗ trợ nhà cũ; actor vận chuyển buffer, reservation và bảo toàn hàng khi bị phá/chuyển việc/cứu dân.
3. Mạng ấn nguyên tố, chuyên tu, khế ước, lãnh địa; tuyển quân/linh mộc, bình mana và hai gói đại phép.
4. AI/hiệu ứng phép ở PvE và snapshot/Worker PvP; bay/chống bay, vách tạm kiểm tra đường, dịch chuyển hàng có hành trình.
5. Art riêng công trình/đơn vị/hiệu ứng, UI nguồn lỗi và preview cho từng đời; browser desktop/mobile và bốn góc xoay.
6. Chơi xuyên từ cả hai kỳ quan đời 6; offline/retry/performance trên runtime; chỉ mở release và push production khi ba đời vận hành đầy đủ.

Zombie nền tảng đã phát hành riêng ở `a7cc706`; xem `zombie-release-2026-11-11.md` để biết phạm vi kiểm chứng và phần tổ/tuần tra chưa hoàn thiện.
