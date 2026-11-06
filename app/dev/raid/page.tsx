"use client";
// Isolated raid preview: no API requests or player saves.
import {useEffect,useRef,useState} from 'react';
import {drawCity,type View} from '@/components/draw';
import {Crowd} from '@/components/villagers';
import {newCity,G,R,HL,idx,derive,settle,raidPhase,raidActors,MIN,type City} from '@/lib/engine';
const view:View={TW:72,TH:36,ox:480,oy:-450,width:960,height:600,s:72/64};
const labels={warning:'Cảnh báo: chưa có quân xuất hiện',enter:'Man rợ đang tiến vào từ rìa làng',fight:'Man rợ đang giao chiến',retreat:'Man rợ đang rút lui'};
function fixture(blocked=false):City {
 const c=newCity(0,123);c.t.fill(G);c.seen.fill(1);c.camp=idx(20,20);c.camps=[];c.herds=[];c.people=c.people.slice(0,2);
 c.b={[idx(20,20)]:{k:'hall',lvl:3,doneAt:null},[idx(22,20)]:{k:'house',lvl:1,doneAt:null},[idx(21,22)]:{k:'storehouse',lvl:1,doneAt:null}};
 for(let y=0;y<96;y++)c.t[idx(25,y)]=R;for(let y=16;y<20;y++)c.t[idx(16,y)]=HL;
 if(blocked)for(let y=18;y<=23;y++)for(let x=18;x<=23;x++)if(x===18||x===23||y===18||y===23)c.b[idx(x,y)]={k:'wall',lvl:1,doneAt:null};
 for(const p of c.people){p.pos=idx(21,20);p.task={t:'idle'};delete p.haul;}
 c.army={club:20};c.res.food=5000;c.raid={warn:0,at:22*MIN,power:40,from:idx(10,30)};return c;
}
function describe(c:City,now:number){
 const phase=raidPhase(c,now);
 return `${phase?labels[phase]:'Đợt tấn công đã kết thúc'} · ${raidActors(c,now).length} actor · ${c.people.filter(p=>p.refuge).length} dân trú ẩn · ${c.log.filter(l=>l.msg.includes('nhưng bị đánh lui')).length} kết quả trận`;
}
export default function RaidPreview(){
 const canvas=useRef<HTMLCanvasElement>(null),[run,setRun]=useState(0),[mode,setMode]=useState<'warning'|'enter'|'fight'|'retreat'>('warning'),[blocked,setBlocked]=useState(false),[status,setStatus]=useState('');
 useEffect(()=>{
  const c=fixture(blocked);
  if(mode!=='warning'){
   c.raid!.at=1000;settle(c,1000);
   if(mode==='fight')settle(c,c.raidEncounter!.engage+1000);
   if(mode==='retreat')settle(c,c.raidEncounter!.resolveAt+1000);
  }
  setStatus(describe(c,c.last));
  const base=c.last,start=performance.now(),crowd=new Crowd();let raf=0,reported=0;
  const frame=(time:number)=>{
   const now=base+time-start;settle(c,now);crowd.sync(c);crowd.update(c,.016,now);
   const ctx=canvas.current?.getContext('2d');if(ctx)drawCity(ctx,c,derive(c),{v:view,now,anim:time,hover:null,selected:null,tool:null,villagers:crowd.list,picked:new Set(),fx:[],chopping:new Set()});
   if(time-reported>150){setStatus(describe(c,now));reported=time;}
   raf=requestAnimationFrame(frame);
  };raf=requestAnimationFrame(frame);return()=>cancelAnimationFrame(raf);
 },[run,mode,blocked]);
 return <main style={{padding:16,background:'#19362b',color:'#f4e7c5',minHeight:'100vh'}}><h1>Man rợ xuất hiện khi hết cảnh báo</h1><p>Bản thử độc lập, không ghi dữ liệu người chơi. Cảnh báo không vẽ toán quân; hết giờ mới chạy vào, giao chiến, tính kết quả rồi rút ra theo lối đất. Sông và tường chặn đường.</p><div>{(['warning','enter','fight','retreat'] as const).map((phase,i)=><button key={phase} onClick={()=>{setMode(phase);setRun(n=>n+1);}}>{['Cảnh báo còn 22 phút','Tới giờ tấn công','Xem giao chiến','Xem rút lui'][i]}</button>)}<button onClick={()=>{setBlocked(v=>!v);setMode('enter');}}>Tường kín: {blocked?'Có':'Không'}</button></div><p role="status">{status}</p><canvas ref={canvas} width={960} height={600} style={{width:'100%',maxWidth:960}} aria-label="Toán man rợ đi từ góc rìa làng theo đường đất, không xuyên sông và tường"/></main>;
}
