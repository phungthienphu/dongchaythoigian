"use client";
import {B,buildingJobs,GATHER_SPEED,HOUR,RES,RN,foodEraScale,storageCapacity,upkeepRates,type Action,type Building,type City} from '@/lib/engine';
import {inDrought,waterProtection} from '@/lib/medieval';
import {active,multiplier,pollutionRemovalCapacity,staffCounts} from '@/lib/industry';
import {finalWonderError,powerFraction,type PowerGroup} from '@/lib/modern';
import PollutionPanel from './PollutionPanel';
import FinalWonderRequirements from './FinalWonderRequirements';
import {isMagicBuilding} from '@/lib/magic';
const number=(n:number)=>Number(n.toFixed(1)).toLocaleString('vi-VN');
const groups:Record<PowerGroup,string>={essential:'Thiết yếu: bệnh viện',housing:'Dân sinh: chung cư',production:'Sản xuất: đại học và xưởng'};
export function EraCivicBuilding({city,building:b,tile,now}:{city:City;building:Building;tile:number;now:number}){
 if(B[b.k].era<4||isMagicBuilding(b.k)&&!B[b.k].prod)return null;// Magic buildings: MagicBuildingCard
 const d=B[b.k],jobs=buildingJobs(b),staff=staffCounts(city).get(tile)??0,water=city.medieval?.water[tile]??0;
 const resource=RES.find(r=>d.prod?.[r]);
 const output=resource?(d.prod?.[resource]??0)*multiplier(b)*(b.k==='estate'?GATHER_SPEED:1):0;
 const reason=b.burned||b.flooded?'Cần sửa công trình':b.off?'Đang tắt':b.lvl<1?'Đang xây':jobs&&staff<jobs?`Có ${staff}/${jobs} thợ đã tới nơi`:d.demand&&powerFraction(city,tile)<1?`Được cấp ${number(powerFraction(city,tile)*100)}% điện`:d.input&&RES.some(r=>(d.input?.[r]??0)>0&&city.res[r]<d.input![r]!/(d.prod?.[resource!]??1))?'Thiếu nguyên liệu đóng kiện':'Sẵn sàng hoạt động';
 return <section className="civic-details"><p role="status"><b>{reason}</b></p>{d.jobs&&<p className="small">Thợ dịch vụ chỉ tính khi đã tới nơi; thợ sản xuất rời nhà để mang hàng vẫn giữ công việc.</p>}
 {d.input&&<p>Đầu vào cơ sở/giờ: {RES.filter(r=>d.input?.[r]).map(r=>`${number(d.input![r]!*multiplier(b))} ${RN[r]}`).join(' + ')}. Chỉ trừ lúc đóng kiện, thiếu thì dừng.</p>}
 {output>0&&resource&&<p>Đầu ra cơ sở: {number(output*(resource==='food'?foodEraScale(city,now):1))} {RN[resource]}/giờ, chưa tính dụng cụ/bonus và thời gian vận chuyển. Phải nộp vào kho.</p>}
 {(b.k==='reservoir'||b.k==='retention')&&<p>Nước dự trữ: <b>{number(water/HOUR)}/12 giờ</b>. Vùng 6 ô; cần 2 thợ. Có nguồn nước thì đầy sau 6 giờ, chỉ dùng khi hạn.</p>}
 {b.k==='well'&&<p>Bán kính 4 ô: giảm một nửa mức phạt hạn. Các giếng chồng nhau không cộng dồn.</p>}
 {d.demand&&<p>Điện: <b>{number(d.demand*((b.k==='hospital'||b.k==='university')?1:multiplier(b)))} MW</b>, đang cấp {number(powerFraction(city,tile)*100)}%.</p>}
 {d.supply&&<p>Đang phát <b>{number(city.modern?.generation[tile]??0)} MW</b>. Điện không tích kho hoặc mua bán.</p>}
 {(b.k==='treatment'||b.k==='park')&&<p>Đang giảm <b>{number(active(b)?pollutionRemovalCapacity(b)*(b.k==='treatment'?Math.min(1,staff/3):1):0)} điểm ô nhiễm/giờ</b>. Cấp {b.lvl}: tối đa {number(pollutionRemovalCapacity(b))} điểm/giờ{b.lvl>0&&b.lvl<3?`; nâng cấp tiếp theo đạt ${number(pollutionRemovalCapacity({...b,lvl:b.lvl+1}))} điểm/giờ`:''}.{b.k==='treatment'?' Cần 3 thợ đã tới nơi, không tăng số thợ khi nâng cấp.':' Không cần thợ hay điện; có thể xây thêm trên đất trống.'}</p>}
 {(b.k==='dam'||b.k==='green')&&<p>{b.lvl>0?'Kỳ quan đã khánh thành; khi hư hại cần sửa để khôi phục hiệu ứng.':finalWonderError(city,b.k,now)??'Đủ điều kiện khởi công.'}</p>}
 </section>;
}
/** Era 7–9 operating goals: the start-up chain of each magic era, then its wonder. */
function magicQuests(c:City,has:(k:string)=>boolean):[string,boolean][]{
 const g=c.magic,done=(k:string)=>!!g?.researched.includes(k as never),sources=Object.values(c.b).filter(b=>(b.k==='aetherwell'||b.k==='manaspire')&&active(b)).length;
 if(c.era===7)return [['Xây Giếng linh mạch',has('aetherwell')],['Xây Xưởng kết tinh',has('crystalworks')],['Xây Xưởng phù văn',has('runeworks')],['Học viện tạo tri thức',has('mageacademy')&&(g?.knowledge??0)>0],['Nghiên cứu Dẫn linh',done('conduction')],['Có ít nhất 2 nguồn mana',sources>=2],['Hoàn thành Tháp Khai Nguyên',has('awakeningtower')]];
 if(c.era===8)return [['Xây Lò tinh chất',has('essenceforge')],['Nghiên cứu Tứ nguyên',done('elements')],['Có đủ bốn trạm ấn',['firealtar','watertemple','woodgrove','earthtemple'].every(has)],['Nghiên cứu Khế ước',done('pact')],['Chọn chuyên tu',!!g?.specialization?.element||!!g?.specialization?.pending],['Hoàn thành Đại Trận Tứ Linh',has('fourspirits')]];
 return [['Xây Lò thiên luyện',has('celestialforge')],['Nghiên cứu Khai giới',done('gatecraft')],['Xây Đài khế ước và chọn khế ước',has('covenantaltar')&&!!g?.contract?.active],['Mở Cổng Linh giới',has('spiritgate')],['Chuẩn bị một gói đại phép',!!g?.packages?.length],['Hoàn thành Thiên Cung Sông Mẹ',has('riverpalace')],['Chọn lãnh địa',!!g?.domain?.chosen]];
}
export default function EraCivicPanel({city:c,now,busy,act,onLocate,view='all'}:{city:City;now:number;busy:boolean;act:(a:Action)=>unknown;onLocate?:(tile:number)=>void;view?:'all'|'development'|'operations'}){
 if(c.era<4)return null;
 const has=(k:string)=>Object.values(c.b).some(b=>b.k===k&&active(b));
 const m=c.modern,s=c.industry,d=c.medieval?.drought;
 const quests=c.era===4?[
  ['Xây Đại kho',has('grandstore')],['Xây giếng hoặc hồ',has('well')||has('reservoir')],['Bảo vệ ít nhất một ruộng',Object.entries(c.b).some(([i,b])=>['farm','estate'].includes(b.k)&&waterProtection(c,+i)>0)],['Nâng Đình 4',Object.values(c.b).some(b=>b.k==='hall'&&b.lvl>=4)],['Xây Trường làng',has('school')],['Hoàn thành Văn Miếu',has('academy')],
 ]:c.era===5?[
  ['Có nguồn than',has('coalmine')||has('charcoal')],['Nộp than vào kho',(s?.coalDelivered??0)>0],['Vận hành xưởng công nghiệp',!!s?.processed],['Xây trạm xử lý nước',has('treatment')],['Đưa ô nhiễm dưới 30',(s?.pollution??0)<30],['Hoàn thành Cầu Sắt Đại Hà',has('ironbridge')],
 ]:c.era===6?[['Phát điện',(m?.supply??0)>0],['Cấp điện cho thiết bị',Object.values(m?.allocation??{}).some(f=>f>0)],['Vận hành dịch vụ đô thị',has('hospital')||has('university')],['Chọn và hoàn thành kỳ quan cuối',!!m?.completedAt]]
 :magicQuests(c,has);
 return <section className="civic-panel">
 {view!=='operations'&&<><h3>Mục tiêu thời đại</h3><ol className="era-checklist">{quests.filter(([,done])=>!done).map(([label])=><li key={String(label)}>○ {label}</li>)}</ol>{quests.every(([,done])=>done)&&<p className="ok">Đã hoàn thành các mục tiêu vận hành của thời đại.</p>}<details className="ui-details"><summary>Đã đạt · {quests.filter(([,done])=>done).length}/{quests.length}</summary><ol>{quests.filter(([,done])=>done).map(([label])=><li key={String(label)}>✓ {label}</li>)}</ol></details></>}
 {view!=='development'&&<>
 {d&&<p role="status">{inDrought(c,now)?`Hạn đang diễn ra, còn ${number((d.end-now)/HOUR)} giờ` : now<d.start?`Cảnh báo hạn sau ${number((d.start-now)/HOUR)} giờ`:'Đợt hạn đã kết thúc'}. Giếng bảo vệ 4 ô; hồ có nước và đủ thợ bảo vệ 6 ô.</p>}
 {c.modern?.floodForecast&&c.modern.floodForecast.at>now&&c.modern.floodForecast.major&&<p role="status">Lũ lớn có thể tới sau {number((c.modern.floodForecast.at-now)/HOUR)} giờ, thời gian ngập tăng 50%. Vòng đê kín và hồ điều hòa vẫn bảo vệ.</p>}
 {s&&<PollutionPanel city={c} now={now} onLocate={onLocate}/>}
 {m&&<><h4>Điện: {number(m.supply)} / {number(m.demand)} MW</h4><p>Nguồn sạch: {number(m.clean)} MW ({m.supply?number(m.clean/m.supply*100):0}%). Thiếu điện chia theo ưu tiên, cùng nhóm chia tỷ lệ; nhà cũ không cần điện.</p><details className="ui-details"><summary>Ưu tiên & thiết bị dùng điện</summary><ol>{m.priority.map((group,i)=><li key={group}>{groups[group]} {i>0&&<button disabled={busy} onClick={()=>{const priority=[...m.priority];[priority[i-1],priority[i]]=[priority[i],priority[i-1]];act({type:'setPowerPriority',priority});}}>Ưu tiên cao hơn</button>}</li>)}</ol>
 {Object.entries(c.b).filter(([,b])=>B[b.k].supply||B[b.k].demand).map(([tile,b])=><p key={`device:${tile}`}><button onClick={()=>onLocate?.(+tile)}>Xem {B[b.k].n}</button> <span className="small">{b.off?'Đang tắt':b.burned||b.flooded?'Cần sửa':B[b.k].supply?`${number(m.generation[tile]??0)} MW phát`:`${number((m.allocation[tile]??0)*100)}% điện`}</span></p>)}
 {!!Object.keys(m.allocation).length&&<ul>{Object.entries(m.allocation).map(([tile,f])=><li key={tile}>{B[c.b[tile].k].n} ({+tile%96+1},{Math.floor(+tile/96)+1}): {number(f*100)}% điện</li>)}</ul>}
 </details></>}
 </>}
 {m&&c.era===6&&view!=='operations'&&<>
 <h4>Hai hướng hoàn thành</h4><p><b>Đập Sông Mẹ:</b> +150 MW sạch, bảo vệ toàn làng khỏi hạn/ngập; phù sa ruộng chỉ còn ×1,5.</p><p><b>Thành Phố Sông Xanh:</b> giảm 50% phát thải sản xuất, chống hạn, bảo vệ ngập trong vùng hồ điều hòa, giữ phù sa ×2; tiếp tục tự cung cấp điện.</p>
 {(['dam','green'] as const).map(k=><details key={k}><summary>{B[k].n} · {finalWonderError(c,k,now)?'Xem điều kiện còn thiếu':'Đủ điều kiện công trình'}</summary><FinalWonderRequirements city={c} kind={k} now={now} onLocate={onLocate}/></details>)}
 {m.completedAt!==undefined&&<div role="status" className="ok"><h3>🏆 Khánh thành {B[m.choice!].n}</h3><p>Thành phố đã hoàn thành nhánh phát triển. Anh vẫn có thể xây dựng, giao thương và tham gia thế giới.</p></div>}
 </>}
 </section>;
}
