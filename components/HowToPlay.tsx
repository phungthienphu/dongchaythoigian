"use client";
import { useEffect, useRef } from 'react';
import { B, ERA_NAMES, ERA_REQ, costText } from '@/lib/engine';
import './HowToPlay.css';

export default function HowToPlay({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el=dialog.current;if(!el)return;
    el.showModal();
    return ()=>{if(el.open)el.close();};
  },[]);
  return <dialog ref={dialog} className="how-to-play" aria-labelledby="how-to-title"
    onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <article>
      <header><div><p className="small muted">Cẩm nang làng bên sông</p><h2 id="how-to-title">Cách chơi & luật chơi</h2></div><button autoFocus onClick={onClose} aria-label="Đóng hướng dẫn">×</button></header>
      <div className="guide-content">
        <section><h3>Bắt đầu từ đâu?</h3><ol>
          <li><b>Kiếm thức ăn:</b> xây Trại hái lượm rồi giao người rảnh vào trại, hoặc chọn dân và bấm đàn thú để đi săn.</li>
          <li><b>Lấy gỗ, đá:</b> chọn dân rồi bấm cây/đồi đá, hoặc giao người cho Trại đốn gỗ và Bãi đá.</li>
          <li><b>Tăng dân:</b> giữ đủ lương thực và chỗ ở trống. Dân tự tăng; xây thêm nhà khi đầy chỗ.</li>
          <li><b>Xây Kho gần nơi làm:</b> rút ngắn đường vận chuyển; mở bảng Thời đại để xem mục tiêu tiếp theo.</li>
        </ol></section>
        <details open><summary>Xây nhà ở đâu?</summary><p>Mở Cửa hàng, chọn công trình: <b>ô xanh là nơi hiện có thể xây</b>. Có thể bấm “Tìm ô xây được” để đưa bản đồ tới một ô hợp lệ. Ô đỏ dưới con trỏ không xây được; dòng trạng thái cho biết lý do.</p><p>Nhà thường đặt trên cỏ trống đã khám phá. Trại đốn gỗ kề rừng; Bãi đá trên đồi đá; Lò đúc kề mỏ đồng. Kênh nối thẳng vào sông/kênh, Cối nước sát sông và Đê sát bờ. Cần đủ vật liệu và thợ xây rảnh.</p></details>
        <details open><summary>Dân làm việc và tài nguyên vào kho thế nào?</summary><p>Dân đi tới nơi → thu thập → mang hàng về → nộp kho. <b>Kho chỉ tăng khi nộp xong</b>. Khi chưa có Kho, hàng được nộp ở điểm tập kết ban đầu; nhà ở không nhận hàng.</p><p>Mỗi ruộng nhận tối đa {B.farm.jobs} người. “Đã nhận đủ người” tính cả người đang đi, đang làm và đang chở hàng; ruộng có thể trống lúc họ về kho. Bấm ruộng để xem từng người đang ở bước nào.</p><p>Ruộng bạc màu theo lượng thu hoạch thực tế. Hết dinh dưỡng thì dân nghỉ và giữ chỗ đã giao. Chọn ruộng, bấm “Cải tạo & gieo lại”: mỗi cấp tốn 20 lương thực và 5 gỗ, chờ 30 giây để tiếp tục vụ mới.</p><p>Kho đầy thì dân giữ hàng chờ nộp. Dùng bớt tài nguyên hoặc xây/nâng Kho; vẫn có thể cho dân nghỉ hay giao lệnh di chuyển. Lương thực nuôi dân và quân; lò đúc dùng gỗ, nên số trong kho cũng có thể giảm.</p></details>
        <details><summary>Tăng dân, nâng công trình và lên đời</summary><p>Dân tự tăng khoảng mỗi phút khi còn chỗ ở và đủ thức ăn; Bếp lửa giúp tăng nhanh hơn. Khi đói hoặc hết chỗ ở, hãy xử lý cảnh báo bên cạnh dân số.</p><p>Lên đời tự đổi kiến trúc và mở công trình/quân mới. <b>Cấp công trình nâng riêng</b>, tốn vật liệu và thời gian, tối đa theo cấp Đình làng. Chưa có Đình thì công trình ở cấp 1.</p><ul>{Object.entries(ERA_REQ).map(([era,r])=><li key={era}><b>{ERA_NAMES[Number(era)]}:</b> {r.pop} dân{r.hall?`, Đình cấp ${r.hall}`:''}; {costText(r.cost)}.</li>)}</ul></details>
        <details><summary>Thám hiểm, sứ giả và bạn bè</summary><p>Cho dân đi vào vùng sương mù để khám phá địa hình làng. Muốn tìm nước khác, xây Nhà sứ giả rồi bấm “Cử sứ giả rảnh đi do thám” hoặc mở Thế giới. Sứ giả đi bộ rời làng, có tin sau 2 phút và trở về sau 4 phút.</p><p>Có thể xem làng bạn bè mà chưa biết vị trí của họ. Vị trí trên thế giới chỉ được mở khi sứ giả tìm ra. Chuyến thăm cho báo cáo trong 3 ngày để xem làng và đủ điều kiện xuất quân.</p></details>
        <details><summary>Đánh trại man rợ</summary><p>Quân đi theo đường đất từ trại lính tới mục tiêu. Khi tới nơi, man rợ ra tiếp chiến; hai bên gây sát thương mỗi giây và mất quân thật. Quân y chỉ cứu người còn sống. Hết chiến binh hoặc giao chiến quá một phút mà chưa thắng thì đoàn rút lui. Quân địch còn sống giữ trại cho lượt tấn công sau. Chỉ khi thắng mới mang chiến lợi phẩm về kho; không nhận thưởng ngay tại trại.</p></details>
        <details><summary>Hành quân, hậu cần và quân y</summary><p>Xuất quân cần đủ lương thực cho cả đi, về và 5 phút chiến đấu dự phòng; trừ một lần khi xuất phát. Đoàn đang đi không bị tính khẩu phần lần nữa tại kho.</p><p>Từ đời đồng, xây Trạm hậu cần để đào tạo Đoàn vận tải, Quân y viện để đào tạo Quân y. Mỗi đơn vị hỗ trợ 20 chiến binh. Hai công trình đổi kiến trúc theo đời, nâng cấp riêng để đào tạo nhanh hơn.</p><p>Hỗ trợ không bắt buộc. Chuyến mỗi chiều trên 10 phút có nguy cơ hao quân; màn xuất quân hiển thị số hao dự kiến và yêu cầu xác nhận khi thiếu hỗ trợ. Hao quân toàn chuyến được tính một lần lúc tới nơi. Vận tải giảm 60% hao mòn ở mức đủ người, quân y giảm thêm 75%. Quân y còn chữa người bị thương gần mình trong trận, không hồi sinh người chết; vận tải không chiến đấu.</p></details>
        <details><summary>Phòng thủ, hiểm họa và thông báo</summary><p>Luyện quân ở Doanh trại, đặt điểm gác và xây Chòi canh. Trong trận, chòi hoạt động tự bắn địch trong tầm; tường và cổng cản đường. Công trình cháy/ngập cần sửa để hoạt động lại.</p><p>Mùa đông làm thức ăn khó kiếm hơn; mùa lũ có thể ngập đất ven sông. Đê giúp bảo vệ, kênh giúp ruộng được tưới. Chú ý cảnh báo đổi dòng và man rợ.</p><p>Lợn rừng báo trước 1 phút: chòi trong 7 ô hoặc quân ở nhà có sức mạnh 20 sẽ xua chúng. Nếu không, một ruộng giảm năng suất 50% trong 2 phút rồi phục hồi.</p><p>Đọc bảng <b>Thông báo</b> khi có số mới. Trước khi đánh nước khác cần báo cáo sứ giả còn hạn; không đánh nước kém quá một đời hoặc đang có khiên. Sau trận làng được bảo vệ 6 giờ; xuất quân sẽ bỏ khiên của mình.</p></details>
        <details><summary>Điều khiển bản đồ</summary><p>Kéo để di chuyển, lăn chuột hoặc chụm hai ngón để phóng to/thu nhỏ. Bấm dân để chọn, bấm nơi làm để giao việc; giữ Shift để chọn nhiều dân. Khi người đứng che công trình, click thường chọn công trình; Shift/Ctrl + click chọn người. Esc hoặc chuột phải để hủy chọn xây. Nút Cách chơi luôn mở lại cẩm nang này.</p></details>
      </div>
      <footer><button className="primary" onClick={onClose}>Đã hiểu, về làng</button></footer>
    </article>
  </dialog>;
}
