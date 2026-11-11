'use client';
/** Render-only village fixture for era 7–9 spell visuals. Effects are injected on a
 * timeline into a local City; no engine step, account or server is involved. */
import {useEffect,useRef,useState} from 'react';
import {eraPreview} from '@/lib/era-preview';
import {G,R,W,derive,type BKey} from '@/lib/engine';
import {initializeMagic,magicSiteId,stepMagic} from '@/lib/magic';
import {MAGIC_SPELLS} from '@/lib/magic-data';
import {setManaOverlay} from '@/lib/mana-overlay';
import type {ZombieState} from '@/lib/zombies';
import {drawCity,fitView,focusOn,camView,type Cam} from '@/components/draw';
const LOOP=12000;
function fixture(){
 const now=Date.now(),c=eraPreview(6,now);c.era=9;
 for(const b of Object.values(c.b))if(b.k==='hall')b.lvl=9;
 initializeMagic(c,now);const m=c.magic!;m.researched.push('conduction','warcraft','lifecraft','elements','pact','gatecraft');
 const cx=c.camp%W+6,cy=Math.floor(c.camp/W)-8;
 // Clear a land plot so the magic quarter reads on its own.
 for(let y=cy-4;y<=cy+10;y++)for(let x=cx-7;x<=cx+9;x++){const i=y*W+x;if(c.b[i]?.k!=='hall')delete c.b[i];if(c.t[i]!==R)c.t[i]=G;}
 const free=(x:number,y:number)=>{const i=y*W+x;return c.t[i]===G&&!c.b[i];};
 const place=(k:BKey,dx:number,dy:number)=>{for(let r=0;r<6;r++)for(let oy=-r;oy<=r;oy++)for(let ox=-r;ox<=r;ox++){const x=cx+dx+ox,y=cy+dy+oy;if(free(x,y)){c.b[y*W+x]={k,lvl:1,doneAt:null,uid:m.nextUid++,builtAt:now-3600000};return y*W+x;}}return -1;};
 const tiles:Record<string,number>={};
 for(const [k,dx,dy] of [['aetherwell',0,0],['manaspire',0,4],['wardcircle',-2,2],['manarelay',4,6],['rivershrine',8,0],['mageacademy',2,1],['firealtar',2,-2],['watertemple',4,-2],['woodgrove',2,4],['earthtemple',4,2],['harmonizer',-2,-2],['worldmatrix',3,3],['teleportdock',-4,4],['teleportdock',-4,8],['riverpalace',6,5],['farm',-1,6]] as const)tiles[k+(tiles[k]!==undefined?'2':'')]=place(k as BKey,dx,dy);
 stepMagic(c,now+60000);for(const s of Object.values(c.b))if(s.uid!==undefined&&(s.k==='aetherwell'||s.k==='manaspire'))m.mana[magicSiteId(s)]=900;
 c.seen.fill(1);
 const dockA=c.b[tiles.teleportdock].uid!,dockB=c.b[tiles.teleportdock2].uid!;m.dockPairs=[[dockA,dockB]];
 c.army={firemage:1,watermage:1,golem:1,spiritdeer:1,dragon:1,tortoise:1,phoenix:1};
 return {c,tiles,cx,cy,dockA,dockB};
}
/** Timeline: zombies walk in, spells fire on their engine cadences, guards cast and take hits. */
function stage(f:ReturnType<typeof fixture>,t:number,base:number){
 const {c,tiles,cx,cy}=f,m=c.magic!,at=base+t,cyc=(n:number)=>base+Math.floor(t/n)*n,xy=(tile:number)=>({x:tile%W+.5,y:Math.floor(tile/W)+.5});
 const ward=xy(tiles.wardcircle),well=xy(tiles.aetherwell);
 const actors=[0,1,2,3,4,5].map(n=>({id:n+1,kind:(n===5?'breaker':n===4?'super':'normal') as 'normal',hp:60,maxHp:100,x:ward.x-3.2+n*.45+Math.sin(t/900+n)*.2,y:ward.y+1.2+(n%3)*.5,era:9,until:at+60000,nextHit:0,repath:0,walking:true,hitAt:at-(t%1500),
  slows:{...(n<3?{roots:{amount:.3,until:at+1000}}:{}),...(n>=3?{lightpulse:{amount:.4,until:at+1000}}:{})}}));
 const guard=(u:string,dx:number,dy:number,extra={})=>({id:`${u}:0`,u,x:cx+dx+.5,y:cy+dy+.5,hp:u==='golem'?900-(t%3000<200?120:60):u==='dragon'?700:300,nextHit:0,anchor:0,...extra});
 const guards=[guard('firemage',-3,4,{castAt:cyc(3000)+MAGIC_SPELLS.fireball.cooldown}),guard('watermage',-2,5,{castAt:cyc(4000)+MAGIC_SPELLS.waterheal.cooldown}),guard('golem',-4,3),guard('spiritdeer',-1,4),guard('dragon',-5,5),guard('tortoise',-3,6),guard('phoenix',-1,6)];
 c.zombies={activatedAt:0,last:at,nextAt:at+60000,index:1,actors,guards,peaks:[],population:c.people.length,patrol:false,healthAt:at,report:{waves:1,killed:0,lost:0,infected:0,destroyed:0}} as unknown as ZombieState;
 m.effects=[{kind:'firestorm',x:well.x+2.5,y:well.y-1.5,start:cyc(LOOP),until:cyc(LOOP)+8000}];
 m.walls=[0,1,2].map(n=>({tile:(cy+1)*W+cx-5+n,hp:200-n*70,until:at+30000}));
 m.growth={[tiles.farm]:at+3600000};
 const loop=cyc(LOOP),palace=xy(tiles.riverpalace);
 m.mythEffects=[{id:1,kind:'thunder',x:ward.x-2,y:ward.y+2,start:loop,until:loop+5000},{id:2,kind:'sanctuary',x:cx-2.5,y:cy+5,start:loop+1000,until:loop+11000}];
 m.cooldowns={purify:loop+3000+MAGIC_SPELLS.purify.cooldown,cleanse:loop+6000+MAGIC_SPELLS.cleanse.cooldown,['heal:'+magicSiteId(c.b[tiles.rivershrine])]:cyc(5000)+MAGIC_SPELLS.waterheal.cooldown};
 m.shipments=[{id:1,from:f.dockA,to:f.dockB,resource:'rune',amount:40,arriveAt:loop+(t%LOOP<6000?30000:30000+LOOP)}];
 const route=Array.from({length:7},(_,n)=>(cy+7)*W+cx-3+n);void palace;
 m.treants=[{id:1,grove:'m1',tile:route[0],phase:'deliver',route,at:loop,nextAt:loop+LOOP-500,load:30,carried:30,resource:'rune'}];
}
export default function MagicPreview(){
 const canvas=useRef<HTMLCanvasElement>(null),[still,setStill]=useState(false),[overlay,setOverlay]=useState(false);
 useEffect(()=>{if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)setStill(true);},[]);
 useEffect(()=>{setManaOverlay(overlay);return()=>setManaOverlay(false);},[overlay]);
 useEffect(()=>{
  const f=fixture(),cv=canvas.current!,ctx=cv.getContext('2d')!,D=derive(f.c),fit=fitView(1000,620),q=new URLSearchParams(location.search),zoom=+(q.get('z')??5.4),cam:Cam={zoom,px:0,py:0};focusOn(fit,cam,f.cx+1+(+(q.get('dx')??0)),f.cy+3+(+(q.get('dy')??0)),zoom);
  let raf=0;const start=performance.now(),base=Date.now();
  const paint=(time:number)=>{const t=still?3400:(time-start)%LOOP;stage(f,t,base);
   drawCity(ctx,f.c,D,{v:camView(fit,cam),now:base+t,anim:still?0:time,selected:null,hover:null,tool:null,villagers:[],picked:new Set(),fx:[],chopping:new Set()});
   if(!still&&!document.hidden)raf=requestAnimationFrame(paint);};
  raf=requestAnimationFrame(paint);const resume=()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(paint);};document.addEventListener('visibilitychange',resume);
  return()=>{cancelAnimationFrame(raf);document.removeEventListener('visibilitychange',resume);};
 },[still,overlay]);
 return <main style={{minHeight:'100vh',background:'#10231d',color:'#eee2c3',padding:24}}>
  <h1>Phép ma pháp trong làng</h1>
  <p>Làng giả lập thời 9, chỉ vẽ: zombie bị Trói rễ/Linh quang/Hỏa trận, Bão lửa, Thạch bích, Mưa sinh trưởng, Thiên lôi, Hộ giới, Thanh tẩy/Tịnh hóa, Thủy hồi, Hỏa cầu, thần thú bị đánh, linh mộc vận tải, bến dịch chuyển và dòng mana. Không đọc hoặc ghi tài khoản.</p>
  <div style={{display:'flex',gap:16}}><label><input type="checkbox" checked={still} onChange={e=>setStill(e.target.checked)}/> Giảm chuyển động</label><label><input type="checkbox" checked={overlay} onChange={e=>setOverlay(e.target.checked)}/> Lớp mana</label></div>
  <canvas ref={canvas} width={1000} height={620} style={{width:'100%',maxWidth:1000,marginTop:12}} aria-label="Hiệu ứng phép trong làng giả lập"/>
 </main>;
}
