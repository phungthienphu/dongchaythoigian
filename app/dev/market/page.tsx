"use client";
// Isolated interaction/art fixture: no API calls, no live player data.
import {useState} from 'react';
import MarketPanel from '@/components/MarketPanel';
import WorldMap from '@/components/WorldMap';
import type {MarketController} from '@/components/useMarket';
import {G,idx,newCity} from '@/lib/engine';
import {caravanView} from '@/lib/market-rules';
import type {MarketData,Caravan} from '@/lib/market-types';
import {startRoadFight,advanceRoadFight} from '@/lib/road-combat';
const at=Date.now();
const c=newCity(at,1);c.t.fill(G);c.seen.fill(1);c.era=3;c.discoveries=['seller','buyer'];c.res.gold=200;c.res.diamond=20;c.army={club:10,sword:5};c.b={[idx(20,20)]:{k:'market',lvl:1,doneAt:null}};
const convoy:Caravan={_id:'demo-convoy',orderId:'demo-order',seller:'seller',buyer:'buyer',sellerName:'Làng tre',buyerName:'Làng ven sông',resource:'wood',amount:100,currency:'gold',price:20,from:{x:50,y:50},to:{x:70,y:50},depart:at-120000,arrive:at+480000,back:at+1080000,escorts:{club:3},initialEscorts:{club:3},createdAt:at,status:'travelling'};
const initial:MarketData={orders:[{_id:'demo-order',seller:'seller',sellerName:'Làng tre',resource:'wood',amount:100,currency:'gold',price:20,escorts:{club:3},createdAt:at,status:'open'}],caravans:[caravanView(convoy,'demo',c)!],enabled:true,playerId:'demo',serverNow:at};
const nations=[{id:'demo',name:'Làng của bạn',era:3,pop:12,score:30,x:60,y:57,me:true,friend:false},{id:'seller',name:'Làng tre',era:2,pop:12,score:30,x:50,y:50,me:false,friend:true},{id:'buyer',name:'Làng ven sông',era:3,pop:12,score:30,x:70,y:50,me:false,friend:false}];
export default function Page(){
 const [data,setData]=useState(initial),[world,setWorld]=useState(false),[target,setTarget]=useState<string>(),[message,setMessage]=useState('Bản thử riêng; không dùng tài khoản hay dữ liệu thật.');
 const market:MarketController={data,busy:false,error:'',refresh:async()=>{},act:async a=>{setMessage(`Đã thử: ${a.type}`);if(a.type==='create')setData(d=>({...d,orders:[{...a,_id:`demo-${d.orders.length}`,seller:'demo',sellerName:'Làng của bạn',status:'open',createdAt:at},...d.orders]}));if(a.type==='cancel')setData(d=>({...d,orders:d.orders.filter(o=>o._id!==a.id)}));if(a.type==='buy')setData(d=>({...d,orders:d.orders.filter(o=>o._id!==a.id)}));if(a.type==='raid')setData(d=>({...d,caravans:d.caravans.map(s=>({...s,canRaid:false,raid:{by:'demo',name:'Làng của bạn',from:{x:60,y:57},to:{x:57,y:50},depart:at-30000,meetAt:at+60000,units:a.units??{},initial:a.units??{}}}))}));return true;}};
 return <main style={{maxWidth:640,margin:'auto',padding:20}}><h1>Chợ và đoàn xe — bản thử</h1><p role="status">{message}</p><button onClick={()=>{setData(initial);setMessage('Đã đặt lại bản thử.');}}>Đặt lại</button><button onClick={()=>{const fight=startRoadFight({club:5},{club:5},at-1000);advanceRoadFight(fight,at);setData(d=>({...d,caravans:d.caravans.map(s=>({...s,status:'fighting',canRaid:false,escorts:fight.defenders,raid:{by:'demo',name:'Làng của bạn',from:{x:60,y:57},to:{x:57,y:50},depart:at-120000,meetAt:at-1000,units:fight.attackers,initial:{sword:5},fight}}))}));}}>Mô phỏng đang giao chiến</button><MarketPanel market={market} city={c} now={at} initialTarget={target} onWorld={()=>setWorld(true)}/>{world&&<div style={{position:"fixed",inset:0,zIndex:20}}><WorldMap caravans={data.caravans} onMarket={id=>{setTarget(id);setWorld(false);}} signedIn={false} onFriendsChanged={async()=>{}} wars={[]} warEnabled={false} onAttack={()=>{}} nations={nations} city={c} now={()=>Date.now()} busy={false} onEnvoy={()=>{}} onVisit={()=>{}} onClose={()=>setWorld(false)}/></div>}</main>;
}
