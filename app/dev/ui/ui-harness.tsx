'use client';
import {useEffect,useRef,useState} from 'react';
import Game from '@/components/Game';
import {eraPreview} from '@/lib/era-preview';
import {LOCAL_RULES} from '@/lib/eras';
import {applyAction,ERA_NAMES,derive,newCity,settle,stats,type Action,type City} from '@/lib/engine';
type Scenario='normal'|'hungry'|'storage'|'damaged'|'crowded';
function fixture(era:number,scenario:Scenario){
  const now=Date.now(),c=era<3?newCity(now,728193):eraPreview(era,now);c.era=era;c.manualWorkforce=true;
  if(scenario==='hungry'){c.res.food=0;c.hunger={lossMs:0,warned:0,...c.hunger,stressMs:25*60000};}
  if(scenario==='damaged')for(const b of Object.values(c.b).slice(0,3))b.burned=true;
  if(scenario==='crowded'){const base=c.people[0];if(base)while(c.people.length<500)c.people.push({...structuredClone(base),id:c.nextId++,name:`Dân thử ${c.people.length+1}`,task:{t:'idle'}});c.pop=c.people.length;}
  if(scenario==='storage'){
    const cap=stats(c,derive(c),now).storage;c.res.wood=cap.wood;
    for(const p of c.people.slice(0,8))p.haul={phase:'unload',at:now,nextAt:now+600000,tile:c.camp,route:[c.camp],routeStart:now,resource:'wood',carried:10,capacity:10,drop:c.camp,taskKey:JSON.stringify(p.task),resting:true};
  }
  return c;
}
export default function UIHarness(){
  const city=useRef<City|null>(null),requests=useRef<Record<string,number>>({});
  const [requestSnapshot,setRequestSnapshot]=useState('{}');
  const [ready,setReady]=useState(false),[era,setEra]=useState(6),[scenario,setScenario]=useState<Scenario>('normal'),[epoch,setEpoch]=useState(0);
  useEffect(()=>{
    const original=window.fetch;city.current=fixture(6,'normal');
    window.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
      const path=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.origin).pathname;
      if(!path.startsWith('/api/'))return original(input,init);
      requests.current[path]=(requests.current[path]??0)+1;
      const c=city.current!,now=Date.now();
      if(path==='/api/city'){settle(c,now);return Response.json({name:'Làng bên sông',state:structuredClone(c),serverNow:now});}
      if(path==='/api/city/action'){const error=applyAction(c,JSON.parse(String(init?.body)) as Action,now,LOCAL_RULES);return Response.json({state:structuredClone(c),serverNow:now,...(error?{error}:{})},{status:error?400:200});}
      if(path==='/api/me')return Response.json({user:{id:'ui-local',name:'Người chơi thử',email:'',friendCode:'LOCAL1',hasCity:true},friends:[]});
      if(path==='/api/battles')return Response.json({battles:[],enabled:true,serverNow:now});
      if(path==='/api/market'){
        if(init?.method==='POST')return Response.json({error:'QA: từ chối giao thương để kiểm tra phản hồi lỗi, không dùng dữ liệu thật.'},{status:400});
        return Response.json({orders:Array.from({length:10},(_,n)=>({_id:`ui-order-${n}`,seller:n===0?'ui-local':`ui-seller-${n}`,sellerName:n===0?'Làng bên sông':`Làng giao thương ${n}`,resource:n%2?'wood':'food',amount:50+n*10,currency:'gold',price:10+n,escorts:{club:2},createdAt:now-n*1000,status:'open'})),caravans:[],enabled:true,playerId:'ui-local',serverNow:now});
      }
      if(path==='/api/diplomacy')return Response.json({messages:[],serverNow:now});
      if(path==='/api/leaderboard')return Response.json({rows:[]});
      if(path==='/api/world')return Response.json({nations:[{id:'ui-local',name:'Làng bên sông',era:c.era,pop:c.pop,score:100,x:50,y:50,me:true,friend:false}]});
      return Response.json({error:'Bản thử UI chặn API bên ngoài.'},{status:403});
    }) as typeof fetch;
    setReady(true);return()=>{window.fetch=original;};
  },[]);
  const reset=(e:number,s:Scenario)=>{city.current=fixture(e,s);requests.current={};setEra(e);setScenario(s);setEpoch(n=>n+1);};
  return <>
    {ready&&<Game key={epoch} rules={LOCAL_RULES}/>}
    <details className="ui-preview-tools"><summary>Thử UI</summary><p>Local · không dùng tài khoản hoặc dữ liệu thật.</p><label>Thời đại<select aria-label="Thời đại thử UI" value={era} onChange={e=>reset(+e.target.value,scenario)}>{[1,2,3,4,5,6].map(e=><option key={e} value={e}>{ERA_NAMES[e]}</option>)}</select></label><label>Kịch bản<select aria-label="Kịch bản thử UI" value={scenario} onChange={e=>reset(era,e.target.value as Scenario)}><option value="normal">Bình thường</option><option value="hungry">Đang đói</option><option value="storage">Kho đầy</option><option value="damaged">Nhà hư hại</option><option value="crowded">500 dân</option></select></label><button onClick={()=>reset(era,scenario)}>Tạo lại mẫu</button><details><summary>Request QA</summary><button onClick={()=>setRequestSnapshot(JSON.stringify(requests.current,null,2))}>Cập nhật bộ đếm</button><pre>{requestSnapshot}</pre></details></details>
  </>;
}
