'use client';
import {useEffect,useState,type ReactNode} from 'react';
export default function ContextCard({children,selectingLocation=false}:{children:ReactNode;selectingLocation?:boolean}){
  const [collapsed,setCollapsed]=useState(false);
  useEffect(()=>{setCollapsed(selectingLocation);},[selectingLocation]);
  return <section className={`hud-card context-card${collapsed?' context-collapsed':''}`} aria-label="Đối tượng đang chọn"><button className="context-toggle" aria-label={collapsed?'Mở lệnh của đối tượng':'Thu gọn để xem bản đồ'} aria-expanded={!collapsed} onClick={()=>setCollapsed(v=>!v)}>{collapsed?'⌃':'⌄'}</button><div className="context-card-content">{children}</div></section>;
}
