"use client";
import {useEffect,useState} from 'react';
import type {City,DisasterNotice} from '@/lib/engine';
const labels:Record<DisasterNotice['kind'],string>={flood:'Lũ lụt',earthquake:'Động đất',river:'Sông đổi dòng',dock:'Cảng mắc cạn'};
export default function DisasterNotifications({city,onLocate,onHistory}:{city:City;onLocate:(tile:number)=>void;onHistory:()=>void}){
 const key=`dong-disasters:${city.seed}:${city.t0}`;
 const [read,setRead]=useState<{key:string;ids:string[]}|null>(null);
 useEffect(()=>{let ids:string[]=[];try{const saved:unknown=JSON.parse(localStorage.getItem(key)??'[]');if(Array.isArray(saved))ids=saved.filter((id):id is string=>typeof id==='string').slice(-120);}catch{}setRead({key,ids});},[key]);
 if(read?.key!==key)return null;
 const notices=city.disasterNotices??[];
 const unread=notices.filter(n=>!read.ids.includes(n.id)&&(n.phase!=='warning'||!notices.some(later=>later.kind===n.kind&&later.phase!=='warning'&&later.at>=n.at)));
 if(!unread.length)return null;
 const dismiss=()=>{const ids=[...new Set([...read.ids,...unread.map(n=>n.id)])].slice(-120);setRead({key,ids});try{localStorage.setItem(key,JSON.stringify(ids));}catch{}};
 const item=(n:DisasterNotice)=><li key={n.id} className={n.phase==='protected'?'protected':''}><div><b>{labels[n.kind]}{n.phase==='warning'?' · Cảnh báo':n.phase==='protected'?' · An toàn':' · Thiệt hại'}</b><time dateTime={new Date(n.at).toISOString()}>{new Date(n.at).toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</time></div><p>{n.msg}</p>{n.tiles.length>0&&<button onClick={()=>onLocate(n.tiles[0])}>Tới vị trí trên bản đồ</button>}</li>;
 return <section className="disaster-notifications" aria-labelledby="disaster-notice-title">
  <div className="disaster-notice-heading"><div role="status" aria-live="polite"><h2 id="disaster-notice-title">Thiên tai · {unread.length} thông báo chưa đọc</h2><p>Bao gồm sự kiện xảy ra khi bạn vắng mặt. Thông báo được giữ lại để bạn xem khi vào làng.</p></div><button onClick={dismiss}>Đã đọc</button></div>
  <ul>{unread.slice(0,3).map(item)}</ul>
  {unread.length>3&&<details><summary>Xem thêm {unread.length-3} thông báo</summary><ul>{unread.slice(3).map(item)}</ul></details>}
  <button onClick={onHistory}>Mở lịch sử thông báo</button>
 </section>;
}
