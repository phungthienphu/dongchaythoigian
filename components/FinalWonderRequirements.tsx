import type {City} from '@/lib/engine';
import {finalWonderReadiness} from '@/lib/final-wonder-readiness';
import styles from './FinalWonderRequirements.module.css';
const number=(n:number)=>n.toLocaleString('vi-VN',{maximumFractionDigits:0});
export default function FinalWonderRequirements({city,kind,now,onLocate}:{city:City;kind:'dam'|'green';now:number;onLocate?:(tile:number)=>void}){
 const r=finalWonderReadiness(city,kind,now);
 return <section className={styles.requirements} aria-label="Điều kiện xây kỳ quan">
  <h4>Điều kiện khởi công</h4><ul>{r.requirements.map(item=><li key={item.id} className={item.met?'ok':'err'}><span>{item.met?'✓ Đạt':'○ Chưa đạt'} · <b>{item.label}</b><small>{item.detail}</small></span>{!item.met&&item.tile!==undefined&&onLocate&&<button type="button" onClick={()=>onLocate(item.tile!)}>Xem công trình</button>}</li>)}</ul>
  <h4>Vật liệu trong kho</h4><ul>{r.cost.map(item=><li key={item.resource} className={item.missing?'err':'ok'}><span>{item.name}: {number(item.available)}/{number(item.required)}{item.missing?` · thiếu ${number(item.missing)}`:' · đủ'}</span></li>)}</ul>
  <p className={r.freeBuilders?'ok':'err'}>Thợ xây rảnh: {r.freeBuilders}{r.freeBuilders?' · đủ':' · cần ít nhất 1'}.</p>
  <p role="status">{r.ready?'Đủ điều kiện khởi công. Tiếp theo chọn ô đất trống đã khám phá sát sông, kề cạnh ngang/dọc.':'Hoàn thành các mục Chưa đạt và bổ sung vật liệu/thợ xây trước khi chọn vị trí.'}</p>
 </section>;
}
