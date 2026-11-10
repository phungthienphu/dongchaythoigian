import {B,type City} from './engine';
import {active,multiplier,pollutionCleanup,pollutionRemovalCapacity,productionEmissionRates,staffCounts} from './industry';
import {completedWonder,operationJobs,powerFraction} from './modern';
import {buildingOutput} from './economy-balance';

/** Read-only snapshot, not a guarantee of future work/transport or fuel supply. */
export function pollutionReport(c:City,at:number){
 const production=new Map<number,number>(),cleaning=new Map<number,number>(),staff=staffCounts(c);
 productionEmissionRates(c,at,B,production);const cleanup=pollutionCleanup(c,staff,Object.entries(c.b),cleaning);
 const assigned=new Map<number,number>();
 for(const p of c.people)if(p.task.t==='work'&&!p.refuge)assigned.set(p.task.at,(assigned.get(p.task.at)??0)+1);
 const inactiveReason=(b:City['b'][number])=>b.lvl<1?'Đang xây':b.burned?'Bị phá hỏng':b.flooded?'Đang ngập':b.off?'Đang tắt':null;
 const sources=Object.entries(c.b).filter(([,b])=>!!B[b.k].emission).map(([key,b])=>{
  const tile=+key,d=B[b.k],jobs=operationJobs(b,d),workers=staff.get(tile)??0;
  const thermal=b.k==='thermal',potential=(d.emission??0)*multiplier(b)*(thermal?1:completedWonder(c,'green')?.5:1);
  // Power plants emit in stepPower, independently of production hauling.
  const rate=(production.get(tile)??0)+(thermal&&active(b)?(c.modern?.generation[tile]??0)/80*4:0);
  const output=Object.values(buildingOutput(c,b.k,d.prod??{},at))[0]??1;
  const missing=Object.entries(d.input??{}).some(([r,n])=>c.res[r as keyof City['res']]<(n??0)/output);
  const reason=inactiveReason(b)??(rate>0?'Đang phát thải':thermal?(workers===0?'Chưa có thợ tại chỗ':c.res.coal<=0?'Hết than':'Chờ cập nhật phát điện'):missing?'Thiếu nguyên liệu đóng kiện':d.demand&&powerFraction(c,tile)<=0?'Chưa được cấp điện':(assigned.get(tile)??0)===0?'Chưa giao thợ':'Thợ đang đi, mang hàng hoặc chờ sản xuất');
  return {tile,k:b.k,level:b.lvl,rate,potential,enabled:active(b),workers,assigned:assigned.get(tile)??0,jobs,reason};
 }).sort((a,b)=>b.rate-a.rate||b.potential-a.potential||a.tile-b.tile);
 const cleaners=[...cleaning].map(([tile,rate])=>{
  const b=c.b[tile],jobs=b.k==='treatment'?3:0,workers=staff.get(tile)??0;
  return {tile,k:b.k,level:b.lvl,rate,capacity:pollutionRemovalCapacity(b),jobs,workers,reason:inactiveReason(b)??(jobs&&workers<jobs?`Có ${workers}/${jobs} thợ tại chỗ`:'Đang xử lý')};
 });
 const emissions=sources.reduce((sum,b)=>sum+b.rate,0),net=emissions-cleanup;
 const pollution=c.industry?.pollution??0;
 const enabledPotential=sources.reduce((sum,b)=>sum+(b.enabled?b.potential:0),0);
 const hoursTo=(target:number)=>pollution>target&&net<-.001?(pollution-target)/-net:null;
 return {sources,cleaners,emissions,cleanup,natural:1,net,enabledPotential,
  hoursBelow60:hoursTo(59.9),hoursAt20:hoursTo(20),hoursBelow30:hoursTo(29.9)};
}
