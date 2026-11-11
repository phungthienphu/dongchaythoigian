/** Era 8 (Vương triều Nguyên tố) rules: elemental seals, the harmonizer,
 * specialization, the four elemental spells, spirit-wood carriers and golem
 * hardening. Called from magic.ts at absolute seconds/minutes, so online,
 * offline and chunked settlement agree. Functions only (imported in a cycle). */
import {B,UNITS,hallLevel,type City,type Building,type BKey,type UKey,type ResKey} from './engine';
import {spendMana} from './mana-network';
import type {MagicFactory} from './magic-production';
import {MAGIC_SPELLS,magicDef,type Element,type MagicBuilding} from './magic-data';
import {isField} from './medieval';
import {recordResourceFlow} from './resource-history';
import {mythSealNeeds,craftActive,recordCraftMana} from './magic-myth';
import {zombiePath,zombiePersonPosition,type Zombie,type ZombieGuard} from './zombies';
import {PRODUCTION,SOURCES,distance,log,magicEntries,magicSiteId,magicSupplyNeed,deliverMagicSupply,magicSpecialization,nearest,operating,point,tileDistance} from './magic';
const SECOND=1000,MINUTE=60*SECOND,HOUR=60*MINUTE,W=96;
export const SEAL_STATIONS:Record<string,Element>={firealtar:'fire',watertemple:'water',woodgrove:'wood',earthtemple:'earth'};
export const ELEMENT_NAMES:Record<Element,string>={fire:'Hỏa',water:'Thủy',wood:'Mộc',earth:'Thổ'};
export type Treant={id:number;grove:string;tile:number;phase:'idle'|'pickup'|'wait'|'deliver';route:number[];at:number;nextAt:number;resource?:ResKey;load:number;carried:number;target?:number;drop?:number};
export type ElementState={
 /** Seals each recipient received at the last minute boundary, by site id. */
 seals?:Record<string,Element[]>;
 /** The two seals a harmonizer was told to use (must be chosen explicitly). */
 harmony?:Record<string,Element[]>;
 /** Golems recruited while Thổ was active: first N golems have +10% max HP. */
 hardened?:number;
 treants?:Treant[];treantQueue?:{doneAt:number;grove:string}[];
 effects?:{kind:'firestorm';x:number;y:number;start:number;until:number}[];
 walls?:{tile:number;hp:number;until:number}[];
 /** Field tile -> end of Mưa sinh trưởng. */
 growth?:Record<string,number>;
};
export type ElementAction={type:'magicSpecialize';element:Element}|{type:'magicHarmonize';x:number;y:number;elements:Element[]}|{type:'magicTreant';x:number;y:number};
const SPEC_SWITCH={rune:100,essence:40},SPEC_SWITCH_MS=6*HOUR;
const TREANT={cost:{wood:100,rune:20,essence:10},ms:HOUR,load:30,speed:1.2,manaPerHour:5,max:8};
const running=(c:City,b:Building|undefined):b is Building=>{if(!operating(b)||!c.magic)return false;const f=c.magic.factories[magicSiteId(b)];return !!f&&f.enabled&&!f.blocked;};
const stations=(c:City,entries:[number,Building][],kind?:string)=>entries.filter(([,b])=>(kind?b.k===kind:SEAL_STATIONS[b.k]!==undefined)&&running(c,b));
const tileOf=(p:{x:number;y:number})=>Math.max(0,Math.min(W-1,Math.floor(p.y)))*W+Math.max(0,Math.min(W-1,Math.floor(p.x)));
const hallTile=(c:City)=>Number(Object.keys(c.b).find(i=>c.b[i].k==='hall')??c.camp);

/* ---------- seals ---------- */
function sealNeeds(c:City,b:Building):Element[]{
 if(b.k==='golemworks'||b.k==='spiritstable')return [...(magicDef(b.k).elements??[])];
 const myth=mythSealNeeds(b);if(myth)return myth;
 if(b.k==='harmonizer')return [...(c.magic?.harmony?.[magicSiteId(b)]??[])];
 if(b.k==='rivershrine')return ['water'];// optional link: Thanh tẩy reach 8→10
 return [];
}
/** Each running station (in tile order) serves its three nearest recipients
 * within six tiles that still lack its seal (ties by tile). A recipient takes one
 * slot per seal kind; a second station of the same kind serves the rest. */
export function computeSeals(c:City,entries:[number,Building][]):Record<string,Element[]>{
 const seals:Record<string,Element[]>={},recipients=entries.filter(([,b])=>operating(b)).map(([tile,b])=>({tile,id:magicSiteId(b),needs:sealNeeds(c,b)})).filter(r=>r.needs.length);
 for(const [tile,b]of stations(c,entries)){const element=SEAL_STATIONS[b.k];
  for(const r of recipients.filter(r=>r.needs.includes(element)&&!seals[r.id]?.includes(element)&&tileDistance(r.tile,tile)<=6).sort((a,b)=>tileDistance(a.tile,tile)-tileDistance(b.tile,tile)||a.tile-b.tile).slice(0,3))(seals[r.id]??=[]).push(element);
 }
 for(const list of Object.values(seals))list.sort();
 return seals;
}
const hasSeals=(c:City,b:Building,need:readonly Element[])=>need.every(e=>c.magic?.seals?.[magicSiteId(b)]?.includes(e));
/** Extra production conditions: a harmonizer needs both chosen, distinct seals. */
export function sealConditions(c:City,f:MagicFactory):string|undefined{
 if(f.kind!=='harmonizer')return undefined;
 const choice=c.magic?.harmony?.[f.id]??[];if(choice.length!==2)return 'Chọn hai ấn nguyên tố khác loại cho đài điều hòa.';
 return choice.every(e=>c.magic?.seals?.[f.id]?.includes(e))?undefined:'Thiếu ấn nguyên tố đã chọn trong 6 ô.';
}
/** Sources within six tiles of a running harmonizer get one extra slot, once. */
export function regulatedSources(c:City,entries:[number,Building][]){
 const result=new Set<string>(),harmonizers=entries.filter(([,b])=>b.k==='harmonizer'&&running(c,b));
 if(harmonizers.length)for(const [tile,b]of entries)if(SOURCES.has(b.k)&&operating(b)&&harmonizers.some(([h])=>tileDistance(h,tile)<=6))result.add(magicSiteId(b));
 return result;
}

/* ---------- placement and training ---------- */
export function elementBuildError(c:City,k:BKey,tile:number):string|null{
 if(k!=='fourspirits')return null;
 if(hallLevel(c)<8)return 'Cần Đình làng cấp 8 đang hoạt động.';
 const entries=magicEntries(c),missing=(Object.values(SEAL_STATIONS)).filter(e=>!stations(c,entries).some(([t,b])=>SEAL_STATIONS[b.k]===e&&tileDistance(t,tile)<=6));
 return missing.length?`Cần đủ bốn ấn đang hoạt động trong 6 ô; thiếu ấn ${missing.map(e=>ELEMENT_NAMES[e]).join(', ')}.`:null;
}
/** Golems need the Thổ seal at the works; deer need Mộc and Thủy at the stable. */
export function elementTrainingError(c:City,u:UKey):string|null{
 const unit=UNITS[u],building=unit.building,need=building==='golemworks'||building==='spiritstable'||building==='spiritgate'?magicDef(building).elements??[]:[];
 if(!need.length)return null;
 return magicEntries(c).some(([,b])=>b.k===building&&operating(b)&&hasSeals(c,b,need))?null:`Thiếu ấn ${need.map(e=>ELEMENT_NAMES[e]).join(' + ')} cấp cho ${B[building as BKey].n}; không bắt đầu lượt tuyển mới.`;
}
/** Losses never leave more hardened golems than golems that exist. */
export function clampHardened(c:City){const m=c.magic;if(!m?.hardened)return;const golems=(c.army.golem??0)+(c.deployedArmy?.golem??0)+c.exps.reduce((n,e)=>n+(e.units.golem??0),0);m.hardened=Math.min(m.hardened,golems);}

/* ---------- actions ---------- */
export function elementAction(c:City,a:ElementAction,now:number):string|null{
 const m=c.magic!;if(c.era<8)return 'Cần vào thời Vương triều Nguyên tố.';
 if(a.type==='magicSpecialize'){
  if(!m.researched.includes('pact'))return 'Cần hoàn thành nghiên cứu Khế ước để chọn chuyên tu.';
  if(!Object.hasOwn(ELEMENT_NAMES,a.element))return 'Nguyên tố không hợp lệ.';
  if(c.battleId||(c.zombies?.actors.length??0)>0)return 'Không đổi chuyên tu khi đang có trận chiến.';
  const spec=m.specialization??={};
  if(spec.pending)return `Đang đổi sang chuyên tu ${ELEMENT_NAMES[spec.pending.element]}.`;
  if(spec.element===a.element)return 'Đang chuyên tu nguyên tố này.';
  if(!spec.element&&!m.cooldowns.specialized){spec.element=a.element;m.cooldowns.specialized=now;log(c,now,`Chọn chuyên tu ${ELEMENT_NAMES[a.element]}.`);return null;}
  if(c.res.rune<SPEC_SWITCH.rune||c.res.essence<SPEC_SWITCH.essence)return `Đổi chuyên tu cần ${SPEC_SWITCH.rune} phù văn + ${SPEC_SWITCH.essence} tinh chất.`;
  c.res.rune-=SPEC_SWITCH.rune;c.res.essence-=SPEC_SWITCH.essence;delete spec.element;spec.pending={element:a.element,doneAt:now+SPEC_SWITCH_MS};
  log(c,now,`Bắt đầu đổi chuyên tu sang ${ELEMENT_NAMES[a.element]}: 6 giờ, hiệu ứng cũ dừng ngay.`,'warn');return null;
 }
 const tile=a.y*W+a.x,b=c.b[tile];
 if(a.type==='magicHarmonize'){
  if(b?.k!=='harmonizer'||b.lvl<1)return 'Chọn Đài điều hòa đã xây xong.';
  const [x,y]=a.elements;if(a.elements.length!==2||x===y||!Object.hasOwn(ELEMENT_NAMES,x)||!Object.hasOwn(ELEMENT_NAMES,y))return 'Chọn đúng hai ấn nguyên tố khác loại.';
  (m.harmony??={})[magicSiteId(b)]=[x,y].sort() as Element[];return null;
 }
 if(b?.k!=='woodgrove'||!running(c,b))return 'Cần Mộc linh viên đang cấp ấn Mộc (đủ thợ, tinh chất và mana).';
 const max=TREANT.max+(magicSpecialization(c)==='wood'?1:0);
 if((m.treants?.length??0)+(m.treantQueue?.length??0)>=max)return `Tối đa ${max} linh mộc vận tải.`;
 for(const [r,n]of Object.entries(TREANT.cost) as [ResKey,number][])if(c.res[r]<n)return 'Linh mộc cần 100 gỗ + 20 phù văn + 10 tinh chất trong kho.';
 for(const [r,n]of Object.entries(TREANT.cost) as [ResKey,number][])c.res[r]-=n;
 const queue=m.treantQueue??=[];queue.push({doneAt:Math.max(now,queue.at(-1)?.doneAt??now)+TREANT.ms,grove:magicSiteId(b)});return null;
}

/* ---------- minute effects: specialization, cleanse, growth rain, harmonizer ---------- */
export function stepElements(c:City,to:number,entries:[number,Building][],staff:Map<number,number>){
 const m=c.magic!;let changed=false;
 const spec=m.specialization;if(spec?.pending&&to>=spec.pending.doneAt){spec.element=spec.pending.element;delete spec.pending;log(c,to,`Hoàn tất chuyên tu ${ELEMENT_NAMES[spec.element]}.`);changed=true;}
 for(const q of m.treantQueue??[])if(q.doneAt<=to){
  const grove=entries.find(([,b])=>magicSiteId(b)===q.grove);(m.treants??=[]).push({id:m.nextUid++,grove:q.grove,tile:grove?.[0]??c.camp,phase:'idle',route:[],at:to,nextAt:to,load:0,carried:0});changed=true;
 }
 if(m.treantQueue?.length)m.treantQueue=m.treantQueue.filter(q=>q.doneAt>to);
 for(const key of Object.keys(m.growth??{}))if(m.growth![key]<=to)delete m.growth![key];
 if(c.industry)for(const [,b]of entries)if(b.k==='harmonizer'&&running(c,b))c.industry.pollution=Math.max(0,c.industry.pollution-8/60);
 if(c.res.essence>=2&&cleanse(c,to,entries))changed=true;
 if(c.res.essence>=2&&growthRain(c,to,entries,staff))changed=true;
 return changed;
}
/** Tịnh hóa: ≥2 sick in ten tiles of a running Thủy temple, up to 8 cured, −4 pollution. */
function cleanse(c:City,at:number,entries:[number,Building][]){
 const m=c.magic!,spell=MAGIC_SPELLS.cleanse;if((m.cooldowns.cleanse??0)>at)return false;
 for(const [tile,b]of stations(c,entries,'watertemple')){
  const origin=point(tile),sick=c.people.filter(p=>p.vital?.infectedAt!==undefined&&distance(zombiePersonPosition(c,p,at),origin)<=spell.radius).sort((a,b)=>distance(zombiePersonPosition(c,a,at),origin)-distance(zombiePersonPosition(c,b,at),origin)||a.id-b.id);
  if(sick.length<2||'error'in spendMana(m.network,m.mana,magicSiteId(b),spell.mana))continue;
  c.res.essence-=2;for(const p of sick.slice(0,spell.targets))delete p.vital!.infectedAt;
  if(c.industry)c.industry.pollution=Math.max(0,c.industry.pollution-4);
  m.cooldowns.cleanse=at+spell.cooldown;log(c,at,`Thủy điện thờ thi triển Tịnh hóa: chữa ${Math.min(spell.targets,sick.length)} dân, giảm 4 ô nhiễm.`);return true;
 }
 return false;
}
/** Keep at least one Bão lửa worth of mana in the source for defence. */
const GROWTH_RESERVE=MAGIC_SPELLS.firestorm.mana;
/** Mưa sinh trưởng: up to four staffed fields in six tiles carry 50% larger food loads for an hour. */
function growthRain(c:City,at:number,entries:[number,Building][],staff:Map<number,number>){
 const m=c.magic!,spell=MAGIC_SPELLS.growthrain;if((m.cooldowns.growthrain??0)>at)return false;
 for(const [tile,b]of stations(c,entries,'woodgrove')){
  const fields=Object.entries(c.b).filter(([i,f])=>isField(f.k)&&operating(f)&&(staff.get(+i)??0)>0&&tileDistance(+i,tile)<=spell.radius).map(([i])=>+i).sort((a,b)=>tileDistance(a,tile)-tileDistance(b,tile)||a-b).slice(0,spell.targets);
  const primary=m.network.bindings[magicSiteId(b)]?.primary;
  if(!fields.length||!primary||(m.mana[primary]??0)<spell.mana+GROWTH_RESERVE||'error'in spendMana(m.network,m.mana,magicSiteId(b),spell.mana))continue;
  c.res.essence-=2;const growth=m.growth??={};for(const f of fields)growth[f]=at+spell.duration;
  m.cooldowns.growthrain=at+spell.cooldown;log(c,at,`Mộc linh viên gọi Mưa sinh trưởng cho ${fields.length} ruộng trong 1 giờ.`);return true;
 }
 return false;
}
/** Cân bằng 11/11: each food load hauled from a field under growth rain is 50% larger.
 * Fields are walk-bound (a staffed level-3 estate delivers ~10,000 food/h whatever its
 * rate), so the old flat +300 food/h (≈0.1% of the work rate) changed nothing. */
export const GROWTH_LOAD=1.5;
export const magicGrowth=(c:City,tile:number,at:number)=>(c.magic?.growth?.[tile]??0)>at?GROWTH_LOAD:1;

/* ---------- spirit-wood carriers ---------- */
export function treantsInTransit(c:City,tile:number,r:string){let n=0;for(const t of c.magic?.treants??[])if(t.target===tile&&t.resource===r&&t.phase!=='idle')n+=t.carried||t.load;return n;}
function storeFor(c:City,from:number,r:ResKey){
 const drops=[...Object.entries(c.b).filter(([,b])=>operating(b)&&B[b.k].drop?.includes(r)).map(([i])=>+i),c.camp];
 return drops.sort((a,b)=>tileDistance(a,from)-tileDistance(b,from)||a-b)[0];
}
/** Travel is paid when a leg starts (5 mana/h of walking) from the grove's
 * bound source. A dry source leaves the carrier waiting with its cargo. */
function leg(c:City,t:Treant,to:number,at:number){
 const route=zombiePath(c,t.tile,to,[],100,true);if(!route)return false;
 const ms=Math.max(SECOND,Math.ceil((route.length-1)/TREANT.speed)*SECOND);
 const m=c.magic!,spare=magicEntries(c).find(([,b])=>b.k==='woodgrove'&&operating(b))?.[1];
 // A carrier whose grove is gone draws from another operating grove's source.
 const id=m.network.bindings[t.grove]?.primary?t.grove:spare?magicSiteId(spare):undefined;
 if(!id||'error'in spendMana(m.network,m.mana,id,TREANT.manaPerHour*ms/HOUR))return false;
 t.route=route;t.at=at;t.nextAt=at+ms;return true;
}
export function stepTreants(c:City,nt:number){
 const m=c.magic!;let changed=false;
 if(m.walls?.length)m.walls=m.walls.filter(w=>w.until>nt&&w.hp>0);
 if(m.effects?.length)m.effects=m.effects.filter(e=>e.until>=nt);
 for(const t of m.treants??[]){
  if(t.nextAt>nt)continue;
  if(t.phase==='pickup'||t.phase==='deliver')t.tile=t.route.at(-1)??t.tile;
  if(t.phase==='idle'){
   const jobs=magicEntries(c).filter(([tile,b])=>PRODUCTION.has(b.k)&&operating(b)).map(([tile])=>({tile,need:magicSupplyNeed(c,tile,TREANT.load)})).filter(j=>j.need).sort((a,b)=>tileDistance(a.tile,t.tile)-tileDistance(b.tile,t.tile)||a.tile-b.tile);
   const job=jobs[0];if(!job){t.nextAt=nt+10*SECOND;continue;}
   const drop=storeFor(c,job.tile,job.need!.resource);
   if(!leg(c,t,drop,nt)){t.nextAt=nt+10*SECOND;continue;}
   Object.assign(t,{phase:'pickup',target:job.tile,resource:job.need!.resource,load:job.need!.amount,drop,carried:0});changed=true;continue;
  }
  if(t.phase==='pickup'){
   const r=t.resource!,store=c.b[t.drop!],ok=t.drop===c.camp||operating(store)&&!!B[store.k].drop?.includes(r);
   const amount=ok?Math.max(0,Math.min(t.load,c.res[r])):0;
   if(amount<=0){Object.assign(t,{phase:'idle',load:0,nextAt:nt});delete t.target;delete t.resource;continue;}
   c.res[r]-=amount;recordResourceFlow(c,nt,'spent',r,amount);t.carried=amount;t.phase='wait';
  }
  if(t.phase==='wait'){if(!leg(c,t,t.target!,nt)){t.nextAt=nt+10*SECOND;continue;}t.phase='deliver';changed=true;continue;}
  if(t.phase==='deliver'){
   const accepted=deliverMagicSupply(c,t.target!,t.resource!,t.carried);
   // A full or lost buffer: the rest goes back to stock (the store clamp applies).
   if(t.carried-accepted>1e-9)c.res[t.resource!]+=t.carried-accepted;
   Object.assign(t,{phase:'idle',carried:0,load:0,nextAt:nt});delete t.target;delete t.resource;delete t.drop;changed=true;
  }
 }
 return changed;
}

/* ---------- zombie defence spells and units ---------- */
const power=(c:City)=>magicSpecialization(c)==='fire'?1.1:1;
/** Bão lửa, Thạch bích and the burning area; called every combat second. */
export function elementSpells(c:City,at:number,zombies:Zombie[]){
 const m=c.magic!;if(m.effects?.length)m.effects=m.effects.filter(e=>e.until>=at);if(m.walls?.length)m.walls=m.walls.filter(w=>w.until>at&&w.hp>0);
 for(const e of m.effects??[])if(e.kind==='firestorm'&&at>e.start&&at<=e.until){const s=MAGIC_SPELLS.firestorm;
  for(const z of nearest(zombies.filter(z=>z.hp>0&&distance(z,e)<=s.radius),e,z=>z.id).slice(0,s.targets)){z.hp-=s.damage*power(c);z.hitAt=at;}}
 if(c.era<8||c.res.essence<2||!zombies.length)return;
 const entries=magicEntries(c);
 firestorm(c,at,zombies,entries);
 if(c.res.essence>=2)stonewall(c,at,zombies,entries);
}
function firestorm(c:City,at:number,zombies:Zombie[],entries:[number,Building][]){
 const m=c.magic!,s=MAGIC_SPELLS.firestorm;if((m.cooldowns.firestorm??0)>at)return;
 for(const [tile,b]of stations(c,entries,'firealtar')){
  const origin=point(tile),center=nearest(zombies.filter(z=>z.hp>0&&distance(z,origin)<=6),origin,z=>z.id).find(z=>zombies.filter(o=>o.hp>0&&distance(o,z)<=s.radius).length>=4);
  if(!center||'error'in spendMana(m.network,m.mana,magicSiteId(b),s.mana))continue;
  c.res.essence-=2;(m.effects??=[]).push({kind:'firestorm',x:center.x,y:center.y,start:at,until:at+s.duration});m.cooldowns.firestorm=at+s.cooldown;return;
 }
}
export const magicWallAt=(c:City,tile:number)=>!!c.magic?.walls?.some(w=>w.tile===tile);
/** Thạch bích: up to three empty tiles across the leading zombie's path, only
 * when every zombie in range still has some route to the hall afterwards. */
function stonewall(c:City,at:number,zombies:Zombie[],entries:[number,Building][]){
 const m=c.magic!,s=MAGIC_SPELLS.stonewall;if((m.cooldowns.stonewall??0)>at)return;
 for(const [tile,b]of stations(c,entries,'earthtemple')){
  const origin=point(tile),near=nearest(zombies.filter(z=>z.hp>0&&distance(z,origin)<=s.radius),origin,z=>z.id);if(near.length<3)continue;
  const occupied=new Set<number>([...zombies.map(tileOf),...(c.zombies?.guards??[]).map(tileOf),...c.people.map(p=>tileOf(zombiePersonPosition(c,p,at)))]);
  const free=(t:number)=>t>=0&&t<W*W&&!c.b[t]&&(c.t[t]===0||c.t[t]===1)&&!occupied.has(t)&&!magicWallAt(c,t)&&tileDistance(t,tile)<=s.radius;
  const lead=near[0],path=lead.path??[];let wall:number[]=[];
  for(let i=1;i<path.length&&!wall.length;i++){const t=path[i];if(!free(t))continue;const step=Math.abs(t-path[i-1])===1?W:1;wall=[t,t-step,t+step].filter(free).slice(0,s.targets);}
  if(!wall.length)continue;
  const placed=wall.map(t=>({tile:t,hp:200,until:at+s.duration})),before=m.walls??[];m.walls=[...before,...placed];
  const goal=hallTile(c),sealed=near.some(z=>zombiePath(c,tileOf(z),goal,[],100,false)===null);
  if(sealed||'error'in spendMana(m.network,m.mana,magicSiteId(b),s.mana)){m.walls=before;continue;}
  c.res.essence-=2;m.cooldowns.stonewall=at+s.cooldown;for(const z of zombies){delete z.path;z.repath=at;}return;
 }
}
/** A zombie with no route hits an adjacent temporary wall. */
export function hitMagicWall(c:City,z:Zombie,at:number,damage:number,attackMs:number){
 const wall=c.magic?.walls?.filter(w=>distance(point(w.tile),z)<=1.6).sort((a,b)=>a.tile-b.tile)[0];if(!wall||z.nextHit>at)return !!wall;
 wall.hp-=damage;z.nextHit=Math.max(z.nextHit,at-attackMs)+attackMs;z.hitAt=at;if(wall.hp<=0)c.magic!.walls=c.magic!.walls!.filter(w=>w!==wall);return true;
}
/** Linh lộc escort: up to four allies within three tiles take 10% less; never stacks. */
export function magicEscort(guards:ZombieGuard[],target:ZombieGuard){
 for(const deer of guards)if(deer.u==='spiritdeer'&&deer.hp>0&&deer!==target&&distance(deer,target)<=3&&nearest(guards.filter(g=>g!==deer&&g.hp>0&&distance(g,deer)<=3),deer,g=>g.id).slice(0,4).includes(target))return .9;
 return 1;
}
/** Essence forge mana: 30 per 12 essence, paid per carried load from its bound source. */
const cargoRate=(k:string)=>{const d=k in B&&magicDef(k as MagicBuilding);return d&&d.mana&&d.output?d.mana/Object.values(d.output)[0]!:0;};
export function magicCargoLimit(c:City,b:Building){
 const rate=cargoRate(b.k),m=c.magic;if(!rate)return Infinity;if(!m)return 0;
 const binding=m.network.bindings[magicSiteId(b)];if(!binding?.primary)return 0;
 const backup=binding.backup&&m.network.sources[binding.backup]&&m.network.sources[binding.backup].used<m.network.sources[binding.backup].slots?m.mana[binding.backup]??0:0;
 return Math.max(m.mana[binding.primary]??0,backup)/rate;
}
export function chargeMagicCargo(c:City,b:Building,amount:number){const rate=cargoRate(b.k);if(!rate||!(amount>0)||!c.magic)return;const debit=spendMana(c.magic.network,c.magic.mana,magicSiteId(b),amount*rate);if(!('error'in debit)&&c.magic.craft&&craftActive(c))recordCraftMana(c,debit.source,amount*rate);}
