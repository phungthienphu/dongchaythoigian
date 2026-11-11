# Spec mở rộng thời đại 4–6 — Dòng Chảy Thời Gian

Ngày: 06/11/2026. Trạng thái: đề xuất sản phẩm để triển khai; chưa thay đổi luật chơi đang chạy. Các giá, thời gian và chỉ số dưới đây là mốc cân bằng ban đầu, cần kiểm chứng bằng mô phỏng và chơi thử.

## 1. Mục tiêu và hướng phát triển

Nối tiếp Đồ đá → Đồ đồng → Đồ sắt bằng **Trung đại → Công nghiệp → Hiện đại**. Giữ bối cảnh thành phố ven sông mang sắc thái Việt Nam; tên thời đại mô tả trình độ phát triển, không tái hiện chính xác một triều đại.

Mỗi thời đại phải đổi cách tổ chức thành phố, có công trình và hình ảnh riêng, có mục tiêu hoàn thành rõ ràng. Người chơi tiếp tục phát triển làng hiện tại, không reset bản đồ hoặc bắt đầu lại.

| Thời | Quy mô mục tiêu | Bài toán mới | Vai trò dòng sông | Kỳ quan cuối thời |
|---|---|---|---|---|
| 4 — Trung đại | 100–180 dân | An ninh lương thực, thủy lợi, học thuật | Trữ nước để vượt hạn | Văn Miếu Ven Sông |
| 5 — Công nghiệp | 180–300 dân | Nhiên liệu, vận tải, ô nhiễm | Nguồn vận tải và nơi chịu sức ép sản xuất | Cầu Sắt Đại Hà |
| 6 — Hiện đại | 300–450 dân | Điện, dịch vụ đô thị, khả năng chống thiên tai | Hệ sinh thái cần quản lý lâu dài | Đập Sông Mẹ hoặc Thành Phố Sông Xanh |

Nhịp mục tiêu cho người chơi quay lại 2–3 lần/ngày: thời 4 khoảng 3–5 ngày, thời 5 khoảng 5–7 ngày, thời 6 khoảng 7–10 ngày tới kỳ quan. Đây là mục tiêu trải nghiệm, không phải thời gian khóa bắt buộc. Không tăng thời gian bằng yêu cầu đăng nhập liên tục.

## 2. Điểm tựa từ game hiện tại

Đối chiếu `lib/engine.ts`, `README.md`, `docs/gameplay-progression.md` ngày viết:

- Có 3 thời đại, 6 tài nguyên: lương thực, gỗ, đá, đồng, vàng, kim cương. Chưa có sắt riêng dù đã có Thời đồ sắt.
- Công trình tối đa cấp 3; nâng cấp thường bị giới hạn bởi Đình. Trung tâm điều khiển hiện mở ở Đình cấp 3.
- Có vận chuyển hàng thực tế tới kho, kho riêng từng ngăn, dân có công việc, nhiên liệu, quân đội, thuyền, chợ người chơi và sứ giả.
- Một mùa là 6 giờ thật, một năm là 24 giờ; tích lũy offline tối đa 14 ngày.
- Sức ăn và hệ số sản xuất lương thực hiện tăng theo `2^(thời−1)`. Không kéo nguyên công thức này lên thời 6.
- Giá lên Sắt trong engine hiện là 3.000 thực, 1.000 gỗ, 2.000 đá, 600 đồng; tài liệu progression vẫn ghi giá thấp hơn. Khi triển khai lấy engine làm mốc và đồng bộ lại tài liệu.

Quy ước: **đồng tiếp tục đại diện nhóm kim loại chế tác**, vàng tiếp tục là phương tiện giao dịch. Không thêm tiền, sắt, thép, gạch hoặc đồ dùng vào thanh kho trong đợt này. Than là tài nguyên kho mới duy nhất; điện và ô nhiễm là chỉ số vận hành.

## 3. Luật chung của bản mở rộng

### 3.1. Lên thời và nâng Đình

| Lên thời | Dân tối thiểu | Đình đang có | Công trình cần hoàn thành, hoạt động | Chi phí trừ một lần |
|---|---:|---:|---|---|
| 4 | 100 | 3 | Đền Sông Mẹ | 12.000 thực, 6.000 gỗ, 6.000 đá, 1.800 đồng, 300 vàng |
| 5 | 180 | 4 | Văn Miếu Ven Sông | 35.000 thực, 12.000 gỗ, 16.000 đá, 5.000 đồng, 1.200 vàng |
| 6 | 300 | 5 | Cầu Sắt Đại Hà | 80.000 thực, 20.000 gỗ, 35.000 đá, 10.000 đồng, 3.000 vàng, 6.000 than |

- Lên thời tức thì như hiện tại, server kiểm tra và trừ tài nguyên một lần. Không thêm hàng chờ nghiên cứu thời đại.
- Đình cấp 3 cho phép vào thời 4; vào thời 4 mới mở nâng Đình cấp 4. Tương tự với thời 5 và 6. Không yêu cầu cấp Đình chưa thể xây.
- Công trình mới của thời đại được xây cấp 1 ngay khi lên thời. Nâng cấp cần cấp Đình tương ứng.
- Đình tối đa bằng thời hiện tại, riêng thời 1–3 giữ khả năng nâng đang có. Các nhà cũ và nhà mới khác giữ tối đa cấp 3; không phải tạo sáu cấp cho mọi công trình.
- Trung tâm điều khiển tiếp tục mở từ Đình cấp 3, không dịch điều kiện sang cấp tối đa mới.
- Kỳ quan có một cấp, tối đa một công trình mỗi loại. Đã xây nhưng cháy/hỏng thì cần sửa trước khi dùng để mở thời tiếp.
- Không tự đổi loại nhà, tăng cấp nhà hoặc chuyển việc dân khi lên thời. Hiện bảng mở khóa rồi để người chơi tự quyết.
- Kim cương không là điều kiện bắt buộc lên thời hoặc hoàn thành kỳ quan.

### 3.2. Kinh tế và kho

- Từ thời 4, giữ hệ số sức ăn và sản xuất lương thực ở mức thời 3. Tăng trưởng sau đó đến từ dân, quân và công trình; không nhân đôi toàn bộ nền kinh tế mỗi lần lên thời.
- Giữ hiệu ứng công cụ/chợ hiện có. Bonus mới cùng nhóm cộng với nhau và có trần; không nhân dây chuyền không giới hạn.
- Bonus sản lượng mới toàn làng tối đa +30%; tốc độ vận chuyển mới tối đa +100%; giảm chi phí tối đa 15%. Không áp dụng giảm giá cho mua bán giữa người chơi hoặc hoàn trả khi phá nhà.
- Giá trong spec là **giá cuối cùng cấp 1**, không nhân thêm hệ số giá thời Sắt hiện có. Công trình mới cấp 2 tốn 2 lần, cấp 3 tốn 4 lần giá cấp 1; thời gian lần lượt gấp 3 và 9. Đình và kỳ quan dùng giá riêng.
- Giữ kho cũ và ngăn riêng. Mở thêm Đại kho thời 4: cấp 1 chứa 10.000 mỗi loại; từng ngăn cấp 2 chứa 20.000, cấp 3 chứa 40.000. Nhiều kho cộng dồn. Có đủ kho để chứa toàn bộ phí lên thời trước khi nút lên thời sáng.
- Đại kho giá 1.200 gỗ, 1.800 đá, 300 đồng; xây 30 phút. Thời 4 chưa hiển thị ngăn than; khi mở thời 5 thêm ngăn than cấp 1 miễn phí cho kho hiện có.
- Người chơi có thể tự cung cấp mọi tài nguyên bắt buộc. Chợ là đường tăng tốc, không là cách duy nhất vượt thời.
- Đình nâng 3→4: 3.000 gỗ, 5.000 đá, 1.000 đồng, 200 vàng, 2 giờ. 4→5: 5.000 gỗ, 10.000 đá, 2.500 đồng, 600 vàng, 4 giờ. 5→6: 8.000 gỗ, 18.000 đá, 5.000 đồng, 1.500 vàng, 3.000 than, 6 giờ.

### 3.3. An toàn khi offline

- Giữ mô phỏng chung client/server và giới hạn offline 14 ngày. Thiên tai, tiêu hao và sản xuất giải quyết theo timestamp, không theo số lần mở app.
- Công trình thiếu đầu vào giảm hoặc ngừng sản xuất; không tạo số âm. Hàng chỉ cộng kho sau khi được nộp, tiếp tục giữ hàng khi kho đầy.
- Hạn, ô nhiễm và thiếu điện mới không trực tiếp giết dân, phá kỳ quan hoặc xóa tài nguyên trong kho. Thiệt hại PvP và hiểm họa cũ vẫn theo luật tương ứng.
- Cảnh báo có thời điểm bắt đầu/kết thúc; không gửi lại một sự kiện sau mỗi lần tải làng.

## 4. Thời 4 — Trung đại

### 4.1. Trải nghiệm chủ đạo

Từ làng nhà đá thành thị trấn mái ngói, có giếng, hồ nước và trường học. Người chơi phải chuẩn bị mùa khô, phân bổ lao động và duy trì lương thực trước khi đầu tư kỳ quan.

Vòng chơi: xây Đại kho → ổn định nhà ở và nước → nâng Đình 4 → phát triển học thuật/phòng thủ → hoàn thành Văn Miếu → đủ điều kiện vào Công nghiệp.

### 4.2. Công trình

Giá viết theo thứ tự thực/gỗ/đá/đồng/vàng, bỏ loại không dùng. Chỉ số sản xuất là mỗi giờ thật khi đủ người, đầu vào và điều kiện; hiệu quả cấp 1/2/3 dùng 1/1,6/2,4 trừ chỗ ở và phạm vi ghi riêng.

| Công trình | Giá cấp 1 | Thời gian | Lao động | Công dụng |
|---|---|---|---:|---|
| Nhà ngói | 600 gỗ, 1.200 đá, 120 đồng | 30 phút | 0 | 18 dân/cấp; chống ngập như nhà đá |
| Giếng làng | 250 gỗ, 500 đá | 10 phút | 0 | Bảo vệ ruộng trong bán kính 4 ô khỏi một nửa tác động hạn; tối đa 3 giếng, một cấp |
| Hồ chứa | 500 gỗ, 1.800 đá, 150 đồng | 45 phút | 2 | Đặt cạnh sông/kênh có nước, trữ nước cho ruộng và cối nước trong 6 ô; một cấp |
| Nông trang | 800 gỗ, 500 đá, 150 đồng | 30 phút | 4 | Sản lượng thực cơ sở 360/giờ, cùng hệ số thực thời Sắt; phù sa ×2; chịu luật đất/đầu vào như ruộng |
| Trường làng | 800 gỗ, 1.000 đá, 150 đồng, 50 vàng | 1 giờ | 2 | +5%/8%/12% sản lượng thu thập và chế tác toàn làng; tối đa 1 |
| Xưởng thủ công | 500 gỗ, 800 đá, 200 đồng | 45 phút | 3 | Đổi 120 gỗ + 60 đá/giờ thành 6 vàng/giờ; giữ thu nhập vàng khi mỏ hữu hạn cạn |
| Văn Miếu Ven Sông | 3.000 gỗ, 8.000 đá, 1.200 đồng, 400 vàng | 8 giờ | 0 | Kỳ quan; +5% sản lượng toàn làng và điều kiện vào thời 5 |

Hồ chứa có 12 giờ dự trữ, đầy từ rỗng sau 6 giờ có nguồn nước và đủ thợ. Chỉ tiêu hao dự trữ khi hạn, đủ nước thì các công trình trong vùng không chịu giảm sản lượng do hạn. Nhiều vùng phủ không cộng bonus; từng hồ vẫn có dung lượng riêng. UI hiện giờ nước còn lại ở mức dùng hiện tại.

### 4.3. Hạn hán

- Sau ít nhất 24 giờ ở thời 4 mới được gặp hạn đầu. Mỗi đầu mùa Hạ kiểm tra bằng seed: xác suất 30%, không hai năm liên tiếp.
- Báo trước 6 giờ; đợt hạn kéo dài một mùa, tức 6 giờ thật.
- Không đổi địa hình sông, không chặn thuyền. Ruộng/nông trang giảm 40% sản lượng, cối nước giảm 50%; hái lượm không bị ảnh hưởng thêm.
- Giếng giảm một nửa các mức phạt; hồ còn nước loại bỏ phạt trong vùng. Giếng và hồ không cộng vượt 100% bảo vệ.
- Đợt hạn kết thúc thì nguồn nước hồi phục, không phải xây lại kênh. Màn hình cho xem công trình nào nằm ngoài vùng bảo vệ.

### 4.4. Quân và hình ảnh

Mở Lính nỏ và Kỵ binh; nâng hình tường đá, cổng ngói, tháp nỏ. Lính nỏ mạnh khi thủ thành nhưng yếu khi áp sát; kỵ binh cơ động, bị giáo binh khắc chế. Chưa thêm máy công thành ở thời này.

Dân mặc áo vải, khăn/nón; trường và Văn Miếu có sân, mái ngói, cờ. Hồ/giếng có tín hiệu nước còn đầy hay cạn. Nhà cũ giữ nhận diện và cấp đã đầu tư.

## 5. Thời 5 — Công nghiệp

### 5.1. Trải nghiệm chủ đạo

Máy móc tăng sản lượng nhưng cần than và làm bẩn sông. Người chơi chọn cụm công nghiệp, xây hậu cần, cân bằng số thợ khai thác–chế tác–xử lý nước.

Vòng chơi: mở than → vận hành xưởng máy → tổ chức trạm vận tải → xử lý ô nhiễm → nâng Đình 5 và xây Cầu Sắt → vào Hiện đại.

### 5.2. Than và khả năng tiếp tục khai thác

- Than là tài nguyên kho, giao dịch và vận chuyển như đá; mỗi chuyến dân mang 10 than.
- Khi vào thời 5, server chọn tối đa 3 ô đồi trống chưa có công trình để mở mỏ than bằng seed lưu cố định; mỗi mỏ 30.000 than. Không ghi đè đường, nhà, mỏ quý hay sửa bản đồ đối thủ.
- Nếu thiếu ô phù hợp, mở công trình Lò than củi làm đường dự phòng bắt buộc: 300 gỗ/giờ → 60 than/giờ, cần 2 thợ. Luôn cho xây lò dù có mỏ than.
- Thêm Vườn ươm thời 5 để tái tạo gỗ; mỗi cây tốn 10 thực, 30 phút lớn thành rừng 400 gỗ. Chỉ trồng trên đồng cỏ trống, không chặn lối đi duy nhất hoặc ô đã đặt xây. Không thưởng gỗ khi hủy cây non.

### 5.3. Công trình

| Công trình | Giá cấp 1 | Thời gian | Lao động | Công dụng cấp 1 |
|---|---|---|---:|---|
| Mỏ than | 1.000 gỗ, 1.500 đá, 500 đồng | 1 giờ | 4 | Khai thác 240 than/giờ, phải nộp kho; tăng cấp theo hệ số chung |
| Lò than củi | 600 gỗ, 800 đá, 150 đồng | 30 phút | 2 | Chuyển hóa như trên; tăng cấp tăng cả đầu vào/đầu ra |
| Xưởng cơ khí | 1.500 gỗ, 2.500 đá, 800 đồng, 200 vàng | 2 giờ | 4 | 300 đá + 120 than/giờ → 120 đồng/giờ; dùng đồng như kim loại chung, không giả lập luyện đồng thành sắt |
| Nhà máy hàng hóa | 1.200 gỗ, 2.000 đá, 600 đồng, 200 vàng | 2 giờ | 4 | 240 gỗ + 120 đồng + 90 than/giờ → 30 vàng/giờ |
| Trạm vận tải | 1.000 gỗ, 1.500 đá, 400 đồng, 100 vàng | 1 giờ | 2 | Điểm nộp mọi hàng; tăng 25% tốc độ vận chuyển dân có nơi làm việc trong 8 ô; tối đa 3, một cấp |
| Khu tập thể | 1.000 gỗ, 3.000 đá, 400 đồng | 1 giờ | 0 | 30 dân/cấp; chống ngập |
| Trạm xử lý nước | 800 gỗ, 2.000 đá, 500 đồng, 150 vàng | 1 giờ | 3 | Giảm 4/8/12 ô nhiễm/giờ cấp 1/2/3, vẫn 3 thợ; tối đa 3 trạm |
| Vườn ươm | 400 gỗ, 600 đá, 100 vàng | 30 phút | 2 | Tối đa 4 cây đang ươm; một cấp |
| Cầu Sắt Đại Hà | 6.000 gỗ, 18.000 đá, 6.000 đồng, 1.500 vàng, 3.000 than | 12 giờ | 0 | Kỳ quan; +20% tốc độ vận chuyển dân toàn làng; điều kiện lên thời 6 |

Cầu kỳ quan chọn hai bờ hợp lệ, nhịp tối đa 8 ô sông và phải có đường tiếp cận hai đầu. Không có vị trí hợp lệ thì cho xây phiên bản quần thể Cầu–Bến trên một ô bờ sông trống với cùng giá/hiệu ứng. Không ép người chơi reset bản đồ. Cầu không tự tăng tốc quân trên bản đồ thế giới.

Đường sắt là phần mở rộng sau, chưa cần để hoàn thành thời 5. Trạm vận tải cung cấp lợi ích hậu cần trong phạm vi hệ thống di chuyển hiện có.

### 5.4. Ô nhiễm

Một chỉ số toàn làng 0–100, chưa mô phỏng từng ô thượng/hạ lưu. Cập nhật theo phút, dựa trên mức hoạt động thực tế:

- Xưởng cơ khí đang chạy: +2 điểm/giờ/cấp hiệu dụng; nhà máy hàng hóa: +3; lò than củi: +1; nhiệt điện thời 6: +4.
- Mỗi trạm xử lý đủ 3 thợ: −4/8/12 điểm/giờ ở cấp 1/2/3, tối đa 3 trạm. Hồi phục tự nhiên: −1 điểm/giờ. Công viên cây xanh mở từ Công nghiệp: −2/4/6 điểm/giờ cấp 1/2/3, không giới hạn số công viên, không cần sát sông.
- Thiếu nguyên liệu/thợ thì phát thải tỷ lệ với hoạt động; công trình dừng không phát thải. Giới hạn chỉ số ở 0–100.

| Mức | Tác động |
|---|---|
| 0–29 | Bình thường |
| 30–59 | −10% sản lượng lương thực, −20% tốc độ sinh dân |
| 60–79 | −20% lương thực, −40% sinh dân |
| 80–100 | −30% lương thực, tạm ngừng sinh dân |

Các mức thay thế nhau, không cộng dồn. Không giảm trực tiếp số dân đang có. Cảnh báo khi vượt 30/60/80, có bảng nguồn phát thải và gợi ý tắt bớt xưởng. Không sinh sự kiện ngẫu nhiên mang tên ô nhiễm: đây là hệ quả có thể dự đoán của sản xuất.

### 5.5. Quân và hình ảnh

Mở Lính súng và Pháo dã chiến. Lính súng cần đồng/vàng, tầm xa tốt nhưng nạp chậm; pháo mạnh với công trình, di chuyển chậm, chiếm nhiều chỗ và yếu khi bị áp sát. Bến cảng đổi hình, thuyền vận tải giữ chức năng hiện có; tàu chiến và trận đánh trên sông hoãn sang spec riêng.

Hình ảnh gạch trần, khung sắt, ống khói, xe hàng. Khói chỉ hiện khi xưởng hoạt động; ô nhiễm đổi màu nước nhẹ, vẫn phân biệt rõ đường đi và vùng ngập.

## 6. Thời 6 — Hiện đại

### 6.1. Trải nghiệm chủ đạo

Chuyển sang quản lý một đô thị: cấp điện đủ, dịch vụ tốt, công nghiệp có giới hạn môi trường. Có hai hướng hoàn thành cuối game để người chơi lựa chọn, sau đó làng vẫn chạy và tham gia thế giới bình thường.

Vòng chơi: xây nguồn điện → chọn ưu tiên cấp điện → bổ sung bệnh viện/học thuật → thích ứng lũ hạn → hoàn thành một kỳ quan cuối.

### 6.2. Điện

- Điện là công suất phát/dùng, đơn vị quy ước MW; không tích kho, không giao dịch, không bị cướp. Không thêm pin trong bản này.
- Nguồn điện và thiết bị được coi nối chung trong làng. Không yêu cầu đặt từng đoạn dây.
- Tổng phát khả dụng phụ thuộc nhiên liệu, thợ, tình trạng nhà. Người chơi có thể tắt từng nhà máy/thiết bị.
- Có ba nhóm ưu tiên: thiết yếu (bệnh viện, xử lý nước hiện đại), dân sinh (chung cư), sản xuất. Trong mỗi nhóm chia điện tỷ lệ nhu cầu; cấp xong nhóm trước mới tới nhóm sau.
- Hệ số hoạt động thiết bị = công suất được cấp / nhu cầu, giới hạn 0–1. Đầu vào, đầu ra và phát thải cùng tỷ lệ. Không có điện thì ngừng sản xuất hoặc bonus.
- Chung cư mất điện vẫn giữ toàn bộ chỗ ở, không đẩy dân ra ngoài. Nông nghiệp, kho, bến, Đình, nhà thợ xây, quân y và công trình thời cũ không phụ thuộc điện.
- Nhiệt điện, thủy điện và điện mặt trời tự khởi động được, không cần điện đầu vào.

### 6.3. Công trình

| Công trình | Giá cấp 1 | Thời gian | Thợ / điện | Công dụng cấp 1 |
|---|---|---|---|---|
| Nhiệt điện | 3.000 đá, 1.500 đồng, 500 vàng, 500 than | 2 giờ | 4 / phát 80 MW | Dùng 240 than/giờ, ô nhiễm +4/giờ |
| Thủy điện nhỏ | 6.000 đá, 2.000 đồng, 800 vàng | 3 giờ | 3 / phát 50 MW | Sát sông; khi hạn chỉ phát 25 MW; tối đa 2, một cấp; không sửa địa hình |
| Điện mặt trời | 2.000 đá, 1.000 đồng, 500 vàng | 1 giờ | 0 / phát 15 MW | Công suất trung bình cố định, không ép online ban ngày; tối đa 6, một cấp |
| Chung cư | 1.500 gỗ, 6.000 đá, 1.000 đồng, 300 vàng | 2 giờ | 0 / dùng 5 MW | 50 dân/cấp; đủ điện +5% sinh dân toàn làng, bonus chung cư tổng tối đa 10% |
| Tổ hợp sản xuất | 4.000 đá, 2.000 đồng, 600 vàng | 3 giờ | 6 / dùng 35 MW | 360 gỗ + 180 đồng/giờ → 60 vàng/giờ; ô nhiễm +2/giờ |
| Bệnh viện | 3.000 đá, 800 đồng, 500 vàng | 2 giờ | 4 / dùng 15 MW | +20% tốc độ sinh dân, tối đa 1; không hồi sinh quân |
| Đại học | 4.000 đá, 1.200 đồng, 800 vàng | 3 giờ | 4 / dùng 20 MW | +10% sản lượng toàn làng, tối đa 1; chịu trần bonus chung |
| Công viên cây xanh | 300 gỗ, 600 đá, 100 vàng | 30 phút | 0 / 0 | Mở từ Công nghiệp; đất trống không cần sát sông; −2/4/6 ô nhiễm/giờ ở cấp 1/2/3, không giới hạn số lượng |
| Hồ điều hòa | 1.000 gỗ, 4.000 đá, 800 đồng | 2 giờ | 2 / 0 | Như hồ chứa, thêm giảm 50% thời gian ngập cho nhà không chống ngập trong 6 ô; một cấp |

Nguồn nhiệt điện, tổ hợp, bệnh viện, đại học và chung cư nâng tối đa cấp 3. Điện, nhiên liệu, lao động và đầu ra cấp 2/3 nhân 1,6/2,4; chỗ ở theo cấp. Bonus phần trăm bệnh viện/đại học cố định, nâng cấp chỉ tăng độ bền, không tăng nhu cầu điện/thợ của hai nhà này. UI phải nói rõ trước khi nâng.

### 6.4. Thời tiết cực đoan

- Dùng mùa/lũ đang có; không thêm một lịch thiên tai độc lập chồng lên lịch cũ.
- Hạn thời 6 kéo dài 9 giờ thay vì 6 giờ, cùng quy tắc báo trước và không hai năm liên tiếp. Chỉ áp dụng đợt bắt đầu sau khi lên thời.
- Mỗi đợt lũ hợp lệ có 25% khả năng thành lũ lớn: thời gian ngập dài hơn 50%, vẫn giữ tác dụng vòng đê kín và công trình chống ngập.
- Báo trước lũ lớn 6 giờ. Hồ điều hòa giảm phần ngập theo phạm vi; không xóa hư hại do quân địch.
- Không tăng độ khó vô hạn theo số năm tồn tại làng. Thành phố đã hoàn thành vẫn có thể duy trì ổn định khi offline.

### 6.5. Hai kỳ quan kết thúc

Mỗi làng chỉ chọn một kỳ quan cuối. Trước khi xác nhận xây, hiện lợi ích, đánh đổi và thông báo lựa chọn cố định. Hủy lúc đang xây dùng luật hoàn trả chung; hoàn thành rồi không đổi nhánh trong phiên bản này.

**A. Đập Sông Mẹ — Thành phố làm chủ dòng nước**

- Cần Đình 6, 400 dân, 2 thủy điện nhỏ hoạt động, ô nhiễm dưới 60 tại lúc khởi công.
- Giá: 15.000 gỗ, 60.000 đá, 18.000 đồng, 6.000 vàng, 10.000 than; xây 24 giờ.
- Phát thêm 150 MW không cần nhiên liệu; bảo vệ làng khỏi ảnh hưởng hạn lên nông nghiệp/cối nước và khỏi ngập do lũ.
- Đánh đổi: ruộng và nông trang trên phù sa còn hệ số ×1,5 thay vì ×2, áp dụng sau khi khánh thành. Ô nhiễm công nghiệp vẫn phải xử lý.
- Là một quần thể trên bờ, không đổi dòng sông, khóa tuyến thuyền hay tác động làng khác.

**B. Thành Phố Sông Xanh — Thành phố chung sống với dòng nước**

- Cần Đình 6, 400 dân, 4 công viên, ít nhất 80% công suất phát khả dụng từ nguồn sạch, ô nhiễm ≤20 liên tục 12 giờ trước khởi công.
- Giá: 20.000 gỗ, 45.000 đá, 15.000 đồng, 8.000 vàng; xây 24 giờ.
- Giảm 50% phát thải từ sản xuất; hạn không giảm sản lượng nông nghiệp/cối nước; nhà trong vùng hồ điều hòa không còn ngập do lũ. Giữ lợi ích phù sa.
- Đánh đổi: không có 150 MW miễn phí; tiếp tục đầu tư điện và bố trí vùng bảo vệ. Nhà ngoài vùng hồ vẫn có thể ngập.
- Ngưỡng 80% điện sạch và 12 giờ sạch chỉ là điều kiện khởi công, không thu hồi kỳ quan nếu vận hành thay đổi sau đó.

Kỳ quan đang xây không tự dừng khi dân/ô nhiễm đổi. Hiệu ứng chỉ kích hoạt sau hoàn thành; nếu bị hư hỏng thì cần sửa để khôi phục. Kỳ quan không miễn nhiễm PvP.

### 6.6. Quân và hình ảnh

Mở Bộ binh hiện đại và Xe thiết giáp; tháp canh đổi thành ụ phòng thủ. Thiết giáp chịu đòn tốt nhưng tốn vàng/đồng, chiếm nhiều chỗ và cần hậu cần. Không có không quân, tên lửa hoặc vũ khí hủy diệt trong phạm vi này.

Đô thị vẫn là Isometric 2.5D: mái bằng, kính, công viên, tấm pin và trạm điện. Công trình thiếu điện có biểu tượng riêng; không chỉ đổi màu. Làng thời 6 vẫn nhìn thấy các khu phố cũ nếu người chơi giữ lại.

## 7. Quy tắc quân sự, thế giới và giao dịch

- Giữ luật chỉ đánh nước thấp hơn tối đa một thời, báo cáo sứ giả còn hạn, khiên và giới hạn cuộc chiến hiện có. Không mở toàn bộ bản đồ khi lên thời.
- Quân cũ vẫn huấn luyện được; quân mới cần tài nguyên và chỗ chứa, không đổi miễn phí quân cũ thành quân mới.
- Chỉ số mục tiêu so với quân chủ lực thời trước: bộ binh mới mạnh hơn 25–40% mỗi chỗ, giá cao hơn 40–70%. Quân đặc chủng phải có đối trọng; không nhân đôi toàn bộ sát thương theo thời.
- Kỵ binh 2 chỗ, pháo 4 chỗ, thiết giáp 5 chỗ; thuyền vận tải tính sức chứa theo số chỗ như hiện tại. Bộ binh/lính nỏ/lính súng mỗi người 1 chỗ.
- Trước khi bật quân mới phải có bảng giá, HP, sát thương, tầm đánh, nhịp đánh, tốc độ, thời gian huấn luyện và hệ số khắc chế trong cấu hình chung cho cả làng lẫn Worker. Tỷ lệ trên là mục tiêu cân bằng, chưa phải bảng stat sẵn triển khai.
- Sứ giả đổi tên/hình theo thời: Sứ bộ → Đại sứ → Nhà ngoại giao. Không đổi thời hạn báo cáo hoặc quyền xem làng.
- Chợ thêm than khi chủ làng lên thời 5. Người mua/người bán đều phải từ thời 5 để giao dịch than. Không cho điện vào kho hoặc thị trường.
- Khi hiển thị thông tin đối thủ, dùng đúng phạm vi quyền hiện có; không gửi chỉ số điện/ô nhiễm nội bộ nếu chưa được phép xem làng.

## 8. UI và nhiệm vụ dẫn đường

Bảng Thời đại hiển thị cả 6 mốc, mốc hiện tại, công trình/quân mới và checklist điều kiện lên thời. Mỗi mục thiếu dẫn tới kho, Đình hoặc công trình liên quan; không tự trừ tiền khi bấm xem.

Mỗi thời có chuỗi nhiệm vụ giới thiệu, không thay điều kiện lên thời:

| Thời | Thứ tự nhiệm vụ |
|---|---|
| 4 | Xây Đại kho → xây giếng/hồ → bảo vệ ít nhất một ruộng → nâng Đình 4 → xây trường → hoàn thành Văn Miếu |
| 5 | Có than từ mỏ/lò → nộp than vào kho → vận hành xưởng → xây xử lý nước → đưa ô nhiễm dưới 30 → hoàn thành Cầu Sắt |
| 6 | Phát điện → cấp điện cho một thiết bị → đặt ưu tiên → vận hành dịch vụ đô thị → xem hai nhánh → hoàn thành kỳ quan |

- Thời 5 thêm thanh than và thẻ ô nhiễm. Thời 6 thêm “phát / nhu cầu MW”, danh sách thiếu điện và bảng ưu tiên. Màn hình nhỏ dùng thanh cuộn/thẻ gọn, không ép cả tám chỉ số vào một hàng.
- Xem trước vùng giếng/hồ/trạm vận tải trước khi đặt. Bảng nhà nêu đầu vào, đầu ra thực, số thợ, nguyên nhân giảm hiệu suất.
- Trước khi lên thời hiện mức tiêu hao dự kiến và số kho cần; trước khi xây kỳ quan hiện đánh đổi dài hạn.
- Offline về có bản tóm tắt: lượng sản xuất/nhiên liệu, diễn biến hạn/lũ, điện thiếu, ô nhiễm và nhà cần sửa. Không tự mở liên tiếp nhiều modal.
- Hoàn thành kỳ quan cuối có màn khánh thành, huy hiệu hồ sơ và mục tiêu tự do tiếp theo; không khóa làng hoặc ép reset.

## 9. Lưu dữ liệu và tương thích

Đây là yêu cầu triển khai, chưa khẳng định các trường đã tồn tại:

- Thêm phiên bản schema, than trong tài nguyên/kho/hàng vận chuyển/chợ, trạng thái hồ, ô nhiễm, ưu tiên điện, mỏ than và nhánh kỳ quan.
- Làng cũ giữ nguyên thời, dân, công trình, cấp, tài nguyên, hàng đang mang, quân và thời điểm hoàn thành đang chờ. Không reset người chơi đã hoàn thành Sắt.
- Settle phần thời gian cũ theo luật cũ tới mốc chuyển phiên bản; luật mới chỉ tính từ mốc đó. Không tính ngược 14 ngày ô nhiễm hoặc áp hệ số ăn mới lên lịch sử.
- Làng thời 1–3 không phát sinh hạn mới, điện hoặc ô nhiễm mới. Dữ liệu thiếu trường mới có mặc định an toàn.
- Mỏ than chỉ sinh một lần và lưu kết quả. Client dự đoán không tự sinh mỏ khác server.
- Mở rộng bảng tên/hình thời đại của tất cả dân, quân, sứ giả, tường, cổng, tháp, công trình. Có fallback tên/hình hợp lệ, không chỉ đổi mảng tên thời đại.
- Không dùng `MAX_LVL` duy nhất cho Đình, nhà thường, ngăn kho và mở trung tâm điều khiển. Định nghĩa giới hạn riêng để không vô tình nâng mọi thứ lên cấp 6.
- Điện tính lại khi công trình/đầu vào thay đổi; ô nhiễm và nước giải quyết ở mốc phút tuyệt đối. Client/server cùng timestamp phải ra cùng kết quả, tránh mô phỏng theo frame.

## 10. Tiêu chí nghiệm thu

1. Một làng thời Sắt có thể tự cung cấp tài nguyên, tăng kho, vào thời 4 rồi tiến tới 6 mà không cần kim cương, mua hàng người khác hoặc reset bản đồ.
2. Không có vòng khóa giữa thời đại, cấp Đình, than và điện. Có thể phục hồi sau khi than, vàng hoặc gỗ trong kho về 0.
3. Chi phí cấp 1 hiển thị bằng số thực trừ; không nhân hệ số thời Sắt hai lần. Refund không tạo lãi nhờ đổi thời/bonus.
4. Settle cùng một khoảng thời gian bằng một lần hoặc nhiều lần cho kết quả tương đương trong sai số làm tròn quy định, gồm kho đầy, hồ cạn, nhiên liệu hết, ngưỡng ô nhiễm và ưu tiên điện.
5. Offline 14 ngày không tạo tài nguyên âm, điện tích kho, ngập vĩnh viễn do luật mới hoặc lỗi tải làng.
6. Làng đã có Đình 3 vẫn mở trung tâm điều khiển; nhà cũ giữ cấp và việc đang làm sau migration.
7. Mọi quân mới dùng cùng dữ liệu giữa làng và trận Worker; có kiểm thử vận tải, hậu cần, tầm đánh và tương tác tường/cổng.
8. QA trình duyệt cả màn hình điện thoại và desktop: lên thời, đặt vùng bảo vệ, thiếu nhiên liệu, mất điện, phục hồi, xây kỳ quan. QA hai tài khoản cho giao dịch than và giao chiến hai thời liền kề.
9. Mỗi bản đồ sinh ra hoặc làng cũ đều có đường hoàn thành Cầu Sắt và tiếp cận than; kiểm tra cả bản đồ kín công trình và đồi đã khai thác hết.
10. Hai nhánh kết thúc đều đạt được bằng nguồn lực trong game; lựa chọn và trạng thái khánh thành bền vững sau tải lại.

## 11. Thứ tự triển khai

- **Đợt 1 — Thời 4:** tách giới hạn cấp, cân bằng ăn/sản xuất, Đại kho, Đình 4, nước/hạn, công trình và hình ảnh, Văn Miếu, migration. Chơi thử từ save cuối thời 3 trước khi mở rộng.
- **Đợt 2 — Thời 5:** than và đường tái tạo tài nguyên, công nghiệp, ô nhiễm, trạm vận tải, cầu, giao dịch than, quân mới.
- **Đợt 3 — Thời 6:** điện và ưu tiên, dịch vụ đô thị, thời tiết, hai kỳ quan, màn hoàn thành và QA xuyên suốt.

Mỗi đợt chỉ phát hành khi nền kinh tế, offline và hình ảnh của thời đó hoàn chỉnh. Trước khi bắt đầu code quân mới cần chốt bảng stat; trước khi phát hành từng thời cần chạy mô phỏng kinh tế để hiệu chỉnh giá/sản lượng và thời gian mục tiêu. Không thêm đường sắt, tàu chiến, PvP liên thời xa, đổi nhánh kỳ quan hoặc thời đại 7 trong ba đợt này.
