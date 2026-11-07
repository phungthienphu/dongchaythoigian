"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import {ReadFlights} from "@/lib/read-flights";
import type { DiplomacyInbox } from '@/lib/diplomacy-types';
export function useDiplomacy(ready:boolean, onChanged:()=>void, withMutation:<T>(run:()=>Promise<T>)=>Promise<T>=run=>run()) {
 const [inbox,setInbox]=useState<DiplomacyInbox>({messages:[],serverNow:0});
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const reads=useRef(new ReadFlights()),enabled=useRef(ready);enabled.current=ready;
 const generation=useRef(0),changed=useRef(onChanged);changed.current=onChanged;
 const refresh=useCallback(()=>reads.current.run("diplomacy",async()=>{
  if(!enabled.current)return;
  const request=++generation.current;
  try{const res=await fetch('/api/diplomacy',{cache:'no-store',signal:AbortSignal.timeout(12000)});if(!res.ok)throw new Error('Không tải được lời nhắn ngoại giao.');const data=await res.json();if(request===generation.current){setInbox(data);setError('');}}
  catch{if(request===generation.current)setError('Không tải được lời nhắn ngoại giao. Thử mở lại Thông báo.');}
 }),[]);
 useEffect(()=>{
  if(!ready)return;void refresh();
  const foreground=()=>{if(document.visibilityState==='visible')void refresh();};
  document.addEventListener('visibilitychange',foreground);window.addEventListener('online',foreground);
  return()=>{generation.current++;document.removeEventListener('visibilitychange',foreground);window.removeEventListener('online',foreground);};
 },[ready,refresh]);
 useEffect(()=>{
  if(!ready||!inbox.nextArrival)return;
  const offset=inbox.serverNow-Date.now();
  const timer=setTimeout(()=>{if(document.visibilityState==='visible')void refresh();},Math.min(2_147_000_000,Math.max(500,inbox.nextArrival-Date.now()-offset+250)));
  return()=>clearTimeout(timer);
 },[ready,inbox.nextArrival,inbox.serverNow,refresh]);
 const act=async(id:string,action:'request'|'accept'|'decline')=>{
  if(busy)return;setBusy(true);setError('');
  try{const res=await withMutation(()=>fetch('/api/diplomacy',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id,action}),signal:AbortSignal.timeout(15000)}));const data=await res.json();if(!res.ok)throw new Error(data.error??'Không gửi được lời nhắn.');generation.current++;reads.current.invalidate("diplomacy");await refresh();changed.current();}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 };
 return {...inbox,refresh,act,busy,error};
}
