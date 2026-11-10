'use client';
import {UKEYS,UNITS,type Troops,type UKey} from '@/lib/engine';
import styles from './TroopTypePicker.module.css';

export default function TroopTypePicker({counts,filter,onChoose,disabled=false}:{counts:Troops;filter:UKey|null;onChoose:(type:UKey|null,additive:boolean)=>void;disabled?:boolean}){
  const total=UKEYS.reduce((n,u)=>n+(counts[u]??0),0);
  return <div className={styles.picker}>
    <div className={styles.types} role="group" aria-label="Chọn theo loại quân">
      <button type="button" disabled={disabled||!total} aria-pressed={filter===null} onClick={e=>onChoose(null,e.shiftKey||e.ctrlKey||e.metaKey)}>Mọi loại ({total})</button>
      {UKEYS.filter(u=>(counts[u]??0)>0||u===filter).map(u=><button type="button" key={u} disabled={disabled||!counts[u]} aria-pressed={filter===u} onClick={e=>onChoose(u,e.shiftKey||e.ctrlKey||e.metaKey)}>{UNITS[u].n} ({counts[u]??0})</button>)}
    </div>
    <small>Bấm loại để chọn quân cùng loại; kéo khung để chọn một phần. Shift + bấm để thêm loại.</small>
  </div>;
}
