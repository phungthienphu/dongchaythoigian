"use client";
import {expansionRisk,WILDERNESS_MS,FRONTIER_WARNING_MS,MIN,W,type City} from '@/lib/engine';
const remaining=(ms:number)=>{const sec=Math.ceil(Math.max(0,ms)/1000);return `${Math.floor(sec/60)} phút ${sec%60} giây`;};
export default function FrontierStatus({city,now}:{city:City;now:number}){
 const risk=expansionRisk(city),d=city.disaster;
 return <div className="small"><div title={`Đã khám phá ${risk.area} ô đất. Chu kỳ thiên tai ở mức này: ${risk.interval/MIN} phút. Mỗi 30 phút, đất hoang bị che và tái tạo; giữ điểm tập kết, công trình + 2 ô và tuyến đang dùng.`}>Đất hoang tái tạo sau {remaining((city.wildernessAt??now+WILDERNESS_MS)-now)} · Rủi ro mở rộng: {['thấp','vừa','cao','rất cao'][risk.level]}</div>{d&&d.at-now<=FRONTIER_WARNING_MS&&<p role="alert" className="err small">{d.kind==='flood'?'Lũ bất thường':'Động đất'} sau {remaining(d.at-now)}{d.kind==='earthquake'?` · quanh ô (${d.center%W+1},${Math.floor(d.center/W)+1})`:" · kiểm tra đê và nhà sát sông"}.</p>}</div>;
}
