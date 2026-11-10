# Spec zombie — sinh tồn, bệnh dịch và phá hủy công trình

Ngày cập nhật: 11/11/2026. Trạng thái: **nền tảng đã phát hành, xem phạm vi và phần chưa hoàn thiện tại `zombie-release-2026-11-11.md`**. Đây là nguồn luật zombie duy nhất cho mọi đời 1–9; `eras-7-9-spec.md` dẫn chiếu tài liệu này. Giá và chỉ số là baseline cần mô phỏng/chơi thử, không phải cân bằng đã xác nhận.

## 1. Luật đã chốt

- Có zombie từ **thời Đồ đá**. Làng mới chỉ có **5 phút chuẩn bị**, không phải một giờ.
- Trồi ngẫu nhiên tại một ổ trên map, kể cả bên trong thành. Báo đất nứt **60 giây trước khi trồi**.
- Dân càng đông → số lượng mỗi đợt tăng **và** khoảng cách đợt giảm. Không phụ thuộc số lần đăng nhập.
- Zombie đi trên mặt đất; bị tường/cổng chặn, có thể phá vật cản rồi đi qua. Không xuyên nhà, bay hoặc bơi qua sông.
- Cắn dân gây thương tích và có thể lây bệnh. Có thể giết dân, lính và phá mọi công trình, kể cả kho/Đình/kỳ quan.
- **Công trình bị zombie phá hủy mất hẳn, không sửa được; phải trả phí xây mới và nâng lại.** Phép không được hồi hoặc tái tạo công trình để lách luật này.
- Có **3 loại**: thường từ Đá, **Super Zombie từ Trung đại (4), ngay sau Sắt**, phá hoại từ Công nghiệp (5). Super chạy nhanh và nhiều HP hơn con thường, không thay vai trò phá thành.
- Lính và tháp là nền bảo vệ; trú dân, y tế và sau này ma pháp hỗ trợ. Người chơi bố trí đúng phải có thể phòng thủ offline.

## 2. Thời điểm và lịch đợt

### 2.1. Kích hoạt

| Loại làng | Mốc bật luật `activatedAt` | Cảnh báo ổ đầu | Zombie đầu trồi |
|---|---|---|---|
| Làng mới sau phát hành | Tạo làng thành công ở server | +4 phút | +5 phút |
| Làng đã tồn tại | Server xác nhận lần đầu người chơi nhận thông báo luật mới | +4 phút | +5 phút |

Ghi mốc đúng một lần; reload/đổi máy không gia hạn. Không tính zombie vào khoảng offline trước mốc bật luật. Thông báo save cũ phải có luật mất nhà và đếm ngược, không âm thầm kích hoạt từ ngày deploy khiến người quay lại mất làng chưa biết lý do.

### 2.2. Công thức theo dân

`P = max(số dân còn sống trong 6 giờ gần nhất kể từ activatedAt)`.

- Tính cả dân bệnh/gục còn cứu được; không tính người đã chết, quân, robot, linh thú hay sứ giả suất riêng. Nếu runtime có dân tạm vắng thì vẫn tính khi họ còn thuộc làng, không né bằng chuyển việc/hành trình.
- Giữ lịch sự kiện dân số có timestamp để tính P tương đương online/offline. Khi dân giảm, đỉnh cũ hết hiệu lực sau đúng 6h; không giữ áp lực cao vĩnh viễn.
- Khoảng cách: **`I(P) = max(15, 60 − 5 × floor(P / 100))` phút**.
- Số lượng: **`N(P) = max(1, ceil(P / 40))`**.
- Đợt đầu cố định ở phút 5, chốt P/N/thời làng khi đợt tới hạn. Sau đó `nextAt = waveAt + I(P)`; thay dân không kéo sớm/muộn mốc đã hẹn. UI hiện P hiện tại và dự báo, số thực chốt tại spawn.

| P | Cách đợt | Số/đợt | Tổng/giờ trung bình |
|---:|---:|---:|---:|
| 3–40 | 60 phút | 1 | 1 |
| 100 | 55 phút | 3 | 3,27 |
| 180 | 55 phút | 5 | 5,45 |
| 300 | 45 phút | 8 | 10,67 |
| 450 | 40 phút | 12 | 18 |
| 650 | 30 phút | 17 | 34 |
| 850 | 20 phút | 22 | 66 |
| 1.100 | 15 phút | 28 | 112 |

Không đặt trần N cố định khiến làng đông hơn được miễn phần tăng. Không nhân HP/sát thương theo P lần nữa; thời đại chỉ quyết định loại và cấp chỉ số. UI báo trước ngưỡng tăng N mỗi 40 dân và giảm I mỗi 100 dân. Các bước nhảy và cửa sổ 6h là baseline cần thử phản ứng người chơi.

## 3. Sức mạnh chi tiết

### 3.1. Zombie thường

| Giai đoạn làng | HP/con | Sát thương mỗi đòn | Nhịp | DPS khi bám mục tiêu | Tốc độ | Tầm cận chiến | Lây bệnh/đòn cắn dân |
|---|---:|---:|---|---:|---|---|---:|
| Đá–Đồng (1–2) | 25 | 2 | 2 giây | 1 | 0,25 ô/giây | 1,1 ô | 10% |
| Sắt–Trung đại–Công nghiệp (3–5) | 55 | 5 | 2 giây | 2,5 | 0,30 ô/giây | 1,1 ô | 10% |
| Hiện đại–Thức tỉnh–Nguyên tố–Thần thoại (6–9) | 90 | 8 | 2 giây | 4 | 0,35 ô/giây | 1,1 ô | 10% |

Dân có 100 HP. Nếu đứng yên không được cứu/chữa/che chắn: một zombie tương ứng cần **50 / 20 / 13 đòn** để làm dân gục. Với đòn đầu sau đủ wind-up 2 giây, thời gian là **100 / 40 / 26 giây** từ lúc vào tầm. Không gồm thời gian đi tìm dân.

Một lính gậy hiện có 20 HP và `atk=4` trong cấu hình; zombie Đá cần 10 đòn để hạ nếu lính không đánh trả. Không suy từ đó ra chắc chắn thắng/thua: runtime quân thường đang có cách tính sát thương theo thời gian, phải dùng mô phỏng chung để kiểm chứng 1v1 và can thiệp nhiều lính.

### 3.2. Zombie phá hoại

Mở từ **thời Công nghiệp (5)**. Số phá hoại là `floor(N / 5)`, thay con thường, không cộng ngoài N. Phân bổ đồng thời với Super theo mục 3.4; thời Trung đại đã có Super, không còn toàn zombie thường.

| HP | Đòn vào dân/quân | Đòn vào công trình | Nhịp | DPS công trình | Tốc độ | Tầm | Lây bệnh |
|---:|---:|---:|---|---:|---|---|---|
| 240 | 12 | 24 (×2) | 2,5 giây | 9,6 | 0,25 ô/giây | 1,1 ô | 10% nếu cắn dân |

Phá hoại ưu tiên mở tường/cổng và đánh nhà, không có giáp/kháng phép/miễn đạn mặc định. Không có zombie bay, đào xuyên thành, bắn xa hay nổ tự sát ở v1. Ba vai trò tách biệt: thường gây sức ép số đông, Super truy đuổi nhanh, phá hoại mở thành. Không cho Super thêm hệ số phá nhà ×2.

### 3.3. Super Zombie — từ sau thời Sắt

Mở **từ Trung đại (thời 4)**, không xuất hiện ở thời Sắt (3). Dáng cao lớn, tay dài, chạy lao tới với bước chân rõ; khác con phá hoại nặng nề, chậm chạp. Stat chốt theo thời làng lúc đợt sinh, lên đời giữa đợt không tự nâng zombie còn sống.

| Giai đoạn | HP | Đòn vào lính/nhà | Nhịp với lính/nhà | DPS với lính/nhà | Tốc độ | Tầm | Lây bệnh |
|---|---:|---:|---|---:|---|---|---|
| Trung đại–Công nghiệp (4–5) | 160 | 6 | 1,5 giây | 4 | 0,80 ô/giây | 1,1 ô | 10% mỗi cú cắn dân |
| Hiện đại–Thần thoại (6–9) | 260 | 10 | 1,5 giây | 6,67 | 0,90 ô/giây | 1,1 ô | 10% mỗi cú cắn dân |

- So con thường cùng thời: HP khoảng **2,9 lần**, tốc độ **2,6–2,7 lần**. Đe dọa chính là rút ngắn thời gian dân chạy trú và lính tới cứu; không thêm teleport/lướt xuyên tường hoặc tốc độ bùng phát vô hạn.
- Với dân, Super dùng đòn riêng: **3 HP/2 giây** ở thời 4–5, **4 HP/2 giây** ở thời 6–9. Dân 100 HP chịu liên tục một Super sẽ gục sau khoảng **68/50 giây**. Tối đa hai zombie chọn cắn cùng một dân; lây bệnh 10% mỗi đòn. Sát thương với lính và nhà giữ bảng trên.
- Đòn đánh nhà không có bonus phá thành. Con phá hoại vẫn mạnh hơn khi đập tường (24 mỗi 2,5 giây), dù Super nhiều HP và chạy nhanh hơn ở đời muộn.
- Ưu tiên quân đang chắn/đánh trong 2 ô → dân có đường tới trong 12 ô → quân tầm xa có đường tới trong 12 ô → nhà/vật cản gần nhất. Không vượt hàng cận chiến để tự đánh pháp sư phía sau; cùng mức chọn đường ngắn rồi ID.
- Không kháng tên/đạn/phép, không miễn chậm, không hồi HP và không có sát thương diện. Tường phân khu, lính chặn, tập trung hỏa lực và Trói rễ là đối trọng; không buộc có phép từ đời 4 mới bảo vệ được dân.
- Cùng luật cổng, góc tường kín, slot cận chiến, tuổi đợt 15 phút và bệnh như zombie thường. Không tăng tỷ lệ lây để cộng thêm một tầng khó ngoài tốc độ/HP.

### 3.4. Thành phần một đợt — tổng vẫn bằng N

Chốt thành phần khi spawn, không roll lại theo reload:

- Thời 1–3: `super = 0`, `breaker = 0`.
- Từ thời 4, nếu `N >= 2`: `super = max(1, floor(N / 6))`. Nếu `N = 1`: chỉ thay bằng 1 Super ở mỗi đợt có `waveIndex % 3 = 0`, đợt khác là thường; waveIndex bắt đầu 1 từ kích hoạt và không reset khi lên đời.
- Từ thời 5: `breaker = floor(N / 5)`, trước đó bằng 0.
- `normal = N − super − breaker`. Với các công thức trên luôn không âm; không sinh thêm ngoài N. Tất cả loại cùng ổ và chia chung hàng chờ trồi. Xếp xen kẽ thường → Super → thường → phá hoại, bỏ qua loại đã hết, để loại đặc biệt không luôn bị mất khi ổ thiếu chỗ.

| Thời / P minh họa | N | Thường | Super | Phá hoại |
|---|---:|---:|---:|---:|
| Sắt / 100 dân | 3 | 3 | 0 | 0 |
| Trung đại / 180 dân | 5 | 4 | 1 | 0 |
| Công nghiệp / 300 dân | 8 | 6 | 1 | 1 |
| Hiện đại / 450 dân | 12 | 8 | 2 | 2 |
| Đời 7–8 / 650 dân | 17 | 12 | 2 | 3 |
| Đời 8–9 / 850 dân | 22 | 15 | 3 | 4 |
| Đời 9 / 1.100 dân | 28 | 19 | 4 | 5 |

Đây là ví dụ dân số, không ép làng phải đạt đúng dân mới mở loại. Điều kiện loại chỉ theo thời; số lượng theo P. UI cảnh báo có Super trước khi xác nhận lên Trung đại và trong báo trước từng đợt.

### 3.5. Quy tắc sát thương

- Bảng zombie là **sát thương/đòn**, không phải DPS. Công thức: `damage = damagePerHit × hệ số công trình nếu có × hệ số nhận sát thương`; không nhân thêm số giây cooldown.
- Quân/tower hiện có dùng cấu hình chung, không ép `atk` của quân thành damage/đòn nếu engine hiện tính DPS. Khi thêm zombie phải chuẩn hóa adapter và có test đối chiếu, tránh ×2 hoặc ×2,5 ngoài ý muốn.
- Cả ba loại zombie không có chí mạng, hụt đòn, hút máu hoặc sát thương diện. Chỉ gây một đòn cho một mục tiêu; một con không cắn dân và đánh nhà cùng tick.
- Bắt đầu đòn sau đủ wind-up bằng nhịp đòn. Mục tiêu rời tầm/chết trước hit thì hủy hit, không roll bệnh, không reset cooldown để đánh ngay mục tiêu khác.
- Tối đa 4 vị trí cận chiến quanh một ô mục tiêu, mỗi vị trí một actor cận chiến; không để 28 con chồng đúng một điểm đánh xuyên nhau. Quân tầm xa vẫn bắn theo tầm/đường bắn. Cần phân bố vị trí có thứ tự ổn định, không ưu ái client có FPS cao.
- Sát thương zombie không tăng theo số nhà, giá trị kho, thời gian làng tồn tại hay số lần người chơi quay lại.

## 4. Ổ trồi, tồn tại và chọn vị trí

1. Khi đến mốc báo trước, chọn một ô hợp lệ từ seed làng + chỉ số đợt, tập ứng viên sắp ID cố định. Lưu seed, ô và mốc; không roll lại do reload.
2. Ô hợp lệ: đã khám phá, đất đi được, không công trình/blueprint, không dân/quân đang đứng, không cầu/nước/vách. Đường thường được phép. Không cố chọn gần dân nhất, cũng không tự chọn ngoài tường.
3. Sau khi báo, cấm đặt blueprint/xây/dịch chuyển công trình lên ổ đang báo. Actor đi ngang vẫn được; khi trồi nếu ô bị actor chiếm, tìm ô đất trống gần nhất trong **cùng vùng đất kết nối không xuyên tường** rồi ID. Không đưa ổ qua tường/sông vì ô cũ đông.
4. Nếu không có ô hợp lệ thì bỏ đợt và ghi lý do, không nợ đợt cho giờ sau. QA map kín để không tạo thao tác che ổ miễn phí bằng blueprint.
5. N con trồi từ một ổ: con đầu xuất tại tâm, con sau xếp vào ô kề đi được cùng vùng. Nếu thiếu chỗ, giữ hàng chờ tại ổ và ra khi trống, tối đa 60 giây. Phần không ra được hết hạn bị bỏ, ghi số thực tế; không chồng actor hoặc sinh xuyên tường.
6. Tất cả zombie của đợt tan rã tại `waveAt + 15 phút`, tính cả thời gian chờ trồi. Không làm mới tuổi bằng đổi mục tiêu/đổi thiết bị. Đợt sau tối thiểu 15 phút; giải hết hạn trước spawn cùng timestamp, tránh chồng vô hạn.

Trồi nội thành làm tổ bảo vệ theo khu vực quan trọng. Tường bao cản zombie bên ngoài; tường phân khu cản lan truyền giữa các khu. Không có vùng miễn spawn vĩnh viễn do nhà trú, phép hoặc kỳ quan.

## 5. AI, đường đi, tường và cổng

### 5.1. Ưu tiên mục tiêu

| Zombie thường | Zombie phá hoại |
|---|---|
| 1. Quân đang trực tiếp chặn/đánh trong 2 ô, để không chạy xuyên hàng lính | 1. Tường/cổng đang cản tuyến tới dân hoặc nhà |
| 2. Dân còn sống chưa gục trong bán kính phát hiện 10 ô và có đường tới | 2. Công trình gần nhất theo đường, không chỉ nhà rẻ nhất |
| 3. Nhà gần nhất có đường đánh; vật cản phá được nếu tuyến bị chặn | 3. Quân đang chặn/đánh trong 2 ô |
| 4. Không mục tiêu thì đi tới ô từng thấy mục tiêu, sau đó quanh ổ | 4. Dân gần nhất khi không nhà/vật cản hợp lệ |

Super dùng ưu tiên riêng ở mục 3.3, vẫn chịu luật lính chắn và đường đi chung. Trong cùng mức, thời 1–4 chọn đường ngắn nhất rồi ID; từ thời 5 chọn đường/đích theo mức nguy hiểm ở mục 5.3, hòa thì đường ngắn rồi ID. Giữ mục tiêu ít nhất 2 giây trừ mục tiêu chết/mất đường/có quân chắn sát người. Không đổi mục tiêu mỗi frame làm quân tuần tra chạy vô tận. Dân gục không bị zombie tiếp tục đánh trong v1; chúng đổi mục tiêu, cho cơ hội cứu hộ 10 phút.

### 5.2. Va chạm và công thành

- Dùng cùng topology đất/cầu/nhà của làng. Zombie không đi chéo qua hai góc tường kín, không đứng xuyên footprint.
- Cổng theo quyền: dân/quân nhà đi qua cổng nhà theo luật hiện có, zombie bị chặn. Nếu triển khai chế độ mở cổng công khai thì zombie cũng đi qua khi mở. Không mặc định cổng đang cho dân đi nghĩa là mở cho zombie.
- Không có đường đến dân sau tường: BFS từ vùng đang đứng để tìm mặt tường/cổng có thể tiếp cận hướng về mục tiêu; tiến tới và phá. Không giả định nhà đã vỡ để tính đường đi xuyên trước.
- Tường bị phá tạo lối ngay khi instance mất; cập nhật nav/đường dịch vụ và mục tiêu cùng transaction. Khi vách tạm phép hết hạn, xử lý tương tự; không hồi tường thật bên dưới.
- Zombie đang trên cầu khi cầu bị phá rút tới bờ gần nhất còn tiếp cận được theo cơ chế an toàn cầu hiện có; không teleport lên bờ bên kia tường. Nếu không có đường rút thì đứng chờ/tan rã hết tuổi, không tạo sát thương xuyên nước.
- Giới hạn tìm đường/tái tìm khi topology đổi; không dùng đường thẳng hoặc “tổng quân lực” để thay pathfinding lúc offline.

### 5.3. Từ Công nghiệp: biết né phòng thủ

**Từ thời Công nghiệp (5), cả thường, Super và phá hoại đều biết đánh giá nguy hiểm.** Đời 1–4 giữ AI đường ngắn, chưa có né tháp có chủ đích. Chốt chế độ AI theo thời làng khi sinh đợt; lên đời giữa đợt không đổi trí thông minh zombie đang sống.

**Nhận biết:**

- Nhận ra công trình bắn mặt đất trong 12 ô quanh mỗi zombie, quân có thể đánh nó trong 6 ô, và nguồn sát thương vừa đánh nó. Ghi nhớ vị trí/trạng thái cuối đã thấy trong 10 giây; quá hạn không tự đọc vị trí mới của quân nằm ngoài vùng cảm nhận.
- Tháp đang hoạt động tính vùng bắn/tầm/nhịp thực từ cấu hình chung. Chỉ tính phòng thủ bắn được zombie mặt đất; không sợ ụ phòng không, nhà trang trí, nhà đang xây/hỏng/tắt hoặc chưa có chức năng tấn công. Khi chưa quan sát được trạng thái mới, dùng trạng thái cuối đã thấy đến hết thời gian nhớ.
- Không đọc toàn bộ bố trí/đội tuần tra của làng từ đầu để tìm lỗ hổng hoàn hảo. Không sửa điểm spawn để bảo đảm tránh tháp: né chỉ bắt đầu sau khi trồi và quan sát.

**Chọn đường và mục tiêu:**

1. Giữ vai trò mục tiêu từng loại ở mục 3/5.1. Trong cùng nhóm ưu tiên, so các đường hợp lệ theo thời gian đi và sát thương dự kiến từ nguồn nguy hiểm đã biết; không lấy khoảng cách Euclid làm đường đi xuyên tường.
2. Baseline điểm tuyến: `score = thời gian đi (giây) + 30 × min(5, sát thương dự kiến dọc tuyến / HP hiện tại)`. Ước tính sát thương bằng DPS/tầm đang biết và thời gian ở mỗi ô; vùng nhiều tháp cộng sức ép. Đây là heuristic định tuyến, không tự trừ HP thật hoặc bảo đảm sống sót.
3. Chỉ xét đường vòng có thời gian không vượt `2 × thời gian đường ngắn nhất + 15 giây`; tránh đi hết bản đồ để né một tháp. Dân/nhà phía yếu trong cùng nhóm có thể được chọn trước đích gần nhưng được bảo vệ mạnh.
4. Nếu mọi đường đều nguy hiểm, vẫn chọn tuyến hợp lệ có điểm thấp nhất và tấn công; không đứng ngoài tầm chờ đủ 15 phút để miễn giao chiến. Tường/cổng kín vẫn phải phá, ưu tiên mặt tiếp cận ít hỏa lực đã biết hơn, không tự cho là đã vỡ.
5. Gặp quân đang chặn sát thì đánh theo luật cũ; không né bằng cách xuyên actor/tường. Super tận dụng tốc độ để vòng sườn khi thực sự có lối, phá hoại tìm đoạn thành yếu để mở đường; không đổi sang đánh dân xuyên hàng lính.

**Phản ứng và giới hạn:**

- Cập nhật nhận biết mỗi 1 giây, tìm lại đường tối đa mỗi 2 giây/zombie; topology đổi hoặc hit đầu từ nguồn chưa biết cho phép tìm lại một lần ngay rồi giữ nhịp. Dùng timestamp server giống nhau khi offline/online.
- Chỉ đổi tuyến đang đi nếu tuyến mới tốt hơn ít nhất 15% điểm, trừ đường bị chặn hoặc mục tiêu mất; tránh chạy qua lại khi tháp/quân đổi mục tiêu. Tính lại theo HP hiện tại nhưng không tự hồi/chuyển sát thương đã nhận.
- Không đọc ý định lệnh quân hoặc đích người chơi sắp bấm. Quân từ khuất đi ra vẫn có thể phục kích; tháp phân tầng và vùng bắn chồng nhau vẫn hiệu quả.
- Không buộc zombie tấn công tháp trước: biết né là tìm lối ít hỏa lực, không thay ưu tiên cả ba loại thành quân công thành thông minh tuyệt đối.
- Cache trường nguy hiểm theo vùng nguồn đã biết và version trạng thái, chia sẻ phép tính khi cùng dữ liệu nhưng không chia sẻ tầm nhìn toàn map miễn phí. Phải benchmark thêm chi phí tìm đường; không giảm số đợt/actor để che CPU.

UI gắn nhãn **“biết né phòng thủ”** từ Công nghiệp, mô tả khuyên bố trí vùng bắn chồng nhau và lính cơ động ở lối vòng; không vẽ đường tính trước của mọi zombie nếu chúng chưa bị người chơi phát hiện.

## 6. Cắn, lây bệnh và chết dân

### 6.1. Trạng thái dân

`Khỏe → Bị thương và/hoặc Nhiễm → Bệnh nặng → Gục → Được cứu/Chết`.

- Một hit cắn dân hợp lệ gây damage rồi roll nhiễm 10% nếu dân còn sống/chưa nhiễm; roll seed theo wave/zombie/victim/attackIndex, retry không roll lại.
- Không lây qua không khí, qua tường hoặc người–người trong v1. Quân không nhiễm bệnh trong v1, nhưng chịu HP/thương vong bình thường.
- Sau k lần bị cắn, xác suất đã nhiễm là `1 − 0,90^k`: 1 đòn 10%; 4 đòn khoảng 34,4%; 8 đòn khoảng 57%. Không gọi đây là “10% cho cả trận”.
- Nhiễm: năng suất −50%, không làm nghề chế biến/thu hoạch thực phẩm; tự tìm y tế. Sau 2 giờ từ lúc nhiễm chưa khỏi chuyển bệnh nặng, ngừng làm và mất 10 HP/giờ.
- Đang được điều trị có giường/thợ và đủ phí thì tạm dừng tiến triển nặng/mất HP bệnh; thời gian thiếu điều kiện lại tiếp tục theo đồng hồ bệnh còn lại, không reset 2h mỗi lần đổi giường.
- HP dân tối đa 100. Về 0: gục tại chỗ, chờ cứu tối đa 10 phút, còn tính trong P. Không phục hồi nhờ đổi nghề/tải lại. Quá hạn chết, mất dân và công việc đúng một lần; không tự sinh zombie mới.
- Người khỏe/bị thương không nhiễm hồi 20 HP/giờ khi an toàn, tức không địch trong 6 ô. Người nhiễm không tự hồi để tránh vòng hồi lấn át bệnh.

### 6.2. Chạy và cứu hộ

- Thấy zombie trong 6 ô hoặc có lệnh báo động thì dân ngừng việc tạm thời, chọn nhà trú còn chỗ và có đường tới; giữ reservation chỗ để không 20 người cùng chiếm giường cuối.
- Không nhà trú thì chạy tới ô đi được xa nguy cơ hơn trong vùng gần; không xuyên tường/teleport. Hàng mang đi theo dân, không cộng kho. Nếu dân chết thì hàng mang mất, không tự nhân thành loot.
- Thợ y tế tới người gục bằng đường thực, mỗi thợ mang một người, không đồng thời chữa nhiều ca/đi sản xuất. Phải tiếp xúc và bắt đầu sơ cứu **trước** hạn 10 phút, sơ cứu 30 giây rồi vận chuyển; khóa bệnh nhân đó. Đã sơ cứu thì tạm ngừng đồng hồ tử vong trong khi thợ còn sống và đang cứu, không đòi tới giường kịp cùng hạn.
- Thợ bị giết hoặc bỏ nhiệm vụ thì bệnh nhân rơi tại ô hợp lệ gần nhất, tiếp tục phần thời gian tử vong còn lại; sơ cứu không đặt lại 10 phút.
- Có giường và phí thì trị 30 phút hoạt động thực; khỏi bệnh, hồi ít nhất 50 HP. Đang giữ giường không đi sản xuất, không tính một dân vào hai cơ sở.

## 7. Phá nhà vĩnh viễn và HP bền vững

### 7.1. Độ bền cơ sở

Hiện `lib/battle.ts` tạo HP công trình trong trận từ `max(60, 2 × tổng số lượng vật liệu giá gốc × cấp)`. Dùng hàm cấu hình chung để tính độ bền ban đầu tương thích, không lấy hình vẽ hoặc giá đã nhân thời một lần nữa. Phải lưu phần độ bền còn lại trong state làng trước khi bật zombie.

Ví dụ nhà cấp 1 theo giá gốc hiện tại:

| Nhà | HP cơ sở | Một zombie Đá cần | Một zombie Hiện đại+ cần |
|---|---:|---:|---:|
| Lều (20 gỗ) | 60 | 30 đòn / 60 giây | 8 đòn / 16 giây |
| Tường (30 gỗ + 20 đá) | 100 | 50 đòn / 100 giây | 13 đòn / 26 giây |
| Cổng (60 gỗ + 30 đá) | 180 | 90 đòn / 180 giây | 23 đòn / 46 giây |
| Kho (40 gỗ + 10 đá) | 100 | 50 đòn / 100 giây | 13 đòn / 26 giây |
| Tháp canh (100 gỗ + 80 đá) | 360 | 180 đòn / 360 giây | 45 đòn / 90 giây |

Thời gian tính từ khi bắt đầu wind-up, một zombie bám liên tục, không quân bảo vệ. Zombie phá hoại gây 24/đòn, phá tường 100 HP sau 5 đòn, **12,5 giây**; một nhóm có thể nhanh hơn khi đủ vị trí tiếp cận. Đây là lý do không được để nhà ở đầu chuỗi hoàn toàn không có lính.

- Nhà đang xây dùng HP của loại/cấp đích theo công thức, không có miễn nhiễm; zombie phá hủy thì mất vật liệu đã trả, mất cả công trình đang xây.
- HP thiếu do zombie không tự hồi và không sửa. Lưu `zombieDamage` tích lũy tuyệt đối để nâng cấp không xóa thiệt hại: trần còn lại `maxHpMới − zombieDamage`; nâng cấp chỉ thêm đúng phần kết cấu mới, không miễn phí hoàn phần cũ.
- HP công trình không được full lại khi bắt đầu/kết thúc PvP hoặc load save. Sửa cháy/ngập/thiên tai giữ luật riêng nhưng chỉ phục hồi trạng thái/HP tạm tới trần còn lại sau zombie, không xóa `zombieDamage`.
- Khi hit zombie làm HP còn lại về 0: **xóa instance**, ghi nguyên nhân và dấu vết nền đổ nát không chặn ô. Không dùng `burned=true` rồi cho sửa giá rẻ.
- Xây mới tạo ID mới, trả đủ giá/thời gian cấp 1 và nâng lại từng cấp/ngăn. Chủ động tháo nhà còn HP áp hoàn trả hiện có × tỷ lệ HP còn lại; về 0 hoàn 0. Không hoàn đủ rồi xây lại rẻ để chữa HP.

### 7.2. Hệ quả theo loại nhà

| Nhà bị phá | Mất ngay | Còn giữ / đường phục hồi |
|---|---|---|
| Nhà dân | Chỗ ở, bonus và nhà instance | Dân không bị xóa tức thì vì thiếu chỗ; ngừng sinh dân, xây nhà mới; luật đói/thiếu nhà hiện có vẫn áp dụng |
| Kho/Đình có chứa hàng | Sức chứa/ngăn nâng; hàng vượt tổng sức chứa còn lại mỗi loại mất đúng một lần | Phần còn nằm trong dung lượng kho sống giữ nguyên; không kho ảo bù đủ |
| Xưởng/nguồn mana | Bộ đệm, tiến độ lô đang trả phí, mana trữ; dịch vụ dừng | Hàng còn ở người vận chuyển giữ nguyên, đổi đích; công thức đã nghiên cứu vẫn còn |
| Trại lính/học viện/cổng | Suất tuyển, slot, hàng đợi đang thực hiện | Quân sống không tự biến mất; quá cap không tuyển mới, vẫn phòng thủ được |
| Y tế/nhà trú | Giường/chỗ trú, tiến độ/chi phí ca đã dùng | Dân sống được ra ô kề an toàn theo hàng chờ nếu ô chật; không tự chữa và không teleport qua tường |
| Đình | Cấp quản trị tại nhà, sức chứa tương ứng | Thời làng giữ; xây Đình cấp 1 không đòi chính Đình còn tồn tại, nâng lại theo phí cấp đã mở |
| Kỳ quan | Công trình, hiệu ứng và điều kiện mở thời tiếp | Không hạ thời đã đạt; giữ nhánh thời 6, cho xây mới đúng nhánh thay vì khóa “đã hoàn thành không xây lại” |
| Nhà thợ xây | Suất khởi công mới | Đội đã cấp cho công trình đang xây được làm tới khi xong theo luật runtime; không nhân thêm đội |

Hủy reservation tới ID đã mất. Lệnh chưa bắt đầu hoàn phần chưa tiêu; lô đang thực hiện mất phí đã trả, không sinh sản phẩm. Chi tiết hàng dịch chuyển/gói phép theo spec ba đời; không nối hợp đồng cũ sang nhà mới chỉ vì cùng tọa độ.

## 8. Lính, tuần tra, tháp và công trình cứu hộ

### 8.1. Lực lượng bảo vệ

- Quân thường đã có từ Đồ đá, gồm lính gậy, ném đá, trại lính, tường/cổng/tháp; không đợi thời phép thuật.
- Tổ bảo vệ có ba lệnh: Giữ vị trí / Tuần tra / Hộ tống cứu dân. Save cũ mặc định giữ vị trí quanh doanh trại, không tự kéo hết quân ra xa.
- Tối đa `max(1, ceil(P / 100))` tổ, 12 chỗ quân/tổ; lấy quân đang có, không cấp miễn phí. Một quân không đồng thời tuần tra và đi đánh làng khác.
- Tuần tra tối đa 6 điểm, truy đuổi trong 10 ô từ tuyến, phát hiện gần 6 ô. Không đuổi mãi khỏi khu đã gán; hết địch trở về tuyến. Báo động cho tổ nhận biết ổ từ xa nhưng không teleport quân.
- Đụng zombie thì dùng đúng stat/tầm/nhịp/khắc chế hiện có. Zombie không được hưởng kháng tên của voi hoặc giáp thiết giáp.
- Tháp mặt đất bắn zombie: runtime hiện tầm 10 ô, 6/9/12 sát thương mỗi 1,5 giây cấp 1/2/3; số tháp hoạt động theo cap thời hiện có (2/3/4/5/6/8 ở đời 1–6, giữ 8 ở đời 7–9 cho baseline). Nếu có tháp dư, chọn cùng thuật toán cấu hình runtime, không cho tháp dư bắn riêng PvE để lách cap.

### 8.2. Nhà phục vụ

| Nhà | Mở từ | Giá; thời gian | Hiệu ứng |
|---|---:|---|---|
| Lều trú dân | Đá | 60 gỗ + 20 đá; 60 giây | Không thợ/điện; 6/10/14 chỗ cấp 1/2/3, vùng gọi 6 ô; không cộng chỗ ở thường |
| Lều cứu thương | Đá | 50 gỗ + 20 đá; 60 giây | 1 thợ, 2/3/4 giường, cứu hộ 6 ô, 40 thực/ca/30 phút |
| Mõ báo động | Đá | 20 gỗ + 10 đá; 30 giây | Không thợ; một cấp, tối đa 4; vùng 8 ô, gọi trú/điều tổ đã gán, không sát thương |
| Nhà trú dân | 7 | 2.000 gỗ + 4.000 đá + 500 đồng; 1h | Không thợ/điện; 40/64/96 chỗ, gọi dân trong 8 ô |
| Trạm cứu dịch | 7 | 3.000 đá + 1.000 gỗ + 500 đồng + 200 vàng; 1h | 3/5/8 thợ, 6/10/14 giường, cứu hộ 6 ô, 80 thực + 10 vàng/ca/30 phút |
| Còi báo động | 7 | 1.000 đá + 300 đồng; 30 phút | Không thợ/điện; một cấp, tối đa 4; vùng điều phối 10 ô |

Nhà thường nâng theo phí/giới hạn Đình runtime ở đời tương ứng; không cần nghiên cứu ma pháp để nâng lều thời Đá. Lều cứu thương vẫn xây được ở đời sau để có cách chữa không cần vàng/điện. Y tế và nhà trú cũng bị phá, không có miễn nhiễm.

Bệnh viện thời 6 khi hoạt động cấp thêm 12 giường với phí 80 thực + 10 vàng/ca/30 phút. Mất điện dừng nhận và tạm dừng ca; đồng hồ bệnh lại tiếp tục theo mục 6, không reset phí/đếm bệnh. Vườn linh dược từ thời 7 có thể rút ca xuống 20 phút nếu liên kết hoạt động.

## 9. Phép hỗ trợ tăng dần theo đời, không thay nền phòng thủ

| Giai đoạn | Phương án chống zombie | Giới hạn |
|---|---|---|
| Đá–Hiện đại | Lính, tường phân khu, tháp, trú dân, y tế | Không cần phép để tồn tại; quân về sau mạnh hơn nhưng zombie đông khi dân tăng |
| 7 — Thức tỉnh | Hỏa cầu, Trói rễ, Thủy hồi, Thanh tẩy | Mana/caster/vị trí thật; phép hỗ trợ lính thường, không phủ toàn map |
| 8 — Nguyên tố | Bão lửa đánh cụm, Thạch bích chặn tạm, Tịnh hóa chữa nhóm; golem chặn, linh thú hộ tống | Có tinh chất, ấn, hồi chiêu; tường phép không sửa/tạo lại tường thật bị phá |
| 9 — Thần thoại | Thiên nhãn báo trước 180 giây; thần thú bảo vệ khu lớn; lãnh địa hỗ trợ phản ứng/y tế | Không chặn spawn, không giảm số đợt miễn phí, không hồi nhà. Gói đại phép có phí và trần |

Nguồn giá/cooldown/mục tiêu phép nằm ở `eras-7-9-spec.md`, không sao chép hai bộ stat. Riêng Thiên lôi/Hộ giới chuẩn bị theo gói: một đợt zombie tính là một encounter, tối đa 1 gói mỗi loại trong đợt, dùng xong không được dùng lại ở PvP. Tự dùng chỉ khi đã bật chính sách và đủ ngưỡng, mặc định không đốt đại phép tốn thiên thạch vào mọi đợt nhỏ.

Thanh tẩy chữa tối đa 4 người với 60 mana, hồi 20 phút/làng từ thời 7. Không đặt lại cooldown khi thay điện thờ. Thủy hồi chỉ chữa người/đơn vị còn sống hợp lệ, không hồi dân đã chết hoặc kết cấu công trình.

## 10. Offline, PvP và phục hồi

- Server lưu lịch wave, P, seed, vị trí, actor/HP/cooldown/mục tiêu, bệnh/giường/cứu hộ, thiệt hại nhà và hậu quả kho. Client chỉ vẽ; tắt tab không đóng băng PvE.
- Trong khoảng có giao chiến, dùng combat tick chung, không bước >1 giây nếu làm bỏ hit/chạy thoát; chuyển động và hit nội suy theo timestamp để không cho zombie chậm né đòn theo cửa sổ tick. Ngoài combat dùng hàng sự kiện. Không yêu cầu render hay mô phỏng 60 FPS để settle offline.
- Không cho bắt đầu snapshot PvP mới khi ổ đã báo hoặc zombie còn sống; trả trạng thái và thời điểm dự kiến thử lại. Trận PvP đã bắt đầu trước báo giữ khóa làng, đồng hồ zombie **tạm dừng**, lưu phần còn lại rồi tiếp tục, không skip/roll lại đợt. Đồng hồ bệnh vẫn chạy. Không bắt đầu lần khóa PvP kế tiếp khi một đợt đã bị hoãn mà chưa được xử lý; phòng lách bằng giao chiến liên tiếp. Phải QA cùng giới hạn thời gian trận/khóa runtime trước release.
- Mỗi lần phá nhà/hit bệnh/chết dân/hồi ca là sự kiện có ID duy nhất. Command retry, resume checkpoint hay tải lại không làm chết hai lần, mất kho hai lần hoặc sinh lại nhà.
- Tối đa offline vẫn 14 ngày. Ở P=1.100, I=15 phút, N=28 → tối đa 1.344 đợt, khoảng 37.632 zombie/14 ngày (chưa trừ đợt không có chỗ hoặc lúc PvP tạm dừng). Đây là fixture bắt buộc, không phải cam kết CPU đã đạt.
- Nếu hết toàn bộ dân sống/gục/đang cứu: được Đón người sống sót sau 30 phút, tạo 3 dân, một yêu cầu chờ/làng. Không tặng quân/nhà/hàng, không reset lịch/P trong 6h, không lấy lần nữa khi còn người sống.
- Có sức chứa nền 200 thực/gỗ/đá để ba dân thu thập và dựng lại kho khi không còn nhà. Nếu runtime chưa có thì bổ sung rõ trong migration; không bù hàng vượt kho lúc kho bị phá, không áp cho kim loại/hàng phép. Sức chứa nền được tính trong tổng sức chứa ngay từ đầu, không chỉ xuất hiện sau mất kho.
- Bỏ mặc có thể mất dân, công trình, kỳ quan và hàng. Không xóa tài khoản, thời đã mở, nghiên cứu hoặc nhánh kỳ quan; mục tiêu là có đường xây lại bằng lao động/tài nguyên thật. Phải thử riêng trường hợp chỉ còn 3 người mới đến nhưng P sáu giờ còn cao; nếu không phục hồi được thì cơ chế tái định cư chưa đạt release, không coi lệnh đón dân đã tự giải quyết tình huống này. Không hứa phòng thủ miễn phí hoặc tự xây lại sau offline.

## 11. UI, âm thanh và báo cáo

- Thanh hiểm họa: mốc đợt tới, P/dân hiện tại, số lượng dự kiến, loại zombie, khu thiếu tổ bảo vệ. Preview ảnh hưởng khi sắp qua ngưỡng dân.
- Minimap ổ trồi, vùng tuần tra, nhà trú/y tế, dân gục/bệnh; không tiết lộ map đối phương hoặc ô sương chưa được phép xem.
- Zombie có trồi/đi/cắn/phá/nhận đòn/tan rã; con phá hoại có silhouette nặng nề, Super cao lớn chạy nhanh và có icon riêng. Không chỉ đổi màu để phân biệt ba loại. Dân bệnh có icon và trạng thái, không chỉ đổi màu. Cắn/phá có dấu hit tương ứng sự kiện server.
- Nhà gần hết HP có cảnh báo **không sửa được thiệt hại zombie**. HP 0 hiện “đã bị phá hủy — xây mới”, không hiện nút sửa. Báo riêng lượng hàng mất khi kho vỡ.
- Tóm tắt offline gộp đợt, tiêu diệt/tan rã, dân bị cắn/nhiễm/cứu/chết, nhà mất, hàng mất, mana đã dùng. Không mở hàng nghìn modal hoặc phát lại mọi tiếng báo.
- Không thưởng vật liệu/tiền/mana khi giết zombie. Có thống kê/thành tích ngoại hình, không tạo vòng farm tài nguyên.

## 12. Nghiệm thu và điểm cân bằng cần đo

1. Mốc đầu: phút 4 báo, phút 5 trồi; reconnect không gia hạn; save cũ không bị đánh trước khi nhận luật. Đá đủ vật liệu/thời gian dựng trại và tuyển quân đầu bằng luật runtime trong 5 phút; không yêu cầu có toàn bộ tường/y tế trước đợt đầu.
2. Thành phần đúng ở biên thời 3→4 và 4→5, N=1/2/5/6/8/12/17/28, waveIndex không reset; không cộng Super ngoài tổng N, không nâng chỉ số giữa đợt. P đúng ở biên 40/41, 99/100, 199/200 và đỉnh hết hạn 6h. Sau giảm dân áp lực giảm đúng cửa sổ; không reset bằng đổi việc/du hành/đón dân mới.
3. Một con đánh đúng DPS và thời gian bảng; quân gậy 1v1/2v1, tháp C1 chống thường/Super/phá hoại; thử Super từ đời 4 khi chưa có phép, dân chạy trú và tổ tuần tra bị vượt tốc; không nhân attackMs lần nữa hoặc cho 28 con chồng hit một ô.
4. Trồi trong/ngoài thành, cổng theo quyền, cầu bị phá, góc kín, nhóm thiếu chỗ, map kín và blueprint chặn ổ. Tường bị phá mới mở đường, không bước xuyên trước. Thử biên đời 4→5: tuyến vòng ít hỏa lực, nhiều tháp chồng, tháp tắt/ụ phòng không không làm né, lính phục kích, mọi đường đều nguy hiểm vẫn tiến công, không đổi tuyến dao động hoặc biết quân ngoài tầm cảm nhận.
5. Cắn/roll bệnh retry, nhiều caster cùng chữa, bệnh viện mất điện, bệnh nặng/cứu trước-sau hạn, y tế bị phá khi đang có bệnh nhân; dân chết/đồ mang mất đúng một lần.
6. Nhà HP còn một phần, nâng cấp/tháo/sửa cháy/ngập/PvP không xóa zombieDamage. Phá kho cuối, Đình cuối, kỳ quan, mana và nhà tuyển có hàng đợi; xây mới không nối nhầm ID cũ.
7. Làng bố trí đúng có thể vận hành 24h không mất dân/nhà đầu chuỗi. Đo thêm HP mất mỗi ngày và nhu cầu xây mới dài hạn; “không chết hôm nay” không đủ nếu mọi nhà bắt buộc vỡ sau vài ngày dù phòng thủ tốt.
8. P=450→850: dân ×1,89 nhưng zombie/h ×3,67; P=1.100 có 112/h. Phải đo tỷ lệ lợi sản xuất tăng so với chi phí lính/y tế/xây lại; không để chiến lược tốt nhất là giữ dân thấp mãi.
9. Cùng 24h/14 ngày một lần, chia nhỏ, reload checkpoint, PvP khóa/resume và retry cho cùng kết quả trong sai số fixed point đã chốt. Benchmark CPU/wall/payload trên runtime Cloudflare thực, không dùng homepage 200 làm bằng chứng engine đạt.
10. Nếu quá khó, chỉnh N/I/HP/damage, AI phản ứng và chi phí phòng thủ. **Không** âm thầm cho sửa nhà, miễn spawn nội thành hoặc bỏ đợt offline để che lỗi/cân bằng.

Các hạng mục này là yêu cầu cho triển khai sau; lượt viết spec không sửa engine, commit hay deploy.

### Ghi chú vận hành AI

Khi toàn bộ zombie chưa có mục tiêu và quân không di chuyển, tìm mục tiêu lại tối đa mỗi 4 giây; khi giao tranh, mô phỏng theo tick 1 giây. Mốc nghỉ được lưu trong save để replay/checkpoint không thay đổi kết quả. Lệnh điều quân mới, thay đổi số dân/quân và đợt trồi mới đánh thức AI sớm. Không thêm request hoặc timer mạng riêng.
