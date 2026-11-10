# Ba thời ma pháp — trạng thái triển khai

11/11/2026. **Chưa mở gameplay thời 7–9 trên production.** `RELEASED_ERA` và `LOCAL_ERA` vẫn là 6. Không dùng bảng dữ liệu mới để tuyên bố đã làm xong ba đời.

## Đã có mô-đun riêng, chưa nối engine/UI

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
