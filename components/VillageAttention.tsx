import type {AttentionItem,AttentionTarget} from '@/lib/game-attention';
export default function VillageAttention({items,expanded=false,onOpen,onAction}:{items:AttentionItem[];expanded?:boolean;onOpen:()=>void;onAction:(target:AttentionTarget)=>void}){
  const urgent=items.filter(i=>i.severity==='urgent'),first=urgent[0]??items[0];
  if(!expanded)return <aside className={`attention-brief${urgent.length?' is-urgent':''}`} aria-label="Tình trạng làng">
    <button onClick={()=>first?.target.kind==='zombie-location'?onAction(first.target):onOpen()} aria-label={`${first?first.title:'Làng đang ổn định'}${items.length>1?` · ${items.length} việc cần chú ý`:''}`}><span aria-hidden="true">{urgent.length?'!':'◉'}</span><span><span role={urgent.length?'alert':undefined}>{first?first.title:'Làng đang ổn định'}</span>{items.length>1&&<small> · {items.length} việc cần chú ý{urgent.length>1?` · ${urgent.length} khẩn`:''}</small>}</span><span aria-hidden="true">›</span></button>
    {first?.target.kind==='zombie-location'&&<button onClick={onOpen} aria-label="Xem tất cả việc cần chú ý">Xem tất cả việc cần chú ý →</button>}
  </aside>;
  return <section className="attention-list" aria-label="Các việc cần chú ý">
    <p className="muted small">Ưu tiên việc khẩn trước. Mở từng mục để xử lý; giao diện không tự đổi việc hay dùng tài nguyên.</p>
    {!items.length&&<p>Chưa có việc cần xử lý. Bạn có thể tiếp tục xây dựng và khám phá.</p>}
    {items.map(item=><article key={item.id} className={`attention-item ${item.severity}`}><span className="eyebrow">{item.severity==='urgent'?'Khẩn cấp':item.severity==='warning'?'Cần xử lý':'Gợi ý'}</span><h3>{item.title}</h3><p>{item.detail}</p><button onClick={()=>onAction(item.target)}>{item.action} →</button></article>)}
  </section>;
}
