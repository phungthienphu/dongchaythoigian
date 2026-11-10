'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';

export default function GamePanel({title,onClose,onBack,feedback,onDismissFeedback,children}:{title:string;onClose:()=>void;onBack?:()=>void;feedback?:string;onDismissFeedback?:()=>void;children:ReactNode}){
  const close=useRef<HTMLButtonElement>(null);
  const [expanded,setExpanded]=useState(false);
  useEffect(()=>{close.current?.focus({preventScroll:true});},[title]);
  return <aside className={`drawer game-panel${expanded?' panel-expanded':''}`} aria-label={title}>
    <div className="dh">
      <div>{onBack&&<button className="panel-back" onClick={onBack}>← Quay lại</button>}<h2>{title}</h2></div>
      <div className="panel-heading-actions"><button className="panel-expand" onClick={()=>setExpanded(v=>!v)} aria-label={expanded?'Thu gọn bảng':'Mở rộng bảng'} aria-pressed={expanded}>{expanded?'↙':'↗'}</button><button ref={close} className="x" onClick={onClose} aria-label={`Đóng ${title.toLocaleLowerCase('vi')}`}>×</button></div>
    </div>
    <div className="db">{feedback&&<div className="panel-feedback" role="alert"><p>{feedback}</p><button className="x" aria-label="Đóng thông báo lỗi" onClick={onDismissFeedback}>×</button></div>}{children}</div>
  </aside>;
}
