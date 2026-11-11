'use client';
import type {City,Troops} from '@/lib/engine';
import type {PackageSpell} from '@/lib/magic-myth';
import {attackPackages,flaskMages,flaskSources} from '@/lib/magic-view';
export type AttackMagic={manaSource?:{x:number;y:number};spells?:PackageSpell[]};
const W=96;
/** PvP launch options: which source fills the mages' flasks and which packages ride along. */
export default function AttackMagicOptions({city,now,army,value,onChange}:{city:City;now:number;army:Troops;value:AttackMagic;onChange:(v:AttackMagic)=>void}){
 if(!city.magic)return null;
 const mages=flaskMages(army),sources=flaskSources(city),packages=attackPackages(city,now);
 if(!mages&&!packages.length)return null;
 const tile=value.manaSource?value.manaSource.y*W+value.manaSource.x:-1;
 const chosen=sources.find(s=>s.tile===tile);
 return <div className="magic-attack small">
  {mages>0&&<><label>Bình mana cho {mages} pháp sư<select value={tile} onChange={e=>{const t=+e.target.value;onChange({...value,...(t>=0?{manaSource:{x:t%W,y:Math.floor(t/W)}}:{manaSource:undefined})});}}><option value={-1}>Không mang bình (chỉ bắn thường)</option>{sources.map(s=><option key={s.tile} value={s.tile}>{s.name} · {s.stored} mana</option>)}</select></label>
   <p className="muted">Rót tối đa 100 mana/pháp sư ({mages*100}) từ nguồn đã chọn{chosen?`, thực rót ${Math.min(mages*100,chosen.stored)}`:''}. Phần chưa dùng về lại nguồn nếu còn chỗ.</p></>}
  {!!packages.length&&<fieldset><legend>Mang gói đại phép (một gói mỗi loại)</legend>{packages.map(p=><label key={p.spell} className="setting-row"><input type="checkbox" checked={!!value.spells?.includes(p.spell)} onChange={e=>onChange({...value,spells:e.target.checked?[...(value.spells??[]),p.spell]:(value.spells??[]).filter(s=>s!==p.spell)})}/> {p.name}</label>)}<p className="muted">Gói đã dùng sẽ mất; gói chưa dùng về làng nếu chưa hết hạn 24 giờ.</p></fieldset>}
 </div>;
}
