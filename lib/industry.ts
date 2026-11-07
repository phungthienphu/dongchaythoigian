import {completedWonder,powerFraction,operationJobs} from './modern';
import {buildingOutput} from './economy-balance';
import type {Building,City,Def} from './engine';
const HOUR=3_600_000,MIN=60_000,SIDE=96;
const ALL=['food','wood','stone','copper','gold','diamond','coal'] as const;
export const INDUSTRIAL_BUILDINGS={
 coalmine:{n:'Mỏ than',era:5,cost:{wood:1000,stone:1500,copper:500},sec:3600,jobs:4,prod:{coal:1200},up:true,d:'Đặt trên mỏ than. 4 thợ khai thác 1.200 than/giờ cấp 1; phải mang về kho. Mỗi mỏ có 30.000 than.'},
 charcoal:{n:'Lò than củi',era:5,cost:{wood:600,stone:800,copper:150},sec:1800,jobs:2,prod:{coal:240},input:{wood:300},emission:1,up:true,d:'2 thợ: 300 gỗ/giờ → 240 than/giờ. Nguồn than thay thế khi mỏ cạn. Đầu vào trừ lúc đóng kiện; hàng phải nộp kho.'},
 machine:{n:'Xưởng cơ khí',era:5,cost:{wood:1500,stone:2500,copper:800,gold:200},sec:7200,jobs:4,prod:{copper:1200},input:{stone:300,coal:120},emission:2,up:true,d:'4 thợ: 300 đá + 120 than/giờ → 1.200 đồng/giờ. Phát thải theo thời gian thực sự sản xuất.'},
 factory:{n:'Nhà máy hàng hóa',era:5,cost:{wood:1200,stone:2000,copper:600,gold:200},sec:7200,jobs:4,prod:{gold:300},input:{wood:240,copper:120,coal:90},emission:3,up:true,d:'4 thợ: 240 gỗ + 120 đồng + 90 than/giờ → 300 vàng/giờ. Cấp 2/3 tăng cả đầu vào lẫn đầu ra.'},
 transport:{n:'Trạm vận tải',era:5,cost:{wood:1000,stone:1500,copper:400,gold:100},sec:3600,jobs:2,max:3,drop:[...ALL],d:'2 thợ: nhận mọi hàng và tăng 25% tốc độ vận chuyển của dân làm việc trong 8 ô. Tối đa 3; vùng phủ không cộng dồn.'},
 tenement:{n:'Khu tập thể',era:5,cost:{wood:1000,stone:3000,copper:400},sec:3600,house:30,up:true,d:'30 dân mỗi cấp, chống ngập. Không tự thay thế nhà cũ.'},
 treatment:{n:'Trạm xử lý nước',era:5,cost:{wood:800,stone:2000,copper:500,gold:150},sec:3600,jobs:3,max:3,d:'3 thợ giảm 4 ô nhiễm/giờ. Không cần điện; tối đa 3, một cấp.'},
 nursery:{n:'Vườn ươm',era:5,cost:{wood:400,stone:600,gold:100},sec:1800,jobs:2,d:'Đủ 2 thợ mới nhận cây mới. Mỗi cây tốn 10 thực, sau 30 phút thành rừng 400 gỗ. Tối đa 4 cây đang ươm, trong 6 ô; cây đã trả phí tiếp tục lớn.'},
 ironbridge:{n:'Cầu Sắt Đại Hà',era:5,cost:{wood:6000,stone:18000,copper:6000,gold:1500,coal:3000},sec:43200,max:1,need:'river',d:'Quần thể Cầu–Bến trên bờ: +20% tốc độ vận chuyển toàn làng, điều kiện vào Hiện đại. Không thay dòng sông hoặc khóa thuyền.'},
} satisfies Record<string,Def>;
export type IndustryState={version:1;enteredAt:number;minuteAt:number;pollution:number;emission:number;cleanSince?:number;coalSpawned:boolean;coalDelivered?:number;processed?:boolean;delivered?:Partial<City['res']>;inputsSpent?:Partial<City['res']>;seedlings:Record<string,{readyAt:number;nursery:number}>;};
export const active=(b:Building|undefined):b is Building=>!!b&&b.lvl>0&&!b.burned&&!b.flooded&&!b.off;
export const distance=(a:number,b:number)=>Math.max(Math.abs(a%SIDE-b%SIDE),Math.abs(Math.floor(a/SIDE)-Math.floor(b/SIDE)));
export const multiplier=(b:Building)=>[0,1,1.6,2.4][Math.min(3,b.lvl)];
export function staffCounts(c:City){const map=new Map<number,number>();for(const p of c.people)if(!p.refuge&&p.task.t==='work'&&(p.pos===p.task.at||p.haul?.phase==='work'&&(p.haul.source?.kind==='building'&&p.haul.source.key===p.task.at||p.haul.source?.kind==='tile'&&['coalmine','quarry','wood','smelter'].includes(c.b[p.task.at]?.k))))map.set(p.task.at,(map.get(p.task.at)??0)+1);return map;}
export function initializeIndustry(c:City,at:number){
 if(c.era<5)return;
 c.industry??={version:1,enteredAt:at,minuteAt:Math.floor(at/MIN)*MIN,pollution:0,emission:0,coalSpawned:false,seedlings:{}};
 if(c.industry.coalSpawned)return;
 const reserved=new Set<number>([c.camp,...c.camps.map(k=>k.at),...c.people.map(p=>p.pos??c.camp),...c.people.flatMap(p=>p.haul?.route??[]),...c.exps.flatMap(e=>e.route??[])]);
 const candidates=c.t.flatMap((terrain,i)=>terrain===2&&!c.b[i]&&!reserved.has(i)?[i]:[]).sort((a,b)=>distance(a,c.camp)-distance(b,c.camp)||((Math.imul(a+1,c.seed|1)>>>0)-(Math.imul(b+1,c.seed|1)>>>0)));
 for(const tile of candidates.slice(0,3)){c.t[tile]=7;delete c.dep[tile];}
 for(const b of Object.values(c.b))if(b.k==='storehouse'||b.k==='grandstore'){b.storageLevels??={};b.storageLevels.coal??=1;}
 c.industry.coalSpawned=true;
}
export const pollutionFood=(c:City)=>!c.industry?1:c.industry.pollution>=80?.7:c.industry.pollution>=60?.8:c.industry.pollution>=30?.9:1;
export const pollutionBirth=(c:City)=>!c.industry?1:c.industry.pollution>=80?0:c.industry.pollution>=60?.6:c.industry.pollution>=30?.8:1;
/** Reusable haul-context snapshot; no population scan for every returning worker. */
export function transportNetwork(c:City,staff=staffCounts(c),entries=Object.entries(c.b)){
 let bridge=false;const stations:number[]=[];
 if(c.industry)for(const [tile,b]of entries)if(active(b)){
  if(b.k==='ironbridge')bridge=true;
  if(b.k==='transport'&&(staff.get(+tile)??0)>=2)stations.push(+tile);
 }
 return {bridge,stations};
}
export function transportSpeed(c:City,origin:number,network=transportNetwork(c)){
 return 1+(network.bridge?.2:0)+(network.stations.some(i=>distance(i,origin)<=8)?.25:0);
}
export function plantTree(c:City,tile:number,now:number){
 const s=c.industry;if(c.era<5||!s)return 'Vườn ươm mở từ Công nghiệp.';
 if(!c.seen[tile]||c.t[tile]!==0||c.b[tile]||s.seedlings[tile]||tile===c.camp)return 'Chỉ trồng trên đồng cỏ trống đã khám phá.';
 const staff=staffCounts(c),nursery=Object.entries(c.b).find(([i,b])=>b.k==='nursery'&&active(b)&&(staff.get(+i)??0)>=2&&distance(+i,tile)<=6&&Object.values(s.seedlings).filter(p=>p.nursery===+i).length<4);
 if(!nursery)return 'Cần Vườn ươm đủ 2 thợ trong 6 ô, còn chỗ (tối đa 4 cây).';
 if(c.res.food<10)return 'Cần 10 lương thực để trồng cây.';
 c.res.food-=10;s.seedlings[tile]={nursery:+nursery[0],readyAt:now+30*MIN};return null;
}
/** Accumulate actual staffed working time, then publish pollution at absolute minutes. */
export function stepIndustry(c:City,from:number,to:number,defs:Record<string,Def>,staff=staffCounts(c),cleaners=Object.entries(c.b)){
 const s=c.industry;if(!s||to<=s.enteredAt)return false;let changed=false,emissionRate=0;
 const green=completedWonder(c,'green')?.5:1;
 for(const p of c.people){const h=p.haul;if(p.refuge||h?.phase!=='work'||h.source?.kind!=='building')continue;const b=c.b[h.source.key],d=b&&defs[b.k];if(!d?.emission||!active(b))continue;
  const output=Object.values(buildingOutput(c,b.k,d.prod??{},from))[0]??1;
  if(d.input&&Object.entries(d.input).some(([r,n])=>c.res[r as keyof City['res']]<(n??0)/output))continue;
  emissionRate+=d.emission*(d.demand?powerFraction(c,h.source.key):1)*green*multiplier(b)/Math.max(1,operationJobs(b,d));
 }
 let clean=1;
 for(const [i,b]of cleaners)if(active(b)){
  if(b.k==='treatment')clean+=4*Math.min(1,(staff.get(+i)??0)/3);
  if(b.k==='park')clean+=1;
 }
 // Split at absolute minute boundaries even when invoked for a large interval.
 let cursor=Math.max(from,s.enteredAt);
 while(cursor<to){
  const boundary=s.minuteAt+MIN,end=Math.min(to,boundary);
  s.emission+=emissionRate*Math.max(0,end-cursor)/HOUR;cursor=end;
  if(cursor<boundary)break;
  const dt=boundary-Math.max(s.minuteAt,s.enteredAt);s.minuteAt=boundary;
  const old=s.pollution;s.pollution=Math.max(0,Math.min(100,old+s.emission-clean*dt/HOUR));s.emission=0;
  if(s.pollution<=20)s.cleanSince??=boundary;else delete s.cleanSince;
  const tier=(p:number)=>p>=80?3:p>=60?2:p>=30?1:0;
  if(tier(old)!==tier(s.pollution)){changed=true;c.log.unshift({at:boundary,msg:`Ô nhiễm ${s.pollution.toFixed(1)}/100: ${tier(s.pollution)?'giảm lương thực và sinh dân; tăng xử lý nước hoặc tắt bớt xưởng.':'môi trường đã hồi phục.'}`,cls:tier(s.pollution)?'warn':'good'});c.log=c.log.slice(0,60);}
 }
 for(const [tile,plant]of Object.entries(s.seedlings))if(plant.readyAt<=to){if(c.t[+tile]===0&&!c.b[tile]){c.t[+tile]=1;delete c.dep[tile];changed=true;}delete s.seedlings[tile];}
 return changed;
}
