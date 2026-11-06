"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import type {MarketAction,MarketData} from '@/lib/market-types';
export function useMarket(ready:boolean,open:boolean,onChanged:()=>void){
 const [data,setData]=useState<MarketData|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const pending=useRef<{key:string;id:string}|null>(null);
 const generation=useRef(0),changed=useRef(onChanged),locked=useRef(false);changed.current=onChanged;
 const refresh=useCallback(async()=>{
  if(!ready)return;const request=++generation.current;
  try{const res=await fetch('/api/market',{cache:'no-store',signal:AbortSignal.timeout(15000)});const value=await res.json();if(!res.ok)throw new Error(value.error??'Không tải được Chợ.');if(request===generation.current){setData(value);setError('');}}
  catch(e){if(request===generation.current)setError((e as Error).message);}
 },[ready]);
 useEffect(()=>{if(!ready){setData(null);return;}void refresh();const resume=()=>{if(document.visibilityState==='visible'){void refresh();changed.current();}};document.addEventListener('visibilitychange',resume);window.addEventListener('online',resume);return()=>{generation.current++;document.removeEventListener('visibilitychange',resume);window.removeEventListener('online',resume);};},[ready,refresh]);
 useEffect(()=>{if(open)void refresh();},[open,refresh]);
 useEffect(()=>{
  if(!ready||!data)return;
  const now=Date.now()+(data.serverNow-Date.now()),times=data.caravans.filter(c=>(c.mine||open)&&c.status!=='completed').flatMap(c=>[c.arrive,c.back,c.raid?.meetAt,c.raid?.backAt].filter((n):n is number=>!!n&&n>now));
  const fighting=data.caravans.some(c=>(c.mine||open)&&c.status==='fighting'),waiting=data.caravans.some(c=>c.mine&&c.status==='waiting');
  const delay=Math.min(open?30000:Infinity,fighting?2000:Infinity,waiting?30000:Infinity,...times.map(t=>Math.max(500,t-now+500)));
  if(!Number.isFinite(delay))return;const timer=setTimeout(()=>{if(document.visibilityState==='visible'){void refresh();changed.current();}},Math.min(2147000000,delay));return()=>clearTimeout(timer);
 },[ready,data,open,refresh]);
 const act=async(a:Omit<Extract<MarketAction,{type:'create'}>,'requestId'>|Omit<Extract<MarketAction,{type:'buy'|'cancel'|'raid'}>,'requestId'>)=>{
  if(locked.current)return false;locked.current=true;setBusy(true);setError('');
  const key=JSON.stringify(a);if(pending.current?.key!==key)pending.current={key,id:crypto.randomUUID()};
  try{const res=await fetch('/api/market',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...a,requestId:pending.current.id}),signal:AbortSignal.timeout(20000)});const value=await res.json();if(!res.ok){pending.current=null;throw new Error(value.error??'Giao thương thất bại.');}pending.current=null;await refresh();changed.current();return true;}
  catch(e){await refresh();changed.current();setError((e as Error).name==='TimeoutError'?'Chưa nhận được kết quả. Bấm Làm mới để kiểm tra lô hàng trước khi thử lại.':(e as Error).message);return false;}
  finally{locked.current=false;setBusy(false);}
 };
 return {data,busy,error,refresh,act};
}
export type MarketController=ReturnType<typeof useMarket>;
