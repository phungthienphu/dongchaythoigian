'use client';
import {zombiePressure,zombieWave,zombieStats} from '@/lib/zombies';
import {type City,type Action} from '@/lib/engine';
import {magicDefenseView} from '@/lib/magic-view';
export default function ZombiePanel({city,now,act,busy=false,onLocate}:{city:City;now:number;act:(a:Action)=>unknown;busy?:boolean;onLocate?:(tile:number)=>void}){
 const z=city.zombies;
 if(!z)return <section className="zombie-panel"><h3>Zombie từ thời Đồ đá</h3><p>Đợt đầu sau 5 phút kể từ khi bật. Zombie cắn lây bệnh và phá nhà vĩnh viễn, phải xây mới. Dân đông thì đợt đông và thường xuyên hơn.</p><p>Chuẩn bị lính, điểm bảo vệ và lều cứu thương. Cơ chế chạy cả khi offline.</p><button className="primary" disabled={busy} onClick={()=>act({type:'activateZombies'})}>Đã đọc · bắt đầu 5 phút chuẩn bị</button></section>;
 const p=zombiePressure(city,now),wave=zombieWave(p,city.era,z.index+1),remaining=Math.max(0,Math.ceil((z.nextAt-now)/1000)),sick=city.people.filter(p=>p.vital?.infectedAt).length,down=city.people.filter(p=>p.vital?.downAt).length;
 return <section className="zombie-panel"><div className="metric-pair"><div><span>Đợt tiếp theo</span><b>{Math.floor(remaining/60)}:{String(remaining%60).padStart(2,'0')}</b></div><div><span>Áp lực 6 giờ</span><b>{p} dân · {wave.total} con</b></div></div>
 <p>{z.actors.length} zombie còn sống · {sick} dân nhiễm · {down} dân chờ cứu.</p>{z.warning!==undefined&&<button onClick={()=>onLocate?.(z.warning!)}>⚠ Đất nứt · xem ổ sắp trồi</button>}
 <label className="setting-row"><input type="checkbox" checked={z.patrol} disabled={busy} onChange={e=>act({type:'zombiePatrol',on:e.target.checked})}/>Lính tự phản ứng bảo vệ quanh vị trí đang đứng</label><p className="small muted">Chọn lính và đặt vị trí bảo vệ tại Quân đội. Tháp hỗ trợ bắn; y tế cần người làm và thực phẩm.</p>
 <MagicDefense city={city} now={now} onLocate={onLocate}/>
 {city.era>=5&&<p className="inline-warning">Từ Công nghiệp, zombie biết né vùng hỏa lực đã phát hiện. Bố trí tháp chồng vùng và lính ở lối vòng.</p>}
 <details className="ui-details"><summary>Sức mạnh và thiệt hại</summary>{(['normal','super','breaker']as const).filter(k=>k==='normal'||city.era>=(k==='super'?4:5)).map(k=>{const s=zombieStats(k,city.era);return <p key={k}><b>{k==='normal'?'Thường':k==='super'?'Super':'Phá hoại'}</b>: {s.hp} HP · tốc {s.speed} ô/giây · {s.civilianDamage} sát thương vào dân.</p>;})}<p>Đã qua {z.report.waves} đợt · tiêu diệt {z.report.killed} · mất {z.report.lost} dân, {z.report.destroyed} công trình.</p><p>Nhà bị phá không sửa được. Thiệt hại HP zombie còn lại không tự hồi; xây lại trả đủ vật liệu.</p></details>
 {!city.people.length&&<button disabled={busy||!!z.survivorsAt} onClick={()=>act({type:'zombieSurvivors'})}>{z.survivorsAt?'Đang đón người sống sót (30 phút)':'Đón 3 người sống sót · 30 phút'}</button>}
 </section>;
}
function MagicDefense({city,now,onLocate}:{city:City;now:number;onLocate?:(tile:number)=>void}){
 const v=magicDefenseView(city,now);if(!v)return null;
 return <details className="ui-details" open><summary>Phòng thủ ma pháp · {v.rows.filter(r=>r.ok).length}/{v.rows.length} sẵn sàng</summary>
  {city.era>=9&&<p className={v.eye?'ok small':'small'}>{v.eye?'Thiên nhãn đang hoạt động: báo điểm trồi zombie trước 180 giây.':v.observatory?`Thiên nhãn dừng${v.observatory.blocked?`: ${v.observatory.blocked}`:''}; chỉ báo trước 60 giây.`:'Cảnh báo trước 60 giây. Xây Đài thiên văn (cần Khai giới, 20 mana/giờ) để báo trước 180 giây.'}{v.observatory&&<> <button className="link" onClick={()=>onLocate?.(v.observatory!.tile)}>Xem đài</button></>}</p>}
  {!v.rows.length&&<p className="small muted">Chưa có công trình phép phòng thủ. Giếng linh mạch có sẵn Linh quang; Pháp trận hộ thành có Hỏa trận.</p>}
  <ul className="magic-needs">{v.rows.map((r,i)=><li key={i} className={r.ok?'ok':'err'}><span aria-hidden="true">{r.ok?'✓':'✗'}</span> <b>{r.name}</b>: {r.detail}{r.tile!==undefined&&<> <button className="link" onClick={()=>onLocate?.(r.tile!)}>Xem</button></>}</li>)}</ul>
 </details>;
}
