"use client";
import {useEffect,useRef,useState} from 'react';
import Game from '@/components/Game';
import {applyAction,F,G,H,HOUR,idx,newCity,R,riverSet,SEASON_MS,settle,type Action,type City} from '@/lib/engine';
function fixture(now:number,protectedBank=false){
 const c=newCity(now,123);c.t.fill(G);c.seen.fill(1);c.people=[];c.pop=0;c.herds=[];c.camps=[];c.b={};c.era=2;
 c.camp=idx(45,48);c.xs=Array(H).fill(40);for(const i of riverSet(c.xs))c.t[i]=R;
 c.b[idx(43,48)]={k:'dock',lvl:2,doneAt:null,shipQueue:[now+90000]};
 c.b[idx(45,48)]={k:'hall',lvl:2,doneAt:null};c.b[idx(47,48)]={k:'storehouse',lvl:3,doneAt:null};
 c.b[idx(45,51)]={k:'house',lvl:1,doneAt:null};
 if(protectedBank)c.b[idx(43,47)]={k:'levee',lvl:1,doneAt:null};
 c.transportShips=2;c.res={wood:1800,food:1500,stone:1000,copper:400,gold:200,diamond:10,coal:0,aetherCrystal:0,rune:0,essence:0,celestialStone:0};
 c.wildernessAt=now+1e10;c.disaster={kind:'earthquake',at:now+1e10,level:0,center:c.camp};return c;
}
export default function RiverHarness(){
 const city=useRef<City|null>(null),offset=useRef(0);const [ready,setReady]=useState(false),[epoch,setEpoch]=useState(0);
 useEffect(()=>{
  const original=window.fetch;city.current=fixture(Date.now());
  window.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
   const path=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.origin).pathname;
   if(!path.startsWith('/api/'))return original(input,init);
   const now=Date.now()+offset.current,c=city.current!;
   if(path==='/api/city'){settle(c,now);return Response.json({name:'Bến thử · sông và thiên tai',state:structuredClone(c),serverNow:now});}
   if(path==='/api/city/action'){const error=applyAction(c,JSON.parse(init?.body as string) as Action,now);return Response.json({state:structuredClone(c),serverNow:now,...(error?{error}:{})},{status:error?400:200});}
   if(path==='/api/me')return Response.json({user:{id:'river-local',name:'Người chơi thử',email:'',friendCode:'LOCAL1',hasCity:true},friends:[]});
   if(path==='/api/diplomacy')return Response.json({messages:[],serverNow:now});
   if(path==='/api/leaderboard')return Response.json({rows:[]});
   if(path==='/api/world')return Response.json({nations:[]});
   if(path==='/api/battles')return Response.json({battles:[],enabled:false});
   return Response.json({error:'Bản thử độc lập: không gọi API tài khoản.'},{status:403});
  }) as typeof fetch;
  setReady(true);return()=>{window.fetch=original;};
 },[]);
 const refresh=()=>setEpoch(n=>n+1);
 const waitingWorkers=()=>{
  offset.current=0;const c=fixture(Date.now());
  c.people=[{id:1,name:'Dân chờ 1',assignment:'manual',task:{t:'idle',at:idx(44,51)},pos:idx(44,51)},{id:2,name:'Dân chờ 2',assignment:'manual',task:{t:'idle',at:idx(46,51)},pos:idx(46,51)}];
  c.pop=2;c.nextId=3;c.t[idx(45,53)]=F;city.current=c;refresh();
 };
 const demolition=(hours:number)=>{
  offset.current=0;const now=Date.now(),c=fixture(now);
  c.b[idx(45,51)]={k:'house',lvl:1,doneAt:null,builtAt:now-hours*HOUR,investment:{wood:120,stone:40}};
  city.current=c;refresh();
 };
 const shift=(protectedBank:boolean)=>{
  offset.current=0;const now=Date.now(),c=fixture(now,protectedBank);
  c.t0=now+1000-2*SEASON_MS;c.seasonIdx=1;c.shift={warn:0,at:2,xs:Array(H).fill(45),done:false};
  settle(c,now+1000);offset.current=1000;city.current=c;refresh();
 };
 return <><aside style={{position:'sticky',top:0,zIndex:10000,padding:10,background:'#233c32',border:'1px solid #ac995a'}}><b>Local · Không dùng database tài khoản</b> <button onClick={()=>{offset.current=0;city.current=fixture(Date.now());refresh();}}>Cảng mắc cạn</button> <button onClick={()=>shift(false)}>Sông đổi dòng</button> <button onClick={()=>shift(true)}>Đê bảo vệ</button> <button onClick={()=>{const c=city.current!,now=Date.now()+offset.current;c.disaster={kind:'earthquake',at:now+1000,level:1,center:c.camp};settle(c,now+2000);offset.current+=2000;refresh();}}>Động đất</button> <button onClick={()=>{offset.current+=180000;refresh();}}>+3 phút</button> <button onClick={()=>demolition(3)}>Phá dỡ · nhà 3 giờ</button> <button onClick={()=>demolition(7)}>Phá dỡ · nhà 7 giờ</button> <button onClick={waitingWorkers}>Dân đứng chờ</button></aside>{ready&&<Game key={epoch}/>}</>;
}
