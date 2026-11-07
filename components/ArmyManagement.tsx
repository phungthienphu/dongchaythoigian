'use client';
import {useEffect,useRef,useState} from 'react';
import {armyReleaseQuote,UKEYS,UNITS,type Action,type City,type Troops} from '@/lib/engine';

export default function ArmyManagement({city,now,busy,act,onClose}:{city:City;now:number;busy:boolean;act:(a:Action)=>Promise<boolean>;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 const [units,setUnits]=useState<Troops>({}),[review,setReview]=useState(false),[pending,setPending]=useState(false),[note,setNote]=useState('');
 useEffect(()=>{dialog.current?.showModal();},[]);
 const quote=armyReleaseQuote(city,units,'expel',now),disabled=busy||pending;
 const away=(u:typeof UKEYS[number])=>(city.deployedArmy?.[u]??0)+city.exps.reduce((n,e)=>n+(e.units[u]??0),0);
 return <dialog ref={dialog} className="final-wonder-modal army-management" aria-labelledby="army-management-title" onCancel={e=>{e.preventDefault();if(!pending)onClose();}}>
  <div className="final-wonder-card">
   <button className="x" aria-label="Đóng quản lý quân" disabled={pending} onClick={onClose}>×</button>
   <h2 id="army-management-title">Quản lý quân đội</h2>
   <p className="small muted">Chỉ giải ngũ quân ở nhà; không thay quân đang huấn luyện, xuất chinh hoặc hộ tống. Không hoàn chi phí tuyển quân. Chưa hỗ trợ cho mượn.</p>
   <div className="army-table-wrap"><table><thead><tr><th>Loại quân</th><th>Ở nhà</th><th>Đi xa</th><th>Đang tuyển</th><th>Chọn</th></tr></thead><tbody>
    {UKEYS.filter(u=>(city.army[u]??0)+away(u)+city.queue.filter(q=>q.u===u).length>0).map(u=><tr key={u}><th scope="row">{UNITS[u].n}</th><td>{city.army[u]??0}</td><td>{away(u)}</td><td>{city.queue.filter(q=>q.u===u).length}</td><td><input type="number" aria-label={`Số ${UNITS[u].n} giải ngũ`} min={0} max={city.army[u]??0} step={1} value={units[u]??0} disabled={disabled||review} onChange={e=>{setNote('');setUnits({...units,[u]:Math.max(0,Math.min(city.army[u]??0,Math.floor(Number(e.target.value)||0)))});}}/></td></tr>)}
   </tbody></table></div>
   {!UKEYS.some(u=>(city.army[u]??0)>0)&&<p>Không có quân ở nhà để giải ngũ.</p>}
   <p>Giải ngũ là cho quân rời làng vĩnh viễn: không chuyển thành dân và không thể gọi về.</p>
   <p>Đã chọn <b>{quote.count}</b> quân · giảm <b>{quote.foodSavedPerMinute.toLocaleString('vi-VN')} thực/phút</b> và <b>{quote.woodSavedPerHour} gỗ/giờ</b>.</p>
   {quote.error&&<p className="err small" role="status">{quote.error}</p>}
   {note&&<p role="status">{note}</p>}
   {review?<div className="demolition-review"><p><b>Cho {quote.count} quân rời làng vĩnh viễn?</b> Quân không thành dân. Sức phòng thủ giảm ngay sau khi nhận lệnh. Không hoàn tài nguyên.</p><button disabled={disabled||!!quote.error} onClick={async()=>{setPending(true);try{if(await act({type:'releaseTroops',units,mode:'expel'})){setUnits({});setReview(false);setNote('Đã nhận lệnh cho quân rời làng. Theo dõi Chờ lưu / Đã lưu trên thanh trạng thái.');}else setNote('Chưa nhận lệnh. Kiểm tra thông báo của làng rồi thử lại.');}finally{setPending(false);}}}>Xác nhận giải ngũ vĩnh viễn</button><button disabled={pending} onClick={()=>setReview(false)}>Quay lại</button></div>:<button disabled={disabled||!!quote.error} onClick={()=>setReview(true)}>Xem lại lệnh giải ngũ</button>}
  </div>
 </dialog>;
}
