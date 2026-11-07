import { RELEASED_ERA } from '@/lib/eras';
import { ERA_REQ, RES, RN, type Res } from '@/lib/engine';

/** An era goal is a payment target, not the village's storage limit. */
export default function EraStorageNotice({ era, storage, onOpenShop, maxEra=RELEASED_ERA }: { maxEra?:number; era:number; storage:Res; onOpenShop:()=>void }) {
  const goal=era+1<=maxEra?ERA_REQ[era+1]:undefined;
  const blocked=goal?RES.filter(r=>(goal.cost[r]??0)>storage[r]):[];
  if(!goal||!blocked.length)return null;
  const fmt=(n:number)=>n.toLocaleString('vi-VN');
  return <aside role="status" className="era-storage-notice">
    <b>Sức chứa kho chưa đủ để lên đời</b>
    <ul>{blocked.map(r=><li key={r}>{RN[r]}: kho chứa tối đa <b>{fmt(storage[r])}</b>, cần tích <b>{fmt(goal.cost[r]!)}</b>.</li>)}</ul>
    <p>Xây thêm Kho hoặc nâng đúng ngăn còn thiếu. Trại sản xuất và mua hàng không tăng sức chứa. Các số bên dưới là tiến độ đạt yêu cầu lên đời.</p>
    <button onClick={onOpenShop}>Mở cửa hàng xây Kho</button>
  </aside>;
}
