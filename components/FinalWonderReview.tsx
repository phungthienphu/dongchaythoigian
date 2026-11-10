'use client';
import {useEffect,useRef} from 'react';
import {B,type City} from '@/lib/engine';
import {finalWonderReadiness} from '@/lib/final-wonder-readiness';
import FinalWonderRequirements from './FinalWonderRequirements';
export default function FinalWonderReview({city,kind,now,onConfirm,onClose,onLocate}:{city:City;kind:'dam'|'green';now:number;onConfirm:()=>void;onClose:()=>void;onLocate?:(tile:number)=>void}){
 const dialog=useRef<HTMLDialogElement>(null),r=finalWonderReadiness(city,kind,now);
 useEffect(()=>{if(!dialog.current?.open)dialog.current?.showModal();},[]);
 return <dialog ref={dialog} aria-label="Chọn kỳ quan cuối" className="final-wonder-modal" onCancel={e=>{e.preventDefault();onClose();}}><div className="final-wonder-card"><h2>{B[kind].n}</h2><p>{B[kind].d}</p><FinalWonderRequirements city={city} kind={kind} now={now} onLocate={onLocate}/><p>Khi hoàn thành, lựa chọn này cố định. Trong lúc xây có thể hủy theo luật hoàn trả; hoàn thành rồi chỉ có thể sửa chữa.</p><button disabled={!r.ready} onClick={()=>{if(r.ready)onConfirm();}}>Đồng ý đánh đổi · chọn vị trí</button><button onClick={onClose}>Quay lại</button></div></dialog>;
}
