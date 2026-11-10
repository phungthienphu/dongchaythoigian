'use client';
import {mapRotationShortcut} from '@/components/map-shortcuts';
import {useEffect,useRef,useState} from 'react';
import {drawCity,fitView,camView,focusOn,rotateCam,pickVillageTarget,screenToCell,type Cam} from '@/components/draw';
import {captureMapTurn,paintMapTurn,type MapTurn} from '@/components/map-transition';
import {newCity,derive,idx,G,R,F,type City,type BKey} from '@/lib/engine';
import {Crowd} from '@/components/villagers';
function fixture(){
 const c=newCity(0,123);c.era=4;c.t.fill(G);c.seen.fill(1);c.b={};c.camps=[];c.herds=[];c.camp=idx(48,48);c.army={spear:3};c.people=[];
 for(let y=0;y<96;y++)for(let x=44;x<46;x++)c.t[idx(x,y)]=R;
 const buildings:[number,number,BKey][]=[[48,48,'hall'],[50,48,'house'],[48,51,'farm'],[51,51,'forge'],[46,48,'house'],[47,46,'storehouse'],[49,45,'envoy'],[47,52,'well'],[51,46,'temple']];
 for(const [x,y,k]of buildings)c.b[idx(x,y)]={k,lvl:k==='hall'?3:2,doneAt:null};
 for(let x=47;x<53;x++)c.b[idx(x,44)]={k:x===49?'gate':'wall',lvl:2,doneAt:null,orientation:'x'};
 c.b[idx(46,51)]={k:'canal',lvl:1,doneAt:null};c.b[idx(47,51)]={k:'canal',lvl:1,doneAt:null};
 for(const [x,y]of [[46,46],[52,49],[50,52],[47,49]])c.t[idx(x,y)]=F;
 return c;
}
export default function RotationPreview(){
 const cv=useRef<HTMLCanvasElement>(null),city=useRef<City|null>(null),crowd=useRef(new Crowd()),cam=useRef<Cam>({zoom:5,px:0,py:0}),fade=useRef<MapTurn|null>(null),selected=useRef<{x:number;y:number}|null>(null),hover=useRef<{x:number;y:number}|null>(null);
 const [drawMs,setDrawMs]=useState(0);
 const [angle,setAngle]=useState(0),[message,setMessage]=useState('Bấm công trình hoặc ô đất để kiểm tra chọn sau khi xoay.');
 useEffect(()=>{const c=fixture();city.current=c;const D=derive(c),canvas=cv.current!,ctx=canvas.getContext('2d')!;crowd.current.sync(c);const f=fitView(1040,640);focusOn(f,cam.current,48.5,48.5,5);let raf=0,last=0,reported=0;const samples:number[]=[];
 const paint=(t:number)=>{if(document.hidden){last=0;raf=requestAnimationFrame(paint);return;}const started=performance.now();crowd.current.update(c,last?Math.min(.05,(t-last)/1000):0,0);last=t;
 drawCity(ctx,c,D,{v:camView(f,cam.current),now:0,anim:t,selected:selected.current,hover:hover.current,tool:null,villagers:crowd.current.list,picked:new Set(),fx:[],chopping:new Set()});
 if(fade.current&&!paintMapTurn(ctx,fade.current,t,1040,640))fade.current=null;samples.push(performance.now()-started);if(samples.length>120)samples.shift();if(t-reported>1000){setDrawMs([...samples].sort((a,b)=>a-b)[Math.floor(samples.length*.95)]??0);reported=t;}raf=requestAnimationFrame(paint);};raf=requestAnimationFrame(paint);return()=>cancelAnimationFrame(raf);},[]);
 const rotate=(delta:number)=>{if(!cv.current)return;fade.current=captureMapTurn(cv.current);rotateCam(fitView(1040,640),cam.current,delta);setAngle(cam.current.rotation!*90);hover.current=null;};
 useEffect(()=>{const onKey=(event:KeyboardEvent)=>{const turn=mapRotationShortcut(event);if(turn!==null){event.preventDefault();rotate(turn);}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[]);
 return <main style={{minHeight:'100vh',background:'#182c25',color:'#f1e4c6',padding:20}}><h1>Xoay làng · 4 góc nhìn</h1><p>Giữ tâm camera · hòa ảnh 260 ms · không thay đổi dữ liệu làng. Phím Q: xoay trái · E: xoay phải.</p><div style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}><button onClick={()=>rotate(-1)} aria-label="Xoay bản đồ sang trái" aria-keyshortcuts="Q" title="Xoay trái (Q)">↶ Xoay trái</button><output aria-live="polite">{angle}°</output><button onClick={()=>rotate(1)} aria-label="Xoay bản đồ sang phải" aria-keyshortcuts="E" title="Xoay phải (E)">Xoay phải ↷</button><button onClick={()=>{cam.current.zoom=cam.current.zoom===5?3:5;focusOn(fitView(1040,640),cam.current,48.5,48.5,cam.current.zoom);fade.current=null;}}>Đổi zoom</button></div><p role="status">{message}</p><p>Vẽ cảnh (p95): {drawMs.toFixed(1)} ms/khung</p><canvas ref={cv} width={1040} height={640} style={{width:'100%',maxWidth:1040,height:'auto'}} aria-label="Bản đồ làng có nhà, ruộng, tường cổng và kênh nước để thử xoay" onPointerMove={e=>{const rect=e.currentTarget.getBoundingClientRect();hover.current=screenToCell(camView(fitView(1040,640),cam.current),(e.clientX-rect.left)*1040/rect.width,(e.clientY-rect.top)*640/rect.height);}} onPointerLeave={()=>{hover.current=null;}} onClick={e=>{if(!city.current)return;fade.current=null;const rect=e.currentTarget.getBoundingClientRect(),target=pickVillageTarget(camView(fitView(1040,640),cam.current),city.current,crowd.current.list,performance.now(),(e.clientX-rect.left)*1040/rect.width,(e.clientY-rect.top)*640/rect.height);if(target?.type==='cell'||target?.type==='building'){selected.current=target.cell;setMessage(`${target.type==='building'?'Công trình':'Ô đất'}: ${target.cell.x}, ${target.cell.y} · góc ${angle}°`);}}}/></main>;
}
