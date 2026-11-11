"use client";
import {expansionRisk,WILDERNESS_MS,FRONTIER_WARNING_MS,MIN,W,type City} from '@/lib/engine';
const remaining=(ms:number)=>{const sec=Math.ceil(Math.max(0,ms)/1000);return `${Math.floor(sec/60)} phút ${sec%60} giây`;};
export default function FrontierStatus({city,now}:{city:City;now:number}){
 const risk=expansionRisk(city),d=city.disaster;
 return <div className="small"><div title={`Đã khám phá ${risk.area} ô đất. Chu kỳ thiên tai ở mức này: ${risk.interval/MIN} phút. Mỗi 30 phút, tái tạo đất hoang và thêm tài nguyên trong cụm đất trống từ 4 ô; giữ công trình và tuyến đang dùng.`}>Đất hoang tái tạo sau {remaining((city.wildernessAt??now+WILDERNESS_MS)-now)} · Rủi ro mở rộng: {['thấp','vừa','cao','rất cao'][risk.level]}</div>
  <details><summary>Tài nguyên có mọc lại khi đã khám phá hết bản đồ?</summary><p>Vẫn có. Mỗi 30 phút, đất hoang được che sương và tạo lại rừng, mỏ hoặc đồng cỏ. Ngoài đất hoang, các cụm đất trống liền nhau từ 4 ô cũng sinh thêm tài nguyên, kể cả gần công trình. Điểm tập kết, người và tuyến đang dùng được giữ nguyên; không sinh mỏ chặn lối hẹp. Từ đời 7 có cơ hội cực hiếm tìm mỏ ma pháp; đời 8 mở tinh chất, đời 9 mở thiên thạch.</p><p>Mỗi nhà bị động đất đánh trúng có 20% khả năng bị phá hủy vĩnh viễn, thay bằng tài nguyên; nhà bị lũ đánh trúng có 10%. Nhà mất phải xây mới. Nhà còn lại sửa được: động đất/cháy tốn 50% / 70% / 90%, ngập tốn 25% / 40% / 60% vật liệu theo cấp 1 / 2 / từ 3.</p></details>
  {d&&d.at-now<=FRONTIER_WARNING_MS&&<p role="alert" className="err small">{d.kind==='flood'?'Lũ bất thường':'Động đất'} sau {remaining(d.at-now)}{d.kind==='earthquake'?` · quanh ô (${d.center%W+1},${Math.floor(d.center/W)+1})`:" · kiểm tra đê và nhà sát sông"}.</p>}</div>;
}
