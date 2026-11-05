"use client";
// Local, account-free fixture for reviewing discovery UI. No API or database writes.
import { useState } from 'react';
import WorldMap from '@/components/WorldMap';
import { idx, newCity, settle } from '@/lib/engine';
import { beginDiscovery, completeDiscoveries, knowsNation, SCOUT_MS } from '@/lib/world-discovery';
import type { Nation } from '@/lib/world';
const home: Nation={id:'demo-home',name:'Làng thử nghiệm',era:1,pop:6,score:10,x:50,y:50,me:true,friend:false};
const friend: Nation={id:'demo-friend',name:'Làng bạn bè',era:2,pop:12,score:30,x:60,y:55,me:false,friend:true};
function initial(){const c=newCity(0,1);c.b[idx(1,1)]={k:'envoy',lvl:1,doneAt:null};return c;}
export default function Page(){
 const [city,setCity]=useState(initial),[at,setAt]=useState(0),[message,setMessage]=useState('Bản thử giao diện; không dùng tài khoản hay dữ liệu thật.');
 const nations=[home,...(knowsNation(city,friend.id)?[friend]:[])];
 return <main style={{position:'fixed',inset:0}}>
  <WorldMap wars={[]} warEnabled={false} onAttack={()=>{}} nations={nations} city={city} now={()=>at} busy={false}
   onEnvoy={()=>{const c=structuredClone(city);const error=beginDiscovery(c,at);setCity(c);setMessage(error??'Đã cử sứ giả dò tìm; chưa biết nước nào.');}}
   onVisit={()=>setMessage('Đã bấm xem làng.')} onClose={()=>setMessage('Đã bấm về làng.')}/>
  <aside style={{position:'absolute',bottom:14,left:14,zIndex:20,maxWidth:'90vw',padding:8,background:'#14201d'}}>
   <p role="status">{message}</p>
   <button onClick={()=>{setCity(initial());setAt(0);}}>Đặt lại bản thử</button>{' '}
   <button onClick={()=>{const c=structuredClone(city);completeDiscoveries(c,home.id,home,[{_id:friend.id,name:friend.name,world:friend}],SCOUT_MS);settle(c,SCOUT_MS);setCity(c);setAt(SCOUT_MS);}}>Mô phỏng đủ 2 phút</button>
  </aside>
 </main>;
}
