"use client";
import { useEffect, useRef, useState } from "react";
import { Crowd } from "@/components/villagers";
import { drawCity, type View } from "@/components/draw";
import { applyAction, derive, F, G, idx, newCity, refugePosition, settle } from "@/lib/engine";
const view: View = { TW: 88, TH: 44, ox: 470, oy: -650, width: 940, height: 540, s: 88 / 64 };
export default function RefugePreview() {
 const canvas=useRef<HTMLCanvasElement>(null),[run,setRun]=useState(0),[status,setStatus]=useState("");
 useEffect(()=>{
  const c=newCity(0,123);c.t.fill(G);c.seen.fill(1);c.b={};c.herds=[];c.camps=[];c.people=c.people.slice(0,3);c.camp=idx(18,20);
  c.b[idx(20,20)]={k:'house',lvl:1,doneAt:null};c.t[idx(24,20)]=F;c.res.food=5000;
  const p=c.people[0];p.pos=idx(24,20);applyAction(c,{type:'assign',ids:[p.id],task:{t:'chop',at:idx(24,20)}},0);
  c.people[1].pos=idx(23,22);c.people[2].pos=idx(23,19);settle(c,11000);
  c.raid={warn:11000,at:31000,power:0,from:idx(29,20)};
  const crowd=new Crowd();crowd.sync(c);let raf=0,lastStatus=0;const start=performance.now();
  const paint=(time:number)=>{
   const now=11000+time-start;settle(c,now);crowd.sync(c);crowd.update(c,.016,now);
   const ctx=canvas.current?.getContext('2d');if(ctx)drawCity(ctx,c,derive(c),{v:view,now,anim:time,hover:null,selected:null,tool:null,villagers:crowd.list,picked:new Set(),fx:[],chopping:new Set()});
   if(time-lastStatus>200){const states=c.people.map(p=>refugePosition(p,now));setStatus(`Đang chạy: ${states.filter(s=>s?.moving&&!s.returning).length} · Đang trú: ${states.filter(s=>s?.hidden).length} · Đang quay lại: ${states.filter(s=>s?.returning).length} · Hàng đang giữ: ${p.haul?.carried??0} · Gỗ trong kho: ${Math.floor(c.res.wood)}`);lastStatus=time;}
   raf=requestAnimationFrame(paint);
  };raf=requestAnimationFrame(paint);return()=>cancelAnimationFrame(raf);
 },[run]);
 return <main style={{padding:16,background:'#19362b',color:'#f4e7c5',minHeight:'100vh'}}><h1>Dân chạy tránh địch</h1><p>Bản thử độc lập, không dùng tài khoản. Báo động kéo dài 20 giây; dân giữ hàng, trú rồi quay lại công việc.</p><button onClick={()=>setRun(v=>v+1)}>Chạy lại</button><p role="status">{status}</p><canvas ref={canvas} width={940} height={540} style={{width:'100%',maxWidth:940}} aria-label="Dân đang vác gỗ chạy tới nhà, trú ẩn rồi quay lại nộp kho"/></main>;
}
