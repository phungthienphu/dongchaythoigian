'use client';
import {useState} from 'react';
import ArmyRecruitment from '@/components/ArmyRecruitment';
import {LOCAL_RULES} from '@/lib/eras';
import {G,HOUR,RES,applyAction,armyCap,armyUsed,idx,newCity,settle,type Action,type City} from '@/lib/engine';

const sites=[idx(20,20),idx(30,20),idx(40,20)];
function fixture(era=6):City{
 const c=newCity(0,123);c.era=era;c.t.fill(G);c.seen.fill(1);c.b={};c.people=[];c.pop=0;c.camps=[];c.herds=[];c.army={};c.manualWorkforce=true;c.camp=idx(20,22);
 for(const tile of sites)c.b[tile]={k:'barracks',lvl:3,doneAt:null};c.b[idx(18,18)]={k:'grandstore',lvl:3,doneAt:null};
 c.b[idx(22,18)]={k:'logistics',lvl:1,doneAt:null};c.b[idx(24,18)]={k:'infirmary',lvl:1,doneAt:null};
 for(const r of RES)c.res[r]=30000;c.wildernessAt=100*HOUR;c.disaster={kind:'flood',at:100*HOUR,level:1,center:0};settle(c,0);return c;
}
export default function RecruitmentHarness(){
 const [city,setCity]=useState(fixture),[message,setMessage]=useState('');
 const act=async(action:Action)=>{const c=structuredClone(city),error=applyAction(c,action,c.last);setMessage(error??'Đã nhận lệnh tuyển');if(error)return false;setCity(c);return true;};
 const advance=(ms:number)=>{const c=structuredClone(city);settle(c,c.last+ms);setCity(c);};
 return <main style={{maxWidth:780,padding:20,margin:'auto'}}><h1>Kiểm thử tuyển quân</h1><p>Dữ liệu giả, không kết nối tài khoản hoặc API game.</p>
  <button onClick={()=>{setCity(fixture(3));setMessage('');}}>Đặt lại Sắt</button><button onClick={()=>{setCity(fixture());setMessage('');}}>Đặt lại Hiện đại</button>
  <button onClick={()=>advance(30000)}>Chạy 30 giây</button><button onClick={()=>advance(60000)}>Chạy 1 phút</button>
  <button onClick={()=>{const c=structuredClone(city);c.b[sites[0]].burned=!c.b[sites[0]].burned;setCity(c);}}>Cháy / sửa trại đầu</button>
  <button onClick={()=>{const c=structuredClone(city);c.res.food=1;setCity(c);}}>Chỉ còn 1 thực</button>
  <button onClick={()=>{const c=structuredClone(city);for(const r of RES)c.res[r]=30000;setCity(c);}}>Bổ sung tài nguyên</button>
  <p role="status">Đời {city.era} · Chỗ {armyUsed(city)}/{armyCap(city)} · Lính gậy {city.army.club??0} · Kiếm sĩ {city.army.sword??0} · Đang tuyển {city.queue.length} · Thực {Math.floor(city.res.food)}</p><p>{message}</p>
  <ArmyRecruitment city={city} now={city.last} busy={false} act={act} rules={LOCAL_RULES}/>
 </main>;
}
