import {MAGIC_EXPANSION} from './building-expansion';
import type {BKey,Building,City,Def,Derived} from './engine';
import {active,distance,multiplier,staffCounts} from './industry';
import {inDrought} from './medieval';
import {recordResourceFlow} from './resource-history';
const HOUR=3_600_000;
export const MODERN_BUILDINGS={
 recyclingworks:{n:'Xưởng tái chế kim loại',era:6,cost:{stone:9000,copper:3500,gold:1800},sec:14400,jobs:6,demand:18,prod:{copper:1800},input:{stone:900,coal:30},emission:1,up:true,d:'6 thợ, 18 MW: 900 đá + 30 than/giờ → 1.800 đồng/giờ cơ bản. Tiết kiệm than trên mỗi đơn vị đồng so với Xưởng cơ khí, đổi lại tốn nhiều đá và cần điện; phát thải 1 điểm/giờ. Cấp 2/3 cần 10/15 thợ và tăng tiêu thụ theo công suất. Hàng phải chở về kho.'},
 hydroponics:{n:'Nhà kính thủy canh',era:6,cost:{wood:4000,stone:10000,copper:3000,gold:1600},sec:14400,jobs:6,demand:22,prod:{food:6000},input:{wood:120,coal:30},emission:0,up:true,d:'6 thợ, 22 MW: 120 gỗ + 30 than/giờ → 6.000 lương thực/giờ cơ bản, còn nhân dụng cụ thực theo đời. Không cần phù sa hay cải tạo đất; đổi lại phải giữ điện và nhiên liệu. Không được thưởng phù sa. Cấp 2/3 cần 10/15 thợ, sản lượng và điện tăng theo cấp.'},
 thermal:{n:'Nhiệt điện',era:6,cost:{stone:3000,copper:1500,gold:500,coal:500},sec:7200,jobs:4,supply:80,emission:4,up:true,d:'4 thợ phát 80 MW, tiêu hao 240 than/giờ cấp 1. Cấp 2/3 cần 7/10 thợ. Thiếu nhiên liệu tự giảm công suất; cấp 2/3 ×1,6/2,4.'},
 hydro:{n:'Thủy điện nhỏ',era:6,cost:{stone:6000,copper:2000,gold:800},sec:10800,jobs:3,supply:50,max:2,need:'river',d:'3 thợ phát 50 MW sạch, khi hạn còn 25 MW. Tối đa 2, một cấp. Không sửa dòng sông.'},
 solar:{n:'Điện mặt trời',era:6,cost:{stone:2000,copper:1000,gold:500},sec:3600,supply:15,max:6,d:'Phát trung bình 15 MW sạch, cố định mọi giờ. Không cần thợ hay nhiên liệu; tối đa 6, một cấp.'},
 apartment:{n:'Chung cư',era:6,cost:{wood:1500,stone:6000,copper:1000,gold:300},sec:7200,house:50,demand:5,up:true,d:'50 dân/cấp. Điện cấp 1: 5 MW; đủ điện +5% sinh dân, tổng bonus chung cư tối đa 10%. Mất điện vẫn giữ toàn bộ chỗ ở.'},
 complex:{n:'Tổ hợp sản xuất',era:6,cost:{stone:4000,copper:2000,gold:600},sec:10800,jobs:6,demand:35,prod:{gold:600},input:{wood:360,copper:180},emission:2,up:true,d:'6 thợ, 35 MW: 360 gỗ + 180 đồng/giờ → 600 vàng/giờ. Cấp 2/3 cần 10/15 thợ. Điện thiếu giảm hoạt động tỷ lệ; hàng nộp kho mới tăng.'},
 hospital:{n:'Bệnh viện',era:6,cost:{stone:3000,copper:800,gold:500},sec:7200,jobs:4,demand:15,up:true,max:1,d:'+20% sinh dân khi đủ thợ và điện. Cấp 2/3 chỉ tăng độ bền; vẫn 4 thợ và 15 MW, bonus không tăng.'},
 university:{n:'Đại học',era:6,cost:{stone:4000,copper:1200,gold:800},sec:10800,jobs:4,demand:20,up:true,max:1,d:'+10% sản lượng khi đủ thợ và điện; bonus mới toàn làng tối đa 30%. Nâng cấp chỉ tăng độ bền, vẫn 4 thợ và 20 MW.'},
 park:{n:'Công viên cây xanh',era:5,cost:{wood:300,stone:600,gold:100},sec:1800,up:true,d:'Cây xanh giảm 2/4/6 ô nhiễm/giờ ở cấp 1/2/3. Xây trên đất trống từ Công nghiệp, không cần sát sông, điện hay thợ. Không giới hạn số công viên; ngập/cháy thì ngừng xử lý.'},
 retention:{n:'Hồ điều hòa',era:6,cost:{wood:1000,stone:4000,copper:800},sec:7200,jobs:2,need:'water',d:'Như hồ chứa: 12 giờ dự trữ, đầy sau 6 giờ. Trong 6 ô giảm 50% thời gian ngập; kỳ quan Sông Xanh loại bỏ ngập trong vùng.'},
 dam:{n:'Đập Sông Mẹ',era:6,cost:{wood:15000,stone:60000,copper:18000,gold:6000,coal:10000},sec:86400,max:1,need:'river',supply:150,d:'Kỳ quan cuối: +150 MW sạch; chống hạn và ngập toàn làng. Đánh đổi: phù sa ruộng/nông trang còn ×1,5. Cần Đình 6, 400 dân, 2 thủy điện, ô nhiễm <60. Chọn cố định sau hoàn thành.'},
 green:{n:'Thành Phố Sông Xanh',era:6,cost:{wood:20000,stone:45000,copper:15000,gold:8000},sec:86400,max:1,need:'river',d:'Kỳ quan cuối: giảm 50% phát thải sản xuất, chống hạn, chống ngập trong vùng hồ điều hòa; giữ phù sa ×2. Cần Đình 6, 400 dân, 4 công viên, ≥80% điện sạch và ô nhiễm ≤20 liên tục 12 giờ. Không cấp điện miễn phí.'},
} satisfies Record<string,Def>;
export type PowerGroup='essential'|'housing'|'production';
export type ModernState={enteredAt:number;priority:PowerGroup[];supply:number;demand:number;clean:number;allocation:Record<string,number>;generation:Record<string,number>;floodForecast?:{at:number;major:boolean};choice?:'dam'|'green';completedAt?:number;};
export const powerGroup=(k:BKey):PowerGroup=>k==='hospital'?'essential':k==='apartment'?'housing':'production';
const SCALED_JOBS=new Set<string>(['thermal','complex','recyclingworks','hydroponics','aetherwell','manaspire','crystalworks','runeworks',...Object.keys(MAGIC_EXPANSION)]);
export const operationJobs=(b:Building,d:Def)=>Math.ceil((d.jobs??0)*(SCALED_JOBS.has(b.k)?multiplier(b):1));
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
export type FinalWonderRequirement={id:string;label:string;met:boolean;detail:string;error:string;tile?:number};
/** Lazy iteration keeps placement checks cheap when an early prerequisite fails. */
export function* finalWonderRequirements(c:City,k:BKey,at:number):Generator<FinalWonderRequirement>{
 if(k!=='dam'&&k!=='green')return;
 const m=c.modern;
 yield {id:'era',label:'Mở thời Hiện đại',met:!!m,detail:m?'Đã mở':'Chưa mở',error:'Chưa mở Hiện đại.'};
 if(!m)return;
 const entries=Object.entries(c.b);
 const other=!!(m.choice&&m.choice!==k)||entries.some(([,b])=>(b.k==='dam'||b.k==='green')&&b.k!==k);
 yield {id:'choice',label:'Chưa chọn kỳ quan nhánh khác',met:!other,detail:other?'Đã chọn hoặc đang xây nhánh khác':'Chỉ được hoàn thành một trong hai nhánh',error:'Chỉ chọn một kỳ quan cuối; lựa chọn cố định sau khánh thành.'};
 const halls=entries.filter(([,b])=>b.k==='hall'),hall=halls.find(([,b])=>b.lvl>=6&&active(b))??halls.sort((a,b)=>b[1].lvl-a[1].lvl)[0];
 yield {id:'hall',label:'Đình làng cấp 6 đang hoạt động',met:!!hall&&hall[1].lvl>=6&&active(hall[1]),detail:hall?`Cấp ${hall[1].lvl}/6${active(hall[1])?'':' · đang xây, tắt hoặc hư hỏng'}`:'Chưa có Đình làng',error:'Cần Đình làng cấp 6 đang hoạt động.',tile:hall?+hall[0]:undefined};
 yield {id:'people',label:'Có ít nhất 400 dân',met:c.people.length>=400,detail:`${c.people.length}/400 dân`,error:`Cần 400 dân, còn thiếu ${400-c.people.length}.`};
 if(k==='dam'){
  const staff=staffCounts(c),hydros=entries.filter(([,b])=>b.k==='hydro'),ready=hydros.filter(([i,b])=>active(b)&&(staff.get(+i)??0)>=3).length;
  const missing=hydros.find(([i,b])=>!active(b)||(staff.get(+i)??0)<3);
  yield {id:'hydro',label:'2 thủy điện nhỏ, mỗi nhà đủ 3 thợ tại chỗ',met:ready>=2,detail:`${ready}/2 nhà đủ thợ${missing?`; nhà (${+missing[0]%96+1}, ${Math.floor(+missing[0]/96)+1}) có ${staff.get(+missing[0])??0}/3 thợ tại chỗ`:''}`,error:'Cần 2 thủy điện nhỏ hoạt động đủ 3 thợ mỗi nhà.',tile:missing?+missing[0]:undefined};
  yield {id:'pollution',label:'Ô nhiễm dưới 60',met:(c.industry?.pollution??0)<60,detail:`${(c.industry?.pollution??0).toFixed(2)}/100`,error:'Ô nhiễm phải dưới 60.'};
 }else{
  const parks=entries.filter(([,b])=>b.k==='park'&&active(b)).length,ratio=m.supply>0?m.clean/m.supply:0,pollution=c.industry?.pollution??0;
  yield {id:'parks',label:'4 công viên cây xanh đang hoạt động',met:parks>=4,detail:`${parks}/4 công viên`,error:'Cần 4 công viên cây xanh đang hoạt động.'};
  yield {id:'power',label:'Ít nhất 80% công suất phát từ điện sạch',met:m.supply>0&&ratio>=.8,detail:`${(ratio*100).toFixed(1)}% · ${m.clean.toFixed(1)}/${m.supply.toFixed(1)} MW`,error:'Cần ít nhất 80% công suất phát khả dụng từ nguồn sạch.'};
  yield {id:'pollution',label:'Ô nhiễm ≤20',met:pollution<=20,detail:`${pollution.toFixed(2)}/100`,error:'Cần ô nhiễm ≤20 liên tục đủ 12 giờ.'};
  const cleanHours=pollution<=20&&c.industry?.cleanSince!==undefined?Math.max(0,(at-c.industry.cleanSince)/HOUR):0;
  yield {id:'cleanTime',label:'Giữ ô nhiễm ≤20 liên tục 12 giờ',met:pollution<=20&&c.industry?.cleanSince!==undefined&&cleanHours>=12,detail:`${Math.min(12,cleanHours).toFixed(2)}/12 giờ${pollution>20?' · chưa bắt đầu; cần giảm về ≤20 trước':''}`,error:'Cần ô nhiễm ≤20 liên tục đủ 12 giờ.'};
 }
}
export function finalWonderError(c:City,k:BKey,at:number):string|null{
 for(const requirement of finalWonderRequirements(c,k,at))if(!requirement.met)return requirement.error;
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
