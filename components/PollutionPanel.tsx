'use client';
import {B,HOUR,type City} from '@/lib/engine';
import {pollutionReport} from '@/lib/pollution-report';
import styles from './PollutionPanel.module.css';
const number=(n:number)=>n.toLocaleString('vi-VN',{maximumFractionDigits:2});
export default function PollutionPanel({city,now,onLocate}:{city:City;now:number;onLocate?:(tile:number)=>void}){
 const s=city.industry;if(!s)return null;
 const r=pollutionReport(city,now),falling=r.net<-.001,rising=r.net>.001;
 const locate=(tile:number,k:typeof r.sources[number]['k'])=>onLocate?<button type="button" onClick={()=>onLocate(tile)}>Xem {B[k].n} ({tile%96+1}, {Math.floor(tile/96)+1})</button>:<b>{B[k].n} ({tile%96+1}, {Math.floor(tile/96)+1})</b>;
 const short= r.cleaners.filter(b=>b.k==='treatment'&&b.workers<3&&b.rate<4);
 return <section className={styles.panel} aria-labelledby="pollution-title">
  <h4 id="pollution-title">Ô nhiễm: {number(s.pollution)}/100</h4>
  <progress aria-label="Ô nhiễm" max={100} value={s.pollution}/>
  <div className={styles.rates}><p>Phát thải <b>+{number(r.emissions)} điểm/giờ</b></p><p>Xử lý + tự nhiên <b>−{number(r.cleanup)} điểm/giờ</b></p></div>
  <p className={rising?'danger':falling?'ok':''}><b>{rising?`Còn tăng khoảng ${number(r.net)} điểm/giờ`:falling?`Có thể giảm khoảng ${number(-r.net)} điểm/giờ`:'Phát thải và xử lý đang cân bằng'}</b>. {s.pollution===0&&falling?'Đã ở mức 0; ô nhiễm không xuống dưới 0.':s.pollution===100&&rising?'Đã chạm mức 100; cần giảm phát thải để hồi phục.':''}</p>
  <p className="small">Đây là nhịp tham khảo theo thợ đang sản xuất và lần cập nhật điện gần nhất; thay đổi khi thợ mang hàng, thiếu nguyên liệu hoặc đổi công suất. Điểm ô nhiễm cập nhật mỗi phút, giảm theo giờ thực, không mất ngay khi xây trạm.</p>
  {r.hoursBelow30!==null&&<p className="small">Nếu giữ nguyên nhịp này: khoảng {number(r.hoursBelow30)} giờ để xuống dưới 30.</p>}
  <p className="small">Từ 30/60/80: sản lượng lương thực giảm 10/20/30%; tốc độ sinh dân giảm 20/40/100%. Dưới 30 trở lại bình thường.</p>
  <h5>Nên xử lý gì?</h5>
  <ul>
   {r.net>=-.001&&r.emissions>0&&<li>Phát thải đang bằng hoặc vượt xử lý. Tắt bớt nguồn đứng đầu danh sách, hoặc tăng khả năng xử lý; xây thêm trạm mà vẫn phát thải nhiều hơn thì ô nhiễm chưa giảm.</li>}
   {short.length>0&&<li>Có {short.length} trạm xử lý chưa đủ 3 thợ tại chỗ. Bấm Xem trạm để kiểm tra giao thợ, đường đi, ngập/cháy hoặc trạng thái tắt. Dân đang đi hay chạy trú chưa được tính làm việc.</li>}
   <li>Trạm xử lý nước: 3 thợ tại chỗ giảm 4 điểm/giờ; 1–2 thợ giảm theo tỷ lệ. Không cần điện, tối đa 3 trạm. Công viên ven sông từ Hiện đại: mỗi công viên giảm 1 điểm/giờ, không cần thợ hay điện, tối đa 4.</li>
   <li>Muốn giảm nhanh hơn: bấm Xem nguồn gây ô nhiễm → Tắt công trình. Bật lại khi môi trường hồi phục; sản xuất và điện của công trình đó cũng dừng.</li>
   {city.era>=6&&<li>Thay dần Nhiệt điện bằng Thủy điện nhỏ hoặc Điện mặt trời rồi tắt bớt Nhiệt điện. Nhiệt điện vẫn đốt than và phát thải khi điện phát ra chưa được dùng hết. Thành Phố Sông Xanh đã khánh thành giảm 50% phát thải sản xuất, không giảm phát thải Nhiệt điện.</li>}
   <li>Tự nhiên giảm 1 điểm/giờ. Vườn ươm, rừng, giếng, hồ và đê không trực tiếp trừ điểm ô nhiễm.</li>
  </ul>
  <details open><summary>Nguồn gây ô nhiễm · nhiều đến ít</summary>
   {r.sources.length?<ul className={styles.buildings}>{r.sources.map(b=><li key={b.tile}>{locate(b.tile,b.k)}<p><b>+{number(b.rate)} điểm/giờ</b> · {b.reason} · cấp {b.level}</p><p className="small">Đã giao {b.assigned} thợ; {b.workers}/{b.jobs} tại chỗ. Mức cơ sở đủ công suất: +{number(b.potential)} điểm/giờ.</p></li>)}</ul>:<p>Chưa có công trình phát thải. Ô nhiễm còn lại từ trước sẽ giảm dần nhờ tự nhiên và các công trình xử lý.</p>}
  </details>
  <details open><summary>Công trình đang xử lý ô nhiễm</summary>
   {r.cleaners.length?<ul className={styles.buildings}>{r.cleaners.map(b=><li key={b.tile}>{locate(b.tile,b.k)}<p><b>−{number(b.rate)} điểm/giờ</b> · {b.reason}</p></li>)}</ul>:<p>Chưa có trạm xử lý hoặc công viên; hiện chỉ tự nhiên giảm 1 điểm/giờ.</p>}
  </details>
  <p className="small">Giữ ≤20: {s.cleanSince===undefined?'chưa đạt':`${number(Math.max(0,now-s.cleanSince)/HOUR)}/12 giờ sạch`}.</p>
 </section>;
}
