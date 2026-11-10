import {B,RES,RN,builders,busyBuilders,type City} from './engine';
import {finalWonderRequirements} from './modern';
export function finalWonderReadiness(c:City,k:'dam'|'green',at:number){
 const requirements=[...finalWonderRequirements(c,k,at)];
 const cost=RES.filter(r=>B[k].cost[r]).map(r=>({resource:r,name:RN[r],required:B[k].cost[r]!,available:Math.floor(c.res[r]),missing:Math.max(0,Math.ceil(B[k].cost[r]!-c.res[r]))}));
 const freeBuilders=Math.max(0,builders(c)-busyBuilders(c));
 return {requirements,cost,freeBuilders,ready:requirements.every(r=>r.met)&&cost.every(r=>r.missing===0)&&freeBuilders>0};
}
