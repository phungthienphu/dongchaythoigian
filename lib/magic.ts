/** Era 7 (Thức tỉnh Ma pháp) engine adapter. Wires the pure mana-network,
 * magic-production and magic-research modules into settle(), placement,
 * training and zombie combat. All timing uses absolute timestamps so online,
 * offline and chunked settlement give the same result. Functions only: this
 * module is imported by the engine, so it must not touch engine values at load. */
import {UNITS,isBuildingActive,hallLevel,stats,derive,type City,type Building,type BKey,type UKey,type ResKey} from './engine';
import type {EngineRules} from './eras';
import {staffCounts} from './industry';
import {zombiePath,zombiePersonPosition,type Zombie,type ZombieGuard} from './zombies';
import {bridgeDeck} from './bridges';
import {manaNetwork,spendMana,type ManaNetwork,type ManaSite} from './mana-network';
import {reconcileMagicFactories,deliverMagicInput,stepMagicProduction,type MagicProduction} from './magic-production';
import {beginMagicResearch,finishMagicResearch,cancelMagicResearch,type MagicResearchState} from './magic-research';
import {MAGIC_BUILDINGS,MAGIC_RESEARCH,MAGIC_SPELLS,magicDef,type MagicBuilding,type MagicGoods,type Research} from './magic-data';
import {recordResourceFlow} from './resource-history';
const SECOND=1000,MINUTE=60*SECOND;
export type MagicState=MagicProduction&MagicResearchState&{version:1;enteredAt:number;nextUid:number;network:ManaNetwork;topology:string;cooldowns:Record<string,number>;boosted:number[]};
export type MagicAction={type:'magicResearch';key:Research}|{type:'cancelMagicResearch'};
export const RESEARCH_NAMES:Record<Research,string>={conduction:'Dẫn linh',warcraft:'Chiến pháp',lifecraft:'Hộ sinh',elements:'Tứ nguyên',pact:'Khế ước',gatecraft:'Khai giới'};
/** Era 7 kinds that the engine registers. Later-era data stays dormant. */
const ERA7=new Set<string>(Object.entries(MAGIC_BUILDINGS).filter(([,d])=>d.era===7).map(([k])=>k));
/** Buildings whose mana, inputs and outputs run in magic-production. Crystal and
 * rune workshops use the ordinary carried-goods pipeline instead. */
const PRODUCTION=new Set<string>(['aetherwell','manaspire','mageacademy','spiritgarden','rivershrine','wardcircle']);
const SOURCES=new Set<string>(['aetherwell','manaspire']);
const W=96;
const point=(tile:number)=>({x:tile%W+.5,y:Math.floor(tile/W)+.5});
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
const tileDistance=(a:number,b:number)=>Math.hypot(a%W-b%W,Math.floor(a/W)-Math.floor(b/W));
const operating=(b:Building|undefined):b is Building=>!!b&&isBuildingActive(b)&&!b.doneAt;
const log=(c:City,at:number,msg:string,cls:'good'|'warn'='good')=>{c.log.unshift({at,msg,cls});if(c.log.length>60)c.log.length=60;};
export const isMagicBuilding=(k:string)=>ERA7.has(k);
export const magicSiteId=(b:Building)=>`m${b.uid}`;

export function initializeMagic(c:City,at:number){
 if(c.era<7||c.magic)return;
 c.magic={version:1,enteredAt:at,minuteAt:Math.floor(at/MINUTE)*MINUTE,knowledge:0,mana:{},factories:{},researched:[],nextUid:1,network:{sources:{},bindings:{},reachable:{}},topology:'',cooldowns:{},boosted:[]};
}
/** Never reuse an id: a rebuilt source/receiver starts empty and unbound. */
export function assignMagicUid(c:City,k:BKey):{uid?:number}{return c.magic&&isMagicBuilding(k)?{uid:c.magic.nextUid++}:{};}
/** The fourteen-day offline cap skips the same absolute minutes as other modules. */
export function skipMagicTo(c:City,at:number){if(c.magic)c.magic.minuteAt=Math.max(c.magic.minuteAt,Math.floor(at/MINUTE)*MINUTE);}

function magicEntries(c:City){
 const m=c.magic!,out:[number,Building][]=[];
 for(const [key,b]of Object.entries(c.b))if(ERA7.has(b.k)&&b.lvl>=1){b.uid??=m.nextUid++;out.push([+key,b]);}
 return out.sort((a,b)=>a[0]-b[0]);
}
/** Euclidean range plus a real civilian route (bridges included, rivers not). */
function routeConnected(c:City,from:number,to:number,deck=bridgeDeck(c)){return tileDistance(from,to)<=6&&zombiePath(c,from,to,[],100,true,deck)!==null;}
function topologyKey(c:City,entries:[number,Building][]){
 let hash=2166136261;
 for(const [key,b]of Object.entries(c.b)){const text=`${key}${b.k}${b.lvl>=1&&!b.burned?1:0}`;for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);}
 return entries.map(([t,b])=>`${magicSiteId(b)}@${t}:${b.k}:${b.lvl}:${operating(b)?1:0}`).join('|')+`#${hash>>>0}#${c.xs.join(',')}`;
}
/** The graph is persisted so fallback swaps survive reload; it is rebuilt only
 * when topology or operation changes, never by polling. */
function refreshNetwork(c:City,entries:[number,Building][]){
 const m=c.magic!,key=topologyKey(c,entries);if(key===m.topology)return;
 const deck=bridgeDeck(c),sites:ManaSite[]=entries.filter(([,b])=>b.k!=='crystalworks'&&b.k!=='runeworks'&&b.k!=='awakeningtower').map(([tile,b])=>({id:magicSiteId(b),tile,kind:b.k as MagicBuilding,level:b.lvl,enabled:operating(b)}));
 const awakening=entries.some(([,b])=>b.k==='awakeningtower'&&operating(b));
 m.network=manaNetwork(sites,(a,b)=>routeConnected(c,a.tile,b.tile,deck),{awakening});m.topology=key;
}

/** Research completion every second; mana, knowledge and receivers at absolute minutes. */
export function stepMagic(c:City,nt:number){
 const m=c.magic;if(!m)return false;let changed=false;
 if(m.research&&finishMagicResearch(m,nt)){log(c,nt,`Hoàn thành nghiên cứu ${RESEARCH_NAMES[m.researched.at(-1)!]}.`);changed=true;}
 if(nt<m.minuteAt+MINUTE)return changed;
 const to=Math.floor(nt/MINUTE)*MINUTE,entries=magicEntries(c),staff=staffCounts(c);
 refreshNetwork(c,entries);
 const tiles=new Map<string,number>();
 reconcileMagicFactories(m,entries.filter(([,b])=>PRODUCTION.has(b.k)).map(([tile,b])=>{tiles.set(magicSiteId(b),tile);return {id:magicSiteId(b),kind:b.k as MagicBuilding,level:b.lvl,workers:staff.get(tile)??0,enabled:operating(b),activeSince:b.builtAt??m.enteredAt};}));
 stepMagicProduction(m,m.network,to);
 // Gardens that actually paid mana this minute shorten nearby care.
 const boosted=new Set<number>();
 for(const [tile,b]of entries)if(b.k==='spiritgarden'&&m.factories[magicSiteId(b)]&&!m.factories[magicSiteId(b)].blocked){
  const near=Object.entries(c.b).filter(([i,o])=>(o.k==='healer'||o.k==='hospital')&&operating(o)&&tileDistance(+i,tile)<=6).map(([i])=>+i).sort((a,b)=>tileDistance(a,tile)-tileDistance(b,tile)||a-b);
  for(const i of near.slice(0,2))boosted.add(i);
 }
 m.boosted=[...boosted].sort((a,b)=>a-b);
 if(purify(c,to,entries))changed=true;
 return changed;
}
/** Two-hour input buffers are filled only by carriers (see engine stepSupply).
 * Goods already on the way reserve space, so a buffer never overfills. */
const levelScale=(lvl:number)=>[0,1,1.6,2.4][Math.max(1,Math.min(3,lvl))];
export function magicInTransit(c:City,tile:number,r:string){let n=0;for(const p of c.people)if(p.haul?.supply===tile&&p.haul.resource===r)n+=p.haul.carried||p.haul.capacity;return n;}
export function magicSupplyNeed(c:City,tile:number,load:number):{resource:ResKey;amount:number}|null{
 const m=c.magic,b=c.b[tile];if(!m||!operating(b)||!PRODUCTION.has(b.k))return null;
 const f=m.factories[magicSiteId(b)],input=magicDef(b.k as MagicBuilding).input;if(!f||!input)return null;
 for(const [r,rate]of (Object.entries(input) as [keyof MagicGoods,number][]).sort((a,b)=>a[0].localeCompare(b[0]))){
  if(!isStock(r)||c.res[r]<=0)continue;const capacity=rate*2*levelScale(b.lvl),free=capacity-(f.input[r]??0)-magicInTransit(c,tile,r);
  if(free>=capacity/2-1e-9)return {resource:r,amount:Math.min(load,free)};
 }
 return null;
}
export function deliverMagicSupply(c:City,tile:number,r:ResKey,amount:number){const b=c.b[tile];return c.magic&&operating(b)&&PRODUCTION.has(b.k)?deliverMagicInput(c.magic,magicSiteId(b),r as keyof MagicGoods,amount):0;}
const isStock=(r:keyof MagicGoods):r is keyof MagicGoods&ResKey=>r==='food'||r==='wood'||r==='stone'||r==='copper'||r==='gold'||r==='coal'||r==='aetherCrystal'||r==='rune';

/** Thanh tẩy: one village cooldown, scheduled when at least two sick villagers are in range. */
function purify(c:City,at:number,entries:[number,Building][]){
 const m=c.magic!,spell=MAGIC_SPELLS.purify;if(!m.researched.includes('lifecraft')||(m.cooldowns.purify??0)>at)return false;
 for(const [tile,b]of entries){if(b.k!=='rivershrine'||!operating(b))continue;
  const origin=point(tile),sick=c.people.filter(p=>p.vital?.infectedAt!==undefined&&distance(zombiePersonPosition(c,p,at),origin)<=spell.radius).sort((a,b)=>distance(zombiePersonPosition(c,a,at),origin)-distance(zombiePersonPosition(c,b,at),origin)||a.id-b.id);
  if(sick.length<2)continue;
  if('error'in spendMana(m.network,m.mana,magicSiteId(b),spell.mana))continue;
  for(const p of sick.slice(0,spell.targets))delete p.vital!.infectedAt;
  m.cooldowns.purify=at+spell.cooldown;log(c,at,`Điện thờ thi triển Thanh tẩy: chữa bệnh cho ${Math.min(spell.targets,sick.length)} dân. Không hồi sinh người đã gục.`);return true;
 }
 return false;
}

export function magicBuildError(c:City,k:BKey,tile:number):string|null{
 if(!isMagicBuilding(k))return null;
 const m=c.magic;if(!m)return 'Cần vào thời Thức tỉnh Ma pháp.';
 const research=magicDef(k as MagicBuilding).research;if(research&&!m.researched.includes(research))return `Cần hoàn thành nghiên cứu ${RESEARCH_NAMES[research]}.`;
 if(k==='rivershrine'){
  const x=tile%W,y=Math.floor(tile/W),river=[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>x+dx>=0&&x+dx<W&&y+dy>=0&&y+dy<W&&c.t[(y+dy)*W+x+dx]===3);
  const lake=Object.entries(c.b).some(([i,b])=>(b.k==='reservoir'||b.k==='retention')&&operating(b)&&(c.medieval?.water[i]??0)>0&&tileDistance(+i,tile)<=4);
  if(!river&&!lake)return 'Điện thờ Sông Mẹ phải sát sông (không chéo) hoặc trong 4 ô hồ chứa đang có nước.';
 }
 if(k==='awakeningtower'){
  const sources=Object.values(c.b).filter(b=>SOURCES.has(b.k)&&operating(b)).length,academy=Object.values(c.b).some(b=>b.k==='mageacademy'&&operating(b));
  if(hallLevel(c)<7)return 'Cần Đình làng cấp 7 đang hoạt động.';
  if(c.people.length<550)return `Cần 550 dân, còn thiếu ${550-c.people.length}.`;
  if(!academy)return 'Cần một Học viện pháp thuật đang hoạt động.';
  if(sources<2)return 'Cần ít nhất 2 nguồn mana (giếng hoặc tháp) còn nguyên vẹn.';
 }
 return null;
}
/** Old industry must keep running: no mana bypass for the crystal/rune chains. */
export function magicSupportError(c:City,tile:number,b:Building):string|null{
 const support=b.k==='crystalworks'?['forge']:b.k==='runeworks'?['artisan','machine']:null;if(!support)return null;
 const deck=bridgeDeck(c);
 for(const [i,o]of Object.entries(c.b))if(support.includes(o.k)&&operating(o)&&routeConnected(c,tile,+i,deck))return null;
 return b.k==='crystalworks'?'Cần Xưởng dụng cụ hoạt động trong 6 ô, có đường nối.':'Cần Xưởng thủ công hoặc Xưởng cơ khí hoạt động trong 6 ô, có đường nối.';
}
export const magicArmySpace=(c:City)=>c.magic?Object.values(c.b).reduce((n,b)=>n+(b.k==='mageacademy'&&operating(b)?magicDef('mageacademy').armySpace!:0),0):0;

/** Training mana is debited once at the start from academies' bound sources, in
 * tile order. A dry run on copies keeps failed orders side-effect free. */
function chargeTraining(c:City,u:UKey,n:number,commit:boolean):string|null{
 const m=c.magic!,unit=UNITS[u],academies=magicEntries(c).filter(([,b])=>b.k==='mageacademy'&&operating(b));
 const network=commit?m.network:structuredClone(m.network),mana=commit?m.mana:{...m.mana};
 for(let k=0;k<n;k++)if(!academies.some(([,b])=>!('error'in spendMana(network,mana,magicSiteId(b),unit.mana??0))))return `Thiếu mana: mỗi ${unit.n} cần ${unit.mana} mana từ nguồn nối với học viện.`;
 return null;
}
export function magicTrainingError(c:City,u:UKey,n:number):string|null{
 const m=c.magic,unit=UNITS[u];if(!m)return 'Cần vào thời Thức tỉnh Ma pháp.';
 if(unit.research&&!m.researched.includes(unit.research))return `Cần hoàn thành nghiên cứu ${RESEARCH_NAMES[unit.research]} để tuyển ${unit.n}.`;
 // Uses the persisted graph: previews must not rebuild it between minute steps.
 return unit.mana?chargeTraining(c,u,n,false):null;
}
export function payMagicTraining(c:City,u:UKey,n:number){const error=magicTrainingError(c,u,n);return error??chargeTraining(c,u,n,true);}

export function magicAction(c:City,a:MagicAction,now:number,rules:EngineRules):string|null{
 if(rules.maxEra<7)return 'Thời đại này sắp ra mắt.';
 const m=c.magic;if(!m)return 'Cần vào thời Thức tỉnh Ma pháp.';
 if(a.type==='cancelMagicResearch'){
  const refund=cancelMagicResearch(m);if(!refund)return 'Không có nghiên cứu đang chạy.';
  const storage=stats(c,derive(c),now).storage;
  for(const [r,amount]of Object.entries(refund) as [keyof MagicGoods,number][])if(isStock(r))c.res[r]=Math.min(Math.max(c.res[r],storage[r]),c.res[r]+amount);
  log(c,now,'Đã hủy nghiên cứu, hoàn 50% phí; thời gian không được hoàn.','warn');return null;
 }
 const def=Object.hasOwn(MAGIC_RESEARCH,a.key)?MAGIC_RESEARCH[a.key]:undefined;if(!def)return 'Nghiên cứu không hợp lệ.';
 if(def.era>rules.maxEra)return 'Nghiên cứu này sắp ra mắt.';
 const stock:MagicGoods={};for(const r of ['food','wood','stone','copper','gold','coal','aetherCrystal','rune'] as const)stock[r]=c.res[r];
 const before={...stock};
 const error=beginMagicResearch(m,stock,a.key,now,{era:c.era,academy:Object.values(c.b).some(b=>b.k==='mageacademy'&&operating(b)),university:Object.values(c.b).some(b=>b.k==='university'&&operating(b)),fourSpirits:false});
 if(error)return error;
 for(const r of Object.keys(stock) as (keyof MagicGoods)[])if(isStock(r)){const spent=(before[r]??0)-(stock[r]??0);c.res[r]=stock[r]??0;recordResourceFlow(c,now,'spent',r,spent);}
 log(c,now,`Bắt đầu nghiên cứu ${RESEARCH_NAMES[a.key]}, xong sau ${def.seconds/3600} giờ.`);return null;
}

/* ---------- combat: spells resolve inside zombie combat ticks ---------- */
const due=(at:number,period:number)=>Math.floor((at-SECOND)/period)!==Math.floor(at/period);
const live=(z:Zombie,at:number)=>z.hp>0&&(z.emergesAt??0)<=at;
const nearest=<T extends {x:number;y:number}>(items:T[],origin:{x:number;y:number},id:(item:T)=>number|string)=>items.slice().sort((a,b)=>distance(a,origin)-distance(b,origin)||(id(a)<id(b)?-1:id(a)>id(b)?1:0));
/** Same-name slows keep the strongest; the total is capped at 40%. */
export function applySlow(z:Zombie,name:string,amount:number,at:number,until:number){const slows=z.slows??={},old=slows[name]&&slows[name].until>at?slows[name]:undefined;if(!old||amount>old.amount)slows[name]={amount,until};else if(amount===old.amount)old.until=Math.max(old.until,until);}
export function zombieSlow(z:Zombie,at:number){if(!z.slows)return 0;let total=0;for(const [name,s]of Object.entries(z.slows)){if(s.until<=at)delete z.slows[name];else total+=s.amount;}if(!Object.keys(z.slows).length)delete z.slows;return Math.min(.4,total);}
/** Mana for an army standing at home: the nearest source in six tiles, else a
 * ward circle in six tiles through its bound source. Never a remote source. */
function homeMana(c:City,pos:{x:number;y:number},amount:number){
 const m=c.magic;if(!m)return false;
 const entries=magicEntries(c).filter(([tile,b])=>operating(b)&&distance(point(tile),pos)<=6);
 const source=nearest(entries.filter(([,b])=>SOURCES.has(b.k)&&(m.mana[magicSiteId(b)]??0)>=amount).map(([tile,b])=>({...point(tile),tile,b})),pos,e=>e.tile)[0];
 if(source){m.mana[magicSiteId(source.b)]-=amount;return true;}
 for(const e of nearest(entries.filter(([,b])=>b.k==='wardcircle').map(([tile,b])=>({...point(tile),tile,b})),pos,e=>e.tile))if(!('error'in spendMana(m.network,m.mana,magicSiteId(e.b),amount)))return true;
 return false;
}
function heal(guards:ZombieGuard[],origin:{x:number;y:number},radius:number,targets:number,amount:number){
 const allies=nearest(guards.filter(g=>g.hp>0&&distance(g,origin)<=radius),origin,g=>g.id);
 if(allies.reduce((n,g)=>n+Math.max(0,UNITS[g.u].hp-g.hp),0)<50)return false;
 for(const g of allies.filter(g=>g.hp<UNITS[g.u].hp).slice(0,targets))g.hp=Math.min(UNITS[g.u].hp,g.hp+amount);return true;
}
/** Building spells: Linh quang, Hỏa trận, Trói rễ and shrine Thủy hồi. */
export function magicStructureDefense(c:City,at:number,actors:Zombie[],guards:ZombieGuard[]){
 const m=c.magic;if(!m)return;const zombies=actors.filter(z=>live(z,at));
 for(const [tile,b]of magicEntries(c)){if(!operating(b))continue;const id=magicSiteId(b),origin=point(tile);
  if(b.k==='aetherwell'&&due(at,MAGIC_SPELLS.lightpulse.cooldown)){const s=MAGIC_SPELLS.lightpulse,hit=zombies.filter(z=>z.hp>0&&distance(z,origin)<=s.radius);
   if(hit.length&&(m.mana[id]??0)>=s.mana){m.mana[id]-=s.mana;for(const z of hit.slice(0,s.targets)){z.hp-=s.damage;z.hitAt=at;applySlow(z,'lightpulse',s.slow,at,at+s.duration);}}}
  if(b.k==='wardcircle'){
   if(due(at,MAGIC_SPELLS.firecircle.cooldown)){const s=MAGIC_SPELLS.firecircle;for(const z of nearest(zombies.filter(z=>z.hp>0&&distance(z,origin)<=s.radius),origin,z=>z.id).slice(0,s.targets)){if('error'in spendMana(m.network,m.mana,id,s.mana))break;z.hp-=s.damage;z.hitAt=at;}}
   const roots=MAGIC_SPELLS.roots;
   if(m.researched.includes('warcraft')&&(m.cooldowns['roots:'+id]??0)<=at){const center=nearest(zombies.filter(z=>z.hp>0&&distance(z,origin)<=6),origin,z=>z.id)[0];
    const cluster=center?nearest(zombies.filter(z=>z.hp>0&&distance(z,center)<=roots.radius),center,z=>z.id):[];
    if(cluster.length>=3&&!('error'in spendMana(m.network,m.mana,id,roots.mana))){for(const z of cluster.slice(0,roots.targets))applySlow(z,'roots',roots.slow,at,at+roots.duration);m.cooldowns['roots:'+id]=at+roots.cooldown;}}
  }
  if(b.k==='rivershrine'&&m.researched.includes('lifecraft')&&(m.cooldowns['heal:'+id]??0)<=at){const s=MAGIC_SPELLS.waterheal;
   if(heal(guards.filter(g=>distance(g,origin)<=s.radius),origin,s.radius,0,0)&&!('error'in spendMana(m.network,m.mana,id,s.mana))){heal(guards,origin,s.radius,s.targets,s.heal);m.cooldowns['heal:'+id]=at+s.cooldown;}}
 }
}
/** A mage's action: cast instead of a basic attack when ready, valid and paid. */
export function mageAction(c:City,g:ZombieGuard,target:Zombie|undefined,at:number,actors:Zombie[],guards:ZombieGuard[]):boolean{
 if(!c.magic||(g.castAt??0)>at)return false;
 if(g.u==='watermage'){const s=MAGIC_SPELLS.waterheal;if(!heal(guards,g,s.radius,0,0)||!homeMana(c,g,s.mana))return false;heal(guards,g,s.radius,s.targets,s.heal);g.castAt=at+s.cooldown;return true;}
 if(g.u==='firemage'&&target&&live(target,at)){const s=MAGIC_SPELLS.fireball;if(!homeMana(c,g,s.mana))return false;
  target.hp-=s.damage;target.hitAt=at;for(const z of nearest(actors.filter(z=>z!==target&&live(z,at)&&distance(z,target)<=s.radius),target,z=>z.id).slice(0,s.targets-1)){z.hp-=s.splash;z.hitAt=at;}
  g.castAt=at+s.cooldown;return true;}
 return false;
}
