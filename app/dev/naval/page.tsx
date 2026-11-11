"use client";
// Isolated real-engine transport fixture, never loads or saves a player account.
import {useEffect,useRef,useState} from 'react';
import DockPanel from '@/components/DockPanel';
import {drawCity,type View} from '@/components/draw';
import {applyAction,derive,G,R,H,idx,newCity,settle,homeSoldiers,type Action,type City} from '@/lib/engine';
const view:View={TW:68,TH:34,ox:610,oy:-400,width:980,height:650,s:68/64};
function fixture(){const c=newCity(0,123);c.t.fill(G);c.seen.fill(1);c.people=[];c.herds=[];c.camps=[];c.b={};c.camp=idx(10,20);c.era=2;c.army={club:2};for(let y=0;y<H;y++)for(let x=15;x<=17;x++)c.t[idx(x,y)]=R;c.b[c.camp]={k:'barracks',lvl:1,doneAt:null};c.b[idx(14,22)]={k:'dock',lvl:1,doneAt:null};c.res={food:500,wood:500,stone:500,copper:500,gold:200,diamond:0,coal:0,aetherCrystal:0,rune:0,essence:0,celestialStone:0};return c;}
export default function NavalPreview(){
 const [city,setCity]=useState<City>(fixture),[now,setNow]=useState(0),[message,setMessage]=useState('Bản thử độc lập: đóng thuyền rồi ra lệnh qua sông.');
 const canvas=useRef<HTMLCanvasElement>(null),clock=useRef(0),skip=useRef(0),frozen=useRef<number|null>(null);
 const act=(a:Action)=>{const c=structuredClone(city),err=applyAction(c,a,clock.current);skip.current=0;frozen.current=null;setCity(c);setMessage(err??'Đã nhận lệnh.');};
 useEffect(()=>{const start=performance.now(),base=city.last,d=derive(city);let raf=0,last=0;
  const paint=(t:number)=>{const at=frozen.current??(base+t-start+skip.current);clock.current=at;settle(city,at);const ctx=canvas.current?.getContext('2d');if(ctx)drawCity(ctx,city,d,{v:view,now:at,anim:t,hover:null,selected:null,tool:null,villagers:[],picked:new Set(),fx:[],chopping:new Set()});if(t-last>150){setNow(at);last=t;}raf=requestAnimationFrame(paint);};raf=requestAnimationFrame(paint);return()=>cancelAnimationFrame(raf);
 },[city]);
 return <main style={{padding:20,maxWidth:1000,margin:'auto',color:'#eadbb7'}}><h1>Bến cảng và thuyền qua sông</h1><p role="status">{message}</p><DockPanel city={city} building={city.b[idx(14,22)]} now={now} busy={false} onBuild={()=>act({type:'buildShip',x:14,y:22})}/><div><button onClick={()=>{skip.current+=90000;}}>Chạy nhanh thêm 90 giây</button><button onClick={()=>act({type:'moveSoldier',id:'club:0',x:22,y:20})}>Cho lính qua bờ bên kia</button><button onClick={()=>{const c=fixture();c.transportShips=1;applyAction(c,{type:'moveSoldier',id:'club:0',x:22,y:20},0);let at=0;for(;at<10000;at+=100){const p=homeSoldiers(c,at)[0];if(c.t[idx(Math.floor(p.x),Math.floor(p.y))]===R)break;}at+=600;skip.current=0;frozen.current=at;settle(c,at);setCity(c);setMessage('Lính đang ngồi thuyền qua sông.');}}>Xem thuyền đang chở quân</button><button onClick={()=>{skip.current=0;frozen.current=null;setCity(fixture());setMessage('Đã đặt lại bản thử.');}}>Đặt lại</button></div><canvas ref={canvas} width={980} height={650} style={{width:'100%'}} aria-label="Cảng gỗ có cầu tàu, sông và quân đi thuyền"/></main>;
}
