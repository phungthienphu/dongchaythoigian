'use client';
import {useState} from 'react';
import ArmyManagement from '@/components/ArmyManagement';
import EconomySummary from '@/components/EconomySummary';
import FarmGroupCare from '@/components/FarmGroupCare';
import {G,HOUR,MIN,applyAction,derive,farmRemaining,idx,newCity,settle,stats,type Action,type City} from '@/lib/engine';

const plots=[[20,20],[21,20],[21,21],[22,22]];
function fixture(era=3):City{
 const c=newCity(0,123);c.era=era;c.t.fill(G);c.seen.fill(1);c.camp=idx(19,20);c.b={[c.camp]:{k:'storehouse',lvl:3,doneAt:null}};
 for(const [x,y]of plots)c.b[idx(x,y)]={k:'farm',lvl:1,doneAt:null,fertility:0};
 c.people=c.people.slice(0,2);c.pop=2;for(const p of c.people){p.task={t:'work',at:idx(20,20)};p.pos=idx(20,20);}
 c.army={club:5,sword:3};c.deployedArmy={club:2};c.queue=[];c.camps=[];c.herds=[];c.manualWorkforce=true;
 c.wildernessAt=10*HOUR;c.disaster={kind:'flood',at:10*HOUR,level:1,center:0};c.res.food=1000;c.res.wood=500;settle(c,0);return c;
}
export default function BalanceHarness(){
 const [city,setCity]=useState(fixture),[modal,setModal]=useState<'army'|'economy'|null>(null),[message,setMessage]=useState('');
 const act=async(action:Action)=>{const c=structuredClone(city),error=applyAction(c,action,c.last);setMessage(error??'Đã thực hiện');if(error)return false;setCity(c);return true;};
 const step=(ms:number)=>{const c=structuredClone(city);settle(c,c.last+ms);setCity(c);};
 return <main style={{padding:20,maxWidth:760,margin:'auto'}}><h1>Kiểm thử cân bằng</h1><p>Dữ liệu giả trong trình duyệt, không đọc hay ghi tài khoản thật.</p>
  <button onClick={()=>{setCity(fixture());setMessage('');}}>Đặt lại Đồ sắt</button><button onClick={()=>{setCity(fixture(2));setMessage('');}}>Trước Đồ sắt</button>
  <button onClick={()=>step(30_000)}>Chạy 30 giây</button><button onClick={()=>step(MIN)}>Chạy 1 phút</button>
  <button onClick={()=>{const c=structuredClone(city);c.res.wood=29;setCity(c);}}>Chỉ còn 29 gỗ</button><button onClick={()=>{const c=structuredClone(city);c.res.wood=500;setCity(c);}}>Bổ sung gỗ</button>
  <p role="status">Đời {city.era} · Dân {city.people.length} · Gậy {city.army.club} · Kiếm {city.army.sword} · Thực {city.res.food.toFixed(1)} · Gỗ {city.res.wood.toFixed(1)}</p><p>{message}</p>
  <FarmGroupCare city={city} tile={idx(20,20)} busy={false} act={act}/>
  <button disabled={!!city.b[idx(20,20)].tendUntil||farmRemaining(city.b[idx(20,20)])>=600} onClick={()=>act({type:'tendFarm',x:20,y:20})}>Chăm riêng ruộng đầu</button>
  <ul>{plots.map(([x,y])=><li key={idx(x,y)}>Ruộng {x},{y}: {Math.ceil(farmRemaining(city.b[idx(x,y)]))} dinh dưỡng{city.b[idx(x,y)].tendUntil?' · đang cải tạo':''}</li>)}</ul>
  <button onClick={()=>setModal('economy')}>Thu chi</button><button onClick={()=>setModal('army')}>Quản lý quân</button>
  {modal==='economy'&&<EconomySummary city={city} now={city.last} stats={stats(city,derive(city),city.last)} onClose={()=>setModal(null)}/>}
  {modal==='army'&&<ArmyManagement city={city} now={city.last} busy={false} act={act} onClose={()=>setModal(null)}/>}
 </main>;
}
