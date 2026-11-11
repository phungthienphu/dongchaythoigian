"use client";
import {useEffect,useState,type RefObject} from 'react';
import type {FrameProfile} from '@/lib/frame-profile';

export default function FrameProfilePanel({profile}:{profile:RefObject<FrameProfile|null>}) {
  const [text,setText]=useState('');
  useEffect(()=>{
    if(new URLSearchParams(location.search).get('perf')!=='1')return;
    const id=setInterval(()=>setText(profile.current?.summary()??''),2000);
    return()=>clearInterval(id);
  },[profile]);
  if(!text)return null;
  return <aside style={{position:'fixed',bottom:60,left:8,zIndex:10020,font:'11px monospace',background:'#10241fee',color:'#fff',padding:8,maxWidth:'calc(100vw - 16px)'}}>
    <output aria-label="Đo hiệu năng bản đồ" style={{whiteSpace:'pre-wrap',display:'block',pointerEvents:'none'}}>{text}</output>
    <button onClick={()=>{profile.current?.clear();setText('');}}>Đo lại</button>
  </aside>;
}
