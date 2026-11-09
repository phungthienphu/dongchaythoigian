'use client';
import {useEffect,useRef,useState} from 'react';
import {applyAction,derive,ERA_NAMES,G,idx,newCity,type City} from '@/lib/engine';
import {camView,drawCity,fitView,focusOn,pickBuilding} from '@/components/draw';
import DefenseOrientation from '@/components/DefenseOrientation';
import {defenseAxis,type DefenseOrientation as Mode} from '@/lib/fortifications';

const corner=idx(19,19),gate=idx(24,21),isolated=idx(26,19),cross=idx(27,23);
function fixture(era:number,level:number){
 const c=newCity(1000,123);c.era=era;c.t.fill(G);c.seen.fill(1);c.b={};c.people=[];c.army={};c.camps=[];c.herds=[];c.exps=[];c.raid=null;
 const wall=(x:number,y:number)=>{c.b[idx(x,y)]={k:'wall',lvl:level,doneAt:null};};
 for(let x=19;x<=24;x++){wall(x,19);wall(x,23);}for(let y=20;y<=22;y++){wall(19,y);wall(24,y);wall(21,y);}
 c.b[gate]={k:'gate',lvl:level,doneAt:null};wall(26,19);wall(27,23);for(const [dx,dy]of [[0,-1],[1,0],[0,1],[-1,0]])wall(27+dx,23+dy);
 return c;
}
export default function WallsHarness(){
 const [era,setEra]=useState(3),[level,setLevel]=useState(1),[city,setCity]=useState(()=>fixture(3,1)),[selected,setSelected]=useState(corner),[preview,setPreview]=useState(false),[mode,setMode]=useState<Mode>('auto');
 const ref=useRef<HTMLCanvasElement>(null),view=useRef<ReturnType<typeof camView>|null>(null);
 const reset=(e=era,l=level)=>{setCity(fixture(e,l));setSelected(corner);setEra(e);setLevel(l);};
 useEffect(()=>{
  const canvas=ref.current;if(!canvas)return;const ctx=canvas.getContext('2d');if(!ctx)return;
  const draw=()=>{const width=canvas.clientWidth,height=canvas.clientHeight,dpr=Math.min(2,devicePixelRatio||1);canvas.width=width*dpr;canvas.height=height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);const fit=fitView(width,height),cam={zoom:1,px:0,py:0};focusOn(fit,cam,23.5,21,Math.min(5.5,width/165));const v=camView(fit,cam);view.current=v;drawCity(ctx,city,derive(city),{v,now:1000,anim:0,hover:preview?{x:26,y:20}:null,tool:preview?'wall':null,defenseOrientation:mode,selected:{x:selected%96,y:Math.floor(selected/96)},villagers:[],picked:new Set(),fx:[],chopping:new Set()});};
  const ro=new ResizeObserver(draw);ro.observe(canvas);draw();return()=>ro.disconnect();
 },[city,selected,preview,mode]);
 const current=city.b[selected];
 return <main style={{maxWidth:1000,margin:'20px auto',padding:16}}>
  <h1>Tường thành và cổng làng</h1><p>Dữ liệu giả; không kết nối API, không thay đổi làng thật.</p>
  <label>Thời đại <select value={era} onChange={e=>reset(Number(e.target.value))}>{[1,2,3,4,5,6].map(e=><option value={e} key={e}>{ERA_NAMES[e]}</option>)}</select></label>{' '}
  <label>Cấp <select value={level} onChange={e=>reset(era,Number(e.target.value))}>{[1,2,3].map(l=><option key={l}>{l}</option>)}</select></label>
  <div className="tb" style={{flexWrap:'wrap',justifyContent:'flex-start',margin:'12px 0'}}><button onClick={()=>setSelected(corner)}>Chọn góc L</button><button onClick={()=>setSelected(gate)}>Chọn cổng</button><button onClick={()=>setSelected(isolated)}>Chọn đoạn rời</button><button onClick={()=>setSelected(cross)}>Chọn ngã tư</button><button onClick={()=>{setCity(c=>{const draft=structuredClone(c);delete draft.b[idx(20,19)];return draft;});}}>Gỡ đoạn cạnh góc</button><button onClick={()=>setPreview(v=>!v)}>{preview?'Ẩn':'Hiện'} bản xem trước</button><button onClick={()=>reset()}>Đặt lại</button></div>
  <canvas ref={ref} aria-label="Bản đồ thử tường nối góc và cổng" style={{width:'100%',height:440,border:'1px solid #71816a',borderRadius:8}} onClick={e=>{if(!view.current)return;const rect=e.currentTarget.getBoundingClientRect(),hit=pickBuilding(view.current,city,e.clientX-rect.left,e.clientY-rect.top);if(hit)setSelected(idx(hit.x,hit.y));}}/>
  {current&&<><p>Đang chọn {current.k==='gate'?'cổng':'tường'} ({selected%96}, {Math.floor(selected/96)}) · {current.orientation??'auto'}</p><DefenseOrientation value={current.orientation??'auto'} axis={defenseAxis(city,selected)} onChange={orientation=>setCity(c=>{const draft=structuredClone(c);applyAction(draft,{type:'orientDefense',x:selected%96,y:Math.floor(selected/96),orientation},1000);return draft;})}/></>}
  {preview&&<><p>Hướng đoạn đang đặt thử</p><DefenseOrientation value={mode} axis={mode==='y'?'y':'x'} onChange={setMode}/></>}
 </main>;
}
