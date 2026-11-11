import {MAGIC_RESEARCH,type Research,type MagicGoods} from './magic-data';
export type MagicResearchState={knowledge:number;researched:Research[];research?:{key:Research;startedAt:number;doneAt:number;goods:MagicGoods;knowledge:number}};
export type ResearchContext={era:number;academy:boolean;university:boolean;fourSpirits:boolean;covenant?:boolean};
export function beginMagicResearch(state:MagicResearchState,stock:MagicGoods,key:Research,at:number,context:ResearchContext):string|undefined{
 const def=Object.hasOwn(MAGIC_RESEARCH,key)?MAGIC_RESEARCH[key]:undefined;if(!def||!Number.isFinite(at))return 'Nghiên cứu không hợp lệ.';
 if(state.research)return 'Đã có nghiên cứu đang thực hiện.';
 if(state.researched.includes(key))return 'Tri thức này đã hoàn thành.';
 if(context.era<def.era||!context.academy)return 'Cần đúng thời đại và học viện đang hoạt động.';
 if(key==='conduction'&&!context.university)return 'Cần đại học thời Hiện đại đang hoạt động để nghiên cứu Dẫn linh.';
 if(key==='gatecraft'&&!context.fourSpirits)return 'Cần Đại Trận Tứ Linh đang hoạt động để bắt đầu Khai giới.';
 if((key==='dragonPact'||key==='tortoisePact'||key==='phoenixPact')&&!context.covenant)return 'Cần Đài khế ước đang hoạt động để nghiên cứu khế ước.';
 if(def.requires.some(k=>!state.researched.includes(k)))return 'Chưa hoàn thành nghiên cứu tiền đề.';
 if(!Number.isFinite(state.knowledge)||state.knowledge<def.knowledge)return 'Thiếu tri thức ma pháp.';
 for(const [resource,amount]of Object.entries(def.goods))if(!Number.isFinite(stock[resource as keyof MagicGoods]??0)||(stock[resource as keyof MagicGoods]??0)<amount)return 'Thiếu vật liệu đã về kho.';
 state.knowledge-=def.knowledge;
 for(const [resource,amount]of Object.entries(def.goods)){const r=resource as keyof MagicGoods;stock[r]=(stock[r]??0)-amount;}
 state.research={key,startedAt:at,doneAt:at+def.seconds*1000,goods:{...def.goods},knowledge:def.knowledge};return undefined;
}
/** Completion survives losing its paid academy and is idempotent across reload. */
export function finishMagicResearch(state:MagicResearchState,at:number){const pending=state.research;if(!pending||at<pending.doneAt)return false;if(!state.researched.includes(pending.key))state.researched.push(pending.key);delete state.research;return true;}
/** The caller limits the refunded goods to current warehouse capacity. */
export function cancelMagicResearch(state:MagicResearchState){const pending=state.research;if(!pending)return undefined;const refund:MagicGoods={};for(const [resource,amount]of Object.entries(pending.goods))refund[resource as keyof MagicGoods]=Math.floor(amount*.5);state.knowledge=Math.min(5000,state.knowledge+Math.floor(pending.knowledge*.5));delete state.research;return refund;}
