'use client';
import {useEffect,useRef,useState} from 'react';
import {BatchedCityQueue,type SaveStatus} from '@/lib/batched-city';
import {controlCityTab} from '@/lib/city-queue-storage';
import {BATCH_DELAY_MS,applyCommandBatch,type CitySync,type BatchResponse,type BatchRequest} from '@/lib/city-sync';
import {ENGINE_VER,newCity,type City} from '@/lib/engine';

// All state here is synthetic and local to this origin, with no API/DB access.
const leaseMode=typeof window!=='undefined' && new URLSearchParams(window.location.search).get('lease')==='1';
const key=`qa-sync${leaseMode?'-lease':''}:1:${ENGINE_VER}`,serverKey=`dong-song-sync-harness-server-v1${leaseMode?'-lease':''}`;
type Server={state:City;ack:number;results:CitySync['results'];calls:number};
function load():Server {
  const saved=localStorage.getItem(serverKey);if(saved)return JSON.parse(saved);
  const state=newCity(Date.now(),123);state.manualWorkforce=true;
  const server={state,ack:0,results:[],calls:0};localStorage.setItem(serverKey,JSON.stringify(server));return server;
}
function response(server=load()):BatchResponse {
  const at=Date.now();
  return {state:structuredClone(server.state),serverNow:at,sync:{cityId:leaseMode?'qa-sync-lease':'qa-sync',session:1,engine:ENGINE_VER,revision:server.ack,ack:server.ack,results:server.results,anchor:'synthetic-local',at,until:at+90000}};
}
export default function SyncHarness() {
  const queue=useRef<BatchedCityQueue|null>(null),offline=useRef(false),loseAck=useRef(false);
  const [status,setStatus]=useState<SaveStatus>('initializing'),[view,setView]=useState<City|null>(null),[logs,setLogs]=useState<string[]>([]),[server,setServer]=useState<Server|null>(null);
  const [leaseView,setLeaseView]=useState(false);
  const log=(text:string)=>setLogs(old=>[text,...old].slice(0,20));
  useEffect(()=>{
    setLeaseView(leaseMode);
    let disposed=false;
    const reload=async()=>{if(offline.current)throw new Error('offline');const value=load();setServer(value);return response(value);};
    const dispose=controlCityTab(key,(active,storage)=>{
      queue.current?.stop();queue.current=null;
      if(!active){setStatus('readonly');return;}
      const initial=response();
      const q=new BatchedCityQueue({state:initial.state,sync:initial.sync,storage,onState:setView,onStatus:setStatus,onError:log,reload,
        send:async(request:BatchRequest)=>{
          if(offline.current)throw new Error('offline');
          const value=load(),fresh=request.commands.filter(c=>c.seq>value.ack);
          value.results=applyCommandBatch(value.state,fresh,Date.now());
          if(fresh.length)value.ack=fresh.at(-1)!.seq;value.calls++;
          localStorage.setItem(serverKey,JSON.stringify(value));setServer(value);
          if(loseAck.current){loseAck.current=false;throw new Error('lost ACK');}
          return response(value);
        },
      });
      if(disposed){q.stop();return;}queue.current=q;void q.initialize();setServer(load());
    },{useWebLocks:!leaseMode});
    return()=>{disposed=true;dispose();queue.current?.stop();};
  },[]);
  return <main style={{padding:24,maxWidth:850,margin:'auto',fontFamily:'sans-serif'}}>
    <h1>Kiểm tra đồng bộ {BATCH_DELAY_MS / 1000} giây</h1>
    <p>Dữ liệu giả trên máy này. Không kết nối tài khoản, API hoặc database game.</p>
    <p role="status" data-testid="sync-status">Trạng thái: {status}</p>
    <p data-testid="server-stats">ACK: {server?.ack??0} · Số gói: {server?.calls??0}</p>
    <p data-testid="local-task">Dân đầu tiên: {view?.people[0]?.task.t??'chỉ xem'}</p>
    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
      <button onClick={async()=>{const start=performance.now();const ok=await queue.current?.enqueue({type:'assign',ids:[1],task:{t:'idle'}});log(`Nhận local: ${ok} · ${(performance.now()-start).toFixed(1)} ms`);}}>Cho dân nghỉ</button>
      <button onClick={async()=>{const ok=await queue.current?.enqueue({type:'assign',ids:[2],task:{t:'idle'}});log(`Dân thứ hai nhận local: ${ok}`);}}>Cho dân thứ hai nghỉ</button>
      <button onClick={()=>void queue.current?.flush()}>Lưu ngay</button>
      <button onClick={()=>location.reload()}>Tải lại trang</button>
      <button onClick={()=>{offline.current=!offline.current;log(`Mất mạng giả lập: ${offline.current}`);}}>Bật/tắt mất mạng</button>
      <button onClick={()=>{loseAck.current=true;log('Gói tiếp theo mất phản hồi sau khi đã lưu');}}>Làm mất phản hồi</button>
      <a href={leaseView?'/dev/sync?lease=1':'/dev/sync'} target="_blank">Mở tab thứ hai</a>
      <a href="/dev/sync?lease=1">Thử khóa IndexedDB dự phòng</a>
    </div>
    <ol>{logs.map((line,n)=><li key={n}>{line}</li>)}</ol>
  </main>;
}
