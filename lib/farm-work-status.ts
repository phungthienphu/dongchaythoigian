import {farmRemaining,type City,type Person,type Res} from './engine';

export type FarmWorkerState = 'sheltering' | 'travelling' | 'working' | 'delivering' | 'waiting-storage' | 'tending' | 'exhausted' | 'inactive' | 'blocked';

/** Assignment reserves a slot; only an actual productive haul phase is work. */
export function farmWorkerState(c:City,p:Person,storage:Res):FarmWorkerState {
 if(p.refuge)return 'sheltering';
 const h=p.haul;
 if(h?.carried){
  if(h.resource && (h.resting ? storage[h.resource]-c.res[h.resource]<h.carried : h.phase==='unload'&&storage[h.resource]-c.res[h.resource]<=1e-9))return 'waiting-storage';
  return 'delivering';
 }
 if(h?.phase==='travel')return 'travelling';
 const b=p.task.t==='work'?c.b[p.task.at]:undefined;
 if(!b || b.lvl<1 || b.off || b.burned || b.flooded)return 'inactive';
 if(b.tendUntil)return 'tending';
 if(farmRemaining(b)<=0)return 'exhausted';
 if(p.task.t==='work'&&h?.phase==='work'&&h.tile===p.task.at&&(h.workRate??0)>0)return 'working';
 return 'blocked';
}

export function farmWorkSummary(c:City,tile:number,storage:Res){
 const workers=c.people.filter(p=>p.task.t==='work'&&p.task.at===tile);
 const counts:Record<FarmWorkerState,number>={sheltering:0,travelling:0,working:0,delivering:0,'waiting-storage':0,tending:0,exhausted:0,inactive:0,blocked:0};
 for(const p of workers)counts[farmWorkerState(c,p,storage)]++;
 return {workers,counts};
}
