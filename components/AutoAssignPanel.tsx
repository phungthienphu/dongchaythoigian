"use client";
import {useEffect,useState} from 'react';
import {DEFAULT_MIX,taskResource,RES,RN,availableForWork,type Action,type City,type Mix,type ResKey} from '@/lib/engine';

export default function AutoAssignPanel({c,busy,act}:{c:City;busy:boolean;act:(a:Action)=>Promise<boolean>}) {
 const saved=JSON.stringify(c.auto?.mix??DEFAULT_MIX);
 const [mix,setMix]=useState<Mix>(()=>JSON.parse(saved));
 // Sync accepted/external settings without discarding unsaved edits on each tick.
 useEffect(()=>{setMix(JSON.parse(saved));},[saved]);
 const total=RES.reduce((n,r)=>n+mix[r],0),unsaved=JSON.stringify(mix)!==saved;
 const counts:Record<ResKey,number>={food:0,wood:0,stone:0,copper:0,gold:0,diamond:0,coal:0};
 let idle=0;
 for(const p of c.people){
  if(p.refuge)continue;
  const tk=p.task;
  if(tk.t==='idle'){if(availableForWork(p)&&!p.assignment)idle++;continue;}
  const r=taskResource(c,p);
  if(r)counts[r]++;
 }
 return <>
  <p role="status" className="small"><b className={c.auto?.on?'ok':'muted'}>{c.auto?.on?'Đang bật tự động giao việc':'Tự động giao việc đang tắt'}</b> · {idle} dân rảnh</p>
  <p className="muted small">Giao việc ngay cho dân rảnh và dân mới, ưu tiên công trình còn chỗ rồi nguồn khai thác có đường tới gần dân. Tỉ lệ là mục tiêu theo số người, tùy nguồn hiện có; không phải tỉ lệ sản lượng. Chạy cả khi offline.</p>
  <p className="muted small">Lưu tỉ lệ không đổi việc của người đang làm. Muốn chuyển nhóm, nhập số dân trong bảng Phân công số dân hoặc chọn dân rồi giao việc mới. Lệnh khám phá, di chuyển và nghỉ do bạn giao được giữ riêng; tự động chỉ lấy dân chưa có lệnh. Tắt tự động giữ nguyên các việc đã giao.</p>
  <ul className="units">
   {RES.filter(r=>r!=='coal'||c.era>=5).map(r=><li key={r}>
    <label htmlFor={`mix-${r}`} style={{minWidth:80}}>{RN[r]}<div className="muted small">Đã giao: {counts[r]} dân</div></label>
    <input id={`mix-${r}`} type="range" min={0} max={100} step={5} value={mix[r]} onChange={e=>setMix({...mix,[r]:Number(e.target.value)})} style={{flex:1,minWidth:0}}/>
    <span style={{minWidth:40,textAlign:'right'}}>{total?Math.round(mix[r]/total*100):0}%</span>
   </li>)}
  </ul>
  {!total&&<p className="danger small" role="alert">Chọn ít nhất một loại tài nguyên.</p>}
  {unsaved&&<p className="small">Tỉ lệ đã chỉnh chưa được lưu.</p>}
  {c.auto?.on&&idle>0&&<p className="small">Chưa tìm được việc phù hợp cho {idle} dân rảnh. Kiểm tra nguồn đã khám phá, đường đi, chỗ làm còn trống và tình trạng ruộng.</p>}
  <div className="actions">
   <button className="primary" disabled={busy||!total} onClick={()=>act({type:'auto',on:true,mix})}>{c.auto?.on?'Lưu tỉ lệ':'Bật tự động giao việc'}</button>
   {c.auto?.on&&<button disabled={busy} onClick={()=>act({type:'auto',on:false,mix:c.auto!.mix})}>Tắt tự động</button>}
  </div>
 </>;
}
