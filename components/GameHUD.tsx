'use client';
import {useState,type Ref} from 'react';
import {ERA_NAMES,RES,RN,SEASONS,busyBuilders,builders,troopCount,upkeepRates,type City,type Stats,type ResKey} from '@/lib/engine';
import {recentResourceFlow} from '@/lib/resource-history';
import type {GamePanelKey} from '@/lib/game-ui';
import {Icon} from './GameIcon';
const number=(n:number)=>Math.floor(n).toLocaleString('vi-VN');

export default function GameHUD({city,stats,name,season,year,unread,ref,onPanel,onResource,onHelp}:{city:City;stats:Stats;name:string;season:number;year:number;unread:number;ref:Ref<HTMLElement>;onPanel:(panel:GamePanelKey)=>void;onResource:(resource?:ResKey)=>void;onHelp:()=>void}){
  return <header className="village-header" ref={ref}>
    <div className="village-heading"><button className="village-name" onClick={()=>onPanel('manage')}><span className="eyebrow">{ERA_NAMES[city.era]} · Năm {year} · {SEASONS[season]}</span><h1>{name}</h1></button><div className="header-actions"><button aria-label={unread?`Thông báo · ${unread} chưa đọc`:'Thông báo'} onClick={()=>onPanel('log')}><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5zM10 20h4"/></svg><span className="header-button-label">Thông báo</span>{unread>0&&<span className="nav-count danger-count">{unread>99?'99+':unread}</span>}</button><button aria-label="Mở cách chơi" onClick={onHelp}>?</button></div></div>
    <div className="village-ledger" aria-label="Tài nguyên trong kho">
      {RES.filter(r=>r!=='coal'||city.era>=5).map(r=>{const full=city.res[r]>=stats.storage[r],pct=Math.max(0,Math.min(100,city.res[r]/Math.max(1,stats.storage[r])*100));return <button key={r} className={`resource-pill${r==='food'||r==='wood'?' essential-resource':''}${full?' is-full':''}${r==='food'&&city.res.food<=0?' is-empty':''}`} onClick={()=>onResource(r)} title={`${RN[r]}: ${number(city.res[r])} / ${number(stats.storage[r])} · ${full?'Kho đầy':`${Math.floor(pct)}% kho`}`} aria-label={`${RN[r]}: ${number(city.res[r])} trên ${number(stats.storage[r])}${full?' · Kho đầy':''}. Xem chi tiết`}><Icon k={r}/><span className="resource-reading"><small>{RN[r]}</small><b>{number(city.res[r])}</b><span className="resource-meter" aria-hidden="true"><i style={{width:`${pct}%`}}/></span></span></button>;})}
      <button className="resource-pill population-pill" onClick={()=>onPanel('people')} aria-label={`Dân số ${city.people.length} trên ${stats.housing}`}><Icon k="pop"/><span><small>Dân làng</small><b>{city.people.length}<em>/{stats.housing}</em></b></span></button>
      <button className="resource-more" onClick={()=>onResource()} aria-label="Tất cả tài nguyên và sức chứa">⋯<span>Tất cả{RES.some(r=>r!=='food'&&r!=='wood'&&(r!=='coal'||city.era>=5)&&city.res[r]>=stats.storage[r])?' · ●':''}</span></button>
      <div className="village-capacity"><button onClick={()=>onPanel('shop')}><Icon k="build"/>{busyBuilders(city)}/{builders(city)} <span>thợ bận</span></button><button onClick={()=>onPanel('army')}><Icon k="army"/>{troopCount(city.army)} <span>quân ở nhà</span></button></div>
    </div>
  </header>;
}

export function ResourceDetails({city,stats,now,resource,onEconomy,onPeople,populationStatus}:{city:City;stats:Stats;now:number;resource:ResKey|null;onEconomy:()=>void;onPeople:()=>void;populationStatus:string}){
  const [chosen,setChosen]=useState<ResKey>(resource??'food');
  const r=chosen,flow=recentResourceFlow(city,now),upkeep=upkeepRates(city.era);
  const waiting=city.people.filter(p=>p.haul?.resource===r&&p.haul.carried>0&&(p.haul.resting?stats.storage[r]-city.res[r]<p.haul.carried:p.haul.phase==='unload'&&stats.storage[r]-city.res[r]<=1e-9)).length;
  const rate=r==='wood'?stats.rate.wood-stats.woodUse:r==='stone'?stats.rate.stone-stats.stoneUse:r==='copper'?stats.copperRate:stats.rate[r];
  return <section className="resource-detail">
    <div className="filter-chips" role="group" aria-label="Chọn tài nguyên">{RES.filter(key=>key!=='coal'||city.era>=5).map(key=><button key={key} aria-pressed={r===key} onClick={()=>setChosen(key)}><Icon k={key}/>{RN[key]}</button>)}</div>
    <div className="resource-total"><Icon k={r}/><div><h3>{RN[r]} trong kho</h3><strong>{number(city.res[r])}<small> / {number(stats.storage[r])}</small></strong></div></div>
    <progress aria-label={`Mức đầy kho ${RN[r]}`} max={Math.max(1,stats.storage[r])} value={city.res[r]}/>
    {waiting>0&&<div className="inline-warning"><b>{waiting} người đang chờ nộp</b><p>Dùng bớt tài nguyên hoặc nâng đúng ngăn kho. Người mang hàng sẽ tự tiếp tục khi có chỗ.</p></div>}
    <div className="metric-pair"><div><span>Đã nộp kho</span><b>+{number(flow.received[r])}</b></div><div><span>Đã chi</span><b>−{number(flow.spent[r])}</b></div></div>
    <p className="small muted">Trong {(flow.elapsedMs/60000).toLocaleString('vi-VN',{maximumFractionDigits:1})} phút đo gần nhất. Hàng đang mang chưa được cộng vào kho. Giao dịch chợ, chiến lợi phẩm và hoàn vật liệu không nằm trong số đo này.</p>
    <div className="actions"><button onClick={onEconomy}>Xem thu chi đầy đủ →</button><button onClick={onPeople}>Kiểm tra người làm →</button></div>
    <details className="ui-details"><summary>Công suất & chi phí duy trì</summary><p>Công suất ròng dự kiến: {(rate/60).toLocaleString('vi-VN',{maximumFractionDigits:1})}/phút. Đây là ước tính; đường đi, chăm đất và thời gian giao hàng làm thực nhận khác đi.</p>
      {r==='food'&&<><p>{stats.upkeep.civilians} dân và {stats.upkeep.foodSoldiers} quân cần {(stats.upkeep.food/60).toLocaleString('vi-VN',{maximumFractionDigits:1})} thực/phút. Khẩu phần hành quân đã trả không tính hai lần.</p><p>Trại hái lượm dùng thêm tối đa {stats.gatherFoodUse/60} thực/phút khi sản xuất; có kênh có nước tưới dùng 2, thiếu tưới dùng 4 thực/trại/phút.</p></>}
      {r==='wood'&&<p>Sinh hoạt và quân đội dùng {stats.upkeep.wood} gỗ/giờ; bếp dùng {stats.fireWoodUse/6} gỗ/10 phút. Lò đúc và cối nước dùng nhiên liệu khi sản xuất. Hết gỗ, cơ sở tạm dừng; người vẫn giữ việc.</p>}
      {r==='stone'&&<p>Lò đúc tiêu hao tối đa {stats.stoneUse/60} đá/phút. Thiếu gỗ hoặc đá thì giảm hoặc ngừng đúc.</p>}
      <p>Xây, nâng cấp, chăm ruộng, luyện quân và giao thương còn có chi phí riêng. Xem giá trước khi xác nhận.</p>
    </details>
    <details className="ui-details"><summary>Dân, thợ & quân</summary><p>{city.people.length}/{stats.housing} dân · {populationStatus}.</p><p>{busyBuilders(city)}/{builders(city)} thợ đang bận. Số còn lại là đội có thể nhận xây hoặc nâng cấp.</p><p>Mỗi dân: {upkeep.civilian.food/6} thực/10 phút và {upkeep.civilian.wood} gỗ/giờ. Mỗi quân: {upkeep.soldier.food/6} thực/10 phút và {upkeep.soldier.wood} gỗ/giờ.</p><p>Thiếu ăn tích lũy mỗi 10 phút có thể mất 1 dân; từ 30 phút có thể chết đói. Duy trì thức ăn giúp mức đói hồi phục.</p></details>
  </section>;
}
