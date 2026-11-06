"use client";
import {useState} from 'react';
import AutoAssignPanel from '@/components/AutoAssignPanel';
import {newCity,G,F,HL,idx,applyAction,settle,MIN,DEFAULT_MIX,type City,type Action} from '@/lib/engine';
function fixture():City {
 const c=newCity(0,123);c.t.fill(G);c.seen.fill(1);c.camp=idx(20,20);c.b={[idx(19,20)]:{k:'hall',lvl:3,doneAt:null},[idx(21,20)]:{k:'farm',lvl:1,doneAt:null,fertility:0},[idx(23,20)]:{k:'gather',lvl:1,doneAt:null}};
 c.herds=[];c.camps=[];c.t[idx(22,22)]=F;c.t[idx(20,22)]=HL;c.res.food=1000;
 for(const p of c.people){p.task={t:'idle'};p.pos=c.camp;delete p.haul;}
 c.auto={on:false,mix:DEFAULT_MIX};return c;
}
export default function AutoPreview(){
 const [city,setCity]=useState(fixture),[error,setError]=useState('');
 const act=async(a:Action)=>{const c=structuredClone(city),err=applyAction(c,a,c.last);setError(err??'');if(!err)setCity(c);return !err;};
 return <main style={{padding:24,maxWidth:500,margin:'auto'}}><h1>Kiểm tra tự động giao việc</h1><p>Bản thử độc lập, không ghi dữ liệu người chơi. Có một ruộng bạc màu và trại hái lượm.</p><AutoAssignPanel c={city} busy={false} act={act}/>{error&&<p role="alert">{error}</p>}<button onClick={()=>{const c=structuredClone(city);settle(c,c.last+MIN);setCity(c);}}>Chạy 1 phút</button><button onClick={()=>setCity(fixture())}>Đặt lại</button><ul>{city.people.map(p=><li key={p.id}>{p.name}: {p.task.t}{'at' in p.task?` @ ${p.task.at}`:''} · {p.haul?.phase??'chờ'}</li>)}</ul></main>;
}
