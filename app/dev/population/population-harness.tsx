'use client';
import {useState} from 'react';
import ArmyManagement from '@/components/ArmyManagement';
import {HungerNotice} from '@/components/HungerStatus';
import {newCity,G,idx,applyAction,settle,MIN,HOUR,farmRemaining,farmAutoStatus,type City} from '@/lib/engine';
function fixture():City{
 const c=newCity(0,123);c.t.fill(G);c.seen.fill(1);c.camp=idx(20,20);c.era=4;c.b={[idx(19,20)]:{k:'house',lvl:3,doneAt:null},[idx(21,20)]:{k:'farm',lvl:1,doneAt:null,fertility:0}};c.people=[];
 for(let n=0;n<10;n++)c.people.push({id:c.nextId++,name:`Dân ${n+1}`,task:{t:'idle'}});c.pop=10;
 c.army={club:5,sword:3};c.deployedArmy={club:2};c.queue=[{u:'sword',doneAt:3*HOUR,startedAt:0}];c.camps=[];c.herds=[];c.manualWorkforce=true;c.wildernessAt=10*HOUR;c.disaster={kind:'flood',at:10*HOUR,level:1,center:0};c.res.food=100;c.res.wood=100;settle(c,0);return c;
}
export default function PopulationHarness(){
 const [city,setCity]=useState(fixture),[open,setOpen]=useState(false),[message,setMessage]=useState('');
 const step=(ms:number)=>{const c=structuredClone(city);settle(c,c.last+ms);setCity(c);};
 return <main style={{padding:16,maxWidth:720,margin:'auto'}}><h1>Kiểm thử dân, ruộng và quản lý quân</h1><p>Dữ liệu giả trong trình duyệt, không đọc hoặc ghi tài khoản thật.</p>
  <button onClick={()=>{setCity(fixture());setMessage('');}}>Đặt lại</button><button onClick={()=>setOpen(true)}>Quản lý quân</button><button onClick={()=>step(1000)}>Chạy 1 giây</button><button onClick={()=>step(30_000)}>Chạy 30 giây</button><button onClick={()=>step(10*MIN)}>Chạy 10 phút</button><button onClick={()=>{const c=structuredClone(city);c.res.food=0;setCity(c);}}>Hết thức ăn</button><button onClick={()=>{const c=structuredClone(city);c.res.food=2000;setCity(c);}}>Thêm thức ăn</button><button onClick={()=>{const c=structuredClone(city);c.b={};setCity(c);}}>Hết chỗ ở</button>
  <p role="status">Dân {city.people.length} · Gậy {city.army.club} · Kiếm {city.army.sword} · Thực {Math.floor(city.res.food)} · Đói {Math.floor((city.hunger?.stressMs??0)/MIN)} phút</p><p>{message}</p><HungerNotice city={city} onFindFood={()=>setMessage('Dân vẫn được giao việc kiếm ăn bình thường.')}/>
  {city.b[idx(21,20)]&&<p>Ruộng: {farmRemaining(city.b[idx(21,20)])} dinh dưỡng. {farmAutoStatus(city,city.b[idx(21,20)])}</p>}
  <ol>{city.log.slice(0,10).map((l,i)=><li key={i}>{l.msg}</li>)}</ol>
  {open&&<ArmyManagement city={city} now={city.last} busy={false} onClose={()=>setOpen(false)} act={async a=>{const c=structuredClone(city),error=applyAction(c,a,c.last);if(error){setMessage(error);return false;}setCity(c);return true;}}/>}
 </main>;
}
