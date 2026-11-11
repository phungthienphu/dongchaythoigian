'use client';
/** Local-only era 7–9 UI fixture: the real Game with mocked APIs and maxEra 9. No account, no server data. */
import {useEffect,useRef,useState} from 'react';
import Game from '@/components/Game';
import {eraPreview} from '@/lib/era-preview';
import {applyAction,G,RES,W,settle,type Action,type BKey,type City} from '@/lib/engine';
import {initializeMagic,magicSiteId,stepMagic} from '@/lib/magic';
const RULES={maxEra:9};
function fixture(era:number){
 const now=Date.now(),c=eraPreview(6,now);c.era=era;
 for(const b of Object.values(c.b))if(b.k==='hall')b.lvl=era;
 initializeMagic(c,now);const m=c.magic!;
 m.researched.push('conduction','warcraft','lifecraft');if(era>=8)m.researched.push('elements','pact');if(era>=9)m.researched.push('gatecraft');
 for(const r of RES)c.res[r]=Math.max(c.res[r],5000);
 const cx=c.camp%W+6,cy=Math.floor(c.camp/W)-8;
 const free=(x:number,y:number)=>{const i=y*W+x;return c.t[i]===G&&!c.b[i]&&c.seen[i];};
 const place=(k:BKey,dx:number,dy:number)=>{for(let r=0;r<6;r++)for(let oy=-r;oy<=r;oy++)for(let ox=-r;ox<=r;ox++){const x=cx+dx+ox,y=cy+dy+oy;if(free(x,y)){c.b[y*W+x]={k,lvl:1,doneAt:null,uid:m.nextUid++,builtAt:now-3600000};return y*W+x;}}return -1;};
 const staff=(tile:number,n:number)=>{const idle=c.people.filter(p=>p.task.t==='idle').slice(0,n);for(const p of idle)p.task={t:'work',at:tile};};
 place('relocationoffice',-6,-2);place('machine',-6,1);
 const wells=[place('aetherwell',0,0),place('aetherwell',0,4)];for(const w of wells)staff(w,2);
 staff(place('mageacademy',2,1),4);place('wardcircle',-2,2);place('manarelay',4,6);place('rivershrine',8,0);
 if(era>=8){for(const [k,dx,dy] of [['firealtar',2,-2],['watertemple',4,-2],['woodgrove',2,4],['earthtemple',4,2]] as const)staff(place(k,dx,dy),3);place('harmonizer',-2,-2);place('golemworks',6,2);}
 if(era>=9){place('spiritgate',3,0);place('worldmatrix',3,3);place('covenantaltar',5,0);place('observatory',-3,0);place('teleportdock',-4,4);place('teleportdock',-4,7);}
 stepMagic(c,now+60000);for(const s of Object.values(c.b))if(s.k==='aetherwell'&&s.uid!==undefined)m.mana[magicSiteId(s)]=900;
 settle(c,now);return c;
}
export default function MagicUIHarness(){
 const city=useRef<City|null>(null);const [ready,setReady]=useState(false),[era,setEra]=useState(9),[epoch,setEpoch]=useState(0);
 useEffect(()=>{
  const original=window.fetch;city.current=fixture(9);
  window.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
   const path=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.origin).pathname;
   if(!path.startsWith('/api/'))return original(input,init);
   const c=city.current!,now=Date.now();
   if(path==='/api/city'){settle(c,now);return Response.json({name:'Làng ma pháp thử',state:structuredClone(c),serverNow:now});}
   if(path==='/api/city/action'){const error=applyAction(c,JSON.parse(String(init?.body)) as Action,now,RULES);return Response.json({state:structuredClone(c),serverNow:now,...(error?{error}:{})},{status:error?400:200});}
   if(path==='/api/me')return Response.json({user:{id:'magic-local',name:'Người chơi thử',email:'',friendCode:'LOCAL2',hasCity:true},friends:[]});
   if(path==='/api/battles')return Response.json({battles:[],enabled:true,serverNow:now});
   if(path==='/api/market')return Response.json({orders:[],caravans:[],enabled:true,playerId:'magic-local',serverNow:now});
   if(path==='/api/diplomacy')return Response.json({messages:[],serverNow:now});
   if(path==='/api/leaderboard')return Response.json({rows:[]});
   if(path==='/api/world')return Response.json({nations:[{id:'magic-local',name:'Làng ma pháp thử',era:c.era,pop:c.pop,score:100,x:50,y:50,me:true,friend:false}]});
   return Response.json({error:'Bản thử chặn API bên ngoài.'},{status:403});
  }) as typeof fetch;
  setReady(true);return()=>{window.fetch=original;};
 },[]);
 return <>{ready&&<Game key={epoch} rules={RULES}/>}
  <details className="ui-preview-tools"><summary>Thử ma pháp</summary><p>Local · không dùng tài khoản hoặc dữ liệu thật.</p><label>Thời đại<select value={era} onChange={e=>{city.current=fixture(+e.target.value);setEra(+e.target.value);setEpoch(n=>n+1);}}>{[7,8,9].map(e=><option key={e} value={e}>Thời {e}</option>)}</select></label></details>
 </>;
}
