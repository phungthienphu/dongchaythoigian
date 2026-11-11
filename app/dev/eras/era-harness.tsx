"use client";
import {useEffect,useRef,useState} from 'react';
import Game from '@/components/Game';
import {applyAction,ERA_NAMES,HOUR,MIN,settle,type Action,type City} from '@/lib/engine';
import {LOCAL_RULES} from '@/lib/eras';
import {eraPreview} from '@/lib/era-preview';
import {syncFixture} from '@/tests/sync-workload';
export default function EraHarness(){
 const city=useRef<City|null>(null),offset=useRef(0),worker=useRef<Worker|null>(null),busyRef=useRef(false);const [busy,setBusy]=useState(false),[ready,setReady]=useState(false),[epoch,setEpoch]=useState(0),[era,setEra]=useState(4),[summary,setSummary]=useState('');
 useEffect(()=>{
  const original=window.fetch;city.current=eraPreview(4,Date.now());worker.current=new Worker(new URL('./era-worker.ts',import.meta.url));
  try{const saved=JSON.parse(localStorage.getItem('dong-eras-local-v1')??'null');if(saved?.state?.t?.length===96*96&&saved.state.seen?.length===96*96&&Array.isArray(saved.state.people)&&saved.state.era>=3&&saved.state.era<=6&&Number.isFinite(saved.offset)){city.current=saved.state;offset.current=saved.offset;setEra(saved.state.era);}}catch{}
  const save=()=>{try{localStorage.setItem('dong-eras-local-v1',JSON.stringify({state:city.current,offset:offset.current}));}catch{}};
  window.addEventListener('pagehide',save);
  window.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
   const path=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.origin).pathname;
   if(!path.startsWith('/api/'))return original(input,init);
   const c=city.current!,now=Date.now()+offset.current;
   if(path==='/api/city'){if(!busyRef.current)settle(c,now);return Response.json({name:`Làng thử ${ERA_NAMES[c.era]}`,state:structuredClone(c),serverNow:now});}
   if(path==='/api/city/action'){
    if(busyRef.current)return Response.json({error:'Đang mô phỏng thời gian, chờ kết quả trước khi thao tác.',state:structuredClone(c),serverNow:now},{status:409});
    const action=JSON.parse(init?.body as string) as Action,error=applyAction(c,action,now,LOCAL_RULES);save();
    return Response.json({...(error?{error}:{}),state:structuredClone(c),serverNow:now},{status:error?400:200});
   }
   if(path==='/api/me')return Response.json({user:{id:'eras-local',name:'Người chơi thử',email:'',friendCode:'LOCAL1',hasCity:true},friends:[]});
   if(path==='/api/battles')return Response.json({battles:[],enabled:false,serverNow:now});
   if(path==='/api/market')return Response.json({orders:[],caravans:[],playerId:'eras-local',enabled:true,serverNow:now});
   if(path==='/api/diplomacy')return Response.json({messages:[],serverNow:now});
   if(path==='/api/leaderboard')return Response.json({rows:[]});
   if(path==='/api/world')return Response.json({nations:[]});
   return Response.json({error:'Bản thử local: API bên ngoài đã bị chặn.'},{status:403});
  }) as typeof fetch;
  setReady(true);return()=>{save();worker.current?.terminate();window.removeEventListener('pagehide',save);window.fetch=original;};
 },[]);
 const reset=(e:number,wonderReady=false)=>{city.current=eraPreview(e,Date.now(),wonderReady);offset.current=0;setEra(e);setEpoch(n=>n+1);try{localStorage.setItem('dong-eras-local-v1',JSON.stringify({state:city.current,offset:0}));}catch{}setSummary('Làng mẫu độc lập, không dùng tài khoản hay cơ sở dữ liệu production.');};
 const largeVillage=()=>{
  const c=syncFixture(1500,true);settle(c,1000);city.current=c;offset.current=1000-Date.now();setEra(c.era);setEpoch(n=>n+1);
  setSummary('Mẫu đo hiệu năng: 1.500 dân, 776 công trình; dữ liệu giả lập độc lập.');
 };
 const advance=(ms:number)=>{
  if(busyRef.current||!worker.current)return;const before={...city.current!.res},nextOffset=offset.current+ms;busyRef.current=true;setBusy(true);
  const finish=()=>{busyRef.current=false;setBusy(false);};
  worker.current.onmessage=(event:MessageEvent<{city?:City;error?:string}>)=>{
   if(event.data.error||!event.data.city){setSummary(event.data.error??'Không nhận được kết quả mô phỏng.');finish();return;}
   const c=event.data.city;city.current=c;offset.current=nextOffset;setSummary(`Đã mô phỏng ${ms/MIN} phút. Thực ${Math.round(c.res.food-before.food)}, gỗ ${Math.round(c.res.wood-before.wood)}, than ${Math.round(c.res.coal-before.coal)}; ${c.pop} dân. Xem Thông báo để biết diễn biến.`);
   try{localStorage.setItem('dong-eras-local-v1',JSON.stringify({state:c,offset:nextOffset}));}catch{}finish();window.dispatchEvent(new Event('online'));
  };
  worker.current.onerror=()=>{setSummary('Không chạy được mô phỏng. Bản lưu hiện tại được giữ nguyên.');finish();};
  worker.current.postMessage({city:city.current,now:Date.now()+nextOffset});
 };
 return <><aside className="era-preview-toolbar" style={{position:'fixed',zIndex:10000,top:4,left:'50%',transform:'translateX(-50%)',background:'#193831',color:'#f2e8cb',padding:8,maxWidth:'95vw',border:'1px solid #ad9658',borderRadius:8,fontSize:12}}>
 <b>Phase 2 · thử local · API độc lập</b> <select aria-label="Chọn thời đại thử" value={era} onChange={e=>reset(+e.target.value)}>{[3,4,5,6].map(e=><option key={e} value={e}>{ERA_NAMES[e]}</option>)}</select>
 <button onClick={()=>advance(10*MIN)}>+10 phút</button><button onClick={()=>advance(HOUR)}>+1 giờ</button><button onClick={()=>advance(12*HOUR)}>+12 giờ</button>
 <button onClick={largeVillage}>Mẫu 1.500 dân</button>
 <details><summary>Kịch bản thử và kết quả</summary><p>{summary}</p><p>Mở Thời đại để xem điện/ô nhiễm/checklist. Chọn nhà để bật/tắt, giao thợ hoặc xem nước. Chọn Vườn ươm để trồng. Bản mẫu có sẵn kho và tài nguyên; không đại diện cân bằng chơi thật.</p><p>Bản thử tự lưu trên trình duyệt. Đổi thời hoặc tạo mẫu sẽ thay thế bản thử đang lưu.</p><button onClick={()=>reset(era)}>Tạo lại làng mẫu thời đang chọn</button><button onClick={()=>reset(6,true)}>Mẫu đủ điều kiện kỳ quan</button></details>
 </aside>{ready&&<Game key={epoch} rules={LOCAL_RULES}/>} {busy&&<div role="status" aria-live="polite" style={{position:'fixed',inset:0,zIndex:10001,background:'#10241fe8',display:'grid',placeItems:'center',color:'#f2e8cb',padding:24,textAlign:'center'}}>Đang mô phỏng thời gian…<br/>Bản thử giữ nguyên cho đến khi có kết quả.</div>}</>;
}
