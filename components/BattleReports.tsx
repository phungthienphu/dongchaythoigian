"use client";
import {useEffect,useState} from 'react';
import {battleReport} from '@/lib/battle-report';
import type {WarSummary} from './useWars';
export default function BattleReports({wars,playerId,history=false}:{wars:WarSummary[];playerId:string;history?:boolean}){
 const key=`dong-battle-reports:${playerId}`;
 const [read,setRead]=useState<{key:string;ids:string[]}>({key:'',ids:[]});
 useEffect(()=>{let ids:string[]=[];try{const value=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(value))ids=value.filter((v):v is string=>typeof v==='string').slice(-100);}catch{}setRead({key,ids});},[key]);
 const reports=wars.filter(w=>w.result&& (history||read.key===key&&!read.ids.includes(w._id)));
 if(!reports.length)return null;
 return <aside className={history?'':'war-alerts battle-reports'} aria-label="Kết quả trận đánh" aria-live="polite">
  {reports.map(w=><div key={w._id}><b>{battleReport(w.result!,w.side,w.side==='attacker'?w.defenderName:w.attackerName)}</b>{w.endedAt&&<span className="small"> · {new Date(w.endedAt).toLocaleString('vi-VN')}</span>}</div>)}
  {!history&&<button onClick={()=>{const ids=[...new Set([...read.ids,...reports.map(w=>w._id)])].slice(-100);setRead({key,ids});try{localStorage.setItem(key,JSON.stringify(ids));}catch{}}}>Đã đọc kết quả</button>}
 </aside>;
}
