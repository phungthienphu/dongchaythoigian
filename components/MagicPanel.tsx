'use client';
import {useState,useSyncExternalStore,type ReactNode} from 'react';
import {RESEARCH_NAMES} from '@/lib/magic';
import type {Action,City} from '@/lib/engine';
import type {Element,Contract} from '@/lib/magic-data';
import {CONTRACT_RESEARCH} from '@/lib/magic-data';
import {ELEMENT_NAMES} from '@/lib/magic-elements';
import {CONTRACT_NAMES,DOMAIN_NAMES,type Domain} from '@/lib/magic-myth';
import {CONTRACT_EFFECTS,DOMAIN_EFFECTS,SPECIALIZATION_EFFECTS,SPELL_TRIGGERS,choicesView,goodsText,magicDiagnosis,manaView,packagesView,researchView,type ResearchItem} from '@/lib/magic-view';
import {MAGIC_SPELLS,type MagicSpell} from '@/lib/magic-data';
import {manaOverlayEnabled,setManaOverlay,subscribeManaOverlay} from '@/lib/mana-overlay';

export type MagicTab='research'|'mana'|'choices'|'spells';
type Props={city:City;now:number;busy:boolean;act:(a:Action)=>unknown;maxEra:number;onLocate:(tile:number)=>void;initialTab?:MagicTab};
const n=(v:number)=>Math.floor(v).toLocaleString('vi-VN');
export const magicDuration=(ms:number)=>{const s=Math.max(0,Math.ceil(ms/1000)),h=Math.floor(s/3600),m=Math.floor(s%3600/60);return h?`${h} giờ ${m} phút`:m?`${m} phút ${s%60} giây`:`${s} giây`;};
const STATUS={done:'Đã xong',running:'Đang nghiên cứu',ready:'Có thể bắt đầu',locked:'Chưa đủ điều kiện',soon:'Sắp ra mắt'} as const;
const ELEMENTS:Element[]=['fire','water','wood','earth'],CONTRACTS:Contract[]=['dragon','tortoise','phoenix'],DOMAINS:Domain[]=['river','citadel','crafts'];

export function useManaOverlay(){return useSyncExternalStore(subscribeManaOverlay,manaOverlayEnabled,()=>false);}
export function ManaOverlayButton(){const on=useManaOverlay();return <button aria-pressed={on} onClick={()=>setManaOverlay(!on)} aria-label="Lớp mana trên bản đồ" title="Lớp mana">✦</button>;}
export function ManaOverlayToggle(){const on=useManaOverlay();return <label className="setting-row"><input type="checkbox" checked={on} onChange={e=>setManaOverlay(e.target.checked)}/> Hiện lớp mana trên bản đồ (nguồn, cột dẫn, ấn, tuyến nối)</label>;}

function ResearchRow({item,busy,act}:{item:ResearchItem;busy:boolean;act:Props['act']}){
 return <li className={`magic-row status-${item.status}`}>
  <div className="magic-row-head"><b>{item.name}</b><span className="magic-chip">{item.status==='done'?'✓ ':item.status==='ready'?'● ':''}{STATUS[item.status]}</span></div>
  <p className="small">{n(item.knowledge)} tri thức{goodsText(item.goods)?` + ${goodsText(item.goods)}`:''} · {magicDuration(item.seconds*1000)}{item.requires.length?` · cần trước: ${item.requires.join(', ')}`:''}</p>
  {item.contract&&<p className="small muted">{CONTRACT_EFFECTS[item.contract]}. Nghiên cứu khế ước đầu tiên làm khế ước có hiệu lực; mỗi làng một khế ước.</p>}
  {item.reason&&item.status!=='done'&&<p className="small err" role="status">{item.reason}</p>}
  {item.status!=='done'&&item.status!=='running'&&item.status!=='soon'&&<button className={item.status==='ready'?'primary':''} disabled={busy||item.status!=='ready'} onClick={()=>act({type:'magicResearch',key:item.key})}>Bắt đầu {item.name} · trả phí ngay</button>}
 </li>;
}

function Research({city,now,busy,act,maxEra}:Props){
 const v=researchView(city,now,maxEra);if(!v)return null;
 const eras=[7,8,9].filter(e=>e<=maxEra);
 return <section aria-label="Nghiên cứu ma pháp">
  <div className="metric-pair"><div><span>Tri thức ma pháp</span><b>{n(v.knowledge)}<small> / {n(v.cap)}</small></b></div><div><span>Học viện đang tạo</span><b>{v.perHour}<small>/giờ</small></b></div></div>
  <progress aria-label="Mức tri thức ma pháp" max={v.cap} value={v.knowledge} style={{width:'100%'}}/>
  {v.full&&<p className="inline-warning">Tri thức đã đầy 5.000: học viện dừng tiêu phù văn. Bắt đầu một nghiên cứu để dùng bớt.</p>}
  {!v.academies&&<p className="inline-warning">Cần Học viện pháp thuật hoạt động để bắt đầu nghiên cứu và tạo tri thức.</p>}
  {v.running?<div className="magic-running" role="status"><p><b>Đang nghiên cứu {v.running.name}</b> · còn {magicDuration(v.running.remaining)}</p><progress aria-label={`Tiến độ ${v.running.name}`} max={1} value={v.running.progress} style={{width:'100%'}}/>
   <button disabled={busy} onClick={()=>{if(window.confirm(`Hủy ${v.running!.name}? Hoàn 50% phí: ${n(v.running!.refundKnowledge)} tri thức${goodsText(v.running!.refundGoods)?` + ${goodsText(v.running!.refundGoods)}`:''} (kho đầy thì mất phần dư). Thời gian không được hoàn.`))act({type:'cancelMagicResearch'});}}>Hủy nghiên cứu · hoàn 50% phí</button></div>
   :<p className="small muted">Một hàng nghiên cứu mỗi làng. Phí trả ngay khi bắt đầu, chạy cả khi offline. Đã xong thì mở vĩnh viễn, kể cả khi mất học viện.</p>}
  {eras.map(era=><div key={era}><h4>{era===7?'Thời 7 · Thức tỉnh':era===8?'Thời 8 · Nguyên tố':'Thời 9 · Thần thoại'}</h4><ul className="magic-list">{v.items.filter(i=>i.era===era).map(i=><ResearchRow key={i.key} item={i} busy={busy} act={act}/>)}</ul></div>)}
 </section>;
}

function Mana({city,now,onLocate}:Props){
 const v=manaView(city);if(!v)return null;
 const problems=v.receivers.filter(r=>!r.primary||r.blocked);
 return <section aria-label="Mạng mana">
  <ManaOverlayToggle/>
  <div className="metric-pair"><div><span>Mana trong các nguồn</span><b>{n(v.stored)}<small> / {n(v.capacity)}</small></b></div><div><span>Nhà nhận · cột dẫn</span><b>{v.receivers.length}<small> · {v.relays.length}/18</small></b></div></div>
  <p className="small muted">Mana trữ riêng ở từng giếng/tháp, không vào kho, không bán hay bị cướp. Nguồn phủ 6 ô; cột dẫn nối tiếp tối đa 3 cột, cần đường đi, không qua sông thiếu cầu.</p>
  {!!problems.length&&<div className="inline-warning" role="status"><b>{problems.length} nhà nhận đang thiếu mana hoặc dừng</b>{problems.map(r=>{const d=magicDiagnosis(city,r.tile,now);return <p key={r.id}><button className="link" onClick={()=>onLocate(r.tile)}>{r.name}</button> → {d?.missing?.text??r.reason??r.blocked}{d?.missing?.tile!==undefined&&d.missing.tile!==r.tile&&<> · <button className="link" onClick={()=>onLocate(d.missing!.tile!)}>xem nơi lỗi</button></>}</p>;})}</div>}
  <h4>Nguồn mana</h4>
  {!v.sources.length&&<p className="small">Chưa có nguồn. Xây Giếng linh mạch (không cần nghiên cứu) hoặc Tháp tụ linh (cần Dẫn linh).</p>}
  <ul className="magic-list">{v.sources.map(s=><li key={s.id} className="magic-row">
   <div className="magic-row-head"><button className="link" onClick={()=>onLocate(s.tile)}><b>{s.name}</b></button><span className="magic-chip">{s.running?'Đang thu':'Dừng'}</span></div>
   <progress aria-label={`Mana trong ${s.name}`} max={Math.max(1,s.capacity)} value={s.stored} style={{width:'100%'}}/>
   <p className="small">{n(s.stored)}/{n(s.capacity)} mana · thu tối đa {n(s.perHour)}/giờ · cấp cho {s.used}/{s.slots} nhà</p>
   {s.blocked&&<p className="small err">{s.blocked}</p>}
   {!!s.receivers.length&&<p className="small muted">Cấp cho: {s.receivers.map(r=>`${r.name}${r.backup?' (dự phòng)':''}`).join(' · ')}</p>}
  </li>)}</ul>
  <h4>Nhà nhận theo nhóm ưu tiên</h4>
  <p className="small muted">Khi thiếu mana, nguồn cấp theo thứ tự: chữa dân → phòng thủ → đầu vào → đầu ra → còn lại; cùng nhóm theo vị trí. Thứ tự này chưa chỉnh tay được trong bản này.</p>
  {v.groups.map(g=><details key={g.group} className="ui-details" open={g.receivers.some(r=>!r.primary||r.blocked)}><summary>{g.label} · {g.receivers.length} nhà</summary><ul className="magic-list">{g.receivers.map(r=><li key={r.id} className="magic-row">
   <div className="magic-row-head"><button className="link" onClick={()=>onLocate(r.tile)}><b>{r.name}</b></button><span className="magic-chip">{r.primary&&!r.blocked?'✓ Có mana':'✗ Dừng'}</span></div>
   <p className="small">{r.primary?`Nguồn chính: ${r.primary.name}`:r.reason}{r.backup?` · dự phòng: ${r.backup.name}`:''}{r.manaPerHour?` · dùng ${n(r.manaPerHour)} mana/giờ`:''}</p>
   {r.blocked&&<p className="small err">{r.blocked}</p>}
  </li>)}</ul></details>)}
  {!!v.relays.length&&<details className="ui-details"><summary>Cột dẫn linh · {v.relays.length}/18</summary><p className="small muted">Cột dẫn không phát, không trữ mana và không thêm chỗ cấp cho nguồn.</p>{v.relays.map(r=><p key={r.id}><button className="link" onClick={()=>onLocate(r.tile)}>{r.name}</button> {r.active?'':'· không hoạt động'}</p>)}</details>}
 </section>;
}

function Choice({title,active,pending,lock,cost,lack,hours,first,children}:{title:string;active?:string;pending?:{name:string;remaining:number};lock?:string;cost?:Record<string,number>;lack:string;hours:number;first:boolean;children:ReactNode}){
 return <section className="magic-choice" aria-label={title}><h4>{title}</h4>
  <p className="small">{active?<>Đang dùng: <b>{active}</b></>:pending?<>Đang đổi sang <b>{pending.name}</b> · còn {magicDuration(pending.remaining)}. Không có hiệu ứng trong lúc đổi.</>:'Chưa chọn.'}</p>
  <p className="small muted">{first?'Lần chọn đầu miễn phí, có hiệu lực ngay.':`Đổi mất ${hours} giờ${cost?` + ${goodsText(cost)}`:''}; hiệu ứng cũ dừng ngay, không cộng hai hiệu ứng.`}{lack?` Còn thiếu ${lack}.`:''}</p>
  {lock&&<p className="small err" role="status">{lock}</p>}
  <div className="magic-options">{children}</div>
 </section>;
}
function Choices({city,now,busy,act,maxEra}:Props){
 const v=choicesView(city,now);if(!v)return null;
 const confirm=(text:string,first:boolean,a:Action)=>{if(first||window.confirm(text))act(a);};
 const s=v.specialization,c=v.contract,d=v.domain;
 return <>
  {maxEra>=8&&<Choice title="Chuyên tu nguyên tố" active={s.active&&ELEMENT_NAMES[s.active]} pending={s.pending&&{name:ELEMENT_NAMES[s.pending.element],remaining:s.pending.remaining}} lock={s.lock} cost={s.cost} lack={s.lack} hours={s.hours} first={s.first}>
   {ELEMENTS.map(e=><button key={e} aria-pressed={s.active===e} disabled={busy||!!s.lock||s.active===e||!!(!s.first&&s.lack)} onClick={()=>confirm(`Đổi chuyên tu sang ${ELEMENT_NAMES[e]}: 6 giờ + 100 phù văn + 40 tinh chất, hiệu ứng hiện tại dừng ngay. Tiếp tục?`,s.first,{type:'magicSpecialize',element:e})}><b>{ELEMENT_NAMES[e]}</b><small>{SPECIALIZATION_EFFECTS[e]}</small></button>)}
  </Choice>}
  {maxEra>=9&&<Choice title="Khế ước thần thú" active={c.active&&CONTRACT_NAMES[c.active]} pending={c.pending&&{name:CONTRACT_NAMES[c.pending.contract],remaining:c.pending.remaining}} lock={c.lock} cost={c.cost} lack={c.lack} hours={c.hours} first={false}>
   <p className="small muted">Chỗ thần thú đang dùng {c.beasts}/{c.beastSlots}. Không hoàn phí quân đã giải tán.</p>
   {CONTRACTS.map(k=><button key={k} aria-pressed={c.active===k} disabled={busy||!!c.lock||c.active===k||!!c.lack} onClick={()=>confirm(`Đổi khế ước sang ${CONTRACT_NAMES[k]}: 12 giờ + 200 thiên thạch + 100 tinh chất. Không có khế ước trong lúc đổi. Tiếp tục?`,false,{type:'magicContract',contract:k})}><b>{CONTRACT_NAMES[k]}</b><small>{CONTRACT_EFFECTS[k]} · nghiên cứu {RESEARCH_NAMES[CONTRACT_RESEARCH[k]]}</small></button>)}
  </Choice>}
  {maxEra>=9&&<Choice title="Lãnh địa Thiên Cung" active={d.active&&`${DOMAIN_NAMES[d.active]}${d.running?'':' (đang dừng: thiếu mana hoặc Thiên Cung không hoạt động)'}`} pending={d.pending&&{name:DOMAIN_NAMES[d.pending.domain],remaining:d.pending.remaining}} lock={d.lock} cost={d.cost} lack={d.lack} hours={d.hours} first={d.first}>
   <p className="small muted">Duy trì {d.upkeep} mana/giờ từ nguồn nối với Thiên Cung.</p>
   {DOMAINS.map(k=><button key={k} aria-pressed={d.active===k} disabled={busy||!!d.lock||d.active===k||!!(!d.first&&d.lack)} onClick={()=>confirm(`Đổi lãnh địa sang ${DOMAIN_NAMES[k]}: 6 giờ + 100 phù văn + 40 thiên thạch, hiệu ứng cũ dừng ngay. Tiếp tục?`,d.first,{type:'magicDomain',domain:k})}><b>{DOMAIN_NAMES[k]}</b><small>{DOMAIN_EFFECTS[k]}</small></button>)}
  </Choice>}
 </>;
}

function Spells({city,now,busy,act,maxEra}:Props){
 const v=maxEra>=9?packagesView(city,now):null;
 const m=city.magic!;
 const known=(Object.keys(MAGIC_SPELLS) as MagicSpell[]).filter(k=>MAGIC_SPELLS[k].era<=Math.min(maxEra,city.era));
 return <>
  {v&&<section aria-label="Gói đại phép"><h4>Gói đại phép · {v.list.length}/{v.max}</h4>
   <p className="small muted">Trả mana và thiên thạch khi chuẩn bị. Giữ tối đa 24 giờ trong Trận đồ thiên địa, hết hạn không hoàn phí; trận đồ bị phá thì mất gói. Mỗi trận dùng tối đa một gói mỗi loại.</p>
   {v.list.map(p=><p key={p.id} className="magic-row"><b>{p.name}</b> · {p.away?'đang mang theo trận':`hết hạn sau ${magicDuration(p.remaining)}`}</p>)}
   <div className="magic-options">{v.prepare.map(p=><button key={p.spell} disabled={busy||!!p.lock} onClick={()=>act({type:'magicPrepare',spell:p.spell})}><b>Chuẩn bị {p.name}</b><small>{p.cost} · ấn {p.seals}</small><small>{p.effect}</small>{p.lock&&<small className="err">{p.lock}</small>}</button>)}</div>
  </section>}
  <section aria-label="Ngưỡng phép tự động"><h4>Phép tự động & ngưỡng</h4>
   <p className="small muted">Phép tự thi triển theo cùng điều kiện cả khi offline. Ngưỡng cố định trong bản này, chưa chỉnh được.</p>
   <ul className="magic-list">{known.map(k=>{const s=MAGIC_SPELLS[k] as {name:string;mana:number;research?:string};const locked=s.research&&!m.researched.includes(s.research as never);return <li key={k} className="magic-row"><b>{s.name}</b>{locked?<span className="magic-chip">Chưa mở</span>:null}<p className="small">{s.mana} mana · {SPELL_TRIGGERS[k]}</p></li>;})}</ul>
  </section>
 </>;
}

export default function MagicPanel(props:Props){
 const [tab,setTab]=useState<MagicTab>(props.initialTab??'research');
 if(!props.city.magic)return <p>Ma pháp mở từ thời Thức tỉnh Ma pháp.</p>;
 const tabs:[MagicTab,string][]=[['research','Nghiên cứu'],['mana','Mana'],...(props.maxEra>=8&&props.city.era>=8?[['choices','Lựa chọn'] as [MagicTab,string]]:[]),['spells','Phép']];
 return <div className="magic-panel">
  <div className="tabs" role="group" aria-label="Ma pháp">{tabs.map(([k,label])=><button key={k} className={'tab'+(tab===k?' on':'')} aria-pressed={tab===k} onClick={()=>setTab(k)}>{label}</button>)}</div>
  {tab==='research'&&<Research {...props}/>}
  {tab==='mana'&&<Mana {...props}/>}
  {tab==='choices'&&<Choices {...props}/>}
  {tab==='spells'&&<Spells {...props}/>}
 </div>;
}
