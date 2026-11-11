'use client';
import {useEffect,useRef,useState} from 'react';
import Game from '@/components/Game';
import BattleView from '@/components/BattleView';
import {createBattle,type BattleSide} from '@/lib/battle';
import {newCity,G,F,idx,settle,applyAction,UNITS,type Action,type City} from '@/lib/engine';

function fixture(){
 const c=newCity(Date.now(),123);c.t.fill(G);c.seen.fill(1);c.b={};c.herds=[];c.camps=[];c.camp=idx(48,48);c.army={sword:5,bow:4};if(c.auto)c.auto.on=false;c.manualWorkforce=true;
 c.b[idx(48,48)]={k:'hall',lvl:3,doneAt:null};c.b[idx(47,46)]={k:'storehouse',lvl:3,doneAt:null};c.b[idx(50,50)]={k:'farm',lvl:1,doneAt:null};c.t[idx(53,50)]=F;c.era=3;
 c.people=Array.from({length:6},(_,n)=>({id:n+1,name:`Dân thử ${n+1}`,assignment:'manual' as const,pos:idx(49+n%3,45+Math.floor(n/3)),task:{t:'idle' as const,at:idx(49+n%3,45+Math.floor(n/3))}}));c.pop=6;c.nextId=7;
 c.homeOrders=Object.fromEntries(['sword:0','sword:1','sword:2','sword:3','sword:4','bow:0','bow:1','bow:2','bow:3'].map((id,n)=>[id,{x:45.5+n%3,y:49.5+Math.floor(n/3),route:[idx(45+n%3,49+Math.floor(n/3))],at:c.last}]));
 c.wildernessAt=c.last+1e9;c.disaster={kind:'earthquake',at:c.last+1e9,level:0,center:c.camp};c.res={food:10000,wood:10000,stone:10000,copper:10000,gold:1000,diamond:100,coal:0,aetherCrystal:0,rune:0,essence:0,celestialStone:0};return c;
}
function combat(side:BattleSide){
 const c=fixture();c.b={};c.people=[];c.army={sword:30,bow:30};delete c.homeOrders;const now=Date.now();
 const battle=createBattle({id:'local-groups',attackerId:'a',defenderId:'d',attacker:c,defender:c,troops:{sword:30,bow:30},now,defenderOnline:true});
 for(const [n,g]of battle.groups.entries()){g.x=g.side===side?46.5:48;g.y=47.5+(n%2)*1.5;g.order={type:'guard',x:g.x,y:g.y};if(g.side!==side){g.u='medic';g.count=g.initial=5000;g.hp=g.count*UNITS.medic.hp;}}
 return {village:c,battle,side,socket:null,war:{_id:'local-groups',attackerName:'Quân tấn công thử',defenderName:'Quân phòng thủ thử',status:'fighting' as const,attackerId:'a',defenderId:'d',troops:{sword:30,bow:30},arrive:now}};
}
export default function SelectionHarness(){
 const city=useRef<City|null>(null),[ready,setReady]=useState(false),[packet,setPacket]=useState<ReturnType<typeof combat>|null>(null),[orders,setOrders]=useState('Chưa có lệnh.'),[epoch,setEpoch]=useState(0);
 useEffect(()=>{
  city.current=fixture();const original=window.fetch;
  window.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
   const path=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.origin).pathname;
   if(!path.startsWith('/api/'))return original(input,init);
   const c=city.current!,now=Date.now();
   if(path==='/api/city'){settle(c,now);return Response.json({name:'Làng thử chọn vùng',state:structuredClone(c),serverNow:now});}
   if(path==='/api/city/action'){const action=JSON.parse(init?.body as string) as Action,error=applyAction(c,action,now);setOrders(JSON.stringify({action,error}));return Response.json({state:structuredClone(c),serverNow:now,...(error?{error}:{})},{status:error?400:200});}
   if(path==='/api/me')return Response.json({user:{id:'selection-local',name:'Người chơi thử',email:'',friendCode:'LOCAL1',hasCity:false},friends:[]});
   if(path==='/api/diplomacy')return Response.json({messages:[],serverNow:now});
   if(path==='/api/leaderboard')return Response.json({rows:[]});
   return Response.json({error:'API tài khoản bị chặn trong bản thử.'},{status:403});
  }) as typeof fetch;
  setReady(true);return()=>{window.fetch=original;};
 },[]);
 return <>{!packet&&<aside style={{position:'fixed',zIndex:1000,top:150,left:10,maxWidth:430,padding:8,background:'#213e34',color:'#f1e4c6',fontSize:12}}><b>QA local · Không gọi database</b><div><button onClick={()=>setPacket(combat('attacker'))}>Combat tấn công</button><button onClick={()=>setPacket(combat('defender'))}>Combat phòng thủ</button><button onClick={()=>{city.current=fixture();setEpoch(n=>n+1);setOrders('Chưa có lệnh.');}}>Đặt lại</button></div><output>{orders}</output></aside>}{ready&&(packet?<BattleView id="local-groups" preview={packet} onClose={()=>setPacket(null)}/>:<Game key={epoch}/>)}</>;
}
