"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {ReadFlights} from '@/lib/read-flights';
import {unseenMarketOrders} from '@/lib/market-notices';
import type {MarketAction,MarketData} from '@/lib/market-types';
export function useMarket(ready:boolean,open:boolean,onChanged:()=>void,viewed=open,target?:string){
 const [data,setData]=useState<MarketData|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [seen,setSeen]=useState({player:'',at:0});
 const reads=useRef(new ReadFlights()),readEpoch=useRef(0);
 const pending=useRef<{key:string;id:string}|null>(null);
 const generation=useRef(0),changed=useRef(onChanged),locked=useRef(false);changed.current=onChanged;
 const refresh=useCallback(()=>reads.current.run(`market:${target??""}:${readEpoch.current}`,async()=>{
  if(!ready)return;const request=++generation.current;
  try{const res=await fetch('/api/market'+(target?'?caravan='+encodeURIComponent(target):''),{cache:'no-store',signal:AbortSignal.timeout(15000)});const value=await res.json();if(!res.ok)throw new Error(value.error??'Không tải được Chợ.');if(request===generation.current){setData(value);setError('');}return value as MarketData;}
  catch(e){if(request===generation.current)setError((e as Error).message);}
 }),[ready,target]);
 useEffect(()=>{if(!ready){setData(null);return;}void refresh();const resume=()=>{if(document.visibilityState==='visible'){void refresh();changed.current();}};document.addEventListener('visibilitychange',resume);window.addEventListener('online',resume);return()=>{generation.current++;document.removeEventListener('visibilitychange',resume);window.removeEventListener('online',resume);};},[ready,refresh]);
 useEffect(()=>{if(open)void refresh();},[open,refresh]);
 const player=data?.playerId??'';
 useEffect(()=>{
  if(!player){setSeen({player:'',at:0});return;}
  let at=0;try{at=Number(localStorage.getItem(`dong-market-seen:${player}`))||0;}catch{}
  if(!Number.isFinite(at)||at<0)at=0;
  setSeen({player,at});
 },[player]);
 useEffect(()=>{
  if(!viewed||!data||seen.player!==data.playerId)return;
  const at=Math.max(seen.at,...data.orders.map(o=>o.createdAt));
  if(at!==seen.at)setSeen({player:data.playerId,at});
  try{localStorage.setItem(`dong-market-seen:${data.playerId}`,String(at));}catch{}
 },[viewed,data,seen.player,seen.at]);
 const hasFeed=!!data?.socket;
 useEffect(()=>{
  if(!ready||!hasFeed)return;
  let disposed=false,socket:WebSocket|null=null,retry=0;
  let reconnect:ReturnType<typeof setTimeout>,renew:ReturnType<typeof setTimeout>,update:ReturnType<typeof setTimeout>;
  const connect=async()=>{
   const value=await refresh();if(disposed)return;
   if(!value?.socket){reconnect=setTimeout(()=>void connect(),30000);return;}
   const ws=new WebSocket(value.socket);socket=ws;
   ws.onopen=()=>{retry=0;renew=setTimeout(()=>{ws.onclose=null;ws.close();void connect();},240000);};
   ws.onmessage=()=>{clearTimeout(update);update=setTimeout(()=>{if(!disposed)void refresh();},500);};
   ws.onclose=()=>{clearTimeout(renew);if(!disposed)reconnect=setTimeout(()=>void connect(),Math.min(30000,1000*2**Math.min(retry++,5)));};
   ws.onerror=()=>ws.close();
  };
  void connect();
  return()=>{disposed=true;clearTimeout(reconnect);clearTimeout(renew);clearTimeout(update);if(socket){socket.onclose=null;socket.close();}};
 },[ready,hasFeed,refresh]);
 const newOrders=seen.player===player?unseenMarketOrders(data,seen.at):0;

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
  try{const res=await fetch('/api/market'+(target?'?caravan='+encodeURIComponent(target):''),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...a,requestId:pending.current.id}),signal:AbortSignal.timeout(20000)});const value=await res.json();if(!res.ok){pending.current=null;throw new Error(value.error??'Giao thương thất bại.');}pending.current=null;readEpoch.current++;generation.current++;await refresh();changed.current();return true;}
  catch(e){readEpoch.current++;generation.current++;await refresh();changed.current();setError((e as Error).name==='TimeoutError'?'Chưa nhận được kết quả. Bấm Làm mới để kiểm tra lô hàng trước khi thử lại.':(e as Error).message);return false;}
  finally{locked.current=false;setBusy(false);}
 };
 return {data,busy,error,refresh,act,newOrders};
}
export type MarketController=ReturnType<typeof useMarket>;
