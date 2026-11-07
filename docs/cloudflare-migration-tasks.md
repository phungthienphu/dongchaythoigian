# Task breakdown — đồng bộ 10 giây và backend làng

Đọc [kế hoạch tổng thể](./cloudflare-migration-plan.md) trước. Đây là description
để tạo ticket triển khai; **chưa phải danh sách chức năng đã hoàn thành**.
Tiến độ cập nhật ở bảng trong kế hoạch tổng thể; bằng chứng và phần còn thiếu ở
[sync-release.md](./sync-release.md), [sync-baseline.md](./sync-baseline.md).
Mỗi task code cần commit riêng, báo rõ local / staging / production và bằng chứng.
Không dùng tài khoản production để thử phá dữ liệu hoặc replay lệnh có tác dụng ghi.

## T00 — Baseline và bộ workload tái hiện được

**Mục đích:** biết tải nào đang tiêu CPU, tạo phép so sánh trước/sau có cùng đầu vào.
**Phạm vi:** đo riêng online action, refresh, offline catch-up và sự kiện nhiều làng;
không thay đổi gameplay hay migration dữ liệu.

**Công việc:**
- Chốt commit, deployment, môi trường, múi giờ và cửa sổ đo. Thu baseline Production
  24 giờ nếu còn quota; dùng replay kiểm soát khi không thể chờ đủ traffic.
- Tạo fixture tổng hợp: làng mới; làng 50/200 dân; nhiều kho; thiếu đường; kho đầy;
  1 phút/1 giờ/24 giờ offline; chuỗi thao tác dày và thưa; chợ, sứ giả và combat.
- Đo CPU server thật trong benchmark, số DB read/write, byte snapshot, retry,
  request/batch, ACK latency; báo riêng wall time. Telemetry ghi tổng theo batch,
  không thêm một DB upsert cho mỗi lệnh con chỉ để phục vụ dashboard.
- Chốt tải chuẩn theo phiên chơi, người đồng thời và lệnh/giờ; thêm tải giờ cao
  điểm gấp đôi. Không chỉ lấy số user đăng ký làm tải thử.

**Hoàn thành khi:** fixture/runner chạy không cần production; có bảng baseline và
công thức quy đổi free; đủ dữ liệu để giải thích từng nhóm CPU; không lưu email,
cookie, token hoặc snapshot riêng tư trong repo/log công khai.
**Kiểm thử:** chạy cùng fixture ba lượt sau warm-up; lưu median và độ dao động.
**Phụ thuộc:** không. **Dừng/rollback:** đo lỗi thì bỏ số đo, không kết luận giảm CPU.

## T01 — Kiểm kê mọi nơi ghi và chốt giao thức đồng bộ

**Mục đích:** tránh tối ưu riêng API action trong khi chợ/cron vẫn ghi đè làng.
**Công việc:**
- Liệt kê nơi đọc/ghi `City`, tài nguyên, quân, dân, khám phá, thuyền, revision và
  outbox. Tối thiểu: `lib/city-store.ts`, `lib/war.ts`, `lib/market.ts`,
  `lib/diplomacy.ts`, world/envoy, tạo làng, callbacks và reconcile.
- Chốt request/response batch: session version, engine version, base revision,
  sequence liên tục, command IDs, kết quả từng lệnh và ACK cao nhất đã lưu.
- Định nghĩa timestamp dựa trên anchor server, cửa sổ nhận lệnh, điểm chốt combat,
  xử lý checkpoint đã tiến trước lệnh chờ; cấm rewind checkpoint đã commit.
- Chốt lỗi có thể retry, lỗi kết thúc lệnh, giới hạn payload/rate, tuổi hàng đợi,
  chính sách khi đổi engine/phiên và khi IndexedDB không khả dụng.
- Vẽ state machine: queued → sending → persisted/rejected/uncertain; uncertain
  hỏi trạng thái server trước khi áp dụng lại. Thiết kế một tab gửi mỗi phiên.

**Hoàn thành khi:** có đặc tả và ví dụ request/response cho thành công, trùng, mất
ACK, revision xung đột và bị đánh giữa batch; mọi nơi ghi có owner/adapter dự kiến;
không còn câu hỏi chưa chốt về thời gian lao động hoặc chống trừ tiền hai lần.
**Kiểm thử:** review từng luồng hiện có theo bảng writer inventory và scenario.
**Phụ thuộc:** T00. **Rollback:** chưa có thay đổi runtime.

## T02 — Một phiên chơi hoạt động cho mỗi tài khoản

**Description:** đăng nhập mới thay phiên cũ; máy cũ không được gửi HTTP mutation
hoặc lệnh combat. Đăng xuất máy cũ không được ngắt phiên mới. Các tab cùng browser
là cùng một phiên; phối hợp sequence nhiều tab thuộc T03.

**Hiện trạng:** code commit `5076aa7`, đã có 35 kiểm thử liên quan qua và build qua.
Chi tiết kỹ thuật: [single-session.md](./single-session.md). Chưa coi là nghiệm thu
OAuth production. Code web đã phát hành đến `7ced7e9`; HTTP/Worker thật local đã
kiểm tra thay phiên chặn cả socket đang mở. Worker đã deploy version
`9e73ae84-83a0-4e73-81de-0c90f814ef09` (gồm sửa cleanup close); probe không quyền tại
`/rooms/player-release-probe/session` trả **401**, router mới đã nhận endpoint.
OAuth takeover trên hai browser thật và quyền WebSocket cũ vẫn cần QA.

**Hoàn thành khi:**
- Worker và web dùng phiên bản tương thích; endpoint phiên từ chối người không
  có quyền; cookie cũ cần đăng nhập lại nhưng không mất làng.
- Hai trình duyệt thật: B đăng nhập thì A bị khóa; A không điều quân được dù giữ
  WebSocket cũ; A logout không làm B mất phiên.
- Login đồng thời, Worker tạm lỗi và logout retry được kiểm tra; không phát sinh
  polling mỗi giây hoặc gọi Vercel trên mỗi lệnh combat để xác thực phiên.

**Kiểm thử:** unit auth/queue, Worker harness, Google OAuth hai trình duyệt và một
trận thử được phép dùng; không giả mạo tấn công tài khoản thật.
**Phụ thuộc:** không. **Rollback:** quay cả web/Worker về cặp tương thích; thông báo
rằng rollback về bản cũ sẽ bỏ chính sách một phiên. Không reset dữ liệu game.

## T03 — Client gom lệnh 10 giây, lưu hàng đợi và phản hồi ngay

**Description:** thay gửi từng action ngay bằng hàng đợi bền vững; gameplay vẫn
phản hồi ngay theo optimistic engine hiện có.

**Công việc:**
- Mở rộng `lib/optimistic-city.ts` và kết nối `components/Game.tsx`; deadline tính
  từ lệnh đầu, không debounce kéo dài mãi khi người chơi bấm tiếp.
- Giới hạn ban đầu 32 lệnh/batch và 256 KiB JSON; đo lại bằng fixture. Đủ giới hạn
  thì flush sớm, chia gói theo thứ tự; không âm thầm bỏ lệnh hay gửi snapshot client.
- Ghi IndexedDB trước khi báo đã nhận bền vững trên máy. Khi lỗi ghi, hiện rõ và
  chuyển chế độ gửi ngay; không giả vờ đã lưu. Queue có giới hạn số/byte/tuổi.
- Phục hồi khi reload, online hoặc foreground; không phụ thuộc `beforeunload`.
- Phối hợp nhiều tab bằng Web Locks/BroadcastChannel và cơ chế tương đương khi
  không được hỗ trợ. Chỉ một tab cấp sequence/gửi; tab khác xem hoặc tiếp quản.
- Thêm flush barrier cho chợ, xuất quân, envoy và chuyển trạng thái combat;
  tách local acceptance khỏi Promise đợi ACK để không khóa nút suốt 10 giây.
- Hiện “Chờ lưu / Đang đồng bộ / Đã lưu / Mất kết nối”, xử lý lệnh bị từ chối rõ ràng.

**Hoàn thành khi:** hành động hợp lệ phản hồi P95 <=100 ms trên thiết bị thử; batch
được gửi tối đa sau 10 giây khi tab chạy bình thường; idle không gửi batch rỗng;
crash/reload không làm mất lệnh đã ghi local; không gửi lại lệnh phiên cũ sau login
mới; đóng/mở nhiều tab không gây nhân đôi hoặc thiếu sequence.
**Kiểm thử:** fake clock, IndexedDB failure, mất ACK, reload, nền điện thoại,
reconnect, hai tab, phiên bị thu hồi, tương tác chợ/combat giữa deadline.
**Phụ thuộc:** T01, T02 và API T04 để QA tích hợp.
**Rollback:** tắt độ trễ bằng `CITY_BATCH_ENABLED=false`; tiếp tục queue/API batch
và gửi ngay, giữ IDs/sequence/receipt. Không hạ bundle về API cũ khi còn lệnh
uncertain; không xóa queue khi bật/tắt flag. Chi tiết trong runbook.

## T04 — Batch API, giảm xử lý lặp và ghi dữ liệu khi đọc

**Description:** một batch làm một lượt xác thực/load/version check và một commit
thay vì lặp toàn bộ cho từng lệnh; giảm refresh và serialize snapshot không cần.

**Công việc:**
- Triển khai API batch theo T01: kiểm tra payload trước tính toán; xử lý tuần tự,
  kết quả từng lệnh, version CAS/transaction thích hợp; ACK chỉ sau durable commit.
- Dedupe bằng session + sequence; retry sau mất response không trừ/cộng lại. Nếu
  receipt chi tiết đã compact thì dùng high-water ACK để ngăn thực thi lại.
- Tính engine theo timeline đã chốt, settle cuối batch; không settle tới giờ nhận
  gói rồi mới cố áp lệnh thuộc 10 giây trước đó.
- Tách query đọc làng khỏi luồng mutation. Sự kiện/outbox, discovery, migration hay
  checkpoint cần lưu phải có owner xử lý riêng, không bị mất vì bỏ ghi trong GET.
- Không tính lại toàn bộ offline catch-up cho mỗi GET. Cache/checkpoint có giới
  hạn byte, revision invalidation và ownership check; cache không là nguồn chính.
- Gộp refresh trùng, chỉ tải dữ liệu khi cần; dùng revision/ACK và dữ liệu thay đổi
  nếu có lợi. Có full checkpoint cho reconnect; không coi HTTP 304 là miễn phí CPU.
- Tổng hợp telemetry theo batch và đếm lệnh con riêng trong bộ đếm, tránh thêm N
  ghi thống kê cho N lệnh đã được gom.

**Hoàn thành khi:** mỗi batch thành công thường có một lần load/save làng; duplicate
không mutation; GET không ghi lại full city chỉ vì người dùng mở/refresh; các sự
kiện gameplay vẫn tới hạn đúng; fixture kết quả tương đương bản cũ; có số CPU,
DB ops và byte trước/sau cho chuỗi thao tác dày lẫn thưa.
**Kiểm thử:** API contract, CAS conflict, partial rejection, lost response, timeline,
GET đồng thời mutation, outbox pending và cặp T03/T04 trên browser.
**Phụ thuộc:** T01, T02. **Rollback:** API cũ vẫn đọc được schema; rollback delay
như T03, tiếp tục nhận in-flight batch. Hạ code cũ cần đối chiếu hết queue trước.

## G-A — Gate sau tối ưu kiến trúc hiện tại

**Description:** chạy workload T00 trên bản Chặng A; so cùng tải và công bố mức
giảm thật. Tách online commands khỏi offline catch-up nhưng vẫn tính tổng bill.

**Đạt khi:** không có sai lệch gameplay/dữ liệu, đạt tiêu chí ổn định và CPU quy
đổi <=2 giờ/tháng riêng game, team còn quota phù hợp. Theo dõi ít nhất 48 giờ,
không lấy một giờ ít người làm kết luận. Nếu đạt thì chốt dự án tại Chặng A.
**Nếu chưa đạt:** ghi endpoint/công việc còn tốn, số CPU cần giảm và chuyển gate
Chặng B; không hứa giảm bằng cách bỏ tính năng. Prototype T05 chưa cho phép
chuyển user production trước G-B.

## T05 — Prototype Village Durable Object và kiểm chứng hạn mức free

**Description:** chạy engine làng trong DO SQLite với dữ liệu tổng hợp, chưa nhận
quyền ghi production và không sửa cơ chế combat hiện tại.

**Công việc:**
- Tạo namespace/class thử tách khỏi `BattleRoom`; handler Worker chỉ xác thực và
  định tuyến, không tự chạy engine nặng ở lớp router.
- Handler DO load checkpoint, áp batch, persist checkpoint/ledger/ACK trước trả
  lời; restart khôi phục từ storage, không phụ thuộc biến trong RAM.
- Dùng hibernation; không giữ interval khi làng rảnh. Alarm chỉ cho sự kiện cần
  phát sinh ngoài tương tác; tiến triển thường tính bù theo engine.
- Đo CPU limit của Worker và DO riêng, duration, storage size, rows và alarm;
  xác minh limits trên account thực. Không áp nhầm 10 ms của Worker lên DO.
- Thử fixture lớn nhất, offline dài, payload xấu và gấp đôi peak; đo cả quota
  combat đang dùng chung, tránh kết luận “chuyển sang Cloudflare là miễn phí”.

**Hoàn thành khi:** engine cho kết quả tương đương; mọi state đã ACK sống qua
restart; idle đủ điều kiện ngủ; tải chuẩn <=50% và stress <=80% từng quota free;
không phát sinh settle/callback Vercel cho mỗi batch để thay cho DB trực tiếp.
**Kiểm thử:** Wrangler local + namespace thử, eviction, storage exception, CPU
stress và báo cáo duration/rows/requests thực. Không dùng namespace production
để phá thử. **Phụ thuộc:** T00, T01. **Rollback:** bỏ prototype/flag, production giữ nguyên.

## T06 — Một nơi có quyền ghi, bộ định tuyến và migrator

**Description:** chuyển từng làng mà không có hai bản cùng nhận lệnh.

**Tiến độ local:** đã có preflight không mutation, envelope/checksum và runner
Mongo snapshot chỉ đọc, 6 test qua. Xem [village-preflight.md](./village-preflight.md).
Chưa có ownership router, bàn giao owner hoặc import; không coi T06 đã hoàn thành.

**Công việc:**
- Metadata ownership: backend hiện tại, engine/schema version, epoch/fence,
  revision và trạng thái `mongo → migrating → durable-object`.
- Tất cả writer trong T01 phải đi qua ownership router hoặc từ chối ghi nếu
  không còn owner. Chỉ một cờ trên frontend không đủ chống cron/callback cũ.
- Export nhất quán từ Mongo, chuẩn hóa/checksum, lưu DO, kiểm tra, rồi mới đổi
  owner. Request đang chạy dùng fence/version không được commit sau bàn giao.
- Migrator có dry-run, resume và nhật ký không chứa payload riêng tư; thất bại
  trước chuyển owner giữ Mongo là chính, không reset làng hay sinh lại địa hình.
- Projection đọc/leaderboard có revision và độ trễ công bố; không ghi ngược vào DO.

**Hoàn thành khi:** dry-run không mutation; migration retry không đổi tài nguyên;
không có writer cũ commit được sau fence; đủ checksum và log để chứng minh làng
trước/sau giống nhau; làng có chợ/hành quân/trận đang hoạt động được hoãn hoặc
chuyển bằng quy tắc đã kiểm thử, không tự bỏ các trạng thái đó.
**Kiểm thử:** dừng tiến trình ở từng bước, hai request migration đồng thời, mutation
đang chạy, DB/DO lỗi, checksum lệch và engine version khác.
**Phụ thuộc:** T01, T05; chỉ bật production sau T08–T10 và G-B.
**Rollback:** chưa đổi owner thì hủy; đã đổi owner thì theo restore T10, không chỉ
flip cờ về bản Mongo đã cũ.

## T07 — Client gọi Cloudflare trực tiếp và phục hồi kết nối

**Description:** bỏ Vercel khỏi đường truyền mỗi lệnh làng, giữ OAuth trên web.

**Công việc:** token bootstrap có chữ ký, ràng buộc account/làng/epoch/phiên và hạn
sử dụng; Worker kiểm tra quyền, origin/CORS cho HTTP và origin khi mở WebSocket;
token không xuất hiện trong analytics/log/URL chia sẻ. Thu hồi phiên áp dụng cả
village socket và battle socket. Gia hạn bình thường không gọi Vercel theo mỗi
batch hoặc polling ngắn. Có fallback về Mongo chỉ khi metadata xác nhận Mongo
còn là owner; khi DO đang là owner và lỗi, báo đang nối lại thay vì ghi bản Mongo.

**Hoàn thành khi:** network trace chứng minh batch đi trực tiếp Worker; giả mạo
làng/phiên/token hết hạn bị chặn; mất kết nối không ghi sai backend; reconnect
khôi phục ACK/revision; không có token trong telemetry; T03 vẫn chạy cùng giao thức.
**Kiểm thử:** hai browser, expiry, takeover, CORS/origin không hợp lệ, reconnect
burst, mạng di động và hidden/foreground.
**Phụ thuộc:** T02, T03, T05. **Rollback:** ngừng thêm user DO; user đã chuyển vẫn
đọc/ghi owner hiện tại hoặc rollback dữ liệu theo T10.

## T08 — Giao dịch nhiều làng: chợ, sứ giả và chiến tranh

**Description:** không còn transaction chung khi tài nguyên của hai làng ở hai
backend/DO khác nhau. Cần điều phối bền vững trước khi cho user thật chuyển.

**Công việc:**
- Có operation ID, reservation/escrow, state machine, inbox/outbox và retry chống
  trùng. Chọn và ghi rõ coordinator/state owner cho từng loại tương tác.
- Chợ: đăng/hủy/mua, hàng và tiền ký gửi, kho đầy, giao nhận, trả hộ tống, cướp,
  hủy/hoàn tiền. Không chuyển tài sản hai lần khi callback mất ACK.
- Chiến tranh: giữ quân/thuyền/lương, xuất quân, điểm chốt làng bị đánh, snapshot
  phòng thủ, kết quả, cướp, thương vong và quân về. Không có server lock vô thời hạn.
- Ngoại giao: sứ giả đến/về, thông báo và chia sẻ vị trí; không ghi discovery vào
  bản Mongo đã không còn owner. Danh sách bạn bè/vị trí vẫn đúng quyền xem.
- Kiểm tra đủ bốn cặp owner: Mongo–Mongo, Mongo–DO, DO–Mongo, DO–DO. Ban đầu có thể
  trì hoãn migration làng đang có giao dịch, nhưng không được khóa mất tính năng
  sau khi làng đã được chuyển.

**Hoàn thành khi:** bảo toàn tiền/hàng/quân cho tất cả scenario; thao tác lỗi có
kết quả hoặc compensation cụ thể; scheduler khôi phục được operation sau restart;
combat trực tiếp vẫn ra lệnh được, không đổi balance hay thời gian vận chuyển;
không còn writer bypass ownership router trong bảng T01.
**Kiểm thử:** kill tại mọi bước reserve/commit/deliver/refund, duplicate callback,
đảo thứ tự, participant offline, mất mạng coordinator và kho đầy.
**Phụ thuộc:** T04, T06, T07. **Rollback:** hoàn tất/compensate operation đang dở;
không xóa escrow hoặc chạy lại các khoản đã commit.

## T09 — Scheduler theo sự kiện, giảm cron quét hệ thống

**Description:** thay việc gọi Vercel mỗi phút bằng lịch sự kiện thực sự đến hạn.
**Công việc:** job ID bền vững, due time, inbox/outbox, alarm và backoff có giới hạn;
khôi phục được khi callback lỗi. Cron cũ chỉ xử lý owner/job chưa chuyển; health
sweep ít tần suất, có giới hạn công việc, không settle toàn bộ làng khi không cần.
Sự kiện kho đầy không được tạo retry nóng. Lập lịch lại theo thay đổi state hoặc
backoff đã chốt, giữ khả năng nhận hàng sau khi có chỗ.

**Hoàn thành khi:** idle không còn cuộc gọi Vercel mỗi phút chỉ để hỏi có việc
không; alarm trùng không giao hàng/kết thúc trận hai lần; job bị trễ được phục hồi;
trễ sự kiện P95 không tệ hơn cron hiện tại và có số đo; CPU giảm không đánh đổi
bằng mất noti, mất tiến triển offline hoặc bỏ đối soát.
**Kiểm thử:** alarm trùng/muộn, crash, deploy giữa chuyến đi, blocked convoy, clock
boundary, sự kiện cùng lúc và user offline nhiều ngày.
**Phụ thuộc:** T06, T08. **Rollback:** chỉ bật lại processor cũ cho job nó có quyền
xử lý; không cho hai scheduler cùng thực thi khoản giao nhận.

## T10 — Backup, restore, rollback và thay đổi engine

**Description:** chứng minh dữ liệu có thể khôi phục, không chỉ chứng minh có bản sao.
**Công việc:**
- Chọn nơi backup và đo chi phí; không gọi Vercel ghi full city mỗi 10 giây để
  backup. Nếu dùng dịch vụ mới, ghi rõ quyền truy cập và cấu hình cần tạo.
- Giữ checkpoint + command/event ledger đủ để khôi phục state đã ACK; backup
  theo chu kỳ và trước migration; có checksum/schema/epoch và retention hữu hạn.
- Tách restart DO (không được mất ACK) với khôi phục mất storage/sai logic. Nếu
  chấp nhận mất tối đa một khoảng dữ liệu khi mất cả storage thì phải xin quyết
  định rõ trước release; mặc định chưa chấp nhận bỏ state đã ACK.
- Export/restore lại Mongo phải mang state mới nhất, revision, escrow, outbox,
  job và session fence; không quay về snapshot trước migration.
- Deploy engine có version gate, nâng schema có đường đi và rollback compatibility;
  queue client cũ không được áp bằng luật engine mới một cách âm thầm.

**Hoàn thành khi:** diễn tập backup/restore trên namespace thử, state và ledger
khớp; có thời gian khôi phục đã đo, mục tiêu <=30 phút cho cohort canary; không
mất state đã ACK trong tình huống crash/restart và rollback đã cam kết; có runbook
đủ để người khác thực hiện mà không phải sửa tay số dư.
**Kiểm thử:** storage corruption mô phỏng, thiếu backup, sai checksum, version
không tương thích, rollback sau giao dịch nhiều làng và sau combat kết thúc.
**Phụ thuộc:** T06, T08, T09. **Rollback:** dừng migration nếu restore drill không đạt.

## G-B — Gate trước canary Cloudflare

**Đạt khi:** T05–T10 đủ bằng chứng; toàn bộ tiêu chí tính đúng, độ ổn định và ngân
sách ở tài liệu tổng thể đạt; kiểm tra startup/restart, hai máy, multi-tab, combat,
chợ và kho đầy trên môi trường thử; không có lỗi nghiêm trọng chưa xử lý.
**Không đạt:** giữ Mongo làm owner production. Không dùng dữ liệu người chơi thật
để thay cho test giao dịch và restore còn thiếu.

## T11 — Canary có thể dừng và rollback

**Description:** chuyển nhóm nhỏ có kiểm soát, không chuyển toàn bộ tài khoản ngay.
**Công việc:** bắt đầu 1 làng thử được chủ dự án chỉ định, rồi nhóm tối đa 5 làng
đồng ý thử; tiếp theo tối đa 10% làng hoạt động. Ghi rõ cohort/deployment/time;
so với cohort chưa chuyển có mức hoạt động tương đương. Theo dõi >=48 giờ và có
ít nhất 24 giờ đủ các luồng; kiểm chứng restore trước khi tăng cohort.

**Hoàn thành khi:** không mất/nhân đôi dữ liệu; người chơi xác nhận thao tác vẫn
mượt; CPU/DB/CF nằm trong budget ở tải đủ đại diện; có báo cáo bao gồm cả chi phí
mới, không chỉ biểu đồ Vercel đã giảm. Nếu traffic thấp phải bổ sung workload T00.
**Stop trigger:** bất kỳ sai lệch tài sản/quân, hai owner ghi cùng lúc, ACK mất qua
restart, 5xx/timeout >=0,1%, hoặc vượt budget stress/không còn headroom.
**Phụ thuộc:** G-A kết luận cần Chặng B và G-B đạt.
**Rollback:** dừng tăng cohort, fence làng lỗi, hoàn tất/compensate operation rồi
restore theo T10; không tự trả về bản Mongo cũ.

## T12 — Mở rộng có kiểm soát và nghiệm thu

**Description:** tăng cohort từng đợt sau khi canary đạt; gỡ đường ghi cũ chỉ khi
không còn owner/job cần nó. Giữ khả năng đọc backup trong thời hạn đã chốt.
**Công việc:** dashboard usage theo ngày/môi trường; cảnh báo nội bộ ở 50/70/85%
hạn mức; giới hạn payload/rate cho abuse mà không chặn chơi bình thường; runbook
quota, rollback và deploy; đếm ngân sách cả team Vercel và cả account Cloudflare.
Không tự mua/nâng gói. Nếu free không đáp ứng tải yêu cầu thì báo lựa chọn và số tiền.

**Hoàn thành khi:** đạt mục 6 của kế hoạch tổng thể; sau đợt mở rộng cuối có ít
nhất 7 ngày theo dõi đủ tải; hai báo cáo trước/sau có provenance; phiên bản code,
deploy, DB owner và runtime được đối chiếu; tài liệu vận hành và rollback bàn giao;
không còn công việc bắt buộc chỉ nằm trong ghi chú chat.
**Phụ thuộc:** T11. **Rollback:** dừng tăng cohort, quay về cohort trước hoặc phục
hồi owner theo T10; không bỏ gameplay hoặc giảm tốc tài nguyên để làm đẹp số CPU.
