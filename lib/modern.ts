import type {BKey,Building,City,Def,Derived} from './engine';
import {active,distance,multiplier,staffCounts} from './industry';
import {inDrought} from './medieval';
import {recordResourceFlow} from './resource-history';
const HOUR=3_600_000;
export const MODERN_BUILDINGS={
 thermal:{n:'Nhiệt điện',era:6,cost:{stone:3000,copper:1500,gold:500,coal:500},sec:7200,jobs:4,supply:80,emission:4,up:true,d:'4 thợ phát 80 MW, tiêu hao 240 than/giờ cấp 1. Cấp 2/3 cần 7/10 thợ. Thiếu nhiên liệu tự giảm công suất; cấp 2/3 ×1,6/2,4.'},
 hydro:{n:'Thủy điện nhỏ',era:6,cost:{stone:6000,copper:2000,gold:800},sec:10800,jobs:3,supply:50,max:2,need:'river',d:'3 thợ phát 50 MW sạch, khi hạn còn 25 MW. Tối đa 2, một cấp. Không sửa dòng sông.'},
 solar:{n:'Điện mặt trời',era:6,cost:{stone:2000,copper:1000,gold:500},sec:3600,supply:15,max:6,d:'Phát trung bình 15 MW sạch, cố định mọi giờ. Không cần thợ hay nhiên liệu; tối đa 6, một cấp.'},
 apartment:{n:'Chung cư',era:6,cost:{wood:1500,stone:6000,copper:1000,gold:300},sec:7200,house:50,demand:5,up:true,d:'50 dân/cấp. Điện cấp 1: 5 MW; đủ điện +5% sinh dân, tổng bonus chung cư tối đa 10%. Mất điện vẫn giữ toàn bộ chỗ ở.'},
 complex:{n:'Tổ hợp sản xuất',era:6,cost:{stone:4000,copper:2000,gold:600},sec:10800,jobs:6,demand:35,prod:{gold:600},input:{wood:360,copper:180},emission:2,up:true,d:'6 thợ, 35 MW: 360 gỗ + 180 đồng/giờ → 600 vàng/giờ. Cấp 2/3 cần 10/15 thợ. Điện thiếu giảm hoạt động tỷ lệ; hàng nộp kho mới tăng.'},
 hospital:{n:'Bệnh viện',era:6,cost:{stone:3000,copper:800,gold:500},sec:7200,jobs:4,demand:15,up:true,max:1,d:'+20% sinh dân khi đủ thợ và điện. Cấp 2/3 chỉ tăng độ bền; vẫn 4 thợ và 15 MW, bonus không tăng.'},
 university:{n:'Đại học',era:6,cost:{stone:4000,copper:1200,gold:800},sec:10800,jobs:4,demand:20,up:true,max:1,d:'+10% sản lượng khi đủ thợ và điện; bonus mới toàn làng tối đa 30%. Nâng cấp chỉ tăng độ bền, vẫn 4 thợ và 20 MW.'},
 park:{n:'Công viên ven sông',era:6,cost:{wood:300,stone:600,gold:100},sec:1800,max:4,need:'river',d:'Giảm 1 ô nhiễm/giờ, không cần điện hay thợ. Tối đa 4, một cấp.'},
 retention:{n:'Hồ điều hòa',era:6,cost:{wood:1000,stone:4000,copper:800},sec:7200,jobs:2,need:'water',d:'Như hồ chứa: 12 giờ dự trữ, đầy sau 6 giờ. Trong 6 ô giảm 50% thời gian ngập; kỳ quan Sông Xanh loại bỏ ngập trong vùng.'},
 dam:{n:'Đập Sông Mẹ',era:6,cost:{wood:15000,stone:60000,copper:18000,gold:6000,coal:10000},sec:86400,max:1,need:'river',supply:150,d:'Kỳ quan cuối: +150 MW sạch; chống hạn và ngập toàn làng. Đánh đổi: phù sa ruộng/nông trang còn ×1,5. Cần Đình 6, 400 dân, 2 thủy điện, ô nhiễm <60. Chọn cố định sau hoàn thành.'},
 green:{n:'Thành Phố Sông Xanh',era:6,cost:{wood:20000,stone:45000,copper:15000,gold:8000},sec:86400,max:1,need:'river',d:'Kỳ quan cuối: giảm 50% phát thải sản xuất, chống hạn, chống ngập trong vùng hồ điều hòa; giữ phù sa ×2. Cần Đình 6, 400 dân, 4 công viên, ≥80% điện sạch và ô nhiễm ≤20 liên tục 12 giờ. Không cấp điện miễn phí.'},
} satisfies Record<string,Def>;
export type PowerGroup='essential'|'housing'|'production';
export type ModernState={enteredAt:number;priority:PowerGroup[];supply:number;demand:number;clean:number;allocation:Record<string,number>;generation:Record<string,number>;floodForecast?:{at:number;major:boolean};choice?:'dam'|'green';completedAt?:number;};
export const powerGroup=(k:BKey):PowerGroup=>k==='hospital'?'essential':k==='apartment'?'housing':'production';
export const operationJobs=(b:Building,d:Def)=>Math.ceil((d.jobs??0)*(['thermal','complex'].includes(b.k)?multiplier(b):1));
export const operationScale=(b:Building)=>b.k==='hospital'||b.k==='university'?1:multiplier(b);
export const powerFraction=(c:City,tile:number)=>c.modern?.allocation[tile]??0;
export const completedWonder=(c:City,k:'dam'|'green')=>c.modern?.choice===k&&!!c.modern.completedAt&&Object.values(c.b).some(b=>b.k===k&&active(b));
export function initializeModern(c:City,at:number){if(c.era>=6)c.modern??={enteredAt:at,priority:['essential','housing','production'],supply:0,demand:0,clean:0,allocation:{},generation:{}};}
export function serviceBonus(c:City,staff=staffCounts(c),entries=Object.entries(c.b)){
 if(!c.modern)return {production:0,birth:1};let production=0,birth=0,apartments=0;
 for(const [i,b]of entries)if(active(b)){
  const f=powerFraction(c,+i);
  if(b.k==='university')production+=.1*f*Math.min(1,(staff.get(+i)??0)/4);
  if(b.k==='hospital')birth+=.2*f*Math.min(1,(staff.get(+i)??0)/4);
  if(b.k==='apartment')apartments+=.05*f;
 }
 return {production:Math.min(.3,production),birth:1+birth+Math.min(.1,apartments)};
}
/** Power has no stock account. Allocate available MW by ordered groups and ratio within each group. */
export function stepPower(c:City,from:number,to:number,defs:Record<string,Def>,staff=staffCounts(c),entries=Object.entries(c.b)){
 const m=c.modern;if(!m||to<m.enteredAt)return false;const dt=Math.max(0,to-Math.max(from,m.enteredAt))/HOUR;
 let supply=0,demand=0,clean=0;const generation:Record<string,number>={},allocation:Record<string,number>={},consumers:{i:string;need:number;group:PowerGroup}[]=[];
 for(const [i,b]of entries){if(!active(b))continue;const d=defs[b.k],jobs=operationJobs(b,d),eff=jobs?Math.min(1,(staff.get(+i)??0)/jobs):1,scale=operationScale(b);
  if(d.supply){let output=d.supply*scale*eff;
   if(b.k==='dam'&&!completedWonder(c,'dam'))output=0;
   if(b.k==='hydro'&&inDrought(c,to))output*=.5;
   if(b.k==='thermal'){
    const fuel=240*scale*eff*dt,fraction=fuel>0?Math.min(1,c.res.coal/fuel):c.res.coal>0?1:0;output*=fraction;c.res.coal=Math.max(0,c.res.coal-fuel*fraction);
    recordResourceFlow(c,to,'spent','coal',fuel*fraction);
    if(c.industry){const ledger=c.industry.inputsSpent??={};ledger.coal=(ledger.coal??0)+fuel*fraction;}
    if(c.industry)c.industry.emission+=4*scale*eff*fraction*dt;
   }else clean+=output;
   generation[i]=output;supply+=output;
  }
  if(d.demand){const need=d.demand*scale;consumers.push({i,need,group:powerGroup(b.k)});demand+=need;}
 }
 let remaining=supply;
 for(const group of m.priority){const rows=consumers.filter(b=>b.group===group),need=rows.reduce((n,b)=>n+b.need,0),fraction=need?Math.min(1,remaining/need):1;for(const row of rows)allocation[row.i]=fraction;remaining=Math.max(0,remaining-need*fraction);}
 const changed=Object.keys({...m.allocation,...allocation}).some(i=>m.allocation[i]!==allocation[i]);
 m.supply=supply;m.demand=demand;m.clean=clean;m.allocation=allocation;m.generation=generation;return changed;
}
export function finalWonderError(c:City,k:BKey,at:number):string|null{
 if(k!=='dam'&&k!=='green')return null;
 const m=c.modern;if(!m)return 'Chưa mở Hiện đại.';
 if(m.choice&&m.choice!==k||Object.values(c.b).some(b=>(b.k==='dam'||b.k==='green')&&b.k!==k))return 'Chỉ chọn một kỳ quan cuối; lựa chọn cố định sau khánh thành.';
 if(!Object.values(c.b).some(b=>b.k==='hall'&&b.lvl>=6&&active(b)))return 'Cần Đình làng cấp 6 đang hoạt động.';
 if(c.people.length<400)return `Cần 400 dân, còn thiếu ${400-c.people.length}.`;
 const staff=staffCounts(c);
 if(k==='dam'){
  if(Object.entries(c.b).filter(([i,b])=>b.k==='hydro'&&active(b)&&(staff.get(+i)??0)>=3).length<2)return 'Cần 2 thủy điện nhỏ hoạt động đủ 3 thợ mỗi nhà.';
  if((c.industry?.pollution??0)>=60)return 'Ô nhiễm phải dưới 60.';
 }else{
  if(Object.values(c.b).filter(b=>b.k==='park'&&active(b)).length<4)return 'Cần 4 công viên ven sông đang hoạt động.';
  if(m.supply<=0||m.clean/m.supply<.8)return 'Cần ít nhất 80% công suất phát khả dụng từ nguồn sạch.';
  if((c.industry?.pollution??0)>20||c.industry?.cleanSince===undefined||at-c.industry.cleanSince<12*HOUR)return 'Cần ô nhiễm ≤20 liên tục đủ 12 giờ.';
 }
 return null;
}
export function floodProtection(c:City,tile:number){if(completedWonder(c,'dam'))return true;if(!completedWonder(c,'green'))return false;return Object.entries(c.b).some(([i,b])=>b.k==='retention'&&active(b)&&distance(+i,tile)<=6);}
export function retentionProtected(c:City,tile:number){return Object.entries(c.b).some(([i,b])=>b.k==='retention'&&active(b)&&distance(+i,tile)<=6);}

/** Announce the existing autumn flood roll one season ahead. No extra hazard clock. */
export function scheduleModernFlood(c:City,season:number){
 const m=c.modern;if(!m||season%4!==1)return;
 const at=c.t0+(season+1)*6*HOUR;
 let seed=(c.seed^Math.imul(season+7,0x9e3779b1))>>>0;
 seed=Math.imul(seed^(seed>>>16),0x7feb352d);seed=Math.imul(seed^(seed>>>15),0x846ca68b);seed^=seed>>>16;
 const major=(seed>>>0)/4294967296<.25;
 m.floodForecast={at,major};
 if(major){c.log.unshift({at:at-6*HOUR,msg:'Cảnh báo lũ lớn: mùa thu tới sau 6 giờ. Nếu sông tràn, công trình ngập lâu hơn 50%; kiểm tra đê và hồ điều hòa.',cls:'warn'});c.log=c.log.slice(0,60);}
}

/** Only timed flood damage recedes; enemy fire and earthquakes still need repair. */
export function recoverModernFloods(c:City,at:number,entries=Object.values(c.b)){
 let recovered=0;
 for(const b of entries)if(b.floodUntil!==undefined&&b.floodUntil<=at){b.flooded=false;delete b.floodUntil;recovered++;}
 if(recovered){c.log.unshift({at,msg:`Nước đã rút: ${recovered} công trình có thể hoạt động lại. Hư hại do quân địch vẫn cần sửa.`,cls:'good'});c.log=c.log.slice(0,60);}
 return recovered>0;
}

export const canToggle=(d:Def)=>d.era>=5&&!!(d.jobs||d.supply||d.demand);
