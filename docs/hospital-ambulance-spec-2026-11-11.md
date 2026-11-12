# Spec đội xe cứu thương bệnh viện

Trạng thái: đề xuất triển khai ngày tiếp theo, CHƯA có trong gameplay hoặc production.
Phạm vi hiện tại: chỉ viết spec. Không sửa code, cân bằng zombie, dữ liệu làng hoặc deploy.

## 1. Mục tiêu

Dân ngã hoặc nhiễm bệnh ở xa vẫn được bệnh viện cử xe đi đón nếu có đường hợp lệ và đủ nguồn lực. Người chơi thấy rõ ai đang chờ, xe đang ở đâu, ETA và lý do không cứu được. Không yêu cầu xây viện trong 6 ô quanh từng khu khai thác.

Mốc hiện trạng từ code `lib/zombies.ts`:

- Lều cứu thương và bệnh viện đều chỉ nhận người trong khoảng cách thẳng 6 ô.
- Mỗi ca giữ một thợ trong suốt thời gian đi đón và điều trị, nên giường trống không đồng nghĩa đủ người cứu.
- Người ngã chết sau 10 phút nếu chưa được đón; điều trị thường 30 phút, có hỗ trợ ma pháp hiện hữu thì 20 phút.
- Bệnh viện cần điện, 80 thực + 10 vàng/ca; công suất cơ sở 12 ca, đi qua `careCapacity` để tính bonus hiện hữu. Lều dùng 40 thực/ca.
- Chuyển động cứu thương hiện dùng vị trí người cứu trong `Vital`, chưa có thực thể xe riêng.

## 2. Luật chốt cho phiên bản đầu

| Thuộc tính | Quy tắc |
| --- | --- |
| Mở khóa | Tự có khi bệnh viện xây xong; dùng điều kiện mở khóa bệnh viện hiện tại, không thêm nghiên cứu |
| Số xe | Bệnh viện cấp 1/2/3 có tối đa 1/2/3 xe |
| Mua xe | Chưa thêm mua/nâng cấp riêng; xe là năng lực của bệnh viện |
| Nhân lực | Một dân được giao làm tại bệnh viện cho mỗi chuyến; dân đó không sản xuất hoặc nhận chuyến khác |
| Sức chở | Một bệnh nhân/xe/chuyến |
| Tốc độ | 2 ô/giây, không thưởng theo đường ở bản đầu |
| Phạm vi | Toàn bộ vùng đất đã khám phá có đường nối tới viện, không còn giới hạn thẳng 6 ô đối với bệnh viện |
| Đón người | Đứng tại ô tiếp cận hợp lệ và sơ cứu 30 giây; phải hoàn tất trước hạn chết |
| Điều trị | 30 phút từ khi nhập viện; giữ cơ chế giảm còn 20 phút của ma pháp hiện tại |
| Chi phí | 80 thực + 10 vàng, trừ một lần khi điều xe; không thêm nhiên liệu |
| Giường | Dùng `careCapacity` hiện tại; đặt trước một chỗ khi nhận chuyến, không cộng thêm 12 giường cho đội xe |
| Tự động | Mặc định bật cho bệnh viện mới và save cũ, là cơ chế hỗ trợ; có nút bật/tắt nhận chuyến mới |
| Lều cứu thương | Giữ cứu bộ trong 6 ô, tốc độ/chi phí/công suất hiện tại; không được biến thành xe |
| Người đã chết | Không hồi sinh; không tự hoàn dân/công trình đã mất |

Xe và kíp cứu thương trong chuyến là đơn vị y tế phi chiến đấu: không bắn, không làm lá chắn, không bị zombie chọn làm mục tiêu. Bệnh nhân chỉ được bảo vệ sau khi hoàn tất sơ cứu và lên xe. Trước đó vẫn chịu tấn công và đồng hồ tử vong bình thường. Xe vẫn bị giới hạn bởi địa hình và đường bị chặn; không bơi hoặc xuyên tường.

## 3. Nhận ca và ưu tiên

Hàng đợi dùng dân còn sống, chưa có ca chăm sóc hoặc xe khác giữ chỗ. Chỉ tự nhận người đã ngã hoặc nhiễm bệnh; người bị thương nhẹ nhưng chưa ngã/nhiễm giữ hồi phục hiện hữu.

Thứ tự toàn làng, không theo thứ tự mảng `people`:

1. Người ngã: hạn chết sớm nhất trước.
2. Người nhiễm bệnh chưa ngã: HP thấp nhất, rồi thời điểm nhiễm sớm nhất.
3. Nếu hòa: ETA đón ngắn hơn, rồi ID dân nhỏ hơn.

Đối với từng người, chọn cơ sở có đường và ETA đón thấp nhất trong các cơ sở đủ điều kiện. Bao gồm lều trong phạm vi hiện tại và xe viện; tie-break theo ô viện rồi ID xe. Thứ tự ưu tiên người ngã luôn cao hơn người nhiễm chưa ngã. Không hủy chuyến đã nhận để tranh ca ưu tiên mới.

Điều kiện điều xe, kiểm tra và giữ chỗ trong cùng một tick authoritative:

- Bệnh viện còn hoạt động, có điện, bật nhận chuyến; xe rảnh.
- Có thợ hợp lệ, không bị thương đến ngã, không nhiễm bệnh, không cứu người khác, không mang hàng chưa xử lý.
- Có giường trống sau khi tính cả bệnh nhân đang điều trị và ca đã giữ chỗ; đủ thực/vàng.
- Có đường qua ô đã khám phá, đi được cả chiều ra và chiều về tại thời điểm nhận.
- ETA tới nơi + 30 giây sơ cứu phải NHỎ HƠN hạn chết. Đúng bằng hạn chết thì không nhận; không trừ tiền.

Không đủ điều kiện: giữ người trong hàng đợi, hiển thị lý do cụ thể. Không xếp chỗ vô hạn hoặc giữ thợ/giường khi chưa điều được xe. Mất bệnh nhân hoặc kết thúc ca phải giải phóng đúng một reservation, không cấp trùng.

## 4. Vòng đời chuyến

`rảnh → đi đón → sơ cứu → chở về → nhập viện → rảnh`

- Đi đón: bệnh nhân chưa lên xe, không đổi vị trí theo xe. Chỉ giữ thợ/xe/giường và trừ chi phí một lần.
- Sơ cứu: xe dừng 30 giây tại vị trí tiếp cận. Bệnh nhân còn chịu hạn chết. Người nhiễm còn đi lại thì cập nhật đích theo ô thực tế, không kéo người tới vị trí cũ.
- Lên xe: lưu số thời gian sống còn lại nếu đã ngã; tạm dừng tiến triển bệnh/tử vong khi có kíp chăm sóc. Bệnh nhân ẩn sprite cá nhân, vị trí chọn/định vị trùng xe. Hàng đang mang vẫn thuộc người đó, không sinh thêm hoặc rơi vào kho.
- Chở về: xe đi theo route hiện hữu, không dịch chuyển. Thợ và bệnh nhân được định vị tại xe.
- Nhập viện: chuyển từ chỗ đặt trước sang giường đang dùng, không tăng gấp đôi công suất. Xe và thợ được giải phóng để nhận chuyến khác; thợ không còn bị khóa cả 30 phút điều trị.
- Điều trị: cần cơ sở còn hoạt động, có điện và ít nhất một thợ hợp lệ được giao tại viện. Thợ đang lái xe vẫn là nhân sự viện nhưng không thể nhận ca khác. Không giữ riêng một bác sĩ cho mỗi giường.
- Hoàn thành: dùng quy tắc hiện tại, HP ít nhất 50, hết nhiễm/ngã; phục hồi công việc/hàng qua luồng `resumeCargo`, không reset lượng hàng hoặc thanh toán lại.

## 5. Đường đi và sự cố

Đường xe dùng land/cardinal, chỉ ô đã khám phá; qua cầu hợp lệ, không qua nước thường/đá/tường kín. Cổng phe mình và cửa ra/vào viện cần được xử lý rõ như đơn vị thân thiện. Không dùng route có fallback teleport. Ô viện là điểm cuối hợp lệ, không cho phép xe xuyên các công trình khác. Lưu route từng ô cho mô phỏng; render nội suy từng cạnh.

| Sự cố | Cách xử lý |
| --- | --- |
| Không có đường ngay từ đầu | Không nhận, không tính phí; hiển thị “Không có đường tới bệnh nhân” |
| Đường bị chặn giữa chuyến | Dừng tại vị trí hợp lệ gần nhất, tính lại đường khi topology đổi; retry tối đa mỗi 5 giây |
| Sương che lại đường | Chuyến đang chạy bảo vệ các ô route đang dùng khỏi tái tạo/sương như hauling; tìm route mới chỉ qua ô đã khám phá |
| Xe đi đón bị kẹt 60 giây | Hủy nhận bệnh nhân, trả reservation; bệnh nhân trở lại hàng đợi. Xe quay về khi có đường; chưa về thì không thành xe rảnh ở viện |
| Chở bệnh nhân mà đường về bị chặn | Giữ bệnh nhân trên xe, tìm lại đường về viện gốc; không tự nhảy sang viện khác trong bản đầu |
| Chăm sóc trên xe quá 20 phút từ lúc lên xe | Hết khả năng ổn định: trả người xuống vị trí đất hợp lệ tại xe, phục hồi thời gian sống còn lại đã lưu; không cấp lại 10 phút. Giải phóng giường; xe phải về viện trước chuyến khác |
| Bệnh nhân chết trước lúc đón | Hủy ca một lần, nhả giường; xe quay về; không hoàn sinh hoặc nhận xác làm bệnh nhân |
| Bệnh nhân đổi chỗ khi đi đón | Replan khi đổi ô, tối đa mỗi 5 giây; vẫn phải tới kịp hạn, không kéo người hoặc hủy lệnh của người chơi |
| Mất điện khi xe đã xuất phát | Xe tiếp tục về bằng năng lực chuyến đã cấp; viện tạm dừng điều trị, không nhận chuyến mới |
| Viện bị phá/hỏng không hoạt động | Chưa đón: hủy nhận và quay về điểm xuất phát còn hợp lệ. Đã đón: hạ người tại ô đất hợp lệ đang đứng và phục hồi hạn còn lại. Giải phóng reservation/thợ; không teleport. Không điều tới viện khác ở bản đầu |
| Mất thợ / bị đổi công việc | Cùng nguyên tắc hủy/hạ người an toàn; backend không cho đổi việc thợ đang lái xe bằng thao tác thông thường |
| Tắt tự cứu | Không nhận chuyến mới; chuyến và điều trị đang chạy tiếp tục |
| Save/reload/offline | Tiếp tục cùng chuyến, không thu phí, sinh xe hoặc cấp lại hạn cứu |
| PvP tạm dừng mô phỏng làng | Dịch đồng bộ mốc thời gian chuyến/bệnh/ổn định theo cơ chế pause hiện hữu |

Không hoàn vật tư ca đã xuất phát, kể cả hủy giữa đường. Việc thu phí chỉ chạy tại transition nhận ca; không phụ thuộc số tick/reload.

Người xuống xe sau khi chuyến thất bại được đánh dấu không tự nhận lại đúng ca/xe cho tới khi điều kiện gây lỗi thay đổi (topology, viện hoặc nhân lực). Mốc ổn định 20 phút không reset bằng reload hoặc nhận lại cùng sự cố. Tránh vòng lặp tạo bất tử hoặc đốt tiền liên tục.

## 6. UI và hình ảnh

### Bệnh viện

Khối “Xe cứu thương” ngay trong bảng công trình:

- `Xe: 2/3 đang chạy · Giường: 5 điều trị + 2 giữ chỗ / 12` (mẫu minh họa, capacity thực lấy từ engine).
- `Thợ được giao: N · Đang lái xe: M`; thiếu thợ phải nêu rõ.
- Toggle “Tự điều xe cứu dân”; giải thích không hủy chuyến đang chạy.
- Danh sách từng xe: bệnh nhân, trạng thái, ETA đón/về; nút “Định vị xe”.
- Cảnh báo mất điện/thiếu vật tư/hết giường/không có đường, không dùng thông báo chung “Không cứu được”.

### Quản lý → Zombie & cứu hộ / Từng người

- Hàng đợi phân biệt “Chờ xe”, “Xe đang đến”, “Đang sơ cứu”, “Đang về viện”, “Đang điều trị”.
- Người ngã: đếm ngược thời gian được cứu còn lại; có ETA thì hiện `Xe đến sau … + sơ cứu 30 giây`.
- Nút định vị người/xe/viện dùng vị trí mô phỏng thực; người trên xe không hiện ở chỗ ngã cũ.
- Không báo “đang được cứu” chỉ vì đứng gần viện hoặc có reservation nhưng xe chưa tới.

### Canvas

- Xe cứu thương nhỏ nhận ra được, màu sáng và dấu cộng; có hướng di chuyển đúng bốn góc camera, sprite đứng/y tế/chạy.
- Một sprite/xe; không vẽ đồng thời bệnh nhân + thợ + xe trên cùng vị trí khi đã lên xe. Không gom xe vào cụm dân.
- Xe được chọn có đường đi và dấu mục tiêu; không rải nhãn tên/nền đen toàn bản đồ. Nhãn hiện khi chọn hoặc có sự cố cần chú ý.
- Badge và hit test dùng đúng vị trí đang vẽ. Zoom xa vẫn có marker xe cần cứu, không vô tình click vào actor ẩn.
- Mobile 390px: nút không tràn chữ, thao tác định vị/chuyển bảng dùng được; không phụ thuộc hover.

## 7. Thiết kế dữ liệu và tương thích

Đề xuất tách mission khỏi `Vital.care`, không nhồi toàn bộ xe vào renderer:

- Thêm cấu trúc optional, có version, dưới state y tế của City, ví dụ `medical?: {version:1; missions:AmbulanceMission[]; settings:...}`. Tên cuối cùng theo conventions repo khi implement.
- Mission giữ ID ổn định, viện + building instance ID, slot xe, driver ID, patient ID, phase, route, tiến độ cạnh, các mốc authoritative, bed reservation, phí đã thu, hạn sống còn lại, mốc ổn định, lý do kẹt và revision topology đã thử.
- Hospital level quyết định số slot; không lưu thêm đội quân ambulance trong `army`.
- Bed reservation được tính từ mission active + ca legacy, không tin số đếm client.
- `Vital.care` nhận mode/version optional để phân biệt ca cũ và ca điều trị mới không giữ riêng doctor; không thay nghĩa ca legacy bằng cách đoán thiếu field.
- Save cũ không có `medical` đọc được, khởi tạo lười khi cần. Ca đang cứu/điều trị theo cơ chế cũ hoàn tất với luật cũ, vẫn chiếm giường/thợ; không tự convert, không thu lại tiền.
- Xây lại viện cùng ô không thừa hưởng xe/ca của building instance đã mất. Nếu hospital hiện chưa có instance ID thì bổ sung cơ chế định danh tương thích trước khi bật ambulance.
- Backend là nguồn quyết định. Toggle là action qua queue/ACK/CAS hiện tại; render không tự đổi vị trí, tiền, bệnh hoặc deadline trong City.

## 8. Thuật toán và hiệu năng

Không thêm cronjob cho y tế. Xe được xử lý trong settlement deterministic hiện hữu, bao gồm offline recovery có checkpoint.

- Dựng index thợ, giường, bệnh nhân, xe theo lượt; không `.find/.filter` toàn bộ dân cho từng xe mỗi giây.
- Chỉ dựng hàng đợi khi có người cần cứu hoặc thay đổi tính khả dụng; thứ tự ổn định theo các khóa ở mục 3.
- Khi có xe rảnh, dùng BFS theo topology từ viện để lấy đường và ETA tới nhiều bệnh nhân cùng vùng; không A* riêng cho mọi cặp viện×dân mỗi tick.
- Cache có giới hạn theo topology + fog + viện; không chia sẻ state làng qua request. Thất bại có cooldown, hết viện/xe/giường thì bỏ sớm.
- Đi qua từng ranh giới sự kiện theo thời gian mô phỏng, không `Date.now()`/timer client để quyết định ca. Cùng input phải cho cùng kết quả online/offline/reload.
- Bổ sung route xe/bệnh nhân vào mọi luồng wilderness renewal và relocation/demolition validation cần bảo vệ. Chặn di dời viện đang có mission/ca như care hiện tại.

## 9. Kế hoạch triển khai ngày tiếp theo

1. Engine/state migration và transition, giữ legacy; index nguồn lực/hàng đợi và route; tests deterministic trước.
2. Action bật/tắt, bảng viện/hàng đợi và hiển thị thiếu điều kiện; cập nhật Cách chơi và hướng dẫn zombie.
3. Vẽ xe, nội suy, picking, định vị, chọn vùng không chọn nhầm driver/bệnh nhân bị ẩn.
4. QA bằng làng synthetic có khai thác xa, sông/cầu/tường, nhiều viện và thương vong; benchmark quy mô lớn.
5. Commit/review/build; chỉ release sau yêu cầu phát hành. Không tự sửa hoặc bù dữ liệu làng production.

Không mở rộng trong phiên bản đầu: mua nhiên liệu/xe riêng, nâng cấp tốc độ, xe đường thủy/bay, PvP ambulance, điều xe tới làng khác, hồi sinh, hoặc chuyển viện tự động.

## 10. Điều kiện nghiệm thu

- Người ngã cách viện >6 ô, có đường và còn thời gian: xe nhận ca, đi tới, sơ cứu đủ 30 giây, chở về, điều trị; không teleport.
- Một người gần hết hạn được ưu tiên trước người nhiễm dù nằm cuối mảng. Đảo thứ tự people/viện không đổi kết quả.
- Cấp 1/2/3 không chạy quá 1/2/3 xe, không vượt staff hoặc giường; xe rảnh sau nhập viện, không chờ đủ 30 phút mới đi tiếp.
- Bệnh nhân được đón đúng một lần, thu phí đúng một lần; thiếu điện/thợ/tiền/giường không tạo mission giả.
- ETA gồm cả sơ cứu; đón đúng hạn chết bị từ chối, người quá hạn không hồi sinh.
- Chặn đường trước/sau lên xe, tháo cầu, viện bị phá/xây lại, đổi thợ, mất điện và hủy nhận ca không gây mất/nhân đôi dân, cargo, giường hoặc xe.
- Kẹt xe quá 20 phút kết thúc ổn định đúng hạn, khôi phục thời gian sống còn lại; reload/retry không cấp lại hạn.
- Ca legacy giữ nguyên thời gian/phí/doctor; save mới đọc lại đúng trạng thái tại mọi phase.
- Online liên tục, offline một lượt, nhiều checkpoint và save/reload ở mọi phase cho cùng toàn bộ City và log.
- PvP pause bảo toàn thời gian còn lại của cả bệnh nhân và chuyến, không thu tiền hoặc chạy xe trong khoảng pause.
- Bốn góc camera, zoom, desktop/mobile: xe không gom với dân, người trên xe không còn sprite ở chỗ cũ, định vị đúng và không tràn nút.
- Benchmark synthetic 1.500 dân, 3 viện, 9 xe: đo riêng CPU y tế, route search count và thời gian catch-up so với baseline; không tăng BFS theo tích dân×viện mỗi giây. Ghi số đo thực, chưa chốt SLA ms trước khi có baseline.
