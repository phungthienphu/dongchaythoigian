'use client';
import {useEffect,useRef,useState} from 'react';
import {newCity,idx,derive,type City} from '@/lib/engine';
import {stepZombies} from '@/lib/zombies';
import {drawCity,fitView,focusOn,camView,type Cam} from '@/components/draw';
import {Crowd} from '@/components/villagers';
function fixture(swarm=false):City{
 const c=newCity(0,123);c.era=5;c.t.fill(0);c.seen.fill(1);c.b={};c.camp=idx(48,48);c.camps=[];c.herds=[];c.army={spear:4,bow:4};c.guardPosts=[{x:50,y:48},{x:50,y:50}];
 for(const [x,y,k]of [[47,48,'hall'],[49,47,'house'],[48,50,'refuge'],[47,51,'healer'],[51,50,'watchtower'],[46,49,'barracks']] as const)c.b[idx(x,y)]={k,lvl:k==='hall'?5:1,doneAt:null};
 for(let y=46;y<=52;y++)if(y!==49)c.b[idx(53,y)]={k:'wall',lvl:1,doneAt:null};
 c.people=Array.from({length:8},(_,i)=>({id:i+1,name:`Dân ${i+1}`,task:i===0?{t:'work' as const,at:idx(47,51)}:{t:'idle' as const},pos:idx(48+i%3,48+Math.floor(i/3))}));c.pop=8;c.nextId=9;c.res.food=1000;
 c.zombies!.nextAt=5000;c.zombies!.warning=idx(55,49);c.zombies!.peaks=[{at:0,pop:swarm?680:360}];if(swarm){c.army={};delete c.b[idx(51,50)];}return c;
}
export default function ZombieSimulation(){
 const canvas=useRef<HTMLCanvasElement>(null),scene=useRef<City|null>(null),clock=useRef(0);const [version,setVersion]=useState(0),[swarm,setSwarm]=useState(false);if(!scene.current)scene.current=fixture();
 useEffect(()=>{const c=scene.current!,cv=canvas.current!,ctx=cv.getContext('2d')!,crowd=new Crowd(),cam:Cam={zoom:4.3,px:0,py:0},fit=fitView(960,500),D=derive(c);focusOn(fit,cam,50,49,4.3);crowd.sync(c);let frame=0,last=0;
 const paint=(at:number)=>{if(!document.hidden){crowd.update(c,last?Math.min(.05,(at-last)/1000):0,clock.current);drawCity(ctx,c,D,{v:camView(fit,cam),now:clock.current,anim:at,selected:null,hover:null,tool:null,villagers:crowd.list,picked:new Set(),fx:[],chopping:new Set()});}last=at;frame=requestAnimationFrame(paint);};frame=requestAnimationFrame(paint);return()=>cancelAnimationFrame(frame);},[version]);
 const advance=(seconds:number)=>{for(let n=0;n<seconds;n++){clock.current+=1000;stepZombies(scene.current!,clock.current);scene.current!.last=clock.current;}setVersion(v=>v+1);};const c=scene.current;
 return <section><h2>Thử phòng thủ trên bản đồ</h2><p>{swarm?'Làng giả lập riêng: 8 dân, không lính/tháp để xem bầy 17 zombie tản đường quanh tường.':'Làng giả lập riêng: 8 dân, 8 lính, tường, tháp và y tế. Đợt thử 9 zombie.'} Không đọc hoặc ghi tài khoản thật.</p><div style={{display:'flex',gap:12,flexWrap:'wrap'}}><label><input type="checkbox" checked={swarm} onChange={e=>{const enabled=e.target.checked;setSwarm(enabled);scene.current=fixture(enabled);clock.current=0;setVersion(v=>v+1);}}/> Xem bầy tản đường (không phòng thủ)</label><button onClick={()=>advance(1)}>Tiến 1 giây</button><button onClick={()=>advance(10)}>Tiến 10 giây</button><button onClick={()=>advance(60)}>Tiến 1 phút</button><button onClick={()=>{scene.current=fixture(swarm);clock.current=0;setVersion(v=>v+1);}}>Đặt lại</button><output>Giây {clock.current/1000} · {c.zombies!.actors.length} zombie · hạ {c.zombies!.report.killed} · mất {c.zombies!.report.destroyed} nhà</output></div><canvas ref={canvas} width={960} height={500} style={{width:'100%',maxWidth:960,marginTop:16}} aria-label="Bản đồ giả lập zombie, lính bảo vệ, dân, tường và tháp"/></section>;
}
