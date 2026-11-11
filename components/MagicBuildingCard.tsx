'use client';
import {useState} from 'react';
import {RES,RN,resourceUnlocked,type Action,type City,type ResKey} from '@/lib/engine';
import type {Element} from '@/lib/magic-data';
import {ELEMENT_NAMES} from '@/lib/magic-elements';
import {isMagicBuilding,magicSiteId} from '@/lib/magic';
import {dockView,magicDiagnosis,packagesView} from '@/lib/magic-view';
import {magicDuration,type MagicTab} from './MagicPanel';

const n=(v:number)=>Math.floor(v).toLocaleString('vi-VN');
const W=96;
type Props={city:City;tile:number;now:number;busy:boolean;act:(a:Action)=>unknown;onLocate:(tile:number)=>void;onOpenMagic:(tab:MagicTab)=>void};

function Harmonizer({city,tile,busy,act}:Props){
 const b=city.b[tile],chosen=city.magic?.harmony?.[magicSiteId(b)]??[];
 const [pick,setPick]=useState<Element[]>(chosen);
 const toggle=(e:Element)=>setPick(p=>p.includes(e)?p.filter(x=>x!==e):[...p.slice(-1),e]);
 return <div><p className="small"><b>Hai ấn dùng cho đài:</b> {chosen.length===2?chosen.map(e=>ELEMENT_NAMES[e]).join(' + '):'chưa chọn'}</p>
  <div className="filter-chips" role="group" aria-label="Chọn hai ấn">{(['fire','water','wood','earth'] as Element[]).map(e=><button key={e} aria-pressed={pick.includes(e)} onClick={()=>toggle(e)}>{ELEMENT_NAMES[e]}</button>)}</div>
  <button disabled={busy||pick.length!==2||pick.slice().sort().join()===chosen.join()} onClick={()=>act({type:'magicHarmonize',x:tile%W,y:Math.floor(tile/W),elements:pick})}>Dùng ấn {pick.map(e=>ELEMENT_NAMES[e]).join(' + ')||'…'}</button></div>;
}
function Treants({city,tile,now,busy,act}:Props){
 const m=city.magic!,max=8+(m.specialization?.element==='wood'?1:0),count=(m.treants?.length??0)+(m.treantQueue?.length??0);
 const next=m.treantQueue?.[0];
 return <div><p className="small"><b>Linh mộc vận tải:</b> {m.treants?.length??0} đang làm · {m.treantQueue?.length??0} đang tạo · tối đa {max}. Mang 30 hàng vào bộ đệm nhà phép, dùng 5 mana/giờ khi đi.</p>
  {next&&<p className="small muted">Linh mộc tiếp theo xong sau {magicDuration(next.doneAt-now)}.</p>}
  <button disabled={busy||count>=max||city.res.wood<100||city.res.rune<20||city.res.essence<10} onClick={()=>act({type:'magicTreant',x:tile%W,y:Math.floor(tile/W)})}>Tạo linh mộc · 100 gỗ + 20 phù văn + 10 tinh chất · 1 giờ</button></div>;
}
function Dock({city,tile,now,busy,act,onLocate}:Props){
 const v=dockView(city,tile,now);const [resource,setResource]=useState<ResKey>('rune');const [amount,setAmount]=useState(60);
 if(!v)return null;
 return <div className="magic-dock"><p className="small"><b>Ghép cặp:</b> {v.partner?<button className="link" onClick={()=>onLocate(v.partner!.tile)}>{v.partner.name}</button>:'chưa ghép'}</p>
  {!v.others.length&&<p className="small muted">Cần xây thêm một Bến dịch chuyển để ghép cặp (tối đa 4 bến).</p>}
  {v.others.map(o=>o.tile!==v.partner?.tile&&<button key={o.tile} disabled={busy} onClick={()=>act({type:'magicDockPair',x:tile%W,y:Math.floor(tile/W),to:o.tile})}>Ghép với {o.name}{o.operating?'':' (đang dừng)'}</button>)}
  {v.partner&&<><p className="small muted">Mỗi chuyến tối đa {v.rule.max} hàng, {v.rule.mana} mana + {v.rule.rune} phù văn, tới sau 30 giây, hồi 2 phút/cặp. Hàng vào bộ đệm nhà phép trong 6 ô bến đích, phần dư về kho. Không chuyển quân.</p>
   <div className="assign"><label className="small">Hàng<select value={resource} onChange={e=>setResource(e.target.value as ResKey)}>{RES.filter(r=>resourceUnlocked(r,city.era)&&r!=='diamond').map(r=><option key={r} value={r}>{RN[r]} ({n(city.res[r])})</option>)}</select></label>
    <label className="small">Số lượng<input type="number" min={1} max={v.rule.max} value={amount} onChange={e=>setAmount(Math.max(1,Math.min(v.rule.max,Math.floor(+e.target.value||1))))} style={{width:70}}/></label></div>
   {v.lock&&<p className="small err" role="status">{v.lock}</p>}
   <button className="primary" disabled={busy||!!v.lock||city.res[resource]<amount} onClick={()=>act({type:'magicTeleport',x:tile%W,y:Math.floor(tile/W),resource,amount})}>Dịch chuyển {amount} {RN[resource].toLocaleLowerCase('vi')}</button></>}
  {!!v.shipments.length&&<ul className="magic-list">{v.shipments.map(s=><li key={s.id} className="small">{s.outgoing?'Gửi đi':'Đang tới'}: {n(s.amount)} {s.resource} · còn {Math.ceil(s.remaining/1000)} giây</li>)}</ul>}
 </div>;
}

/** Context card body for every era 7–9 building: needs, root error, what it serves, buffers, spells. */
export default function MagicBuildingCard(props:Props){
 const {city,tile,now,onLocate,onOpenMagic}=props,b=city.b[tile];
 if(!b||!isMagicBuilding(b.k)||!city.magic)return null;
 const d=magicDiagnosis(city,tile,now);
 if(!d)return <p className="small muted">Công trình ma pháp sẽ được nối vào mạng ở mốc phút tiếp theo.</p>;
 const packages=b.k==='worldmatrix'?packagesView(city,now):null;
 return <section className="magic-card" aria-label="Vận hành ma pháp">
  {d.missing?<div className="inline-warning" role="status"><b>Đang dừng · thiếu gì</b><p>{d.missing.text}{d.missing.tile!==undefined&&d.missing.tile!==tile&&<> <button className="link" onClick={()=>onLocate(d.missing!.tile!)}>Xem nơi lỗi →</button></>}</p></div>:b.lvl>=1&&<p className="ok small" role="status">✓ Đang hoạt động</p>}
  {d.mana&&<><p className="small"><b>Mana:</b> {n(d.mana.stored)}/{n(d.mana.capacity)}</p><progress aria-label="Mana trong nguồn" max={Math.max(1,d.mana.capacity)} value={d.mana.stored} style={{width:'100%'}}/></>}
  {!!d.needs.length&&<><h4>Cần ai</h4><ul className="magic-needs">{d.needs.map((r,i)=><li key={i} className={r.ok?'ok':'err'}><span aria-hidden="true">{r.ok?'✓':'✗'}</span> <b>{r.label}:</b> {r.detail}{r.tile!==undefined&&r.tile!==tile&&<> <button className="link" onClick={()=>onLocate(r.tile!)}>Xem</button></>}</li>)}</ul></>}
  {!!d.buffers.length&&<><h4>Bộ đệm đầu vào (2 giờ)</h4>{d.buffers.map(x=><p key={x.resource} className="small">{x.resource}: {n(x.have)}/{n(x.capacity)} · dùng {n(x.perHour)}/giờ. Dân của nhà này mang từ kho gần nhất.</p>)}</>}
  {!!d.serves.length&&<><h4>Cấp cho ai</h4><ul className="magic-needs">{d.serves.map((s,i)=><li key={i}>→ {s.label}{s.tile!==undefined&&<> <button className="link" onClick={()=>onLocate(s.tile!)}>Xem</button></>}</li>)}</ul></>}
  {!!d.spells.length&&<details className="ui-details" open><summary>Phép · {d.spells.length}</summary>{d.spells.map(s=><div key={s.key} className="magic-row"><div className="magic-row-head"><b>{s.name}</b><span className="magic-chip">{s.locked?'Chưa mở':s.readyIn>0?`Hồi ${magicDuration(s.readyIn)}`:'Sẵn sàng'}</span></div><p className="small">{s.cost} · {s.cooldown} · {s.area}</p><p className="small muted">Tự thi triển: {s.trigger}</p>{s.locked&&<p className="small err">{s.locked}</p>}</div>)}</details>}
  {b.k==='harmonizer'&&b.lvl>=1&&<Harmonizer {...props}/>}
  {b.k==='woodgrove'&&b.lvl>=1&&city.era>=8&&<Treants {...props}/>}
  {b.k==='teleportdock'&&b.lvl>=1&&<Dock {...props}/>}
  {packages&&<p className="small">Gói đại phép: {packages.list.length}/{packages.max}{packages.list.map(p=>` · ${p.name} ${p.away?'(đang ở trận)':`còn ${magicDuration(p.remaining)}`}`).join('')} <button className="link" onClick={()=>onOpenMagic('spells')}>Chuẩn bị gói →</button></p>}
  {(b.k==='covenantaltar'||b.k==='riverpalace'||b.k==='golemworks'||b.k==='spiritstable')&&city.era>=8&&<button onClick={()=>onOpenMagic('choices')}>{b.k==='riverpalace'?'Chọn lãnh địa →':b.k==='covenantaltar'?'Khế ước thần thú →':'Chuyên tu nguyên tố →'}</button>}
  {b.k==='mageacademy'&&<button onClick={()=>onOpenMagic('research')}>Mở nghiên cứu ma pháp →</button>}
  {(b.k==='aetherwell'||b.k==='manaspire'||b.k==='manarelay')&&<button onClick={()=>onOpenMagic('mana')}>Xem mạng mana →</button>}
 </section>;
}
