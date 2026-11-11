'use client';
import {useState} from 'react';
import {availableForQuickAssign,isScout,type City,type Person} from '@/lib/engine';
import {searchText} from '@/lib/game-ui';
import {HungryVillager} from './HungerStatus';
import {useViewPreference} from './useViewPreference';
type Filter='all'|'idle'|'carrying'|'scouts'|'sheltering';
export default function PeopleDirectory({city,picked,label,detail,onPick,onLocate,scope}:{city:City;picked:Set<number>;label:(person:Person)=>string;detail:(person:Person)=>string;onPick:(id:number,add:boolean)=>void;onLocate:(person:Person)=>void;scope?:ReadonlySet<number>|null}){
  const [savedFilter,setSavedFilter]=useViewPreference<Filter>('people-filter','all',(v):v is Filter=>['all','idle','carrying','scouts','sheltering'].includes(String(v))),[savedQuery,setSavedQuery]=useViewPreference('people-search','',(v):v is string=>typeof v==='string'),[page,setPage]=useState(0);
  const [localFilter,setLocalFilter]=useState<Filter>('all'),[localQuery,setLocalQuery]=useState('');
  const filter=scope?localFilter:savedFilter,setFilter=scope?setLocalFilter:setSavedFilter,query=scope?localQuery:savedQuery,setQuery=scope?setLocalQuery:setSavedQuery;
  const search=searchText(query);
  const rows=city.people.filter(p=>(!scope||scope.has(p.id))&&(filter==='all'||filter==='idle'&&availableForQuickAssign(p)||filter==='carrying'&&(p.haul?.carried??0)>0||filter==='scouts'&&isScout(p)||filter==='sheltering'&&p.refuge)&&(!search||searchText(`${p.name} ${label(p)}`).includes(search)));
  const pages=Math.max(1,Math.ceil(rows.length/30)),current=Math.min(page,pages-1);
  return <section className="people-directory"><label className="search-field">Tìm người hoặc công việc<input type="search" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}} placeholder="Tên, chặt cây, làm ruộng…"/></label>
    <div className="filter-chips" role="group" aria-label="Lọc dân làng">{([['all','Tất cả'],['idle','Nhận việc được'],['carrying','Mang hàng'],['scouts','Khám phá'],['sheltering','Trú ẩn']] as const).map(([key,title])=><button key={key} aria-pressed={filter===key} onClick={()=>{setFilter(key);setPage(0);}}>{title}</button>)}</div>
    <p className="small muted">{rows.length} người · {picked.size} đang chọn</p>
    <ul className="people">{rows.slice(current*30,current*30+30).map(p=><li key={p.id}><button className={`person${availableForQuickAssign(p)?' idle':''}`} aria-pressed={picked.has(p.id)} onClick={e=>onPick(p.id,e.shiftKey||e.ctrlKey||e.metaKey)}><span className="nm">{p.name}</span><span className="tk">{label(p)}</span></button><button className="link" onClick={()=>onLocate(p)}>Tìm</button><details className="person-detail"><summary>Trạng thái</summary><HungryVillager city={city} person={p}/><p>{detail(p)}</p></details></li>)}</ul>
    {!rows.length&&<p>Không có người phù hợp bộ lọc.</p>}
    {pages>1&&<div className="directory-pages"><button disabled={current===0} onClick={()=>setPage(current-1)}>← Trước</button><span>{current+1}/{pages}</span><button disabled={current===pages-1} onClick={()=>setPage(current+1)}>Sau →</button></div>}
    <p className="small muted">Chọn người rồi bấm bản đồ để giao việc. Shift để chọn thêm; trên cảm ứng dùng Chọn vùng.</p>
  </section>;
}
