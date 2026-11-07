import type {City} from './engine';
export const HUNGER_WARNING_MS=60_000;
export const HUNGER_LOSS_MS=10*60_000;
export const HUNGER_SEVERE_MS=30*60_000;
export const HUNGER_MIN_POP=3;
export type HungerState={stressMs:number;lossMs:number;warned:number};
export const hungerLevel=(ms:number)=>ms>=HUNGER_SEVERE_MS?3:ms>=HUNGER_LOSS_MS?2:ms>=HUNGER_WARNING_MS?1:0;
/** Actual unmet upkeep, after deliveries. Brief gaps recover twice as quickly as
 * they accumulate; a single tiny delivery cannot erase a prolonged famine. */
export function stepHunger(c:City,at:number,dt:number,shortage:boolean){
 const state=c.hunger??={stressMs:0,lossMs:0,warned:0};
 const notice=(msg:string,cls:'warn'|'good')=>{c.log.unshift({at,msg,cls});c.log=c.log.slice(0,60);};
 state.stressMs=Math.max(0,state.stressMs+(shortage?dt:-2*dt));
 state.lossMs=shortage?state.lossMs+dt:Math.min(state.lossMs,state.stressMs);
 const level=hungerLevel(state.stressMs);
 if(level>state.warned){
  state.warned=level;
  notice(level===3?'Đói nguy kịch: dân có thể chết sau mỗi 10 phút thiếu ăn. Cần đưa lương thực về kho ngay.':level===2?'Đói kéo dài: dân bắt đầu bỏ làng; tiếp tục thiếu ăn đến 30 phút có thể chết người.':'Kho không đủ nuôi dân. Thiếu ăn kéo dài 10 phút sẽ có dân bỏ làng; 30 phút trở lên có nguy cơ chết đói.','warn');
 }
 if(state.stressMs===0){
  if(state.warned)notice('Làng đã qua cơn đói, dân hồi phục và có thể tăng trở lại.','good');
  state.lossMs=0;state.warned=0;
 }
 if(!shortage||state.lossMs<HUNGER_LOSS_MS)return false;
 state.lossMs-=HUNGER_LOSS_MS;
 if(c.people.length<=HUNGER_MIN_POP)return false;
 const idle=c.people.findIndex(p=>p.task.t==='idle'),gone=c.people.splice(idle>=0?idle:c.people.length-1,1)[0];
 notice(level>=3?`Đói nguy kịch: ${gone.name} đã chết vì thiếu ăn. Còn ${c.people.length} dân.`:`Đói kém: ${gone.name} bỏ đi tìm nơi khác. Còn ${c.people.length} dân.`,'warn');
 c.pop=c.people.length;return true;
}
