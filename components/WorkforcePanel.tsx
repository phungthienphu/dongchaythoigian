"use client";
import {useEffect,useId,useState} from 'react';
import {RES,RN,resourceUnlocked,availableForWork,isScout,taskResource,workforceCounts,type Action,type City,type Res} from '@/lib/engine';
type Form=Record<keyof Res|'scouts',string>;
export default function WorkforcePanel({c,busy,act,pickGroup}:{c:City;busy:boolean;act:(a:Action)=>Promise<boolean>;pickGroup:(ids:number[])=>void}) {
 const id=useId(),current=workforceCounts(c),saved=JSON.stringify(current);
 const initial=()=>Object.fromEntries([...RES.map(r=>[r,String(current.counts[r])]),['scouts',String(current.scouts)]]) as Form;
 const [form,setForm]=useState<Form>(initial),[edited,setEdited]=useState(false),[result,setResult]=useState('');
 // Live ticks may change the village while the player is entering several counts.
 useEffect(()=>{if(!edited){const state=JSON.parse(saved);setForm(Object.fromEntries([...RES.map(r=>[r,String(state.counts[r])]),['scouts',String(state.scouts)]]) as Form);}},[saved,edited]);
 const keys=[...RES,'scouts'] as const;
 const valid=keys.every(r=>/^\d+$/.test(form[r])&&Number.isSafeInteger(Number(form[r]))&&Number(form[r])<=10_000);
 const total=keys.reduce((n,r)=>n+(Number(form[r])||0),0),assigned=RES.reduce((n,r)=>n+current.counts[r],current.scouts);
 const free=c.people.filter(availableForWork).length,other=c.people.length-assigned-free;
 const over=total>c.people.length-other;
 const ids=(key:typeof keys[number])=>c.people.filter(p=>key==='scouts'?isScout(p):!isScout(p)&&taskResource(c,p)===key).map(p=>p.id);
 return <section className="workforce" aria-label="Phân công số dân">
  <h3>Phân công số dân</h3>
  <p className="small muted">Đặt số người cho từng việc, rồi áp dụng một lần.</p>
  <p role="status" className="small">{c.manualWorkforce?'Đang phân công theo số dân · dân mới chờ lệnh':c.auto?.on?'Đang bật tự động · áp dụng số dân sẽ tắt tự động':'Chưa đặt số dân cố định'} · {free} dân có thể nhận việc{other>0?` · ${other} người giữ lệnh/dịch vụ khác`:''}.</p>
  <div className="workforce-rows">{keys.filter(r=>r==='scouts'||resourceUnlocked(r,c.era)).map(r=>{
   const count=r==='scouts'?current.scouts:current.counts[r],label=r==='scouts'?'Khám phá':RN[r];
   const locked=r==='gold'&&c.era<2||r==='diamond'&&c.era<3;
   return <div key={r} className="workforce-row">
    <label htmlFor={`${id}-${r}`}>{label}<small>Đã giao: {count}{locked?` · mở từ đời ${r==='gold'?'đồng':'sắt'}`:''}</small></label>
    <input id={`${id}-${r}`} aria-label={`Số dân ${label.toLowerCase()}`} type="number" inputMode="numeric" min={0} max={c.people.length} step={1} disabled={busy||locked} value={form[r]} onChange={e=>{setForm({...form,[r]:e.target.value});setEdited(true);setResult('');}}/>
    <button className="link" disabled={!count||busy} aria-label={`Chọn nhóm ${label.toLowerCase()} (${count})`} onClick={()=>pickGroup(ids(r))}>Chọn nhóm</button>
   </div>;
  })}</div>
  <p className={over?'small danger':'small'}>Đã chọn {total}/{c.people.length-other} người có thể quản lý trong bảng.{!over&&valid?` Còn ${c.people.length-other-total} người ngoài các nhóm đã chọn.`:''}</p>
  {(!valid||over)&&<p role="alert" className="small danger">{over?'Tổng số vượt số dân có thể phân công. Giảm một nhóm trước khi tăng nhóm khác.':'Nhập số nguyên từ 0 đến 10.000 cho từng nhóm.'}</p>}
  <div className="actions"><button className="primary" disabled={busy||!valid||over} onClick={async()=>{
   const counts=Object.fromEntries(RES.map(r=>[r,Number(form[r])])) as Res;
   const ok=await act({type:'setWorkforce',counts,scouts:Number(form.scouts)});
   setResult(ok?'Đã áp dụng. Dân mới chờ lệnh; các nhóm giữ việc đã giao.':'Chưa áp dụng được. Kiểm tra thông báo lỗi, nguồn khai thác, chỗ làm và người đang trú ẩn.');if(ok)setEdited(false);
  }}>Áp dụng số dân</button>{edited&&<button disabled={busy} onClick={()=>{setForm(initial());setEdited(false);setResult('');}}>Bỏ chỉnh sửa</button>}</div>
  {result&&<p role="status" className="small">{result}</p>}
  <details className="ui-details"><summary>Giữ nhóm, đổi việc & nguồn đã cạn</summary><p className="small muted">Hết cụm cây hoặc mỏ, dân tự tìm nguồn cùng loại đã khám phá có đường tới. Nếu chưa có nguồn, họ giữ nhóm và chờ; khám phá thêm hoặc mở lối để làm tiếp. Không tự kéo người khám phá hay người đứng theo lệnh sang việc khác. Muốn giải tán nhóm, giảm số nhóm hoặc chọn nhóm rồi “Cho nghỉ”. Dân giữ hàng đang mang và nộp kho trước khi đổi việc; khi có địch vẫn tạm trú ẩn rồi trở lại.</p></details>
 </section>;
}
