import {buildingDefense} from './economy-balance';
/** Era 7–8 (Thức tỉnh Ma pháp, Vương triều Nguyên tố) engine adapter. Wires the pure mana-network,
 * magic-production and magic-research modules into settle(), placement,
 * training and zombie combat. All timing uses absolute timestamps so online,
 * offline and chunked settlement give the same result. Functions only: this
 * module is imported by the engine, so it must not touch engine values at load. */
import {UNITS,ENGINE_MAX_ERA,isBuildingActive,hallLevel,stats,derive,type City,type Building,type BKey,type UKey,type ResKey,type Troops} from './engine';
import type {EngineRules} from './eras';
import {staffCounts} from './industry';
import {zombiePath,zombiePersonPosition,type Zombie,type ZombieGuard} from './zombies';
import {bridgeDeck} from './bridges';
import {manaNetwork,spendMana,type ManaNetwork,type ManaSite} from './mana-network';
import {reconcileMagicFactories,deliverMagicInput,stepMagicProduction,type MagicProduction} from './magic-production';
import {beginMagicResearch,finishMagicResearch,cancelMagicResearch,type MagicResearchState} from './magic-research';
import {MAGIC_BUILDINGS,MAGIC_RESEARCH,MAGIC_SPELLS,CONTRACT_RESEARCH,magicDef,type MagicBuilding,type MagicGoods,type Research,type Element,type Contract} from './magic-data';
import {MYTH_ACTIONS,mythAction,mythBuildError,mythConditions,mythDefense,mythTrainingError,stepMythMinute,stepMythSecond,craftActive,recordCraftMana,settleCraft,type MythState,type MythAction} from './magic-myth';
import {recordResourceFlow} from './resource-history';
import {computeSeals,sealConditions,regulatedSources,stepElements,stepTreants,elementSpells,elementBuildError,elementTrainingError,elementAction,treantsInTransit,clampHardened,type ElementState,type ElementAction} from './magic-elements';
const SECOND=1000,MINUTE=60*SECOND;
export type MagicState=MagicProduction&MagicResearchState&ElementState&MythState&{version:1;enteredAt:number;nextUid:number;network:ManaNetwork;topology:string;cooldowns:Record<string,number>;boosted:number[];
 /** Era 8 chuyên tu: one active element; a switch removes it until `pending` completes. */
 specialization?:{element?:Element;pending?:{element:Element;doneAt:number}}};
export type MagicAction={type:'magicResearch';key:Research}|{type:'cancelMagicResearch'}|ElementAction|MythAction;
const ELEMENT_ACTIONS=new Set(['magicSpecialize','magicHarmonize','magicTreant']);
export const isMagicActionType=<A extends {type:string}>(a:A):a is A&MagicAction=>a.type==='magicResearch'||a.type==='cancelMagicResearch'||ELEMENT_ACTIONS.has(a.type)||MYTH_ACTIONS.has(a.type);
export const RESEARCH_NAMES:Record<Research,string>={conduction:'Dẫn linh',warcraft:'Chiến pháp',lifecraft:'Hộ sinh',elements:'Tứ nguyên',pact:'Khế ước',gatecraft:'Khai giới',dragonPact:'Khế ước Long',tortoisePact:'Khế ước Quy',phoenixPact:'Khế ước Phượng'};
const CONTRACT_OF=Object.fromEntries(Object.entries(CONTRACT_RESEARCH).map(([k,v])=>[v,k])) as Partial<Record<Research,Contract>>;
/** Era 7–9 kinds that the engine registers (each gated by its era and EngineRules.maxEra). */
const KINDS=new Set<string>(Object.keys(MAGIC_BUILDINGS));
/** Buildings whose mana, inputs and outputs run in magic-production. Crystal,
 * rune and essence workshops use the ordinary carried-goods pipeline instead. */
export const PRODUCTION=new Set<string>(Object.keys(MAGIC_BUILDINGS).filter(k=>{const d=magicDef(k as MagicBuilding);return !d.output&&(!!d.source||d.mana!==undefined||!!d.knowledge);}));
export const SOURCES=new Set<string>(Object.keys(MAGIC_BUILDINGS).filter(k=>magicDef(k as MagicBuilding).source));
/** Not mana receivers: carried workshops (except the essence forge, which pays mana per load) and wonders. */
export const OFF_NETWORK=new Set<string>(Object.keys(MAGIC_BUILDINGS).filter(k=>{const d=magicDef(k as MagicBuilding);return !d.source&&!d.relay&&d.mana===undefined;}));
const W=96;
export const point=(tile:number)=>({x:tile%W+.5,y:Math.floor(tile/W)+.5});
export const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
export const tileDistance=(a:number,b:number)=>Math.hypot(a%W-b%W,Math.floor(a/W)-Math.floor(b/W));
export const operating=(b:Building|undefined):b is Building=>!!b&&isBuildingActive(b)&&!b.doneAt;
export const log=(c:City,at:number,msg:string,cls:'good'|'warn'='good')=>{c.log.unshift({at,msg,cls});if(c.log.length>60)c.log.length=60;};
export const isMagicBuilding=(k:string)=>KINDS.has(k);
export const magicSiteId=(b:Building)=>`m${b.uid}`;

export function initializeMagic(c:City,at:number){
 if(c.magic){normalizeMagic(c.magic);return;}
 if(c.era<7)return;
 c.magic={version:1,enteredAt:at,minuteAt:Math.floor(at/MINUTE)*MINUTE,knowledge:0,mana:{},factories:{},researched:[],nextUid:1,network:{sources:{},bindings:{},reachable:{}},topology:'',cooldowns:{},boosted:[]};
}
/** Save migration: era 8 fields default empty on older era 7 saves. */
function normalizeMagic(m:MagicState){m.cooldowns??={};m.boosted??=[];m.seals??={};}
/** Never reuse an id: a rebuilt source/receiver starts empty and unbound. */
export function assignMagicUid(c:City,k:BKey):{uid?:number}{return c.magic&&isMagicBuilding(k)?{uid:c.magic.nextUid++}:{};}
/** The fourteen-day offline cap skips the same absolute minutes as other modules. */
export function skipMagicTo(c:City,at:number){if(c.magic)c.magic.minuteAt=Math.max(c.magic.minuteAt,Math.floor(at/MINUTE)*MINUTE);}

export function magicEntries(c:City){
 const m=c.magic!,out:[number,Building][]=[];
 for(const [key,b]of Object.entries(c.b))if(KINDS.has(b.k)&&b.lvl>=1){b.uid??=m.nextUid++;out.push([+key,b]);}
 return out.sort((a,b)=>a[0]-b[0]);
}
/** Euclidean range plus a real civilian route (bridges included, rivers not). */
export function routeConnected(c:City,from:number,to:number,deck=bridgeDeck(c)){return tileDistance(from,to)<=6&&zombiePath(c,from,to,[],100,true,deck)!==null;}
function topologyKey(c:City,entries:[number,Building][],bonus:string){
 let hash=2166136261;
 for(const [key,b]of Object.entries(c.b)){const text=`${key}${b.k}${b.lvl>=1&&!b.burned?1:0}`;for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);}
 return entries.map(([t,b])=>`${magicSiteId(b)}@${t}:${b.k}:${b.lvl}:${operating(b)?1:0}`).join('|')+`#${hash>>>0}#${c.xs.join(',')}#${bonus}`;
}
/** The graph is persisted so fallback swaps survive reload; it is rebuilt only
 * when topology or operation changes, never by polling. */
function refreshNetwork(c:City,entries:[number,Building][]){
 const m=c.magic!,awakening=entries.some(([,b])=>b.k==='awakeningtower'&&operating(b)),fourSpirits=entries.some(([,b])=>b.k==='fourspirits'&&operating(b));
 // Harmonizer slots come from last minute's running state, so they change at minute boundaries only.
 const regulated=regulatedSources(c,entries),key=topologyKey(c,entries,`${+awakening}${+fourSpirits}:${[...regulated].join(',')}`);if(key===m.topology)return;
 const deck=bridgeDeck(c),sites:ManaSite[]=entries.filter(([,b])=>!OFF_NETWORK.has(b.k)).map(([tile,b])=>({id:magicSiteId(b),tile,kind:b.k as MagicBuilding,level:b.lvl,enabled:operating(b)}));
 m.network=manaNetwork(sites,(a,b)=>routeConnected(c,a.tile,b.tile,deck),{awakening,fourSpirits,regulated});m.topology=key;
}

/** Research completion every second; mana, knowledge and receivers at absolute minutes. */
export function stepMagic(c:City,nt:number){
 const m=c.magic;if(!m)return false;let changed=false;
 if(m.research&&finishMagicResearch(m,nt)){const key=m.researched.at(-1)!,contract=CONTRACT_OF[key];log(c,nt,`Hoàn thành nghiên cứu ${RESEARCH_NAMES[key]}.`);changed=true;
  // The first contract research makes that contract active; later switches use magicContract.
  if(contract&&!m.contract?.active&&!m.contract?.pending)m.contract={active:contract};}
 if((m.packages?.length||m.shipments?.length||m.mythEffects?.length)&&stepMythSecond(c,nt))changed=true;
 if(stepTreants(c,nt))changed=true;
 if(nt<m.minuteAt+MINUTE)return changed;
 const to=Math.floor(nt/MINUTE)*MINUTE,entries=magicEntries(c),staff=staffCounts(c);
 refreshNetwork(c,entries);
 const tiles=new Map<string,number>();
 reconcileMagicFactories(m,entries.filter(([,b])=>PRODUCTION.has(b.k)).map(([tile,b])=>{tiles.set(magicSiteId(b),tile);return {id:magicSiteId(b),kind:b.k as MagicBuilding,level:b.lvl,workers:staff.get(tile)??0,enabled:operating(b),activeSince:b.builtAt??m.enteredAt};}));
 const crafts=craftActive(c);
 // Bách Nghệ counts ordinary production mana only: not Thiên nhãn or the domain upkeep itself.
 stepMagicProduction(m,m.network,to,f=>sealConditions(c,f)??mythConditions(c,f),crafts?(f,source,amount)=>{if(f.kind!=='observatory'&&f.kind!=='riverpalace')recordCraftMana(c,source,amount);}:undefined);
 settleCraft(c,to,crafts);
 m.seals=computeSeals(c,entries);clampHardened(c);
 // Gardens that actually paid mana this minute shorten nearby care.
 const boosted=new Set<number>();
 for(const [tile,b]of entries)if(b.k==='spiritgarden'&&m.factories[magicSiteId(b)]&&!m.factories[magicSiteId(b)].blocked){
  const near=Object.entries(c.b).filter(([i,o])=>(o.k==='healer'||o.k==='hospital')&&operating(o)&&tileDistance(+i,tile)<=6).map(([i])=>+i).sort((a,b)=>tileDistance(a,tile)-tileDistance(b,tile)||a-b);
  for(const i of near.slice(0,2))boosted.add(i);
 }
 m.boosted=[...boosted].sort((a,b)=>a-b);
 if(purify(c,to,entries))changed=true;
 if(stepElements(c,to,entries,staff))changed=true;
 if(c.era>=9&&stepMythMinute(c,to,entries))changed=true;
 return changed;
}
/** Two-hour input buffers are filled only by carriers (see engine stepSupply).
 * Goods already on the way reserve space, so a buffer never overfills. */
const levelScale=(lvl:number)=>[0,1,1.6,2.4][Math.max(1,Math.min(3,lvl))];
export function magicInTransit(c:City,tile:number,r:string){let n=treantsInTransit(c,tile,r);for(const p of c.people)if(p.haul?.supply===tile&&p.haul.resource===r)n+=p.haul.carried||p.haul.capacity;return n;}
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
export const isStock=(r:keyof MagicGoods):r is keyof MagicGoods&ResKey=>r==='food'||r==='wood'||r==='stone'||r==='copper'||r==='gold'||r==='coal'||r==='aetherCrystal'||r==='rune'||r==='essence'||r==='celestialStone';

/** Thanh tẩy: one village cooldown, scheduled when at least two sick villagers are in range. */
function purify(c:City,at:number,entries:[number,Building][]){
 const m=c.magic!,spell=MAGIC_SPELLS.purify;if(!m.researched.includes('lifecraft')||(m.cooldowns.purify??0)>at)return false;
 for(const [tile,b]of entries){if(b.k!=='rivershrine'||!operating(b))continue;
  const radius=m.seals?.[magicSiteId(b)]?.includes('water')?10:spell.radius;
  const origin=point(tile),sick=c.people.filter(p=>p.vital?.infectedAt!==undefined&&distance(zombiePersonPosition(c,p,at),origin)<=radius).sort((a,b)=>distance(zombiePersonPosition(c,a,at),origin)-distance(zombiePersonPosition(c,b,at),origin)||a.id-b.id);
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
 const era8=elementBuildError(c,k,tile);if(era8)return era8;
 const era9=mythBuildError(c,k);if(era9)return era9;
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
 const support=isMagicBuilding(b.k)?magicDef(b.k as MagicBuilding).support:null;if(!support?.length)return null;
 // Runs on every carried load: scan only the 6-tile box (ascending tile order, as
 // Object.entries would) and build the bridge deck only when a candidate exists.
 let deck:ReturnType<typeof bridgeDeck>|undefined;const x=tile%W,y=Math.floor(tile/W);
 for(let ny=Math.max(0,y-6);ny<=Math.min(W-1,y+6);ny++)for(let nx=Math.max(0,x-6);nx<=Math.min(W-1,x+6);nx++){const i=ny*W+nx,o=c.b[i];
  if(o&&support.includes(o.k)&&operating(o)&&tileDistance(tile,i)<=6&&routeConnected(c,tile,i,deck??=bridgeDeck(c)))return null;}
 if(!['crystalworks','runeworks','essenceforge','celestialforge'].includes(b.k))return `Cần ${support.map(k=>({forge:'Xưởng dụng cụ',artisan:'Xưởng thủ công',machine:'Xưởng cơ khí',complex:'Tổ hợp sản xuất'}[k]??k)).join(' hoặc ')} hoạt động trong 6 ô, có đường nối.`;
 return b.k==='celestialforge'?'Cần Tổ hợp sản xuất hoạt động trong 6 ô, có đường nối.':b.k==='crystalworks'?'Cần Xưởng dụng cụ hoạt động trong 6 ô, có đường nối.':b.k==='essenceforge'?'Cần Xưởng cơ khí hoạt động trong 6 ô, có đường nối.':'Cần Xưởng thủ công hoặc Xưởng cơ khí hoạt động trong 6 ô, có đường nối.';
}
/** Academies, golem works and spirit stables each open their own magic army space. */
export const magicArmySpace=(c:City)=>c.magic?Object.values(c.b).reduce((n,b)=>n+(isMagicBuilding(b.k)&&operating(b)?magicDef(b.k as MagicBuilding).armySpace??0:0),0):0;

/** Training mana is debited once at the start from academies' bound sources, in
 * tile order. A dry run on copies keeps failed orders side-effect free. */
function chargeTraining(c:City,u:UKey,n:number,commit:boolean):string|null{
 const m=c.magic!,unit=UNITS[u],facilities=magicEntries(c).filter(([,b])=>b.k===(unit.building??'mageacademy')&&operating(b));
 const network=commit?m.network:structuredClone(m.network),mana=commit?m.mana:{...m.mana};
 for(let k=0;k<n;k++)if(!facilities.some(([,b])=>!('error'in spendMana(network,mana,magicSiteId(b),unit.mana??0))))return `Thiếu mana: mỗi ${unit.n} cần ${unit.mana} mana từ nguồn nối với nơi tuyển.`;
 return null;
}
export function magicTrainingError(c:City,u:UKey,n:number):string|null{
 const m=c.magic,unit=UNITS[u];if(!m)return 'Cần vào thời Thức tỉnh Ma pháp.';
 if(unit.research&&!m.researched.includes(unit.research))return `Cần hoàn thành nghiên cứu ${RESEARCH_NAMES[unit.research]} để tuyển ${unit.n}.`;
 const seals=elementTrainingError(c,u);if(seals)return seals;
 const beasts=mythTrainingError(c,u,n);if(beasts)return beasts;
 // Uses the persisted graph: previews must not rebuild it between minute steps.
 return unit.mana?chargeTraining(c,u,n,false):null;
}
export function payMagicTraining(c:City,u:UKey,n:number){const error=magicTrainingError(c,u,n);return error??chargeTraining(c,u,n,true);}

export function magicAction(c:City,a:MagicAction,now:number,rules:EngineRules):string|null{
 if(rules.maxEra<7)return 'Thời đại này sắp ra mắt.';
 const m=c.magic;if(!m)return 'Cần vào thời Thức tỉnh Ma pháp.';
 if(MYTH_ACTIONS.has(a.type))return rules.maxEra<9?'Thời đại này sắp ra mắt.':mythAction(c,a as MythAction,now);
 if(a.type!=='magicResearch'&&a.type!=='cancelMagicResearch')return rules.maxEra<8?'Thời đại này sắp ra mắt.':elementAction(c,a as ElementAction,now);
 if(a.type==='cancelMagicResearch'){
  const refund=cancelMagicResearch(m);if(!refund)return 'Không có nghiên cứu đang chạy.';
  const storage=stats(c,derive(c),now).storage;
  for(const [r,amount]of Object.entries(refund) as [keyof MagicGoods,number][])if(isStock(r))c.res[r]=Math.min(Math.max(c.res[r],storage[r]),c.res[r]+amount);
  log(c,now,'Đã hủy nghiên cứu, hoàn 50% phí; thời gian không được hoàn.','warn');return null;
 }
 const def=Object.hasOwn(MAGIC_RESEARCH,a.key)?MAGIC_RESEARCH[a.key]:undefined;if(!def)return 'Nghiên cứu không hợp lệ.';
 if(def.era>Math.min(rules.maxEra,ENGINE_MAX_ERA))return 'Nghiên cứu này sắp ra mắt.';
 if(CONTRACT_OF[a.key]&&(m.contract?.active||m.contract?.pending||m.researched.some(k=>CONTRACT_OF[k])||m.research&&CONTRACT_OF[m.research.key]))return 'Mỗi làng chỉ một khế ước chủ đạo; đổi khế ước bằng lệnh đổi (thu hồi thần thú, 12 giờ, 200 thiên thạch + 100 tinh chất).';
 const stock:MagicGoods={};for(const r of ['food','wood','stone','copper','gold','coal','aetherCrystal','rune','essence','celestialStone'] as const)stock[r]=c.res[r];
 const before={...stock};
 const error=beginMagicResearch(m,stock,a.key,now,{era:c.era,academy:Object.values(c.b).some(b=>b.k==='mageacademy'&&operating(b)),university:Object.values(c.b).some(b=>b.k==='university'&&operating(b)),fourSpirits:Object.values(c.b).some(b=>b.k==='fourspirits'&&operating(b)),covenant:Object.values(c.b).some(b=>b.k==='covenantaltar'&&operating(b))});
 if(error)return error;
 for(const r of Object.keys(stock) as (keyof MagicGoods)[])if(isStock(r)){const spent=(before[r]??0)-(stock[r]??0);c.res[r]=stock[r]??0;recordResourceFlow(c,now,'spent',r,spent);}
 log(c,now,`Bắt đầu nghiên cứu ${RESEARCH_NAMES[a.key]}, xong sau ${def.seconds/3600} giờ.`);return null;
}

/* ---------- combat: spells resolve inside zombie combat ticks ---------- */
export const due=(at:number,period:number)=>Math.floor((at-SECOND)/period)!==Math.floor(at/period);
export const live=(z:Zombie,at:number)=>z.hp>0&&(z.emergesAt??0)<=at;
export const nearest=<T extends {x:number;y:number}>(items:T[],origin:{x:number;y:number},id:(item:T)=>number|string)=>items.slice().sort((a,b)=>distance(a,origin)-distance(b,origin)||(id(a)<id(b)?-1:id(a)>id(b)?1:0));
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
export const magicSpecialization=(c:City)=>c.magic?.specialization?.element;
/** Max HP of a home guard: the first `hardened` golems were recruited under Thổ (+10%). */
export function magicGuardHp(c:City,g:{id:string;u:UKey}){const hp=UNITS[g.u].hp;return g.u==='golem'&&+g.id.split(':')[1]<(c.magic?.hardened??0)?hp*11/10:hp;}
function heal(c:City,guards:ZombieGuard[],origin:{x:number;y:number},radius:number,targets:number,amount:number){
 const max=(g:ZombieGuard)=>magicGuardHp(c,g),allies=nearest(guards.filter(g=>g.hp>0&&distance(g,origin)<=radius),origin,g=>g.id);
 if(allies.reduce((n,g)=>n+Math.max(0,max(g)-g.hp),0)<50)return false;
 for(const g of allies.filter(g=>g.hp<max(g)).slice(0,targets))g.hp=Math.min(max(g),g.hp+amount);return true;
}
/** Building spells: Linh quang, Hỏa trận, Trói rễ and shrine Thủy hồi. */
export function magicStructureDefense(c:City,at:number,actors:Zombie[],guards:ZombieGuard[]){
 const m=c.magic;if(!m)return;const zombies=actors.filter(z=>live(z,at));
 elementSpells(c,at,zombies);
 if(c.era>=9)mythDefense(c,at,zombies,guards);
 for(const [tile,b]of magicEntries(c)){if(!operating(b))continue;const id=magicSiteId(b),origin=point(tile);
  const extraDefense=buildingDefense(c,b.k,magicDef(b.k as MagicBuilding).defense,at);
  if(extraDefense&&due(at,extraDefense.cooldown)){
   const targets=nearest(zombies.filter(z=>z.hp>0&&distance(z,origin)<=extraDefense.range),origin,z=>z.id);
   if(at>=(c.expansionBalanceStartsAt??Infinity)&&(b.k==='wardbastion'||b.k==='celestialbastion')){
    const priority={breaker:0,super:1,normal:2};targets.sort((a,b)=>priority[a.kind]-priority[b.kind]||distance(a,origin)-distance(b,origin)||a.id-b.id);
   }
   for(const z of targets.slice(0,extraDefense.targets)){
    if('error'in spendMana(m.network,m.mana,id,extraDefense.mana))break;
    z.hp-=extraDefense.damage;z.hitAt=at;
   }
  }
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
   if(heal(c,guards.filter(g=>distance(g,origin)<=s.radius),origin,s.radius,0,0)&&!('error'in spendMana(m.network,m.mana,id,s.mana))){heal(c,guards,origin,s.radius,s.targets+(magicSpecialization(c)==='water'?1:0),s.heal);m.cooldowns['heal:'+id]=at+s.cooldown;}}
 }
}
/** A mage's action: cast instead of a basic attack when ready, valid and paid. */
export function mageAction(c:City,g:ZombieGuard,target:Zombie|undefined,at:number,actors:Zombie[],guards:ZombieGuard[]):boolean{
 if(!c.magic||(g.castAt??0)>at)return false;
 if(g.u==='watermage'){const s=MAGIC_SPELLS.waterheal;if(!heal(c,guards,g,s.radius,0,0)||!homeMana(c,g,s.mana))return false;heal(c,guards,g,s.radius,s.targets+(magicSpecialization(c)==='water'?1:0),s.heal);g.castAt=at+s.cooldown;return true;}
 if(g.u==='firemage'&&target&&live(target,at)){const s=MAGIC_SPELLS.fireball;if(!homeMana(c,g,s.mana))return false;
  const power=magicSpecialization(c)==='fire'?1.1:1;
  target.hp-=s.damage*power;target.hitAt=at;for(const z of nearest(actors.filter(z=>z!==target&&live(z,at)&&distance(z,target)<=s.radius),target,z=>z.id).slice(0,s.targets-1)){z.hp-=s.splash*power;z.hitAt=at;}
  g.castAt=at+s.cooldown;return true;}
 return false;
}

/* ---------- mana flasks for armies leaving the village (spec 7.2) ---------- */
export const FLASK_PER_MAGE=100;
/** Mana poured into flasks, by source id, so unused mana returns where it came from. */
export type ManaFlask={mana:number;from:Record<string,number>};
export const flaskMages=(t:Troops)=>(t.firemage??0)+(t.watermage??0);
const sourceAt=(c:City,tile:number)=>{const b=c.b[tile];return c.magic&&operating(b)&&SOURCES.has(b.k)?magicSiteId(b):undefined;};
/** Pour up to 100 mana per mage from one chosen source before marching. */
export function pourFlask(c:City,troops:Troops,sourceTile:number):ManaFlask|string{
 const m=c.magic,mages=flaskMages(troops);if(!m||!mages)return 'Chỉ pháp sư mang bình mana.';
 const id=sourceAt(c,sourceTile);if(!id)return 'Chọn giếng linh mạch hoặc tháp tụ linh đang hoạt động để rót bình mana.';
 const mana=Math.min(FLASK_PER_MAGE*mages,Math.max(0,m.mana[id]??0));m.mana[id]=(m.mana[id]??0)-mana;
 return {mana,from:mana>0?{[id]:mana}:{}};
}
/** Home defenders snapshot flasks from operating sources in tile order; the
 * battle frame never touches village mana again. */
export function pourDefenseFlask(c:City):ManaFlask|undefined{
 const m=c.magic,mages=flaskMages(c.army);if(!m||!mages)return undefined;
 let want=FLASK_PER_MAGE*mages;const from:Record<string,number>={};
 for(const [,b]of magicEntries(c)){if(want<=0)break;if(!SOURCES.has(b.k)||!operating(b))continue;const id=magicSiteId(b),take=Math.min(want,Math.max(0,m.mana[id]??0));if(take>0){m.mana[id]-=take;from[id]=take;want-=take;}}
 const mana=Object.values(from).reduce((n,v)=>n+v,0);return {mana,from};
}
/** Return at most the unused mana, never more than was poured, only into free
 * space of the original sources that still exist. Drunk mana is not refunded. */
export function returnFlask(c:City,flask:ManaFlask|undefined,unused:number){
 const m=c.magic;if(!m||!flask)return 0;let left=Math.max(0,Math.min(flask.mana,Number.isFinite(unused)?unused:0)),returned=0;
 for(const [id,poured]of Object.entries(flask.from).sort((a,b)=>a[0].localeCompare(b[0]))){
  const capacity=m.network.sources[id]?.capacity;if(capacity===undefined||!(id in m.mana))continue;
  const add=Math.max(0,Math.min(left,poured,capacity-m.mana[id]));m.mana[id]+=add;left-=add;returned+=add;
 }
 return returned;
}
