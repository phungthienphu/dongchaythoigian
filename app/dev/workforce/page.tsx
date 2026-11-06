"use client";
import {useState} from 'react';
import WorkforcePanel from '@/components/WorkforcePanel';
import {newCity,G,F,HL,idx,applyAction,settle,MIN,isScout,workforceCounts,DEFAULT_MIX,type City,type Action} from '@/lib/engine';
function fixture():City {
 const c=newCity(0,123);c.t.fill(G);c.seen.fill(1);c.camp=idx(20,20);c.herds=[];c.camps=[];
 c.b={[idx(19,20)]:{k:'hall',lvl:3,doneAt:null},[idx(18,20)]:{k:'storehouse',lvl:5,doneAt:null},[idx(22,20)]:{k:'gather',lvl:1,doneAt:null},[idx(23,20)]:{k:'gather',lvl:1,doneAt:null}};
 c.t[idx(20,22)]=F;c.t[idx(22,22)]=HL;c.res.food=1000;
 c.people=Array.from({length:10},(_,i)=>({id:i+1,name:`Dân ${i+1}`,task:{t:'idle'},pos:c.camp}));c.pop=10;c.nextId=11;
 c.auto={on:true,mix:DEFAULT_MIX};return c;
}
export default function WorkforcePreview(){
 const [city,setCity]=useState(fixture),[error,setError]=useState(''),[picked,setPicked]=useState<number[]>([]);
 const act=async(a:Action)=>{const c=structuredClone(city),err=applyAction(c,a,c.last);setError(err??'');if(!err)setCity(c);return !err;};
 const counts=workforceCounts(city);
 return <main style={{padding:16,maxWidth:520,margin:'auto'}}><h1>Phân công và giữ nhóm khám phá</h1><p>Bản thử độc lập, không ghi dữ liệu người chơi.</p><WorkforcePanel c={city} busy={false} act={act} pickGroup={setPicked}/>{error&&<p role="alert">{error}</p>}
 <p role="status">Đã chọn {picked.length} người · Khám phá: {counts.scouts} · Tự động: {city.auto?.on?'bật':'tắt'}</p>
 <button disabled={!picked.length} onClick={()=>void act({type:'assign',ids:picked,task:{t:'explore',to:idx(26,20)}})}>Khám phá tới ô (26, 20)</button>
 <button onClick={()=>{const c=structuredClone(city);settle(c,c.last+MIN);setCity(c);}}>Chạy 1 phút</button>
 <button onClick={()=>{setCity(fixture());setPicked([]);setError('');}}>Đặt lại</button>
 <ul>{city.people.map(p=><li key={p.id}>{p.name}: {isScout(p)?'Khám phá':p.assignment==='manual'?'Giữ lệnh':'Chưa có lệnh'} · {p.task.t} · vị trí {p.pos===undefined?'trại':`${p.pos%96}, ${Math.floor(p.pos/96)}`} · {p.haul?.phase??'chờ'}</li>)}</ul>
 </main>;
}
