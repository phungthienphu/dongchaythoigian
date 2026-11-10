# Rà soát UI/UX và kế hoạch cải tiến Dòng Sông Thời Đại

Ngày: 10/11/2026. Mốc mã nguồn: `7a63720` trên `main`.

Trạng thái cập nhật: đã triển khai UI mới và kiểm thử local sau khi được duyệt; chưa phát hành production. Xem [báo cáo triển khai và QA](ui-implementation-and-qa-2026-11-10.md) để phân biệt phần đã làm và phần chưa nghiệm thu. Ma trận bên dưới vẫn là mục tiêu đầy đủ của roadmap, không phải mọi mục đã đạt. Những con số kích thước bên dưới là quan sát local hoặc mục tiêu thiết kế, không phải số đo production.

## 1. Kết luận và mục tiêu

Game đã có nhiều cơ chế, trạng thái và lời giải thích hữu ích. Vấn đề chính là người chơi phải tự tìm, đọc và kết nối chúng để biết nên làm gì. Giao diện thường đặt luật chơi, thông số, cảnh báo và nút thao tác ngang hàng nhau. Thu nhỏ màn hình làm vấn đề rõ hơn.

Ưu tiên cải tiến: **giúp người chơi quyết định nhanh và nhìn rõ làng**, rồi đồng bộ hình thức. Màn hình mặc định cần trả lời được:

1. Làng có việc gì cần xử lý ngay?
2. Đối tượng tôi đang chọn đang làm gì, tôi ra được lệnh gì?
3. Mục tiêu tiếp theo thiếu gì và có thể giải quyết ở đâu?

“Thông minh” trong kế hoạch này là lọc theo ngữ cảnh, xếp ưu tiên và giải thích nguyên nhân từ trạng thái game sẵn có. Người chơi vẫn quyết định; giao diện không tự đổi việc dân, tiêu tài nguyên hay điều quân.

## 2. Phạm vi và bằng chứng

### Đã kiểm tra trực tiếp trong trình duyệt

| Màn/luồng | Môi trường | Kết quả chính |
| --- | --- | --- |
| Làng Trung đại, cửa hàng | `/dev/eras`, 1280×720 | Cửa hàng 400px, thẻ hai cột nhiều chữ nhỏ; bảng che một phần tài nguyên |
| Làng Hiện đại, Thu chi | `/dev/eras`, 375×812 | Tài nguyên xếp nhiều hàng; nút điều hướng nằm ngoài màn; bảng thu chi xuống dòng dày |
| Làng Hiện đại, phân dân, tuyển quân | `/dev/eras`, 1280×720 và 768×1024 | Phân công và danh sách người chung một bảng dài; tuyển quân lặp nhiều form, hàng đợi ở dưới danh sách |
| Thế giới | `/dev/world`, 1280×720 | Có giải thích sứ giả và nước chưa biết, nhưng thông tin nằm thành khối chữ trên bản đồ |
| Chợ, đoàn xe | `/dev/market`, 1280×720 | Đã có cảnh báo, theo dõi xe và xác nhận; danh sách và các thao tác nối tiếp trong một luồng dọc |
| Combat | `/dev/defense-orders`, 1280×720 và 375×812 | Có chọn vùng, lọc loại quân, nhóm quân và hướng dẫn; nhiều lớp điều khiển cùng hiện |
| Điều kiện kỳ quan | `/dev/wonders`, 375×812 | Có đầy đủ điều kiện và liên kết tới công trình; cần cuộn dài để tới lựa chọn cuối |
| Đăng nhập/phiên hết hiệu lực | `WelcomeScreen` trong local | Có thông tin khởi đầu, lưu tiến trình, luật phiên chơi; chưa thử OAuth thật trong lượt rà này |

Các màn trên dùng dữ liệu mô phỏng; không điều dân, mua hàng, tuyển quân hay tấn công bằng tài khoản thật. Thanh công cụ “Phase 2 · thử local” và các nút mô phỏng là dụng cụ QA, không tính là lỗi giao diện game. Phần mô tả/điều khiển riêng của combat preview cũng không tính là chiều cao production.

Harness `/dev/eras` có lúc trở về màn hết phiên; chưa xác minh nguyên nhân cụ thể của lần chuyển màn này. Mã harness chặn API ngoài danh sách bằng 403, chưa mô phỏng đầy đủ giao thức phiên hiện tại. Đây là giới hạn QA cần xử lý khi triển khai; không dùng hiện tượng này để kết luận đăng nhập production lỗi.

### Đã đối chiếu mã nguồn theo toàn bộ nhóm chức năng

- Khung game, tài nguyên, chọn đối tượng, xây, nâng cấp, phân dân, tuyển quân, lên đời, bạn bè, lịch sử: `components/Game.tsx`, `app/globals.css`.
- Kinh tế, đói, phân việc, tự động, ruộng và kho: `EconomySummary`, `HungerStatus`, `WorkforcePanel`, `AutoAssignPanel`, `FarmWorkers`, `FarmGroupCare`, `EraStorageNotice`.
- Công trình: `DockPanel`, `BridgePanel`, `DefenseOrientation`, `DemolitionPanel`, `EraCivicPanel`.
- Quân sự và kết quả: `ArmyRecruitment`, `ArmyManagement`, `ExpeditionReadiness`, `TroopTypePicker`, `BattleView`, `BattleReports`.
- Ngoại giao, thế giới, giao thương: `WorldMap`, `FriendSearch`, `DiplomacyMessages`, `MarketPanel`, các hook `useWars/useMarket/useDiplomacy`.
- Thiên tai, offline, ô nhiễm, kỳ quan: `DisasterNotifications`, `FrontierStatus`, `EraOfflineSummary`, `PollutionPanel`, `FinalWonderReview/Requirements`.
- Đăng nhập, tải lại làng và cẩm nang: `WelcomeScreen`, `MapLoadingScreen`, `HowToPlay`.

Đây là rà soát kiến trúc UI và các luồng đại diện. Chưa kiểm thử toàn bộ tổ hợp trạng thái, thiết bị cảm ứng thật, trình đọc màn hình, nhiều tài khoản hoặc combat mạng thật. Các phần này có trong điều kiện nghiệm thu, không được coi là đã đạt.

## 3. Các vấn đề cần xử lý

P0: chặn thao tác. P1: gây nhầm lẫn hoặc làm sai quyết định. P2: tính nhất quán, tốc độ thao tác và hoàn thiện.

| ID | Mức | Bằng chứng hiện tại | Ảnh hưởng | Hướng xử lý |
| --- | --- | --- | --- | --- |
| F01 | P0 | 375px: 10 nút 50px, cách nhau 6px; vị trí x lần lượt −89, −33…415. “Thế giới”, “Cửa hàng”, “Đình làng” nằm ngoài vùng nhìn/bấm. CSS `.bubbles`, khoảng dòng 230–299 | Chức năng chính không tiếp cận được trên mobile | Điều hướng 5 mục cố định, chức năng con nằm trong nhóm |
| F02 | P1 | HUD Hiện đại có dân, thợ, quân và 7 tài nguyên; ở 375px phải xếp khoảng 5 hàng. `Game.tsx:1214–1243` | Mất diện tích bản đồ, khó xác định chỉ số đáng chú ý | HUD gọn, tài nguyên mở rộng khi bấm; luôn hiện chi phí liên quan hành động |
| F03 | P1 | Tài nguyên dùng `title` chứa nhiều luật, chi phí và ước tính. Trong chip không có nút mở giải thích riêng | Khó đọc trên cảm ứng, người chơi phải học qua hover | Popover mở bằng chạm/click/focus; tách số dư, dòng tiền thực tế và công suất |
| F04 | P1 | Cửa hàng mặc định phân theo thời đại, mỗi thẻ gồm ảnh, giá, thời gian và mô tả dài. CSS chữ mô tả 11px, giá 11.5px | Phải đọc và đổi tab để tìm công trình theo mục đích | Phân nhóm công dụng, tìm tên, bộ lọc; mô tả đầy đủ ở chi tiết |
| F05 | P1 | Bảng Dân làng: phân số dân rồi `c.people.map(...)` toàn bộ người, `Game.tsx:1599–1620`. Fixture 300 dân tạo 300 hàng | Khó tìm người đang kẹt; DOM cập nhật không cần thiết | Tổng quan nhóm trước, lọc nguyên nhân chờ; danh sách người chỉ mở khi cần, giới hạn số hàng render |
| F06 | P1 | Nhiều nguồn thông báo độc lập: thiên tai, đói, battle report, chiến tranh, tin mới, offline summary. Nhiều khối dùng cùng `.war-alerts` top95px | Rủi ro chồng khung và cạnh tranh chú ý; chưa tái hiện toàn bộ tổ hợp trong browser | Một bộ phân loại/xếp ưu tiên, một vị trí thông báo khẩn và một lịch sử có bộ lọc |
| F07 | P1 | `Game.tsx:1420–1452` có nhiều thanh chọn/xây/gác/trạng thái; chế độ được quản lý bằng nhiều state riêng | Người chơi khó biết đang chọn, kéo bản đồ hay ra lệnh; rủi ro mode xung đột | Một thanh lệnh theo đối tượng/chế độ, một cách hủy nhất quán |
| F08 | P1 | `ArmyRecruitment.tsx:13–42`: mỗi loại quân là một form dài; hàng đợi đặt sau danh sách | Khó thấy đang tuyển gì, thiếu gì, khi nào xong | Quân hiện có + hàng đợi ở trên; chọn một loại mới mở form tuyển |
| F09 | P1 | Combat đồng thời có chọn vùng, bỏ chọn, bộ lọc loại, nhóm và nhiều dòng hướng dẫn; quan sát local ở 375px | Điều khiển chiếm chỗ, người chơi phải tìm nút trong lúc đánh | Thanh chỉ huy gọn và phản hồi lệnh ngay trên bản đồ; panel mở rộng theo lựa chọn |
| F10 | P1 | `EraCivicPanel` ghép mục tiêu, ô nhiễm, điện, danh sách thiết bị, kỳ quan; `Game.tsx:1622+` còn thêm roadmap và điều kiện lên đời | Cần đọc một bảng dài để biết một việc còn thiếu | Tách “Phát triển” và “Vận hành”; mặt trước chỉ hiện điều kiện đang chặn |
| F11 | P1 | Thế giới/chợ đã có ETA, điều kiện và cảnh báo; chúng xen trong nhiều đoạn chữ | Khó phân biệt chưa khám phá, hết quyền thăm, có khiên, thiếu thuyền hay lỗi kết nối | Trạng thái ngắn có biểu tượng + một hành động xử lý; tiến trình chuyến đi thống nhất |
| F12 | P2 | `HowToPlay.tsx` là nhiều mục dài, một số mở sẵn | Thông tin đủ nhưng khó tra cứu đúng vấn đề hiện tại | Cẩm nang theo chủ đề, tìm kiếm local, liên kết tới mục liên quan từ UI |
| F13 | P2 | `.bubble .bl` 8.5–9.5px; nhiều mô tả 11px; màu dịu trên nền bản đồ. Desktop pointer ở viewport nhỏ vẫn có nút 31×36 và nút đóng 30×30 | Đọc và bấm khó; đổi chiều rộng không đồng nghĩa kiểm thử cảm ứng thật | Chữ, nền, vùng bấm và kiểm tra tương phản theo chuẩn chung |
| F14 | P2 | `Game.tsx` 1692 dòng và nhiều CSS override theo chiều rộng/chiều cao | Dễ vá vị trí màn này làm lệch màn khác | Tách shell/panel/lệnh và token; giữ nguyên ranh giới đồng bộ/simulation |

Những thứ nên giữ: bản đồ isometric và art theo thời đại; vùng xây hợp lệ; “Tìm ô xây được”; thông tin từng bước vận chuyển; báo thiếu vật liệu cụ thể; chọn quân theo loại; tiến độ tuyển; nút tới công trình; khôi phục làng có tiến độ; luật kỳ quan đầy đủ. Các phần này cần được tổ chức và làm nổi đúng lúc.

## 4. Tham khảo và phần áp dụng

Đã mở và đọc các nguồn sau trong lượt rà này. Chỉ mượn nguyên tắc UI, không suy luận về kiến trúc backend hay sao chép luật chơi.

| Nguồn | Điều được nguồn mô tả | Áp dụng cho game |
| --- | --- | --- |
| [Supercell — We’ve revamped the Clash of Clans User Interface](https://supercell.com/en/games/clashofclans/blog/news/weve-revamped-the-clash-of-clans-user-interface), 08/10/2026 | Gom xây/nâng cấp vào một nơi, bộ lọc/sắp xếp; item bị khóa dẫn tới công trình đang chặn; chỉ hiện currency dùng được trong ngữ cảnh; hướng dẫn ngắn khi thay UI | “Xây dựng” thống nhất, chi phí theo hành động, đường tắt xử lý điều kiện, giới thiệu vị trí nút mới |
| [Ubisoft — Statistics overview in Anno 1800](https://www.ubisoft.com/en-ca/help/anno-1800/gameplay/article/accessing-the-statistics-overview-in-anno-1800/000065241) | Có bảng thống kê sản xuất riêng; mở từ quản lý, phím tắt hoặc công trình/kho | Tổng quan kinh tế gọn và drill-down từ tài nguyên/công trình; không ép đọc bảng đầy đủ ở HUD. Không yêu cầu tăng lịch sử server lên 2 giờ như Anno |
| [Age of Empires IV — Shortcuts Revealed](https://www.ageofempires.com/news/aoeiv-shortcuts-revealed/) | Chọn dân rảnh, gán nhóm quân, chuyển nhóm theo loại và đưa camera về trung tâm | Thao tác nhanh có nhãn/phím tắt; thống nhất chọn nhóm ở làng và combat. Không sao chép phím đang xung đột Q/E xoay bản đồ |
| [Xbox Accessibility Guideline 101 — Text display](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/101) | Khả năng đọc chữ gồm kích thước, khoảng cách, kiểu, màu; cân nhắc màn nhỏ và cấu hình | Có chế độ chữ lớn, kiểm thử dấu tiếng Việt và nền rõ. Mốc CSS ở kế hoạch là mục tiêu riêng của web game, không phải số đo chứng nhận XAG |

## 5. Thiết kế giao diện theo ba lớp

| Lớp | Khi nào xuất hiện | Nội dung |
| --- | --- | --- |
| 1 — Chơi | Luôn có | Bản đồ, HUD gọn, điều hướng, một cảnh báo khẩn nếu cần, một mục tiêu có thể thu gọn |
| 2 — Thao tác | Chọn nhà/dân/quân/tài nguyên hoặc mở một bảng | Trạng thái hiện tại, nguyên nhân bị chặn, 1 hành động chính và tối đa 2 hành động phụ; phần khác trong “Thêm” |
| 3 — Tra cứu | Chủ động bấm “Chi tiết”, “Thu chi”, “Luật” | Thông số, công thức, lịch sử, danh sách đầy đủ, so sánh nâng cấp |

### Điều hướng ổn định

Thay 10 bong bóng ngang hàng bằng 5 mục có vị trí cố định: **Xây dựng · Dân làng · Quân đội · Thế giới · Quản lý**.

| Mục | Chức năng con |
| --- | --- |
| Xây dựng | Công trình mới, đang xây/nâng cấp, cần sửa; nhóm Nhà ở/Kinh tế/Quân sự/Hạ tầng/Văn hóa |
| Dân làng | Phân công số dân, nhóm việc, người đang chờ, chế độ tự động theo điều kiện mở khóa |
| Quân đội | Quân hiện có, tuyển quân, hàng đợi, điểm gác, hành quân và báo cáo |
| Thế giới | Bản đồ, bạn bè, ngoại giao, chợ, đoàn xe; có đường tắt từ các chuyến đang theo dõi |
| Quản lý | Kinh tế, phát triển thời đại, nước/điện/môi trường, lịch sử, hướng dẫn, tài khoản; xếp hạng là mục phụ |

Chuông thông báo cố định cạnh thông tin làng; các cảnh báo có thể mở trực tiếp đúng mục con. Không bắt đi lại qua nhiều menu khi bấm từ một sự kiện.

Các nhóm cấp cao giữ nguyên vị trí qua các thời đại. Chỉ module con liên quan mới mở ra; tính năng chưa mở có thể xem trong mục Phát triển, không chiếm thanh lệnh hằng ngày. Không tự đổi thứ tự nút theo tần suất sử dụng.

### Desktop và tablet

- Thanh trên: tên làng/thời đại, tài nguyên gọn và chuông. Dân/thợ/quân có nhãn rõ; không chỉ dựa vào icon.
- Panel theo ngữ cảnh ở cạnh phải, một panel chính mỗi lần. Bố cục dành sẵn khoảng cho panel, không đè lên HUD hoặc nút điều hướng.
- Thanh lệnh hiện theo lựa chọn, ở dưới vùng chơi; nút camera gom thành cụm riêng. Minimap nhỏ có thể thu gọn, bổ sung ở giai đoạn sau.
- Chiều cao màn nhỏ phải chuyển cách bố trí theo diện tích còn lại, không chỉ dựa vào chiều rộng.

### Mobile

- Điều hướng 5 mục ở đáy; 375px vẫn đủ chỗ với vùng bấm tối thiểu 44×44 CSSpx. Không cuộn ngang mới tìm được chức năng chính.
- HUD mặc định: thực, gỗ, dân và nút “Tất cả tài nguyên”; khi xây/tuyển/mua, hiện đủ các loại cần trả và phần còn thiếu. Cảnh báo kho đầy/thiếu tài nguyên khác vẫn phải có dấu và đường mở, không bị giấu.
- Bảng công việc mở dạng bottom sheet, có mức thu gọn/mở rộng. Khi cần chọn vị trí trên map, sheet về dạng gọn và giữ nút xác nhận/hủy trong vùng bấm.
- Hạn chế một vùng cuộn chính trong panel. Nút chính và nút đóng/hủy luôn tiếp cận được; không có bảng khác tự mở đè lên khi đang ra lệnh.

## 6. Quy tắc “thông minh”, giảm loạn thông tin

### 6.1 Một danh sách việc cần chú ý, tính tại client

Đề xuất một hàm thuần nhận snapshot game hợp lệ và trả `{id, severity, reason, target, action, expiresAt}`. Dùng dữ liệu đã có; không gọi AI, không thêm polling, không tự phát lệnh.

Thứ tự ưu tiên: an toàn tiến trình/kết nối và đang bị đánh → đói/thiệt hại sắp xảy ra → công việc ngừng vì thiếu đầu vào/đường/kho → dân mới hoặc người thực sự chưa có lệnh → mục tiêu phát triển.

- Mặc định một dòng khẩn và tối đa ba mục trong danh sách “Cần chú ý”. Nếu nhiều nguy cơ khẩn cùng lúc, gộp tiêu đề và giữ số lượng/nút mở toàn bộ; không âm thầm bỏ qua nguy cơ còn hiệu lực.
- Gộp cùng nguyên nhân: “8 người chờ nộp vì kho thực đầy”, thay vì 8 thông báo riêng.
- Thông tin bình thường như thêm một kiện hàng đi vào lịch sử/thống kê, không bật popup.
- Đọc sự kiện không có nghĩa đã khắc phục vấn đề; trạng thái đang đói/cháy/chưa lưu vẫn hiện tới khi hết.
- Badge đỏ chỉ cho nguy hiểm hoặc việc cần phản hồi; số quân, số dân rảnh là số liệu trung tính.
- Hạn chế lặp lại cùng cảnh báo. Chỉ báo lại khi mức nguy hiểm tăng hoặc tình trạng đã hết rồi xảy ra lại.
- Không tự kéo camera, đổi lựa chọn hoặc đóng panel khi có tin; người chơi bấm “Tới vị trí” mới di chuyển.

### 6.2 Trạng thái trước, con số và luật sau

| Ngữ cảnh | Mặt trước | Mở chi tiết |
| --- | --- | --- |
| Ruộng 2/2 nhưng không thấy ai | “Đã giao 2 · 2 đang giao hàng” hoặc đúng nguyên nhân chờ | Người nào, vị trí, kiện đang mang, thời điểm tới dự kiến |
| Kho đầy | “Kho thực đầy · 8 người chờ nộp” + “Mở kho” | Sức chứa từng ngăn, nâng cấp/giá, các kho liên quan |
| Công trình thiếu thợ | “Đã giao 2/3 · 1 người đã tới” + “Giao thêm” nếu hợp lệ | Người đang đi/trú/kẹt, hiệu suất theo người có mặt |
| Quân không đi được | “Không có lối qua sông”/nguyên nhân đã được engine xác định | Tuyến, thuyền, vật cản; không đoán nguyên nhân từ vị trí sprite |
| Ô nhiễm | “57/100 · đang giảm khoảng 4 điểm/giờ” + “Xem cách giảm” | Phát thải/xử lý, 3 nguồn lớn nhất, danh sách đầy đủ, mốc mục tiêu |
| Chưa lên đời được | “Còn 2 điều kiện” và điều kiện đang chặn | Checklist đầy đủ, số còn thiếu, sức chứa kho, nút tới công trình |
| Chưa thể tấn công | Giữ mục tấn công nhìn thấy, vô hiệu hóa có lý do và thời gian hết hạn nếu biết | Khiên, quyền thăm, chênh đời, quân, hậu cần, kết nối |
| Đồng bộ chậm | “Có lệnh chưa lưu”/“Đang nối lại” với hành động thử lại phù hợp | Lệnh còn chờ và lỗi xác nhận; không báo “Đã lưu” chỉ vì UI đã phản hồi |

Không đơn giản hóa số liệu thành lời khẳng định sai: đã giao khác đã tới; năng suất lý thuyết khác hàng nộp; thợ đang vận chuyển vẫn giữ việc; tài nguyên đang mang không phải kho.

### 6.3 Kinh tế có thời gian và mức tin cậy

- HUD: số trong kho, sức chứa ở lớp mở rộng; màu cảnh báo theo vấn đề thực, không tô đỏ mọi số giảm.
- Chi tiết tài nguyên: “Đã nhận / Đã dùng / Chênh lệch” cùng một khoảng thời gian đo. “Công suất dự kiến” là nhóm riêng, có điều kiện và chú thích ngắn.
- Sản lượng, tiêu hao ở màn so sánh dùng cùng đơn vị/phút; tooltip/chi tiết có thể quy đổi giờ. Không trộn /giờ và /10 phút trong một phép so sánh.
- Chỉ ước lượng thời gian hết thực khi có mẫu đủ dài và nhịp âm tương đối ổn định; giai đoạn đầu hiện “Đang đo”. Khởi điểm đề xuất mẫu ít nhất 90 giây, cần kiểm tra với chu kỳ vận chuyển thật trước khi chốt.
- Không dự báo “an toàn” từ công suất tối đa nếu kho đang không nhận hàng. Các giao dịch ngoài thống kê phải có nhãn giới hạn hoặc nguồn dữ liệu riêng.

### 6.4 Các thao tác được trợ giúp nhưng không tự quyết

- Bấm điều kiện thiếu đưa tới đúng nhà/kho/nhóm dân. Nếu chưa có công trình thì mở đúng nhóm xây, đã lọc sẵn, có thể bỏ lọc.
- Lưu bộ lọc và tab trong phiên để không mất chỗ khi đóng/mở. Không thay đổi mục đang đọc vì snapshot mới.
- Hướng dẫn chỉ xuất hiện lần đầu gặp cơ chế hoặc khi bấm trợ giúp; có bỏ qua và mở lại. Không tự bật lại mỗi lần đồng bộ.
- Dân đang giữ nhóm khám phá, đứng theo lệnh hay mang hàng được gọi đúng tên trạng thái; không đề xuất kéo tất cả sang việc khác như “dân rảnh”.

## 7. Thay đổi cụ thể theo hệ thống

| Hệ thống | Thiết kế đề xuất | Hoàn thành khi |
| --- | --- | --- |
| Chọn đối tượng và bản đồ | Một panel thống nhất: tên/đời/cấp, trạng thái, lệnh chính; vòng chọn rõ; cụm đông người có lựa chọn người/nhà; minh họa đường và đích | Dễ thấy đã chọn ai, lệnh nào đang bật, hủy bằng Esc/nút; camera và chọn vùng không nhầm |
| Xây/nâng cấp/sửa/phá | Thẻ gọn theo công dụng; đã có/giới hạn; chi phí thiếu ngay trên chi tiết; đang xây/nâng cấp ở đầu danh sách riêng | Không cần vào chế độ đặt mới biết thiếu gì; sửa/nâng/phá có ảnh hưởng và xác nhận đúng luật |
| Ruộng/kho/bến/cầu/đê | Trạng thái và một việc xử lý chính; vùng ảnh hưởng chỉ hiện lúc chọn hoặc bật lớp bản đồ | Hiểu được ai đang làm/đi/chờ; xem tuyến cầu, bờ đích và giá chuyển bến trước xác nhận |
| Dân làng | Thẻ nhóm tài nguyên và số người, “Chờ xử lý” tách khỏi “Chưa có lệnh”; sửa số dân với tổng và thay đổi dự kiến | Tìm nhóm gỗ/nhóm khám phá tối đa 2 thao tác; giữ nháp khi đang nhập, không bị snapshot ghi đè |
| Quân đội | Tab “Quân ở nhà / Tuyển / Hành quân”; quân theo loại có portrait; hàng đợi ghim trong tab tuyển; giải ngũ ở mục quản lý | Thấy số ở nhà/đi xa/đang tuyển; biết quân đầu và cả lô xong lúc nào; ra gác theo nhóm |
| Combat | Một bộ chọn nhóm, các lệnh hợp lệ theo trạng thái, phản hồi lệnh đã nhận/đích/đường bị chặn; kết quả rõ thắng/thua và thiệt hại | Đổi lệnh khi đang đánh dễ tìm; không để nhiều hàng hướng dẫn mặc định; trạng thái mạng tách trạng thái quân |
| Thế giới/ngoại giao | Chú giải rút gọn; nước của mình/bạn bè/đã khám phá/được thăm có icon+nhãn; bảng “Chuyến đi” dùng chung ngôn ngữ | Không nhầm kết bạn với biết tọa độ; tuyến/ETA/chủ sứ giả rõ; giữ luật ẩn vị trí |
| Chợ/đoàn xe | Tab “Mua / Hàng của tôi / Đang vận chuyển”; lọc tài nguyên/thanh toán; chi tiết xe là timeline và trạng thái nguy cơ | Phân biệt hàng giữ riêng, tiền chờ, hàng đã giao và bị cướp; thông báo mở đúng xe |
| Phát triển/vận hành | Lên đời và nhánh kỳ quan nằm ở Phát triển; nước/điện/môi trường ở Vận hành, có tổng quan riêng | Checklist ưu tiên mục thiếu; điều kiện đạt thu gọn; vẫn mở được đầy đủ và xem đánh đổi nhánh |
| Thông báo/ngoại tuyến | Một inbox theo loại, tóm tắt lần trở lại và sự kiện cần phản hồi; cảnh báo khẩn riêng một chỗ | Không chồng popup; lịch sử và lý do vẫn xem lại; không làm mất đọc/đang chờ phản hồi |
| Đăng nhập/tải làng/trợ giúp | Giữ cấu trúc đăng nhập hiện có; loading theo bước đã biết, không tạo % giả; cẩm nang tra cứu và hướng dẫn tại chỗ | Phân biệt cần đăng nhập, đang tính bù, lỗi mạng, lỗi quyền; thử lại không dựng làng mới hoặc gửi lệnh trùng |

## 8. Hướng hình ảnh

- Giữ làng bên sông Việt Nam, phối xanh rêu/trầm, giấy ngà, điểm vàng đồng. Dùng đường kẻ và họa tiết tiết chế; giữ bản đồ là chủ thể.
- Panel có nền đủ đặc để chữ không lẫn với cỏ/nước. Giảm nhiều lớp viền sáng, bong bóng và bóng đổ cùng lúc.
- Tiêu đề dùng font có cá tính; số liệu, nội dung và lệnh dùng font dễ đọc, đủ dấu tiếng Việt. Mục tiêu thân bài 14–16px, chữ phụ từ 12px; không dùng 8–10px cho nhãn chức năng chính.
- Bộ icon thống nhất từ hình vẽ hiện có; ảnh quân/công trình đúng loại và thời đại. Không cần thay toàn bộ art trong đợt UI đầu.
- Màu có nghĩa cố định: vàng cho lựa chọn/lệnh chính; đỏ cho nguy hiểm; xanh cho hợp lệ/hoàn tất; trạng thái luôn kèm chữ/icon.
- Hỗ trợ chữ lớn và giảm chuyển động; ưu tiên rõ ràng trước animation. Thiết kế để có thể thêm đời sau mà không thêm một hàng nút mới cho mỗi cơ chế.

## 9. Chia task và điều kiện hoàn thành

Độ lớn: S khoảng nửa–1 ngày kỹ thuật; M 1–2 ngày; L 2–3 ngày. Chỉ là ước lượng ban đầu cho triển khai tập trung, chưa tính vòng phản hồi mỹ thuật và kiểm thử nhiều thiết bị.

| Task | Ưu tiên / độ lớn | Phạm vi chính | Phụ thuộc | Điều kiện hoàn thành |
| --- | --- | --- | --- | --- |
| UI-01: bộ trạng thái và mẫu bố cục | P1 / M | Wireframe desktop/mobile: mặc định, chọn nhà, chọn dân, combat, khẩn; token chữ/màu/khoảng cách | Không | Có gallery local với trạng thái thật/giả lập rõ ràng; chốt điều hướng và phân lớp trước khi thay hàng loạt |
| UI-02: shell responsive và điều hướng | P0 / L | `Game`, CSS, shell mới; 5 mục, vị trí HUD/panel/camera | UI-01 | 375px không mất nút; không chồng tài nguyên/panel; 1280×600 vẫn dùng được; một panel chính |
| UI-03: HUD và chi tiết tài nguyên | P1 / M | Resource bar/popover, `EconomySummary` | UI-02 | Chạm được giải thích; hiển thị chi phí liên quan; đo thực nhận và công suất tách rõ; đơn vị nhất quán |
| UI-04: một thanh lệnh theo ngữ cảnh | P1 / L | Chọn/xây/gác/cầu/chuyển bến/chọn vùng và xử lý hủy | UI-02 | Không có hai mode phát lệnh cùng hoạt động; xác định rõ đối tượng; hủy không gửi lệnh |
| UI-05: việc cần chú ý và inbox | P1 / L | Adapter cho notification hiện có, quy tắc ưu tiên/gộp, đường mở | UI-02 | Tổ hợp đói+bị đánh+đồng bộ lỗi không chồng; khẩn còn hiệu lực không bị dismiss vĩnh viễn; không thêm request |
| UI-06: xây dựng và công trình | P1 / L | Catalog theo công dụng, tìm/lọc, panel nhà và quản lý công trình | UI-03,04 | Tìm nhà theo tên/công dụng; số giới hạn rõ; điều kiện/thiếu vật liệu trước đặt; nâng/sửa/phá đúng luật |
| UI-07: quản lý dân và chu kỳ ruộng/kho | P1 / L | `WorkforcePanel`, `FarmWorkers`, danh sách dân, tóm tắt việc chờ | UI-03,04,05 | Mở đúng nhóm ≤2 thao tác; 500 dân không render đồng thời 500 hàng khi chỉ cần tổng quan; nháp không bị mất |
| UI-08: tuyển quân và hành quân | P1 / M | `ArmyRecruitment`, `ArmyManagement`, `ExpeditionReadiness` | UI-03,04 | Số hiện có và queue nhìn thấy trước; chọn loại mới mở form; lương thực, thuyền, rủi ro rõ trước xuất quân |
| UI-09: chỉ huy combat | P1 / L | `BattleView`, `TroopTypePicker`, phản hồi lệnh | UI-04,08 | Bộ chọn/lệnh thống nhất với làng; đổi vị trí giữa giao chiến và hồi kết rõ; test cả mạng thật và preview |
| UI-10: thế giới, bạn bè, sứ giả | P1 / M | `WorldMap`, `FriendSearch`, `DiplomacyMessages` | UI-02,05 | Lý do chưa thăm/đánh rõ; timeline chuyến đi; không lộ tọa độ chưa khám phá |
| UI-11: chợ và đoàn xe | P1 / M | `MarketPanel`, đường theo dõi xe, mẫu mua/bán | UI-03,05,10 | Lọc không gọi API mỗi lần gõ; đơn vị giá cả lô rõ; xác nhận và nguy cơ vận chuyển dễ thấy |
| UI-12: phát triển, môi trường và kỳ quan | P1 / L | `EraCivicPanel`, `PollutionPanel`, checklist, requirements | UI-03,05,06 | Tóm tắt mục thiếu trước; mở được toàn bộ luật; điện sạch/ô nhiễm/12h liên tục giải thích đúng; giữ khóa chọn nhánh |
| UI-13: onboarding và tra cứu | P2 / M | `HowToPlay`, return summary, loading/login, hướng dẫn chuyển UI | UI-06…12 | Người mới làm 3 việc đầu không phải đọc cả cẩm nang; có bỏ qua/mở lại; hướng dẫn lấy cùng nguồn luật hiện hành |
| UI-14: khả năng đọc, hiệu năng và nghiệm thu | P1 / M | Gallery, responsive, focus, touch, đo render/request, harness phiên | Xuyên suốt; chốt sau 13 | Đạt ma trận mục 11; có bằng chứng trước/sau và danh sách giới hạn; rollback UI độc lập |

### Thứ tự phát hành đề xuất

| Đợt | Nội dung | Kết quả người chơi thấy |
| --- | --- | --- |
| A | UI-01,02,03 và phần nền UI-14 | Không mất nút trên mobile; HUD dễ đọc, ít chiếm chỗ; chi tiết tài nguyên bấm được |
| B | UI-04,05,06,07 | Xây và phân dân rõ; biết vấn đề nào cần xử lý; không có nhiều thanh lệnh/popup tranh chỗ |
| C | UI-08,09,10,11 | Tuyển/điều quân, thăm làng, chợ và đoàn xe dùng cùng cách tổ chức |
| D | UI-12,13 và đóng UI-14 | Lên đời/môi trường dễ hiểu; onboarding, chữ lớn và regression hoàn chỉnh |

Tổng khung ước lượng khoảng 21–35 ngày kỹ thuật, triển khai tăng dần qua các đợt; không cần đợi hoàn thành cả bốn đợt mới sửa lỗi mobile. Sau UI-01 cần cập nhật lại ước lượng theo prototype và độ khó giữ hành vi cũ. Không cam kết thời gian chỉ dựa trên số dòng code.

## 10. Ranh giới kỹ thuật và bảo vệ gameplay

- Dùng chung action/validation/quote/readiness hiện tại. UI không tự tính một phiên bản luật khác để quyết định giá, sức chứa, lên đời hay kết quả trận.
- Không đổi thời gian thực, tích lũy offline, giao hàng vào kho, nhóm việc, pathfinding, sức ăn, quân số, quyền thăm, khiên, cơ chế kỳ quan hoặc tính toán server trong đợt UI.
- Tách dần `Game` thành shell, panel và bộ trạng thái tương tác; không refactor toàn bộ engine và queue cùng lúc. Mode mới chỉ quản lý ý định chọn/lệnh, không sở hữu snapshot game thứ hai.
- Selector cho “Cần chú ý” được memo theo phần dữ liệu liên quan; không quét toàn bộ bản đồ/người mỗi frame canvas. Timer chỉ cập nhật text cần thiết; danh sách dài chỉ render phần thấy được.
- Giữ nhịp batch/flush và cache hiện hành. Tìm kiếm/lọc/đổi tab/hover/mở chi tiết là thao tác local nếu đã có dữ liệu; không tăng polling. Khi dữ liệu chưa tải thì tải đúng nhu cầu qua controller hiện tại.
- Phản hồi chọn và nhận lệnh phải tức thì ở client; trạng thái chờ lưu/xác nhận server vẫn chính xác, thất bại có giải thích. Bấm lặp không tạo lệnh mua/tuyển/xây trùng.
- Thông báo đọc/chưa đọc giữ ngữ nghĩa lưu hiện tại trong đợt đầu. Nếu muốn đồng bộ đã đọc giữa thiết bị phải tách task backend, đánh giá request trước.
- Lớp map mới và minimap không được tiết lộ đất chưa thấy, tọa độ nước chưa biết hoặc dữ liệu của người khác; giữ điều kiện quyền xem hiện tại.
- Không tăng thư viện animation/UI nặng chỉ để vẽ panel; ưu tiên CSS, component nhỏ và renderer sẵn có. UI không cần dịch vụ AI bên ngoài.

## 11. Ma trận nghiệm thu

Các mục sau là **mục tiêu cho triển khai**, chưa phải kết quả hiện tại.

| Nhóm | Ca bắt buộc | Mức đạt |
| --- | --- | --- |
| Responsive | 375×812, 390×844, 768×1024, 844×390, 1280×600, 1440×900; chữ lớn và zoom trình duyệt | Không mất nút chính; đóng/hủy/xác nhận tiếp cận được; không tràn ngang trang; safe-area đúng |
| Thông tin | Đời1,3,6; kho đầy, ruộng bạc màu, dân giao hàng, thiếu thợ/đường/điện | Mặt trước nêu đúng trạng thái và hành động; luật đầy đủ vẫn truy cập được |
| Chú ý | Đói+bị đánh+thiên tai+tin ngoại giao+offline result | Một vị trí khẩn, gộp có số lượng; không chồng panel; không đánh mất tin cần phản hồi |
| Chọn/lệnh | Người trước nhà, chọn nhóm nhiều loại, kéo camera/chọn vùng, xây tường, nối cầu, chuyển bến, hủy | Không nhầm đối tượng; một mode phát lệnh; không thay đổi nhóm/đường đi ngoài lệnh người chơi |
| Kinh tế | Mẫu ngắn, thu/chi cùng lúc, kho đầy, chợ/chiến lợi phẩm nằm ngoài thống kê hiện có | Không coi ước tính là hàng đã nhận; không dự báo an toàn từ số chưa đủ tin cậy |
| Chiến đấu | Chọn nhiều, lọc loại, ra gác, bị chặn sông/nhà, đổi lệnh giữa combat, reconnect, thắng/thua | Phản hồi lệnh/không thể làm rõ; giữ server quyết định; báo cáo đúng kết quả thật |
| Thế giới/chợ | Bạn chưa biết vị trí, quyền thăm hết hạn, có khiên, xe bị cướp, chờ kho | Không lộ tọa độ; lý do vô hiệu hóa rõ; thông báo mở đúng đối tượng |
| Phát triển | Thiếu sức chứa dù đủ chỉ tiêu khác; kỳ quan thiếu nhiều điều kiện; đã chọn nhánh | Hiện các blocker chính trước; có đường xử lý; không cho xác nhận sai luật |
| Khả năng dùng | Keyboard/focus/Esc, cảm ứng thật, chữ có dấu, reduced motion | Mục tiêu vùng bấm44×44; chữ chức năng chính≥14px; chữ thường tương phản mục tiêu4.5:1; màu không là tín hiệu duy nhất |
| Hiệu năng | Cùng fixture300/500 dân, cùng camera, mở/đóng panel liên tục | So trước/sau: FPS trung vị không giảm quá5%; p95 thời gian frame không tăng quá10%; node DOM có giới hạn và không tăng dần sau 20 vòng mở/đóng |
| Mạng | Kịch bản chọn/lọc/mở panel và kịch bản xây/tuyển giống nhau trước/sau | Không có request do hover/lọc local; không tăng tần suất sync/poll; không tạo timer/listener/WebSocket trùng |
| Độ trễ cảm nhận | Chọn nhà/dân/nhóm, mở panel với dữ liệu đã có, máy tham chiếu thống nhất | Phản hồi nhìn thấy mục tiêu<100ms, không đợi API cho highlight/đổi panel |
| Tiến trình | Vắng nhiều ngày, mất mạng, phiên bị thay, lệnh bị server từ chối | Có bước tải thật/thử lại; không báo lưu sai, không mất nháp không liên quan, không tự tạo làng mới |

Kịch bản sử dụng sau prototype: 5 người chơi (có cả người mới và người đã chơi) thực hiện xây kho, tìm dân chờ, giao nhóm gỗ, tuyển/ra gác, đọc lý do không đánh được và tìm blocker lên đời. Mục tiêu ít nhất 4/5 hoàn thành mỗi việc không cần người hướng dẫn; ghi số bước, thời gian và chỗ hiểu nhầm trước/sau. Đây là bài kiểm tra đề xuất, chưa có kết quả hay số liệu người dùng được thu thập.

## 12. Cách triển khai và chốt từng đợt

1. Tạo gallery UI mới từ fixture độc lập, khắc phục mô phỏng phiên cho harness; thống nhất trạng thái mặc định/chọn/khẩn/mobile trước.
2. Thay shell/HUD trước, dùng adapter gọi action cũ. Các module chuyển lần lượt, giữ đường quay về UI cũ trong quá trình kiểm thử.
3. Mỗi task có commit riêng, kiểm tra tập trung và browser QA tương ứng; thay CSS/bố cục không cần thêm test phản chiếu JSX. Quy tắc ưu tiên, quyền hiển thị và mode chuyển lệnh cần test hành vi vì có nguy cơ làm mất cảnh báo/ra lệnh sai.
4. Trước mỗi đợt: chạy type-check/build/test phù hợp, regression lưu làng, quote/validation, route quyền xem và combat; so request/render với baseline cùng fixture. Build thành công không thay thế browser QA.
5. Phát hành từng đợt trên Cloudflare sau khi đạt nghiệm thu của phạm vi đó. UI nên rollback độc lập với dữ liệu, không cần migration chỉ để đổi bố cục.
6. Thông báo ngắn cho người chơi vị trí nút mới và cho mở lại hướng dẫn; cập nhật báo cáo trước/sau bằng số đo thật.

Điểm bắt đầu được đề xuất: **UI-01 → UI-02 → UI-03**, đồng thời xây các ca QA nền. Sau đó ưu tiên bộ chú ý và quản lý dân/xây dựng vì giải quyết trực tiếp tình trạng “quá nhiều thông tin, không biết làm gì”.
