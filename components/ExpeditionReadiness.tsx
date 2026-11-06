import {costText,shipPlaces,UKEYS,UNITS,type City,type Troops} from '@/lib/engine';
import type {expeditionReadiness} from '@/lib/expedition-readiness';
export default function ExpeditionReadiness({city,units,readiness,onDock}:{city:City;units:Troops;readiness:ReturnType<typeof expeditionReadiness>;onDock?:()=>void}){
 const r=readiness,food=r.supplies?.food,missing=food===undefined?0:Math.max(0,Math.ceil(food-city.res.food));
 return <section className="small" aria-label="Điều kiện xuất quân">
  <p role="status" className={r.reason?'err':'ok'}>{r.message}</p>
  {r.places>0&&<p>Đoàn quân cần <b>{r.places} chỗ vận tải</b>. Mỗi thuyền 10 chỗ; từng loại quân dùng thuyền riêng: {UKEYS.filter(u=>units[u]).map(u=>`${UNITS[u].n} ${units[u]} × ${shipPlaces(u)} chỗ`).join('; ')}.</p>}
  {food!==undefined?<p className={missing?'err':''}>Dự trữ cả đi và về: <b>{costText({food})}</b> · hiện có {Math.floor(city.res.food).toLocaleString('vi-VN')} thực{missing?` · thiếu ${missing.toLocaleString('vi-VN')} thực`: ' · đủ lương thực'}.</p>:<p>Chưa tính được dự trữ lương thực: cần xác định được tuyến đường trước.</p>}
  {(r.reason==='ships'||r.reason==='dock')&&onDock&&<button type="button" onClick={onDock}>Mở Bến cảng và thuyền</button>}
 </section>;
}
