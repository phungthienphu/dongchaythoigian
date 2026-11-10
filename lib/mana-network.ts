import {magicDef,type MagicBuilding} from './magic-data';
export type ManaSite={id:string;tile:number;kind:MagicBuilding;level:number;enabled:boolean;receiver?:boolean;priority?:number;preferred?:{primary?:string;backup?:string}};
export type ManaBinding={primary?:string;backup?:string;reason?:string};
export type ManaNetwork={sources:Record<string,{slots:number;used:number;capacity:number}>;bindings:Record<string,ManaBinding>;reachable:Record<string,string[]>};
const distance=(a:ManaSite,b:ManaSite)=>Math.hypot(a.tile%96-b.tile%96,Math.floor(a.tile/96)-Math.floor(b.tile/96));
const rank={health:0,defense:1,input:2,output:3,other:4};
const scale=(level:number)=>[1,1,1.6,2.4][Math.max(1,Math.min(3,level))];
/** Rebuild only after topology/operation changes. Connectivity is supplied by the
 * civil path index, so a short Euclidean edge alone never crosses a sealed river. */
export function manaNetwork(sites:readonly ManaSite[],connected:(a:ManaSite,b:ManaSite)=>boolean,bonuses:{awakening?:boolean;fourSpirits?:boolean;regulated?:ReadonlySet<string>}={}):ManaNetwork{
 const active=sites.filter(s=>s.enabled).sort((a,b)=>a.id.localeCompare(b.id));
 const sources=active.filter(s=>magicDef(s.kind).source),relays=active.filter(s=>magicDef(s.kind).relay);
 const receivers=sites.filter(s=>s.receiver??(magicDef(s.kind).mana!==undefined)).slice().sort((a,b)=>{
  const role=rank[magicDef(a.kind).priority??'other']-rank[magicDef(b.kind).priority??'other'];return role||(a.priority??0)-(b.priority??0)||a.id.localeCompare(b.id);
 });
 const network:ManaNetwork={sources:{},bindings:{},reachable:{}};
 const edges=(a:ManaSite,b:ManaSite)=>distance(a,b)<=6&&connected(a,b);
 const reached=new Map<string,ManaSite[]>();
 for(const source of sources){
  network.sources[source.id]={slots:4+2*(Math.max(1,Math.min(3,source.level))-1)+(bonuses.awakening?1:0)+(bonuses.regulated?.has(source.id)?1:0),used:0,capacity:magicDef(source.kind).source!.capacity*scale(source.level)*(bonuses.fourSpirits?1.2:1)};
  const queue=[{site:source,hops:0}],seen=new Set([source.id]);
  for(let i=0;i<queue.length;i++){
   const node=queue[i];if(node.hops>=3)continue;
   for(const relay of relays)if(!seen.has(relay.id)&&edges(node.site,relay)){seen.add(relay.id);queue.push({site:relay,hops:node.hops+1});}
  }
  reached.set(source.id,queue.map(n=>n.site));
 }
 for(const receiver of receivers){
  if(!receiver.enabled){network.bindings[receiver.id]={reason:'Công trình đang dừng hoặc thiếu điều kiện vận hành.'};network.reachable[receiver.id]=[];continue;}
  const candidates=sources.filter(source=>reached.get(source.id)!.some(node=>edges(node,receiver))).sort((a,b)=>distance(a,receiver)-distance(b,receiver)||a.id.localeCompare(b.id));
  network.reachable[receiver.id]=candidates.map(s=>s.id);
  const preference=receiver.preferred;
  const allowed=preference?.primary||preference?.backup?candidates.filter(s=>s.id===preference.primary||s.id===preference.backup).sort((a,b)=>(a.id===preference.primary?-1:1)-(b.id===preference.primary?-1:1)):candidates;
  const primary=allowed.find(s=>network.sources[s.id].used<network.sources[s.id].slots);
  if(!primary){network.bindings[receiver.id]={reason:candidates.length?'Nguồn hợp lệ đã hết chỗ hoặc nguồn đã chọn không còn kết nối.':'Không có nguồn mana trong mạng đường và tối đa ba cột dẫn linh.'};continue;}
  network.sources[primary.id].used++;
  const backup=allowed.find(s=>s.id!==primary.id)?.id;network.bindings[receiver.id]={primary:primary.id,...(backup?{backup}:{})};
 }
 return network;
}
/** Atomic debit: a backup must have both balance and a free service slot. A
 * failed request changes neither balances nor primary allocations. */
export function spendMana(network:ManaNetwork,balances:Record<string,number>,receiver:string,amount:number):{source:string}|{error:string}{
 if(!Number.isFinite(amount)||amount<0)return {error:'Phí mana không hợp lệ.'};
 const binding=network.bindings[receiver];if(!binding?.primary)return {error:binding?.reason??'Công trình chưa nối nguồn mana.'};
 const primary=binding.primary;
 if((balances[primary]??0)>=amount){balances[primary]=(balances[primary]??0)-amount;return {source:primary};}
 const backup=binding.backup,slot=backup?network.sources[backup]:undefined;
 if(!backup||!slot||slot.used>=slot.slots||(balances[backup]??0)<amount)return {error:'Nguồn chính thiếu mana; nguồn dự phòng thiếu mana hoặc hết chỗ.'};
 balances[backup]=(balances[backup]??0)-amount;network.sources[primary].used--;slot.used++;binding.primary=backup;binding.backup=primary;return {source:backup};
}
