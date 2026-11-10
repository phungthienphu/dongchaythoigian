'use client';
import {B,ERA_REQ,RES,RN,buildingName,isBuildingActive,type BKey,type City,type ResKey} from '@/lib/engine';

export default function EraRequirements({city,hallLevel,onBuilding,onResource,onPeople}:{city:City;hallLevel:number;onBuilding:(kind:BKey)=>void;onResource:(key:ResKey)=>void;onPeople:()=>void}){
  const next=ERA_REQ[city.era+1];
  if(!next)return null;
  const number=(n:number)=>Math.floor(n).toLocaleString('vi-VN');
  const rows:{key:string;label:string;met:boolean;detail:string;action:()=>void}[]=[];
  if(next.wonder){const k=next.wonder,met=Object.values(city.b).some(b=>b.k===k&&isBuildingActive(b));rows.push({key:k,label:buildingName(city,k),met,detail:met?'Đã hoàn thành và hoạt động':'Cần xây xong hoặc khôi phục hoạt động',action:()=>onBuilding(k)});}
  if(next.hall)rows.push({key:'hall',label:B.hall.n,met:hallLevel>=next.hall,detail:`Cấp ${hallLevel}/${next.hall}`,action:()=>onBuilding('hall')});
  rows.push({key:'pop',label:'Dân số',met:city.people.length>=next.pop,detail:city.people.length>=next.pop?`${city.people.length}/${next.pop}`:`Cần thêm ${next.pop-city.people.length} dân · ${city.people.length}/${next.pop}`,action:onPeople});
  for(const r of RES.filter(r=>next.cost[r])){const cost=next.cost[r]!;rows.push({key:r,label:RN[r],met:city.res[r]>=cost,detail:city.res[r]>=cost?`${number(city.res[r])}/${number(cost)}`:`Thiếu ${Math.ceil(cost-city.res[r]).toLocaleString('vi-VN')} · ${number(city.res[r])}/${number(cost)}`,action:()=>onResource(r)});}
  const missing=rows.filter(r=>!r.met),complete=rows.filter(r=>r.met);
  return <section className="era-requirements" aria-label="Điều kiện lên đời">
    <h3>{missing.length?`Còn ${missing.length} điều kiện`:'Đã đủ điều kiện'}</h3>
    {missing.map(row=><button key={row.key} className="requirement-row" onClick={row.action}><span>{row.label}<small>{row.detail}</small></span><span aria-hidden="true">›</span></button>)}
    {!!complete.length&&<details className="ui-details"><summary>Đã đạt · {complete.length} điều kiện</summary>{complete.map(row=><p key={row.key}>✓ {row.label} · {row.detail}</p>)}</details>}
  </section>;
}
