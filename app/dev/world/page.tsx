"use client";
// Local, account-free fixture. All trips and results below stay in component state.
import { useEffect, useState } from 'react';
import WorldMap from '@/components/WorldMap';
import { G, idx, newCity, sendEnvoy, settle } from '@/lib/engine';
import { beginDiscovery, completeDiscoveries, knowsNation, SCOUT_MS } from '@/lib/world-discovery';
import type { Nation } from '@/lib/world';
const home:Nation={id:'demo-home',name:'Làng thử nghiệm',era:1,pop:6,score:10,x:50,y:50,me:true,friend:false};
const friend:Nation={id:'demo-friend',name:'Làng bạn bè',era:2,pop:12,score:30,x:60,y:55,me:false,friend:true};
function initial(){const c=newCity(0,1);c.t.fill(G);c.seen.fill(1);c.b={[idx(10,10)]:{k:'envoy',lvl:1,doneAt:null}};return c;}
function advance(city:ReturnType<typeof initial>,at:number){
 const c=structuredClone(city);completeDiscoveries(c,home.id,home,[{_id:friend.id,name:friend.name,world:friend}],at);settle(c,at);return {city:c,at};
}
export default function Page(){
 const [sim,setSim]=useState(()=>({city:initial(),at:0}));
 const [feedback,setFeedback]=useState<{text:string;err?:boolean}>({text:'Bản thử độc lập; không dùng tài khoản hay dữ liệu thật.'});
 const {city,at}=sim,nations=[home,...(knowsNation(city,friend.id)?[friend]:[])];
 useEffect(()=>{const tick=setInterval(()=>setSim(s=>advance(s.city,s.at+1000)),1000);return()=>clearInterval(tick);},[]);
 return <main style={{position:'fixed',inset:0}}>
  <WorldMap signedIn={false} onFriendsChanged={async()=>{}} wars={[]} warEnabled={false} onAttack={()=>{}} nations={nations} city={city} now={()=>at} busy={false} feedback={feedback}
   onEnvoy={id=>{const c=structuredClone(city);const error=id?sendEnvoy(c,friend.id,friend.name,Math.round(Math.hypot(home.x-friend.x,home.y-friend.y)),at):beginDiscovery(c,at);setSim({city:c,at});setFeedback(error?{text:error,err:true}:{text:id?'Đã cử sứ giả; nét đứt xanh là tuyến đi của bạn.':'Đang dò tìm; chưa xác định đích nên chưa vẽ tuyến trên thế giới.'});}}
   onVisit={()=>setFeedback({text:'Đã bấm xem làng.'})} onClose={()=>setFeedback({text:'Đã bấm về làng.'})}/>
  <aside style={{position:'absolute',bottom:14,left:14,zIndex:20,maxWidth:'90vw',padding:8,background:'#14201d'}}>
   <button onClick={()=>{setSim({city:initial(),at:0});setFeedback({text:'Đã đặt lại bản thử.'});}}>Đặt lại bản thử</button>{' '}
   <button onClick={()=>setSim(s=>advance(s.city,s.at+SCOUT_MS))}>Mô phỏng đủ 2 phút</button>{' '}
   <button onClick={()=>setSim(s=>advance(s.city,Math.max(s.at,...(s.city.trips??[]).map(tr=>tr.back))))}>Mô phỏng sứ giả trở về</button>
  </aside>
 </main>;
}
