# Rà soát logic, tác vụ và hiệu năng — 10/11/2026

Đợt tối ưu engine/crowd đã được triển khai sau bản audit ban đầu;
xem [thay đổi, benchmark và kiểm chứng](./logic-performance-implementation-2026-11-10.md).
Những nhận định bên dưới ghi nhận trạng thái trước đợt tối ưu đó.

## Kết luận

Nút thắt kiến trúc là mô phỏng theo từng giây kết hợp nhiều lượt duyệt dân,
tính đường và dựng lại dữ liệu dẫn xuất. Tăng số dân và thời gian offline làm
chi phí nhân lên. Ở client, mô phỏng, clone snapshot, đồng bộ crowd và React
cùng dùng main thread với Canvas. Tối ưu từng lớp trước khi thay engine.

Đây là audit source và benchmark local, chưa phải đo production hay đo FPS
trên thiết bị thật. Không thay logic, schema, hạ tầng hay dữ liệu người chơi.
Các tài liệu hiệu năng và phục hồi trước đây đã được đối chiếu với code hiện tại.

## Bằng chứng mới

- Node v24.14.1; bundle bằng Bun, chạy benchmark bằng Node.
- `tests/era-benchmark.ts`, thời đại 6, offline 1 giờ: dân 300 → 378,
  JSON cuối 86.234 byte. Lượt thường: wall 1.710 ms, CPU process 2.771 ms;
  lượt có CPU profiler: wall 1.304 ms, CPU process 2.249 ms.
  CPU process có thể lớn hơn wall do nhiều thread; hai lượt này không phải p95
  hay phép so sánh trước/sau tối ưu.
- Profile lượt thứ hai: hàm BFS `find` bên trong `haulPath` khoảng 32,6%
  thời gian mẫu; `settle` self 10%; `stepHauling` self 7,5%; GC 5%;
  `haulPassable` self 4,1%; `derive` self 4%. Đây là tỷ trọng self của một
  workload tổng hợp, không cộng lại thành chi phí toàn phần của các caller.
- 20 test đạt trong `settlement-budget`, `batched-city`, `bounded-cache`.
- `node tests/render-performance.mjs` đạt kiểm tra viewport, picking,
  cache invalidation, đường đi, hauling và Canvas. Đây là regression bằng
  fixture/context giả lập, không đo FPS hay GPU trình duyệt thật.
- Profile chỉ lưu tạm ở `/tmp/dong-logic-audit.cpuprofile`.

## 1. Engine: chia cache theo nguyên nhân thay đổi

**Nguồn:** `lib/engine.ts`: `settle`, `haulingContext`, `haulPath`, `derive`.

`settle` dùng một cờ `dirty` cho nhiều loại thay đổi. Khi cờ bật, engine dựng
lại derived, stats và toàn bộ hauling context, bao gồm route trees và paths.
Một thay đổi dịch vụ hoặc dân số vì thế có thể làm mất cache navigation dù
đường đi chưa đổi. Cache hiện có giới hạn và chia sẻ BFS theo điểm xuất phát;
không cần thay toàn bộ thuật toán tìm đường ngay.

Đề xuất:

1. Đo số lần rebuild context, hit/miss route, số node BFS mở rộng, lý do dirty.
2. Tách invalidation cho topology, visibility, công trình/dịch vụ, workforce
   và economy. Chỉ giữ cache qua thay đổi đã chứng minh không ảnh hưởng nó.
3. Giữ BFS tree khi điều kiện passability và thứ tự tie-break không đổi;
   drop/source cache có dependency riêng, không được sống theo topology đơn thuần.
4. Khi đã có số liệu, cân nhắc shared flow field cho nhóm có cùng đích;
   chỉ dùng nếu bảo toàn lựa chọn đường hoặc có thay đổi gameplay được chấp nhận.

Điều kiện: tường/cổng/cầu, địa hình, fog, cháy/ngập, hoàn tất công trình và
mỏ cạn phải vô hiệu đúng cache liên quan. So sánh toàn bộ state với engine cũ.
Không tăng cache vô hạn để đổi CPU lấy rủi ro memory.

## 2. Giảm lượt duyệt dân và công trình

**Nguồn:** `autoAssign`, `autoTarget`, `updateRefuges`, `stepHauling`, vòng `settle`.

- `autoAssign` đếm `taskResource` của toàn bộ dân bên trong vòng từng dân rảnh:
  riêng phần đếm có chi phí O(dân rảnh × tổng dân). Đếm một lần, cập nhật sau
  mỗi phân công thành công theo đúng kết quả task thực tế và thứ tự hiện tại.
- `autoTarget` dựng/sort danh sách công trình và gọi `workersAt` theo ứng viên.
  Lập chỉ mục số người làm theo tile và vị trí còn chỗ trong phạm vi một lượt
  phân công; cập nhật ngay sau mỗi thay đổi để không phân quá số slot.
- Trong `settle`, các lượt đếm thợ smelter, wheel, gather và staff có thể chia sẻ
  dữ liệu theo tick. Chỉ hợp nhất khi giữ đúng thời điểm lấy mẫu: người vừa tới,
  vừa chạy trú ẩn hoặc vừa được phân công có thể đổi trạng thái giữa các bước.
- Khi có nguy hiểm, `updateRefuges` dựng/sort danh sách nhà cho từng dân.
  Chia sẻ danh sách nhà hợp lệ và kết quả ứng viên theo vị trí; giữ nguyên tie-break.
- `nextGatherSource` filter/sort nguồn theo vị trí. Tối ưu sau khi đo miss,
  vì cache/retry hiện tại đã tránh nhiều lần tìm lại không cần thiết.

Ưu tiên phần đếm trong autoAssign trước; lợi ích rõ về độ phức tạp nhưng tỷ lệ
CPU thực tế còn tùy số dân rảnh và auto có bật hay không.

## 3. Client: giảm allocation và cập nhật UI

**Nguồn:** `components/Game.tsx`, `components/villagers.ts`, `lib/batched-city.ts`.

Mỗi `advance` mô phỏng visible state rồi `publish` clone toàn bộ city. Callback
publish tiếp tục `derive`, `Crowd.sync`, cập nhật React. Timer một giây còn gọi
`bump`; cần React Profiler để biết số commit thực tế vì React có thể batch.
`Game` gọi `stats` trong render, kể cả render do state giao diện thay đổi.

Đề xuất theo mức rủi ro tăng dần:

1. `Crowd.update` hiện tạo `new Map(city.people.map(...))` mỗi frame. Dựng index
   khi sync snapshot, dùng lại trong frame; thay reference khi state mới tới.
   Nhánh explorer cũng có thể dùng index thay `people.find`.
2. Cache tổng chiều dài và cumulative distance của route bất biến để giảm việc
   `haulPosition` duyệt lại route; gắn với reference/version route, không chỉ ID dân.
3. Chia HUD, panel và map controller thành subscriber riêng; map đọc refs,
   UI dùng selector và snapshot bất biến. Memo theo revision, không theo City
   reference nếu còn mutate trực tiếp. Không trả live mutable city cho React.
4. Tránh tính stats kinh tế lại vì mở menu/chọn tab; dùng stats revision riêng.
5. Đo clone/replay trước khi áp dụng copy-on-write. Replay đang clone cho mỗi
   command để bỏ được trạng thái bị action từ chối; bỏ clone trực tiếp có thể
   làm rò mutation từ command lỗi. Giữ durable queue, ACK và writer lease.

Lợi ích kỳ vọng: giảm GC và giật khi click/sync. Chưa có số đo allocation
trình duyệt để định lượng phần trăm cải thiện.

## 4. Render: cache tĩnh và giảm công việc mỗi frame

**Nguồn:** `components/draw.ts`: `drawCity`; `Game.tsx`: vòng RAF.

Viewport culling và pause khi bị che/hidden đã tồn tại. Phần còn lại dựng/sort
visible tiles, tạo draw item/closure, vẽ lại nhiều hình tĩnh mỗi frame; crowd
vẫn cập nhật toàn bộ actor trước bước lọc draw.

- Cache thứ tự tile theo bounds và rotation; camera dịch trong cùng bounds
  chỉ đổi projection. Không giữ cache vô hạn theo mọi tọa độ camera.
- Cache nền theo chunk có revision địa hình/fog; tách nước/hiệu ứng động.
- Công trình tĩnh có thể dùng atlas hoặc bitmap có giới hạn bộ nhớ;
  phải tính cả rotation, era, level, cháy/ngập và zoom/DPR.
- Giữ painter ordering giữa nhà/cây/actor; không ghép mọi công trình lên
  một layer trước actor vì có thể sai che khuất ở góc isometric.
- Sau khi đo, cho phép chất lượng thích ứng: DPR, hiệu ứng, nhịp animation
  30/60 Hz. Vị trí và logic authoritative vẫn theo đồng hồ mô phỏng.
- Chỉ giảm tần suất actor ngoài viewport khi visual state có thể dựng lại từ
  timestamp; actor trang trí còn state machine không thể ngừng tùy tiện.

## 5. Lập lịch: hướng lớn nhất, triển khai sau tối ưu cục bộ

Giữ engine hiện tại làm oracle. Chưa nhảy ngay từ tick một giây sang tính
offline bằng sản lượng × thời gian: luật kho đầy, nguyên liệu cạn, đói, giao
hàng, mở fog và thay đổi terrain tương tác theo thứ tự.

Lộ trình hợp lý là scheduler lai:

1. Đăng ký deadline cho xây xong, cải tạo ruộng, chuyển pha hauling,
   chuyến đi, mùa/thiên tai và các mốc kinh tế.
2. Heap event dùng thứ tự ổn định `(tick, phase, entityOrder, sequence)`.
   Bản đầu bảo toàn tick lượng tử hiện tại; không thực thi sớm ở millisecond
   chính xác nếu engine cũ chỉ xử lý tại tick tiếp theo.
3. Chỉ bỏ qua khoảng yên khi chứng minh không vượt ngưỡng tài nguyên,
   sinh dân/đói, nhiên liệu, đầy kho, depleted source hay điểm mở fog trên đường.
4. Kiểm soát sai số số thực: cộng gộp nhiều tick có thể khác cộng lặp;
   không tự nới deep equality nếu chưa có quyết định về tương thích save.
5. Persist deadline/cursor cần thiết và rebuild runtime heap có thứ tự xác định
   sau checkpoint; không lưu closure, Map cache hay toàn bộ heap runtime vào save.

Web Worker cho dự đoán ở client có thể giữ main thread mượt nhưng không giảm
CPU server. Chỉ gửi patch/render snapshot; gửi toàn bộ City qua worker mỗi
giây có thể chuyển chi phí sang structured clone. OffscreenCanvas là bước sau,
phụ thuộc browser và pipeline picking/input.

## 6. Server, DB, mạng và combat

- Recovery đã có tick cap theo quy mô, CAS và checkpoint. Giữ hard work budget;
  Cloudflare có thể đứng đồng hồ trong CPU loop. Bổ sung counter BFS expansions,
  context rebuild và thời gian kết nối/DB để hiệu chỉnh cap bằng telemetry.
  Nếu cần giới hạn bên trong một tick, phải thiết kế continuation có thể resume;
  không ngắt tick giữa mutation rồi ghi state dở.
- `saveCityBatch` có thể tính lại batch khi CAS thất bại, tối đa năm lượt.
  Đo conflict trước; hướng lâu dài là một writer có fencing theo làng cho tất cả
  đường ghi liên quan. Khóa riêng GET không serialize được mutation khác.
- `lib/world.ts` còn quét toàn bộ vị trí khi đặt làng và toàn bộ candidate khi
  discovery đến hạn. Hướng scale: spatial cell có index, truy vấn theo vùng,
  phân trang. Không thêm limit tùy ý làm đổi luật lựa chọn discovery.
- `ensureWorldPos` đọc tập vị trí trước khi ghi: hai làng khác nhau có thể chọn
  gần nhau; CAS của từng làng không bảo vệ MIN_GAP toàn thế giới. Cần reservation
  vùng/slot có cơ chế tranh chấp, kiểm tra lại khoảng cách và retry.
- `lib/market.ts` đã có limit/index và reconcile. Đo `explain` trên đúng môi
  trường trước khi thêm index cho `$or`, status và sort; tránh index trùng.
- Queue đã batch lệnh, hook phụ đã có event/deadline và coalescing ở nhiều nơi.
  Kiểm tra foreground refresh giữa các hook/queue; không mặc định mọi refresh
  cùng lúc đều tạo request trùng vì ReadFlights và promise guard có tồn tại.
- `worker/src/index.ts`: combat tick 100 ms, broadcast snapshot khi có socket,
  persist khoảng một giây. Tách nhịp simulation, publish và persistence nếu số đo
  tải yêu cầu; delta frame cần base revision, full resync khi reconnect và xử lý
  client chậm. Giữ authorization/session fence và kết quả durable trước callback.
- Backend Village SQLite hiện có QA epoch guard. Không coi prototype này là
  bằng chứng backend production đã di chuyển, hoặc đề nghị cutover chỉ để tối ưu.

## 7. Tổ chức code theo ranh giới trách nhiệm

Tách dần `engine.ts` thành model, navigation, workforce, hauling, economy,
event scheduling và action validation. Giữ API façade hiện tại để mỗi lần
tách đều chạy được regression, tránh vòng import giữa các system.

Phân biệt ba loại dữ liệu:

- Durable: City, task/route cần khôi phục, thời gian, RNG state, receipt/ledger.
- Runtime: index người/công trình, cache đường, event heap dựng lại được.
- Presentation: camera, selection, animation, render cache và UI snapshot.

System trả các loại invalidation cần thiết; orchestrator giữ thứ tự cập nhật.
Không cần chuyển toàn bộ game sang ECS hoặc thêm framework để đạt phân chia này.
Tách module tự nó không bảo đảm nhanh hơn: mục đích là quản lý dependency và
giúp tối ưu có thể kiểm chứng độc lập.

## Thứ tự triển khai và tiêu chí hoàn tất

| Đợt | Nội dung | Bằng chứng cần có |
| --- | --- | --- |
| 0 | Benchmark matrix và telemetry theo system | Baseline lặp nhiều lần, median/p95; 6 era; idle/active/blocked/combat; 50/300/1.400 dân; offline 1h/24h/14d |
| 1 | AutoAssign count/index, Crowd person index, tránh tính stats vì UI-only state | Deep state equality; phân công không vượt slot; heap allocation và UI profile trước/sau |
| 2 | Dirty dependencies và cache navigation | Hit/miss, BFS expansions, CPU/heap; ma trận fog/bridge/wall/flood/depletion; cache vẫn bounded |
| 3 | Tách subscriber UI, cache nền/render ordering | Browser profile desktop/mobile, frame p50/p95, long task, input latency, ảnh/picking ở bốn rotation |
| 4 | Scheduler lai chạy song song oracle ở test | Toàn bộ state/RNG/receipt khớp cho tick liền mạch, chia lát bất kỳ, serialize/resume và command xen kẽ |
| 5 | Worker client và tối ưu backend theo số đo | Long task giảm; bytes sync; CAS/retry; DB p95; combat reconnect/load test |

Các chỉ số cần theo dõi: CPU trên mỗi giờ game, tick/lát, heap sau GC, clone
ms/bytes, BFS expansions, số lần rebuild, request/DB write mỗi phiên, response
bytes, CAS conflict, recovery 202/503 và thời gian hoàn tất. Không dùng FPS
trung bình hoặc homepage HTTP 200 để kết luận toàn hệ thống đã tối ưu.

Chưa chạy build/type-check vì audit không sửa executable code. Chưa đo DB,
production, trình duyệt thật hoặc làng người chơi. Những hạn chế này cần được
đóng bằng số đo trước khi chốt mục tiêu cải thiện hoặc triển khai hạ tầng.
