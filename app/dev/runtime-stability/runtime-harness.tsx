"use client";
// Real Game with an isolated in-memory API. This page never contacts MongoDB.
import {useEffect,useRef,useState} from 'react';
import Game from '@/components/Game';
import {applyAction,newCity,settle,type Action} from '@/lib/engine';
export default function RuntimeHarness(){
 const [ready,setReady]=useState(false),[counts,setCounts]=useState<Record<string,number>>({}),[hidden,setHidden]=useState(false);
 const hiddenRef=useRef(false),countsRef=useRef<Record<string,number>>({});
 useEffect(()=>{
  const originalFetch=window.fetch,originalInterval=window.setInterval;
  const visibility=Object.getOwnPropertyDescriptor(document,'visibilityState');
  Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>hiddenRef.current?'hidden':'visible'});
  window.setInterval=((handler:TimerHandler,ms?:number,...args:unknown[])=>originalInterval(handler,ms===60000?1000:ms,...args)) as typeof window.setInterval;
  const c=newCity(Date.now(),123);c.seen.fill(1);
  window.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
   const path=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.origin).pathname;
   if(!path.startsWith('/api/'))return originalFetch(input,init);
   countsRef.current[path]=(countsRef.current[path]??0)+1;setCounts({...countsRef.current});
   await new Promise(r=>setTimeout(r,150));const now=Date.now();
   if(path==='/api/city'){settle(c,now);return Response.json({name:'Làng thử độc lập',state:structuredClone(c),serverNow:now});}
   if(path==='/api/city/action'){const action=JSON.parse(init?.body as string) as Action;return Response.json({error:applyAction(c,action,now),state:structuredClone(c),serverNow:now});}
   if(path==='/api/me')return Response.json({user:null,friends:[]});
   if(path==='/api/diplomacy')return Response.json({messages:[],serverNow:now});
   if(path==='/api/leaderboard')return Response.json({rows:[{name:'Làng thử độc lập',score:10,era:1,pop:3,temple:false,me:true}]});
   if(path==='/api/world')return Response.json({nations:[]});
   return Response.json({error:'API ngoài bản thử đã bị chặn.'},{status:403});
  }) as typeof fetch;
  setReady(true);
  return()=>{window.fetch=originalFetch;window.setInterval=originalInterval;if(visibility)Object.defineProperty(document,'visibilityState',visibility);else delete(document as unknown as Record<string,unknown>).visibilityState;};
 },[]);
 return <><aside style={{position:'fixed',zIndex:10000,bottom:8,left:8,background:'#112a25',padding:12,maxWidth:400,color:'white'}}>
 <strong>QA độc lập · API mô phỏng · 60 giây → 1 giây</strong>
 <p role="status">Tab: {hidden?'ẩn':'hiện'} · {Object.entries(counts).map(([k,v])=>`${k}: ${v}`).join(' · ')}</p>
 <button onClick={()=>{hiddenRef.current=!hiddenRef.current;setHidden(hiddenRef.current);document.dispatchEvent(new Event('visibilitychange'));}}>Đổi trạng thái ẩn/hiện</button>
 <button onClick={()=>{for(let i=0;i<20;i++)window.dispatchEvent(new Event('online'));}}>Phát 20 sự kiện kết nối</button>
 <button onClick={()=>{countsRef.current={};setCounts({});}}>Xóa bộ đếm</button>
 </aside>{ready&&<Game/>}</>;
}
