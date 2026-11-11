'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {B,BKEYS,ERA_NAMES,RES,RN,W,buildMs,buildingCost,buildingName,type BKey,type City,type Derived} from '@/lib/engine';
import {erasUpTo,type EngineRules} from '@/lib/eras';
import {buildAvailability} from '@/lib/build-availability';
import {placementHint} from '@/lib/build-placement';
import {BUILD_GROUPS,buildingGroup,searchText,type BuildGroup} from '@/lib/game-ui';
import {drawThumb} from './draw';
import {Icon} from './GameIcon';
import {useViewPreference} from './useViewPreference';
const duration=(ms:number)=>{const s=Math.ceil(ms/1000);return s<60?`${s} giây`:s<3600?`${Math.floor(s/60)} phút${s%60?` ${s%60} giây`:''}`:`${Math.floor(s/3600)} giờ${Math.floor(s%3600/60)?` ${Math.floor(s%3600/60)} phút`:''}`;};
function Thumbnail({city,D,kind}:{city:City;D:Derived;kind:BKey}){
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{if(ref.current)drawThumb(ref.current,city,D,kind);},[kind,city.era]);
  return <canvas ref={ref} className="thumb" aria-hidden="true"/>;
}
export default function BuildingCatalog({city,D,rules,initialEra,initialKind=null,onChoose,onLocate}:{city:City;D:Derived;rules:EngineRules;initialEra:number;initialKind?:BKey|null;onChoose:(kind:BKey)=>void;onLocate:(tile:number)=>void}){
  const [query,setQuery]=useViewPreference('build-search','',(v):v is string=>typeof v==='string'),[group,setGroup]=useViewPreference<BuildGroup>('build-group','Tất cả',(v):v is BuildGroup=>BUILD_GROUPS.includes(v as BuildGroup)),[era,setEra]=useState(initialEra),[selected,setSelected]=useState<BKey|null>(initialKind),[page,setPage]=useState(0);
  const detailBack=useRef<HTMLButtonElement>(null);
  useEffect(()=>{if(selected){detailBack.current?.scrollIntoView({block:'start'});detailBack.current?.focus({preventScroll:true});}},[selected]);
  // Catalog text/order changes with filters and era, not live stock/timers.
  const rows=useMemo(()=>{
    const search=searchText(query),rank=(k:BKey)=>search&&searchText(`${buildingName(city,k)} ${B[k].n}`).includes(search)?0:1;
    return BKEYS.filter(k=>(era?B[k].era===era:B[k].era<=city.era)&&(group==='Tất cả'||buildingGroup(k)===group)&&searchText(`${buildingName(city,k)} ${B[k].n} ${B[k].d}`).includes(search)).sort((a,b)=>rank(a)-rank(b)||B[a].era-B[b].era||buildingName(city,a).localeCompare(buildingName(city,b),'vi'));
  },[query,era,group,city.era]);
  const pages=Math.max(1,Math.ceil(rows.length/12)),current=Math.min(page,pages-1);
  const building=selected?B[selected]:null,availability=selected?buildAvailability(city,selected,rules):null,cost=selected?buildingCost(selected,Math.max(building!.era,city.era)):null;
  const missing=cost?RES.filter(r=>(cost[r]??0)>city.res[r]):[];
  const pending=Object.entries(city.b).filter(([,b])=>b.doneAt);
  if(selected&&building&&availability&&cost)return <section className="catalog-detail">
    <button ref={detailBack} className="panel-back" onClick={()=>setSelected(null)}>← Danh sách công trình</button>
    <div className="catalog-hero"><Thumbnail city={city} D={D} kind={selected}/><div><span className="eyebrow">{buildingGroup(selected)} · {ERA_NAMES[building.era]}</span><h3>{buildingName(city,selected)}</h3><p>{availability.limit!==undefined?`Đã đặt ${availability.count}/${availability.limit}`:`Hiện có ${availability.count}`} · {duration(buildMs(selected,1))}</p></div></div>
    <p>{building.d}</p>
    <div className="cost-list">{RES.filter(r=>cost[r]).map(r=><div key={r} className={missing.includes(r)?'cost-missing':''}><Icon k={r}/><span>{RN[r]}</span><b>{cost[r]!.toLocaleString('vi-VN')}</b>{missing.includes(r)&&<small>Thiếu {Math.ceil(cost[r]!-city.res[r]).toLocaleString('vi-VN')}</small>}</div>)}</div>
    <p className="small">{placementHint(selected)}</p>
    {availability.reason&&<p className="inline-warning" role="status">{availability.reason}</p>}
    {!!missing.length&&<p className="small danger">Cần thêm vật liệu. Bạn vẫn có thể xem vị trí; chỉ xây được khi đủ điều kiện.</p>}
    <button className="primary wide" disabled={availability.locked} onClick={()=>onChoose(selected)}>{selected==='dam'||selected==='green'?'Xem điều kiện & chọn vị trí':'Chọn vị trí xây'}</button>
    {availability.count>0&&<button onClick={()=>{const tile=Object.keys(city.b).find(t=>city.b[+t].k===selected);if(tile)onLocate(+tile);}}>Tới công trình hiện có</button>}
  </section>;
  return <section className="building-catalog">
    <label className="search-field">Tìm công trình<input type="search" placeholder="Tên hoặc công dụng…" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/></label>
    <div className="catalog-filter"><label>Thời đại<select value={era} onChange={e=>{setEra(+e.target.value);setPage(0);}}><option value={0}>Đã mở</option>{erasUpTo(Math.max(6,rules.maxEra)).map(e=><option key={e.id} value={e.id}>{e.name}{e.id>rules.maxEra?' · Sắp ra mắt':e.id>city.era?' · Chưa mở':''}</option>)}</select></label><label>Công dụng<select value={group} onChange={e=>{setGroup(e.target.value as BuildGroup);setPage(0);}}>{BUILD_GROUPS.map(g=><option key={g}>{g}</option>)}</select></label></div>
    {!!pending.length&&<details className="ui-details"><summary>Đang xây / nâng cấp · {pending.length}</summary>{pending.map(([tile,b])=><button key={tile} className="menu-link" onClick={()=>onLocate(+tile)}>{buildingName(city,b.k)} <span>({+tile%W}, {Math.floor(+tile/W)}) →</span></button>)}</details>}
    <p className="small muted">{rows.length} công trình · Chọn để xem giá và điều kiện</p>
    {!rows.length&&<p>Không có công trình phù hợp. <button onClick={()=>{setQuery('');setGroup('Tất cả');setEra(0);}}>Bỏ bộ lọc</button></p>}
    <div className="catalog-list">{rows.slice(current*12,current*12+12).map(k=>{const a=buildAvailability(city,k,rules),cost=buildingCost(k,Math.max(city.era,B[k].era));return <button className="catalog-row" key={k} onClick={()=>setSelected(k)}><Thumbnail city={city} D={D} kind={k}/><span><b>{buildingName(city,k)}</b><small>{buildingGroup(k)}{a.limit!==undefined?` · ${a.count}/${a.limit}`:''}</small><small className={a.locked?'muted':'catalog-price'}>{a.reason??RES.filter(r=>cost[r]).map(r=>`${cost[r]} ${RN[r].toLocaleLowerCase('vi')}`).join(' · ')}</small></span><span aria-hidden="true">›</span></button>;})}</div>
    {pages>1&&<div className="directory-pages"><button disabled={current===0} onClick={()=>setPage(current-1)}>← Trước</button><span>{current+1}/{pages}</span><button disabled={current===pages-1} onClick={()=>setPage(current+1)}>Sau →</button></div>}
  </section>;
}
