import {magicDef,type MagicBuilding,type MagicGoods} from './magic-data';
import {spendMana,type ManaNetwork} from './mana-network';
export type MagicFactory={id:string;kind:MagicBuilding;level:number;workers:number;enabled:boolean;activeSince:number;input:MagicGoods;output:MagicGoods;blocked?:string};
export type MagicProduction={minuteAt:number;knowledge:number;mana:Record<string,number>;factories:Record<string,MagicFactory>};
const MINUTE=60000,HOUR=3600000;
const entries=(goods:MagicGoods)=>Object.entries(goods) as [keyof MagicGoods,number][];
function scale(factory:MagicFactory){const d=magicDef(factory.kind);return [0,1,1.6,2.4][Math.max(1,Math.min(3,Math.floor(factory.level)))]*(d.jobs?Math.min(1,Math.max(0,factory.workers)/Math.ceil(d.jobs*[0,1,1.6,2.4][Math.max(1,Math.min(3,Math.floor(factory.level)))])):1);}
/** Buffers are instance-bound. A rebuilt building must receive a fresh id; it
 * never inherits inputs, outputs, mana or a paid batch from the destroyed one. */
export function reconcileMagicFactories(state:MagicProduction,factories:readonly Omit<MagicFactory,'input'|'output'>[]){
 const present=new Set(factories.map(f=>f.id));
 for(const id of Object.keys(state.factories))if(!present.has(id)){delete state.factories[id];delete state.mana[id];}
 for(const factory of factories){const old=state.factories[factory.id];state.factories[factory.id]={...factory,input:old?.input??{},output:old?.output??{}};if(magicDef(factory.kind).source)state.mana[factory.id]??=0;}
}
/** Deliver/collect transfer an existing carrier's cargo; neither function credits
 * village stock. The caller owns the other side of that one atomic transfer. */
export function deliverMagicInput(state:MagicProduction,id:string,resource:keyof MagicGoods,amount:number){
 const factory=state.factories[id];if(!factory||!Number.isFinite(amount)||amount<=0)return 0;
 const rate=magicDef(factory.kind).input?.[resource];if(!rate)return 0;
 const levelScale=[0,1,1.6,2.4][Math.max(1,Math.min(3,factory.level))],capacity=rate*2*levelScale;
 const accepted=Math.min(amount,Math.max(0,capacity-(factory.input[resource]??0)));factory.input[resource]=(factory.input[resource]??0)+accepted;return accepted;
}
export function collectMagicOutput(state:MagicProduction,id:string,resource:keyof MagicGoods,amount:number){
 const factory=state.factories[id];if(!factory||!Number.isFinite(amount)||amount<=0)return 0;
 const accepted=Math.min(amount,factory.output[resource]??0);factory.output[resource]=(factory.output[resource]??0)-accepted;return accepted;
}
/** Absolute minute boundaries make arbitrary request/checkpoint chunking
 * equivalent. Sources run before receivers; paid production cannot borrow from
 * a remote village stockpile or from another building's buffer. */
export function stepMagicProduction(state:MagicProduction,network:ManaNetwork,to:number,conditions:(factory:MagicFactory)=>string|undefined=()=>undefined){
 if(!Number.isFinite(to)||to<state.minuteAt)return;
 const priorities={health:0,defense:1,input:2,output:3,other:4};
 const factories=Object.values(state.factories).sort((a,b)=>Number(!!magicDef(b.kind).source)-Number(!!magicDef(a.kind).source)||priorities[magicDef(a.kind).priority??'other']-priorities[magicDef(b.kind).priority??'other']||a.id.localeCompare(b.id));
 for(let end=state.minuteAt+MINUTE;end<=to;end+=MINUTE){
  for(const factory of factories){
   const d=magicDef(factory.kind),reason=conditions(factory);delete factory.blocked;
   if(!factory.enabled||reason){factory.blocked=reason??'Công trình đang dừng.';continue;}
   const working=scale(factory),hours=Math.max(0,end-Math.max(end-MINUTE,factory.activeSince))/HOUR;
   if(!working||!hours){factory.blocked='Chưa có thợ làm việc.';continue;}
   const maximum=working*hours;let fraction=1;
   for(const [resource,rate]of entries(d.input??{}))fraction=Math.min(fraction,(factory.input[resource]??0)/(rate*maximum));
   const levelScale=[0,1,1.6,2.4][Math.max(1,Math.min(3,factory.level))];
   for(const [resource,rate]of entries(d.output??{}))fraction=Math.min(fraction,Math.max(0,rate*2*levelScale-(factory.output[resource]??0))/(rate*maximum));
   if(d.knowledge)fraction=Math.min(fraction,Math.max(0,5000-state.knowledge)/(d.knowledge*maximum));
   if(d.source){const capacity=network.sources[factory.id]?.capacity??0;fraction=Math.min(fraction,Math.max(0,capacity-(state.mana[factory.id]??0))/(d.source.perHour*maximum));}
   fraction=Math.max(0,Math.min(1,fraction));
   if(fraction<=1e-12){factory.blocked='Thiếu vật liệu hoặc bộ đệm đã đầy.';continue;}
   const amount=maximum*fraction;
   if(d.mana!==undefined){const debit=spendMana(network,state.mana,factory.id,d.mana*amount);if('error'in debit){factory.blocked=debit.error;continue;}}
   for(const [resource,rate]of entries(d.input??{}))factory.input[resource]=Math.max(0,(factory.input[resource]??0)-rate*amount);
   for(const [resource,rate]of entries(d.output??{}))factory.output[resource]=(factory.output[resource]??0)+rate*amount;
   if(d.knowledge)state.knowledge=Math.min(5000,state.knowledge+d.knowledge*amount);
   if(d.source)state.mana[factory.id]=Math.min(network.sources[factory.id].capacity,(state.mana[factory.id]??0)+d.source.perHour*amount);
  }
  state.minuteAt=end;
 }
}
