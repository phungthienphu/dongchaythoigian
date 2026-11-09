'use client';
import {useState} from 'react';
import {B,ERA_NAMES,MAX_TRAIN_BATCH,UKEYS,UNITS,W,buildingName,costText,trainingLanes,trainingPlan,type Action,type City,type UKey} from '@/lib/engine';
import type {EngineRules} from '@/lib/eras';

const duration=(ms:number)=>{const seconds=Math.max(0,Math.ceil(ms/1000));return seconds>=3600?`${Math.floor(seconds/3600)} giờ ${Math.floor(seconds%3600/60)} phút`:seconds>=60?`${Math.floor(seconds/60)} phút ${seconds%60} giây`:`${seconds} giây`;};
type Props={city:City;now:number;busy:boolean;act:(action:Action)=>Promise<boolean>;rules:EngineRules};

function RecruitUnit({city,now,busy,act,rules,u}:Props&{u:UKey}){
 const [amount,setAmount]=useState('1'),[pending,setPending]=useState(false);
 const unit=UNITS[u],n=Number(amount),plan=trainingPlan(city,u,n,now,rules),locked=unit.era>city.era;
 const facilities=new Set(plan.orders.map(q=>q.source)).size;
 return <li className={locked?'locked':''}>
  <div><b>{unit.n}</b> <span className="muted small">· {city.army[u]??0} ở nhà</span>
   <div className="muted small">⚔ {unit.atk} · ❤ {unit.hp} · {unit.space} chỗ/quân</div>
   <div className="muted small">{locked?`Mở ở ${ERA_NAMES[unit.era]}`:unit.d}</div>
   {!locked&&<>
    <label className="small">Số lượng <input aria-label={`Số ${unit.n} cần tuyển`} type="number" min={1} max={MAX_TRAIN_BATCH} step={1} value={amount} disabled={busy||pending} onChange={e=>setAmount(e.target.value)} style={{width:70}}/></label>
    <div className="tb" style={{flexWrap:'wrap',justifyContent:'flex-start',marginTop:6}}>
     {[1,5,10].map(count=><button key={count} aria-label={`Chọn ${count} ${unit.n}`} disabled={busy||pending||count>plan.max} onClick={()=>setAmount(String(count))}>{count}</button>)}
     <button disabled={busy||pending||!plan.max} onClick={()=>setAmount(String(plan.max))} aria-label={`Chọn tối đa ${unit.n}`}>Tối đa ({plan.max})</button>
    </div>
    {!!plan.orders.length&&<><p className="small">Tổng: <b>{costText(plan.cost)}</b> · {n*unit.space} chỗ.</p><p className="muted small">Tự chia vào {facilities} {B[unit.building??'barracks'].n.toLowerCase()}. Quân đầu xong sau {duration(plan.orders[0].doneAt-now)}; cả lô xong sau {duration(plan.doneAt-now)}.</p></>}
    {plan.error&&<p className="err small" role="status">{plan.error}</p>}
    <button className="primary" disabled={busy||pending||!!plan.error} onClick={async()=>{setPending(true);try{await act({type:'train',u,n});}finally{setPending(false);}}}>{`Tuyển ${Number.isSafeInteger(n)&&n>0?n:''} ${unit.n}`}</button>
   </>}
  </div>
 </li>;
}

export default function ArmyRecruitment(props:Props){
 const lanes=trainingLanes(props.city),next=Math.min(...props.city.queue.map(q=>q.doneAt)),last=Math.max(...props.city.queue.map(q=>q.doneAt));
 return <>
  <p className="small muted">Mỗi trại có hàng tuyển riêng; cấp 1/2/3 tuyển với tốc độ ×1/×1,5/×2. Hậu cần và quân y tuyển tại cơ sở riêng. Tài nguyên trừ khi nhận lệnh; quân chờ tuyển vẫn chiếm chỗ và có khẩu phần.</p>
  <ul className="units train">{UKEYS.filter(u=>UNITS[u].era<=props.rules.maxEra).map(u=><RecruitUnit key={u} {...props} u={u}/>)}</ul>
  {!!lanes.length&&<section aria-label="Các hàng tuyển quân"><h3>Đang tuyển {props.city.queue.length} quân</h3><p className="small">Tiếp theo sau {duration(next-props.now)} · tất cả xong sau {duration(last-props.now)} nếu các cơ sở tiếp tục hoạt động và có lối ra.</p>
   {lanes.map(lane=>{const first=lane.orders[0],b=lane.source===undefined?undefined:props.city.b[lane.source],name=lane.source===undefined?'Hàng tuyển cũ':`${b?buildingName(props.city,b.k):'Cơ sở không còn'} (${lane.source%W}, ${Math.floor(lane.source/W)})`;
    const started=first.startedAt??first.doneAt-UNITS[first.u].sec*1000,progress=first.paused==='exit'?1:Math.max(0,Math.min(1,(props.now-started)/Math.max(1,first.doneAt-started)));
    return <div key={lane.source??'legacy'}><p className="small"><b>{name}</b> · {lane.orders.length} quân · {UNITS[first.u].n}{first.paused==='inactive'?' · Tạm dừng: sửa công trình hoặc chờ hết ngập.':first.paused==='exit'?' · Chờ mở lối ra.':` · xong sau ${duration(first.doneAt-props.now)}`}</p><progress aria-label={`Tiến độ tuyển tại ${name}`} max={1} value={progress} style={{width:'100%',accentColor:'var(--accent)'}}/></div>;
   })}
  </section>}
 </>;
}
