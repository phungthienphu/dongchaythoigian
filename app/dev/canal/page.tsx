"use client";
// Isolated picker/demolition fixture. Never loads or saves a player account.
import {useEffect,useRef,useState} from 'react';
import {drawCity,pickVillageTarget,type View} from '@/components/draw';
import {newCity,derive,applyAction,G,R,H,idx,type City} from '@/lib/engine';
const view:View={TW:88,TH:44,ox:612,oy:-564,width:960,height:520,s:88/64};
function fixture(){const c=newCity(0,123);c.t.fill(G);c.seen.fill(1);c.people=[];c.herds=[];c.camps=[];c.b={};c.era=3;for(let y=0;y<H;y++)c.t[idx(14,y)]=R;for(let x=15;x<=19;x++)c.b[idx(x,20)]={k:'canal',lvl:1,doneAt:null};return c;}
export default function CanalPreview(){
 const [city,setCity]=useState<City>(fixture),[selected,setSelected]=useState<{x:number;y:number}|null>(null),[message,setMessage]=useState('Gỡ đầu kênh, rồi bấm rãnh hoặc nhánh kênh cạn để chọn và gỡ tiếp.');
 const canvas=useRef<HTMLCanvasElement>(null),d=derive(city);
 useEffect(()=>{let raf=0;const ctx=canvas.current?.getContext('2d');const paint=(anim:number)=>{if(ctx)drawCity(ctx,city,d,{v:view,now:0,anim,hover:null,selected,tool:null,villagers:[],picked:new Set(),fx:[],chopping:new Set()});raf=requestAnimationFrame(paint);};raf=requestAnimationFrame(paint);return()=>cancelAnimationFrame(raf);},[city,selected]);
 const remove=(cell:{x:number;y:number})=>{const c=structuredClone(city),err=applyAction(c,{type:'demolish',...cell},0);setCity(c);setMessage(err??`Đã gỡ kênh (${cell.x}, ${cell.y}).`);setSelected(null);};
 const canals=Object.entries(city.b).filter(([,b])=>b.k==='canal');
 return <main style={{padding:20,maxWidth:1000,margin:'auto',color:'#eadbb7'}}><h1>Gỡ kênh đã mất nguồn nước</h1><p>Bản thử độc lập, không thay đổi làng người chơi.</p><p role="status">{message}</p><p>Còn {canals.length} đoạn · {canals.filter(([i])=>d.wet[Number(i)]).length} có nước · {canals.filter(([i])=>!d.wet[Number(i)]).length} cạn.</p><button disabled={!city.b[idx(15,20)]} onClick={()=>remove({x:15,y:20})}>Gỡ đầu kênh sát sông</button><button onClick={()=>{setCity(fixture());setSelected(null);setMessage('Đã đặt lại bản thử.');}}>Đặt lại</button><p>{selected?`Đã chọn kênh (${selected.x}, ${selected.y}) · ${d.wet[idx(selected.x,selected.y)]?'Có nước':'Cạn nước'}`:'Chưa chọn đoạn kênh.'}</p><button disabled={!selected} onClick={()=>{if(selected)remove(selected);}}>Phá dỡ đoạn đã chọn</button><canvas ref={canvas} width={960} height={520} style={{width:'100%'}} aria-label="Bấm vào nhánh kênh để chọn" onClick={e=>{const rect=e.currentTarget.getBoundingClientRect(),target=pickVillageTarget(view,city,[],0,(e.clientX-rect.left)*960/rect.width,(e.clientY-rect.top)*520/rect.height);if(target?.type==='building'&&city.b[idx(target.cell.x,target.cell.y)]?.k==='canal')setSelected(target.cell);else{setSelected(null);setMessage('Không có kênh tại điểm bấm.');}}}/></main>;
}
