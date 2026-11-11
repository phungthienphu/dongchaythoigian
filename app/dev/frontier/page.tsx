"use client";
// Isolated shared-engine preview: never reads or writes an account.
import {useEffect,useRef,useState} from 'react';
import FrontierStatus from '@/components/FrontierStatus';
import {drawCity,fitView,type View} from '@/components/draw';
import {newCity,settle,derive,idx,G,MIN,W,WILDERNESS_MS,applyAction,type City} from '@/lib/engine';
const view:View={...fitView(1120,680),TW:10,TH:5,s:10/64,ox:560,oy:65};
function fixture(){const c=newCity(0,123);c.people=[];c.herds=[];c.camps=[];c.seen.fill(1);c.wildernessAt=WILDERNESS_MS;c.res={wood:500,stone:500,food:500,copper:500,gold:100,diamond:10,coal:0,aetherCrystal:0,rune:0,essence:0};for(const i of [c.camp,idx(72,70)]){c.t[i]=G;c.b[i]={k:'house',lvl:1,doneAt:null};}return c;}
export default function FrontierPreview(){
 const [city,setCity]=useState<City>(fixture),canvas=useRef<HTMLCanvasElement>(null),[detail,setDetail]=useState(false);
 useEffect(()=>{let raf=0;const d=derive(city),center=idx(72,70),v=detail?{TW:76,TH:38,s:76/64,ox:560-(72-70)*38,oy:325-(72+70)*19,width:1120,height:680}:view;
  const paint=(anim:number)=>{const ctx=canvas.current?.getContext('2d');if(ctx)drawCity(ctx,city,d,{v,now:city.last,anim,hover:null,selected:detail?{x:center%W,y:Math.floor(center/W)}:null,tool:null,villagers:[],picked:new Set(),fx:[],chopping:new Set()});raf=requestAnimationFrame(paint);};raf=requestAnimationFrame(paint);return()=>cancelAnimationFrame(raf);
 },[city,detail]);
 const advance=(ms:number)=>{const c=structuredClone(city);settle(c,c.last+ms);setCity(c);};
 return <main style={{padding:20,maxWidth:1160,margin:'auto',color:'#eadbb7'}}><h1>Đất hoang và thiên tai</h1><p>Bản thử độc lập. Hai khu nhà được giữ; đất hoang đổi địa hình sau 30 phút.</p><FrontierStatus city={city} now={city.last}/><p>Đất đã thấy: {city.seen.filter(Boolean).length} ô · Nhà còn nguyên vị trí: {Object.keys(city.b).length}</p><div><button onClick={()=>advance(25*MIN)}>Tới cảnh báo 5 phút</button><button onClick={()=>advance(5*MIN)}>Chạy thêm 5 phút</button><button onClick={()=>{const c=structuredClone(city);c.disaster={kind:'earthquake',at:c.last+5*MIN,level:0,center:idx(72,70)};settle(c,c.last+1000);setCity(c);setDetail(true);}}>Xem cảnh báo động đất</button><button onClick={()=>{const c=structuredClone(city);applyAction(c,{type:'repair',x:72,y:70},c.last);setCity(c);}}>Sửa nhà</button><button onClick={()=>{setCity(fixture());setDetail(false);}}>Đặt lại</button></div><canvas ref={canvas} width={1120} height={680} style={{width:'100%'}} aria-label={detail?'Tâm chấn và nhà hư hại do động đất':'Đất hoang phủ sương, giữ vùng quanh hai khu nhà'}/><ol>{city.log.slice(0,5).map((l,i)=><li key={i}>{l.msg}</li>)}</ol></main>;
}
