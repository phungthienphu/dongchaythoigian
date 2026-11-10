'use client';
import {useState} from 'react';
import PollutionPanel from '@/components/PollutionPanel';
import HowToPlay from '@/components/HowToPlay';
import {B,idx,MIN,HOUR,type City} from '@/lib/engine';
import {eraFixture,eraStaff} from '@/lib/era-fixtures.test-utils';
import {stepIndustry} from '@/lib/industry';
import {stepPower} from '@/lib/modern';
function fixture(){
 const c=eraFixture(6);c.industry!.pollution=70;
 for(const [n,k]of (['factory','machine','charcoal','thermal','treatment','park'] as const).entries()){
  const tile=idx(22+n,22);c.b[tile]={k,lvl:1,doneAt:null};eraStaff(c,tile,k==='park'?0:k==='treatment'?1:k==='charcoal'?2:4);
  if(['factory','machine','charcoal'].includes(k))for(const p of c.people.filter(p=>p.task.t==='work'&&p.task.at===tile))p.haul={phase:'work',at:0,nextAt:HOUR,tile,route:[tile],routeStart:0,carried:0,capacity:10,resource:'gold',source:{kind:'building',key:tile},taskKey:JSON.stringify(p.task)};
 }
 stepPower(c,0,0,B);return c;
}
export default function PollutionHarness(){
 const [city,setCity]=useState(fixture),[target,setTarget]=useState<number|null>(null),[guide,setGuide]=useState(false);
 const change=(fn:(c:City)=>void)=>setCity(old=>{const c=structuredClone(old);fn(c);stepPower(c,c.last,c.last,B);return c;});
 return <main style={{maxWidth:760,margin:'auto',padding:16}}><h1>Kiểm tra hướng dẫn ô nhiễm</h1><p>Bản thử độc lập; không gọi API hay dữ liệu người chơi.</p>
  <button onClick={()=>change(c=>{for(const b of Object.values(c.b))if(B[b.k].emission)b.off=true;})}>Tắt mọi nguồn phát thải</button>
  <button onClick={()=>change(c=>eraStaff(c,idx(26,22),2))}>Bổ sung 2 thợ xử lý</button>
  <button onClick={()=>change(c=>{c.b[idx(26,22)].lvl=3;c.b[idx(27,22)].lvl=3;})}>Xem xử lý cấp 3</button>
  <button onClick={()=>change(c=>{c.b[idx(27,22)].flooded=true;})}>Cho công viên bị ngập</button>
  <button onClick={()=>change(c=>{stepPower(c,c.last,c.last+MIN,B);stepIndustry(c,c.last,c.last+MIN,B);c.last+=MIN;})}>Chạy 1 phút</button>
  <button onClick={()=>{setCity(fixture());setTarget(null);}}>Đặt lại</button><button onClick={()=>setGuide(true)}>Cách chơi</button>
  {target!==null&&<output role="status">Đã chọn {B[city.b[target].k].n} tại ({target%96+1}, {Math.floor(target/96)+1}).</output>}
  <PollutionPanel city={city} now={city.last} onLocate={setTarget}/>
  {guide&&<HowToPlay maxEra={6} onClose={()=>setGuide(false)}/>}
 </main>;
}
