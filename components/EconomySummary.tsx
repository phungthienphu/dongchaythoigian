'use client';
import {useEffect,useRef} from 'react';
import {B,RES,RN,farmRemaining,type City,type Stats} from '@/lib/engine';
import {recentResourceFlow} from '@/lib/resource-history';

const number=(n:number)=>n.toLocaleString('vi-VN',{maximumFractionDigits:1});
export default function EconomySummary({city,now,stats,onClose}:{city:City;now:number;stats:Stats;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);useEffect(()=>{dialog.current?.showModal();},[]);
 const flow=recentResourceFlow(city,now),fields=Object.values(city.b).filter(b=>b.k==='farm'||b.k==='estate');
 const waiting=city.people.filter(p=>p.haul?.phase==='unload'&&p.haul.carried>0&&city.res[p.haul.resource!]>=stats.storage[p.haul.resource!]).length;
 const tending=fields.filter(b=>b.tendUntil).length,depleted=fields.filter(b=>!b.tendUntil&&farmRemaining(b)<=0).length;
 const idle=city.people.filter(p=>p.task.t==='idle').length,travelling=city.people.filter(p=>p.haul?.phase==='travel'||p.haul?.phase==='return').length;
 const paused=Object.values(city.b).filter(b=>B[b.k].prod&&(b.burned||b.flooded||b.off)).length;
 return <dialog ref={dialog} className="final-wonder-modal army-management" aria-labelledby="economy-summary-title" onCancel={e=>{e.preventDefault();onClose();}}><div className="final-wonder-card">
  <button className="x" aria-label="Đóng thu chi" onClick={onClose}>×</button><h2 id="economy-summary-title">Thu chi của làng</h2>
  <p>Thống kê {number(flow.elapsedMs/60000)} phút gần nhất, tối đa 5 phút; gộp mỗi 10 giây. Hàng chỉ được tính khi đã nộp kho.</p>
  <div className="army-table-wrap"><table><thead><tr><th>Tài nguyên</th><th>Đã giao kho</th><th>Đã chi</th><th>Công suất ròng dự kiến / giờ</th></tr></thead><tbody>{RES.map(r=>{
   const estimate=r==='wood'?stats.rate.wood-stats.woodUse:r==='stone'?stats.rate.stone-stats.stoneUse:stats.rate[r];
   return <tr key={r}><th scope="row">{RN[r]}</th><td>+{number(flow.received[r])}</td><td>−{number(flow.spent[r])}</td><td>{estimate>=0?'+':''}{number(estimate)}*</td></tr>;
  })}</tbody></table></div>
  <p className="small muted">Đã giao kho chỉ gồm thu gom và sản xuất. Đã chi gồm khẩu phần, nhiên liệu, nguyên liệu và lệnh xây/tuyển/chăm ruộng. Giao dịch chợ, chiến lợi phẩm, hoàn vật liệu và tài nguyên bị cướp không nằm trong bảng này. * Công suất là ước tính; quãng đường, chờ kho và chăm đất làm thực nhận thấp hơn.</p>
  <ul><li>{idle} dân rảnh; {travelling} người đang đi lấy hoặc giao hàng.</li><li>{waiting} người chờ vì kho đầy.</li><li>{depleted} ruộng bạc màu đang chờ chăm; {tending} ruộng đang cải tạo.</li><li>{paused} cơ sở sản xuất cháy, ngập hoặc đang tắt.</li></ul>
  {depleted>0&&<p>Chọn ruộng để xem giá chăm và nguyên liệu còn thiếu. Từ Trung đại, đủ vật liệu sẽ tự cải tạo.</p>}
  <p>Đặt kho gần nguồn và kiểm tra đủ người, nhiên liệu, đường đi khi thực nhận thấp hơn công suất.</p>
 </div></dialog>;
}
