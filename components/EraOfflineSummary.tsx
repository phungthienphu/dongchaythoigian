"use client";
import {useEffect,useRef,useState} from 'react';
import {B,MIN,RES,RN,type City,type Res} from '@/lib/engine';
type Snapshot={t0:number;at:number;delivered:Partial<Res>;inputs:Partial<Res>};
const values=(current:Partial<Res>,old:Partial<Res>)=>RES.filter(r=>(current[r]??0)>(old[r]??0)+.5).map(r=>`${Math.floor((current[r]??0)-(old[r]??0)).toLocaleString('vi-VN')} ${RN[r]}`).join(', ')||'chưa có';

/** One local checkpoint per village, at most once a minute. No API polling or simulation. */
export default function EraOfflineSummary({city,now}:{city:City;now:number}){
 const current=useRef({city,now});current.current={city,now};
 const [report,setReport]=useState<{from:number;goods:string;inputs:string}|null>(null);
 useEffect(()=>{
  const key=`dong-era-offline:${city.seed}`;
  const save=()=>{const {city:c,now:at}=current.current;const next:Snapshot={t0:c.t0,at,delivered:{...c.industry?.delivered},inputs:{...c.industry?.inputsSpent}};try{localStorage.setItem(key,JSON.stringify(next));}catch{}};
  try{
   const old=JSON.parse(localStorage.getItem(key)??'null') as Snapshot|null;
   if(old&&old.t0===city.t0&&Number.isFinite(old.at)&&now-old.at>=10*MIN&&old.delivered&&old.inputs)setReport({from:old.at,goods:values(city.industry?.delivered??{},old.delivered),inputs:values(city.industry?.inputsSpent??{},old.inputs)});
  }catch{}
  save();const timer=setInterval(save,MIN);window.addEventListener('pagehide',save);
  return()=>{clearInterval(timer);window.removeEventListener('pagehide',save);save();};
 },[city.seed,city.t0]);
 if(!report)return null;
 const damaged=Object.values(city.b).filter(b=>b.flooded||b.burned);
 return <details className="era-offline-summary"><summary>Khi bạn vắng mặt · xem tóm tắt</summary><div aria-label="Tóm tắt khi vắng mặt"><button className="x" aria-label="Đóng tóm tắt" onClick={()=>setReport(null)}>×</button><h3>Khi bạn vắng mặt</h3><p>Hàng đã nộp kho: {report.goods}. Nguyên liệu chế tác và nhiên liệu điện đã dùng: {report.inputs}.</p><p>Hiện tại: ô nhiễm {(city.industry?.pollution??0).toFixed(1)}/100{city.modern?`, điện ${city.modern.supply.toFixed(1)}/${city.modern.demand.toFixed(1)} MW`:''}; {damaged.length} công trình cần sửa hoặc chờ nước rút.</p>{damaged.length>0&&<p className="small">{[...new Set(damaged.map(b=>B[b.k].n))].join(', ')}</p>}<p className="small">Xem Thông báo để đọc diễn biến hạn, lũ và chiến sự. Báo cáo dựa trên lần mở làng trước trên trình duyệt này.</p></div></details>;
}
