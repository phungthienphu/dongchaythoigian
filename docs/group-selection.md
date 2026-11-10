# Chọn và điều khiển nhiều quân, nhiều dân

- Trong làng: bật **Chọn lính** hoặc **Chọn dân**, kéo khung rồi bấm đất đã khám phá để di chuyển cả nhóm. Giữ Shift để chọn thêm. Dân nhận lệnh thủ công, không bị tự phân công lại; dùng **Giao việc** để chuyển sang giao việc như trước.
- Trong combat: bật **Chọn vùng**, giữ Shift và kéo khung, hoặc dùng **Chọn tất cả**. Chỉ chọn quân còn sống thuộc phe của mình. Shift + bấm thêm/bớt nhóm. Bấm đất để di chuyển, bấm địch để đánh; chuột phải luôn ra lệnh di chuyển.
- Tắt chế độ chọn vùng để kéo bản đồ; chụm hai ngón vẫn phóng to. Esc bỏ chọn; trong combat, Esc tiếp theo đóng màn trận.
- Một hình trong combat vẫn đại diện một nhóm cùng loại; chọn vùng không tách, nhân bản hoặc đổi số quân.

## Chọn loại quân và dàn vị trí gác

- Trong làng, bật **Chọn lính**; trong combat, dùng hàng **Chọn theo loại quân**. Bấm tên loại kèm số lượng để chọn toàn bộ quân loại đó. Giữ Shift/Ctrl khi bấm loại khác để thêm vào nhóm. **Mọi loại** chọn tất cả và bỏ lọc.
- Sau khi chọn loại, kéo khung chỉ chọn quân thuộc loại đó. Bấm từng nhóm trong danh sách combat sẽ bỏ bộ lọc để vẫn chọn linh hoạt từng nhóm.
- Bấm đất: mỗi lính trong làng, hoặc mỗi nhóm hiển thị trong combat, nhận một ô gác riêng quanh điểm bấm. Không đổi số lượng hoặc chia tách nhóm combat. Chỗ đứng và đích đến của quân khác được giữ riêng, kể cả quân đó đang trên đường.
- Chỉ dàn trên địa hình đi được; không đứng trong nhà, núi, vùng chưa khám phá của làng hoặc tự vượt sông khi chưa có cầu/thuyền. Nếu khu vực quá chật hoặc có quân không thể tới, cả nhóm giữ lệnh cũ và hiện lý do. Quân tấn công vẫn có thể phá công trình cản đường.
- Tìm ô có giới hạn bán kính, dùng chung cache đường đi ở làng; combat kiểm tra vùng liên thông theo khả năng vận tải thay vì tìm đường lại cho từng quân. Vẫn một action/frame cho cả nhóm.

## Sửa lỗi không rời được giao chiến

Trước đây quân tấn công kiểm tra địch trong tầm và đánh trước khi xét lệnh di chuyển, khiến lệnh mới bị bỏ qua. Nay lệnh di chuyển chủ động ưu tiên trên cả hai phe; tới đích quân chuyển sang gác. Quân vẫn chịu sát thương khi rời giao chiến. Quân phòng thủ offline giữ cơ chế tự bảo vệ cũ. Quân xâm lược vẫn phá vật cản nếu cần, quân phòng thủ không tự phá nhà mình.

## Dữ liệu và chi phí xử lý

- Làng dùng một action `moveSoldiers` (tối đa 360 ID, không trùng), đi qua hàng đợi đồng bộ sẵn có; dân dùng action `assign` hiện có. Không gửi một API riêng cho mỗi người.
- Quân làng dùng chung snapshot vị trí và cache tìm đường trong một lệnh nhóm. Nếu thiếu đường/thuyền hoặc có ID không còn ở làng, không thay đổi một phần lệnh hay giữ chỗ thuyền của nhóm.
- Combat dùng một frame WebSocket `move`/`attack` với `groupIds`; máy chủ tiếp tục hỗ trợ `groupId` của tab cũ. Kiểm tra sở hữu, quân còn sống, giới hạn và đường đi trước khi thay lệnh. Không thay nhịp đồng bộ làng hoặc thêm polling.
- Không đổi tài nguyên, quân số, công thức sát thương hoặc dữ liệu làng hiện có.

## Kiểm thử

`lib/group-orders.test.ts` kiểm tra đường vòng, đổi đích không dịch chuyển tức thì, lưu/tải, lệnh nhóm nguyên khối, quyền điều khiển, dân giữ việc thủ công và hai phe rời giao chiến; mô phỏng một lần và nhiều bước phải trùng nhau. Worker kiểm tra một frame nhóm nhận một ACK và từ chối ID đối phương, ID trùng, nhóm quá lớn.

`/dev/selection` là fixture local không gọi database, có cả làng và hai phía combat. Trang bị chặn trong production. Địch trong fixture combat là quân y đông để giữ mục tiêu tồn tại trong suốt thao tác QA, không dùng làm số liệu cân bằng.
