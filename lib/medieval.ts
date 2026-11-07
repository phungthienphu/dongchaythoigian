import type { Building, City, Def, Derived } from './engine';

const HOUR=3_600_000, MIN=60_000, SEASON=6*HOUR;
export const MEDIEVAL_BUILDINGS = {
  grandstore: { n:'Đại kho',era:4,cost:{wood:1200,stone:1800,copper:300},sec:1800,storage:10000,up:true,drop:['food','wood','stone','copper','gold','diamond'],d:'Cấp đầu chứa 10.000 mỗi loại. Nâng riêng ngăn lên 20.000 / 40.000; nhiều kho cộng dồn.' },
  tilehouse: { n:'Nhà ngói',era:4,cost:{wood:600,stone:1200,copper:120},sec:1800,house:18,up:true,d:'18 dân mỗi cấp. Chống ngập; không tự thay nhà cũ.' },
  well: { n:'Giếng làng',era:4,cost:{wood:250,stone:500},sec:600,max:3,d:'Trong 4 ô, giảm một nửa thiệt hại do hạn cho ruộng và cối nước. Một cấp, tối đa 3 giếng.' },
  reservoir: { n:'Hồ chứa',era:4,cost:{wood:500,stone:1800,copper:150},sec:2700,jobs:2,need:'water',d:'Cần kề sông/kênh có nước và 2 thợ. Đầy sau 6 giờ, trữ tối đa 12 giờ chống hạn trong 6 ô. Không tăng hiệu ứng khi chồng vùng.' },
  estate: { n:'Nông trang',era:4,cost:{wood:800,stone:500,copper:150},sec:1800,jobs:4,prod:{food:360},up:true,d:'4 nông dân, cơ sở 360 thực/giờ với công cụ và giỏ thời Sắt. Phù sa ×2; đất bạc màu cần cải tạo, hạn giảm 40% nếu không có nước bảo vệ.' },
  school: { n:'Trường làng',era:4,cost:{wood:800,stone:1000,copper:150,gold:50},sec:3600,jobs:2,max:1,up:true,d:'Đủ 2 thợ tăng 5% / 8% / 12% sản lượng toàn làng. Hiệu quả theo số thợ. Tối đa 1 trường.' },
  artisan: { n:'Xưởng thủ công',era:4,cost:{wood:500,stone:800,copper:200},sec:2700,jobs:3,prod:{gold:6},up:true,d:'Đủ 3 thợ: 120 gỗ + 60 đá/giờ → 6 vàng/giờ, chưa tính bonus. Trừ đầu vào lúc đóng kiện; vàng chỉ cộng khi mang về kho.' },
  academy: { n:'Văn Miếu Ven Sông',era:4,cost:{wood:3000,stone:8000,copper:1200,gold:400},sec:28800,max:1,d:'Kỳ quan một cấp. Khi hoạt động tăng 5% sản lượng toàn làng; cần hoàn thành và sửa hư hại trước khi vào Công nghiệp.' },
} satisfies Record<string,Def>;
export type MedievalState = { enteredAt:number; minuteAt:number; water:Record<string,number>; drought?:{warnAt:number;start:number;end:number}; lastDroughtYear?:number };
const notify=(c:City,at:number,msg:string,cls:'warn'|'good')=>{c.log.unshift({at,msg,cls});if(c.log.length>60)c.log.length=60;};
const active=(b:Building|undefined):b is Building=>!!b&&b.lvl>0&&!b.burned&&!b.flooded;
const distance=(a:number,b:number)=>Math.max(Math.abs(a%96-b%96),Math.abs(Math.floor(a/96)-Math.floor(b/96)));
export const isField=(k:string)=>k==='farm'||k==='estate';
export const isStorage=(k:string)=>k==='storehouse'||k==='grandstore';
export const medievalStaff=(c:City,i:number)=>c.people.filter(p=>!p.refuge&&p.task.t==='work'&&p.task.at===i&&(p.pos===i||p.haul?.phase==='work'&&p.haul.tile===i)).length;
export function medievalBonus(c:City){
  let bonus=0;
  for(const [tile,b]of Object.entries(c.b))if(active(b)){
    if(b.k==='school')bonus+=[0,.05,.08,.12][Math.min(3,b.lvl)]*Math.min(1,medievalStaff(c,+tile)/2);
    if(b.k==='academy')bonus+=.05;
  }
  return Math.min(.3,bonus);
}
export function initializeMedieval(c:City,at:number){
  if(c.era>=4)c.medieval??={enteredAt:at,minuteAt:Math.floor(at/MIN)*MIN,water:{}};
}
export const inDrought=(c:City,at:number)=>!!c.medieval?.drought&&at>=c.medieval.drought.start&&at<c.medieval.drought.end;
export function hasWaterSource(c:City,d:Derived,i:number){
  const x=i%96,y=Math.floor(i/96);
  return [[x-1,y],[x+1,y],[x,y-1],[x,y+1]].some(([a,b])=>a>=0&&a<96&&b>=0&&b<96&&(c.t[b*96+a]===3||c.b[b*96+a]?.k==='canal'&&d.wet[b*96+a]));
}
export function waterProtection(c:City,i:number){
  let protection=0;
  for(const [key,b]of Object.entries(c.b))if(active(b)){
    if(b.k==='well'&&distance(+key,i)<=4)protection=Math.max(protection,.5);
    if(b.k==='reservoir'&&distance(+key,i)<=6&&(c.medieval?.water[key]??0)>0&&medievalStaff(c,+key)>=2)return 1;
  }
  return protection;
}
export function droughtFactor(c:City,i:number,k:string,at:number){
  if(!inDrought(c,at)||!isField(k)&&k!=='wheel')return 1;
  return 1-(k==='wheel'?.5:.4)*(1-waterProtection(c,i));
}
export function scheduleDrought(c:City,season:number){
  const m=c.medieval,at=c.t0+season*SEASON,year=Math.floor(season/4);
  if(!m||season%4!==1||at-m.enteredAt<24*HOUR||m.lastDroughtYear===year-1)return;
  // One stable roll per summer, independent of polling and Math.random.
  let seed=(c.seed^Math.imul(year+17,2654435761))>>>0;seed=Math.imul(seed^(seed>>>16),0x7feb352d);seed=Math.imul(seed^(seed>>>15),0x846ca68b);seed^=seed>>>16;
  if((seed>>>0)/4294967296>=.3)return;
  m.lastDroughtYear=year;m.drought={warnAt:at,start:at+SEASON,end:at+2*SEASON};
  notify(c,at,'Báo hạn: 6 giờ nữa bắt đầu hạn hán, kéo dài 6 giờ. Chuẩn bị hồ đầy nước hoặc giếng gần ruộng.','warn');
}
/** Absolute minute boundaries; fractional city ticks cannot skip water updates. */
export function stepMedieval(c:City,d:Derived,from:number,to:number){
  const m=c.medieval;if(!m)return false;
  let changed=false;
  if(m.drought&&from<m.drought.start&&to>=m.drought.start){notify(c,m.drought.start,'Hạn hán bắt đầu. Ruộng và cối nước ngoài vùng bảo vệ giảm sản lượng.','warn');changed=true;}
  if(m.drought&&from<m.drought.end&&to>=m.drought.end){notify(c,m.drought.end,'Hạn đã qua, sản xuất và nguồn nước trở lại bình thường.','good');changed=true;}
  while(m.minuteAt+MIN<=to){
    const at=m.minuteAt+MIN,previous=Math.max(m.enteredAt,m.minuteAt);m.minuteAt=at;
    // Only the portion of this minute spent in drought consumes water.
    const dry=m.drought?Math.max(0,Math.min(at,m.drought.end)-Math.max(previous,m.drought.start)):0;
    for(const key of Object.keys(m.water))if(c.b[key]?.k!=='reservoir')delete m.water[key];
    for(const [key,b]of Object.entries(c.b))if(b.k==='reservoir'){
      const water=m.water[key]??0,working=active(b)&&medievalStaff(c,+key)>=2;
      const delta=working?(dry?-dry:hasWaterSource(c,d,+key)?2*Math.max(0,at-previous):0):0;
      const next=Math.max(0,Math.min(12*HOUR,water+delta));
      if((water>0)!==(next>0))changed=true;
      m.water[key]=next;
    }
  }
  return changed;
}
