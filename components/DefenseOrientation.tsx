'use client';
import type {DefenseOrientation} from '@/lib/fortifications';

type Props={value:DefenseOrientation;axis:'x'|'y';disabled?:boolean;onChange:(orientation:DefenseOrientation)=>void};
export default function DefenseOrientation({value,axis,disabled,onChange}:Props){
 return <div aria-label="Hướng tường và cổng">
  <p className="small">{value==='auto'?'Tự nối theo tường/cổng sát cạnh, gồm góc L, ngã ba và ngã tư.':'Đang cố định đoạn thẳng. Chọn Tự nối để ghép góc với các đoạn bên cạnh.'}</p>
  <div className="tb" style={{display:'flex',gap:6,flexWrap:'wrap',justifyContent:'flex-start'}}>
   <button disabled={disabled} aria-pressed={value==='auto'} onClick={()=>onChange('auto')}>Tự nối</button>
   <button disabled={disabled} onClick={()=>onChange(axis==='x'?'y':'x')}>↻ Xoay 90° · {axis==='x'?'↘':'↙'}</button>
  </div>
 </div>;
}
