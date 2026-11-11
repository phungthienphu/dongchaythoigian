/** Era 9 (Kỷ nguyên Thần thoại) rules: contracts and beasts, prepared spell
 * packages (Thiên lôi, Hộ giới), Thiên nhãn, teleport docks and the domains
 * after Thiên Cung Sông Mẹ. Called from magic.ts and zombies.ts at absolute
 * seconds/minutes so online, offline and chunked settlement agree. Functions
 * only: this module sits in the engine import cycle. */
import {UNITS,hallLevel,type City,type Building,type BKey,type UKey,type ResKey,type Troops} from './engine';
import {spendMana} from './mana-network';
import type {MagicFactory} from './magic-production';
import {MAGIC_SPELLS,type Contract,type Element} from './magic-data';
import {recordResourceFlow} from './resource-history';
import type {Zombie,ZombieGuard} from './zombies';
import {PRODUCTION,deliverMagicSupply,distance,due,live,log,magicEntries,magicGuardHp,magicSiteId,nearest,operating,tileDistance} from './magic';
import {ELEMENT_NAMES,magicEscort} from './magic-elements';
const SECOND=1000,MINUTE=60*SECOND,HOUR=60*MINUTE,W=96;
export type PackageSpell='thunder'|'sanctuary';
export type Domain='river'|'citadel'|'crafts';
export const CONTRACT_NAMES:Record<Contract,string>={dragon:'Long',tortoise:'Quy',phoenix:'Phượng'};
export const DOMAIN_NAMES:Record<Domain,string>={river:'Sông Thiêng',citadel:'Thành Trì Linh Giới',crafts:'Bách Nghệ'};
export const PACKAGE_SPELLS:readonly PackageSpell[]=['thunder','sanctuary'];
/** A prepared spell package lives in one world matrix (by uid). `away` marks a
 * package snapshotted into a PvP battle: it still counts toward the cap and
 * expires on time, but cannot be used at home until the battle settles. */
export type MagicPackage={id:number;spell:PackageSpell;matrix:number;preparedAt:number;expiresAt:number;away?:string};
/** Goods left the village stock at dispatch and ride the trip (by dock uid). */
export type Shipment={id:number;from:number;to:number;resource:ResKey;amount:number;arriveAt:number};
export type MythState={
 contract?:{active?:Contract;pending?:{contract:Contract;doneAt:number}};
 packages?:MagicPackage[];
 /** Thiên lôi warning zones (strike at `until`) and Hộ giới areas (active until `until`). */
 mythEffects?:{id:number;kind:PackageSpell;x:number;y:number;start:number;until:number}[];
 /** Zombie wave index in which each package type was used: one per type per wave. */
 waveSpells?:Partial<Record<PackageSpell,number>>;
 dockPairs?:[number,number][];
 shipments?:Shipment[];
 domain?:{active?:Domain;pending?:{domain:Domain;doneAt:number};chosen?:true};
 /** Bách Nghệ ledger: ordinary production mana spent per source in the current hour. */
 craft?:{hourAt:number;spent:Record<string,number>};
};
export type MythAction={type:'magicContract';contract:Contract}|{type:'magicPrepare';spell:PackageSpell}|{type:'magicDockPair';x:number;y:number;to:number}|{type:'magicTeleport';x:number;y:number;resource:ResKey;amount:number}|{type:'magicDomain';domain:Domain};
export const MYTH_ACTIONS=new Set(['magicContract','magicPrepare','magicDockPair','magicTeleport','magicDomain']);
const CONTRACT_SWITCH={celestialStone:200,essence:100},CONTRACT_SWITCH_MS=12*HOUR;
const DOMAIN_SWITCH={rune:100,celestialStone:40},DOMAIN_SWITCH_MS=6*HOUR;
export const PACKAGE_TTL=24*HOUR,MAX_PACKAGES=2,BEAST_SLOTS=4;
export const PACKAGE_SEALS:Record<PackageSpell,Element[]>={thunder:['fire','water'],sanctuary:['wood','earth']};
export const TELEPORT={max:60,ms:30*SECOND,cooldown:2*MINUTE,mana:20,rune:1};
export const EYE_WARNING=180*SECOND;
export const BEAST_HEAL={every:10*SECOND,amount:60,radius:3,targets:4};
export const TORTOISE_COVER={radius:2,targets:4,reduction:.15};
/** Damage reductions of different names add up, capped at 30% (spec 2.3). */
export const MAX_REDUCTION=.3;
export const BEASTS=['dragon','tortoise','phoenix'] as const satisfies readonly UKey[];
const sorted=(c:City,k:BKey)=>Object.entries(c.b).filter(([,b])=>b.k===k&&b.lvl>=1).map(([t,b])=>[+t,b] as [number,Building]).sort((a,b)=>a[0]-b[0]);
export function byUid(c:City,uid:number):[number,Building]|undefined{for(const [t,b]of Object.entries(c.b))if(b.uid===uid&&b.lvl>=1)return [+t,b];return undefined;}
const sealsOf=(c:City,b:Building)=>c.magic?.seals?.[magicSiteId(b)]??[];
const running=(c:City,b:Building)=>{const f=c.magic?.factories[magicSiteId(b)];return operating(b)&&!!f&&f.enabled&&!f.blocked;};
export const gateActive=(c:City)=>sorted(c,'spiritgate').some(([,b])=>operating(b)&&sealsOf(c,b).includes('water')&&sealsOf(c,b).includes('earth'));
export const altarActive=(c:City)=>sorted(c,'covenantaltar').some(([,b])=>operating(b));
/** A world matrix works with a bound mana source and two different seals. */
export const matrixActive=(c:City,b:Building)=>operating(b)&&!!c.magic?.network.bindings[magicSiteId(b)]?.primary&&new Set(sealsOf(c,b)).size>=2;
/** Thiên nhãn: a staffed observatory that paid its 20 mana/h last minute. */
export const eyeActive=(c:City)=>!!c.magic&&sorted(c,'observatory').some(([,b])=>running(c,b));
export function domainActive(c:City,d:Domain){return c.magic?.domain?.active===d&&sorted(c,'riverpalace').some(([,b])=>running(c,b));}
/** Sông Thiêng: bed caps ×1.5 rounded down. */
export const careCapacity=(c:City,base:number)=>c.magic?.domain?.active==='river'&&domainActive(c,'river')?Math.floor(base*1.5):base;
/** Thành Trì Linh Giới: patrol chase radius 10→14 and +20% speed toward alerts. */
export const patrolReach=(c:City)=>c.magic?.domain?.active==='citadel'&&domainActive(c,'citadel')?{radius:14,speed:1.2}:{radius:10,speed:1};

/* ---------- seals, conditions, placement, training ---------- */
export function mythSealNeeds(b:Building):Element[]|undefined{
 if(b.k==='spiritgate')return ['water','earth'];
 if(b.k==='worldmatrix')return ['earth','fire','water','wood'];// any two different seals
 return undefined;
}
export function mythConditions(c:City,f:MagicFactory):string|undefined{
 const m=c.magic!;
 if(f.kind==='observatory'&&!m.researched.includes('gatecraft'))return 'Cần nghiên cứu Khai giới để duy trì Thiên nhãn.';
 if(f.kind==='riverpalace'&&!m.domain?.active)return m.domain?.pending?'Đang đổi lãnh địa, hiệu ứng cũ đã dừng.':'Chưa chọn lãnh địa.';
 return undefined;
}
export function mythBuildError(c:City,k:BKey):string|null{
 if(k!=='riverpalace')return null;
 if(hallLevel(c)<9)return 'Cần Đình làng cấp 9 đang hoạt động.';
 if(c.people.length<950)return `Cần 950 dân, còn thiếu ${950-c.people.length}.`;
 if(!c.magic?.contract?.active)return 'Cần một khế ước đang hiệu lực.';
 if(!gateActive(c))return 'Cần Cổng Linh giới hoạt động có ấn Thủy + Thổ.';
 if(!sorted(c,'worldmatrix').some(([,b])=>matrixActive(c,b)))return 'Cần Trận đồ thiên địa hoạt động (hai ấn khác loại, có nguồn mana).';
 return null;
}
const slots=(t:Troops)=>BEASTS.reduce((n,u)=>n+(t[u]??0)*(UNITS[u].beastSlots??0),0);
/** Beasts at home, marching, on expeditions and in training all hold slots. */
export function beastSlotsUsed(c:City){return slots(c.army)+slots(c.deployedArmy??{})+c.exps.reduce((n,e)=>n+slots(e.units),0)+c.queue.reduce((n,q)=>n+(UNITS[q.u].beastSlots??0),0);}
export function mythTrainingError(c:City,u:UKey,n:number):string|null{
 const unit=UNITS[u];if(!unit.contract)return null;
 if(c.magic?.contract?.active!==unit.contract)return `Cần khế ước ${CONTRACT_NAMES[unit.contract]} đang hiệu lực để huấn luyện ${unit.n}.`;
 if(!altarActive(c))return 'Cần Đài khế ước hoạt động để cấp chỗ thần thú.';
 const used=beastSlotsUsed(c),need=n*(unit.beastSlots??0);
 if(used+need>BEAST_SLOTS)return `Chỗ thần thú đã dùng ${used}/${BEAST_SLOTS}; mỗi ${unit.n} cần ${unit.beastSlots}, tối đa 2 thần thú.`;
 return null;
}

/* ---------- actions ---------- */
function pay(c:City,goods:Partial<Record<ResKey,number>>,at:number){for(const [r,n]of Object.entries(goods) as [ResKey,number][]){c.res[r]-=n;recordResourceFlow(c,at,'spent',r,n);}}
const afford=(c:City,goods:Partial<Record<ResKey,number>>)=>(Object.entries(goods) as [ResKey,number][]).every(([r,n])=>c.res[r]>=n);
const fighting=(c:City)=>!!c.battleId||(c.zombies?.actors.length??0)>0;
export function mythAction(c:City,a:MythAction,now:number):string|null{
 const m=c.magic!;if(c.era<9)return 'Cần vào Kỷ nguyên Thần thoại.';
 if(a.type==='magicContract'){
  if(!Object.hasOwn(CONTRACT_NAMES,a.contract))return 'Khế ước không hợp lệ.';
  const state=m.contract;if(!state?.active&&!state?.pending)return 'Cần nghiên cứu khế ước đầu tiên tại Đài khế ước.';
  if(state.pending)return `Đang đổi sang khế ước ${CONTRACT_NAMES[state.pending.contract]}.`;
  if(state.active===a.contract)return 'Khế ước này đang hiệu lực.';
  if(fighting(c))return 'Không đổi khế ước khi đang có trận chiến.';
  if(beastSlotsUsed(c)>0)return 'Thu hồi mọi thần thú trước (giải tán quân ở nhà, chờ quân xuất chinh và lượt huấn luyện xong); không hoàn phí.';
  if(!altarActive(c))return 'Cần Đài khế ước hoạt động.';
  if(!afford(c,CONTRACT_SWITCH))return 'Đổi khế ước cần 200 thiên thạch + 100 tinh chất.';
  pay(c,CONTRACT_SWITCH,now);delete state.active;state.pending={contract:a.contract,doneAt:now+CONTRACT_SWITCH_MS};
  log(c,now,`Bắt đầu nghiên cứu khế ước ${CONTRACT_NAMES[a.contract]}: 12 giờ, khế ước cũ dừng ngay.`,'warn');return null;
 }
 if(a.type==='magicPrepare'){
  if(!PACKAGE_SPELLS.includes(a.spell))return 'Gói đại phép không hợp lệ.';
  const spell=MAGIC_SPELLS[a.spell],list=m.packages??=[];
  if(list.length>=MAX_PACKAGES)return `Tối đa ${MAX_PACKAGES} gói đại phép mỗi làng (kể cả gói đang mang theo trận).`;
  const need=PACKAGE_SEALS[a.spell],matrix=sorted(c,'worldmatrix').find(([,b])=>matrixActive(c,b)&&need.every(e=>sealsOf(c,b).includes(e)));
  if(!matrix)return `Cần Trận đồ thiên địa hoạt động có ấn ${need.map(e=>ELEMENT_NAMES[e]).join(' + ')} và nguồn mana.`;
  if(!afford(c,spell.goods))return `${spell.name} cần ${spell.goods.celestialStone} thiên thạch trong kho.`;
  const debit=spendMana(m.network,m.mana,magicSiteId(matrix[1]),spell.mana);if('error'in debit)return `Thiếu ${spell.mana} mana: ${debit.error}`;
  pay(c,spell.goods,now);list.push({id:m.nextUid++,spell:a.spell,matrix:matrix[1].uid!,preparedAt:now,expiresAt:now+PACKAGE_TTL});
  log(c,now,`Trận đồ chuẩn bị gói ${spell.name}; giữ tối đa 24 giờ.`);return null;
 }
 if(a.type==='magicDockPair'){
  const from=c.b[a.y*W+a.x],to=c.b[a.to];
  if(from?.k!=='teleportdock'||to?.k!=='teleportdock'||from.lvl<1||to.lvl<1||from===to)return 'Chọn hai Bến dịch chuyển khác nhau đã xây xong.';
  const pair=[from.uid!,to.uid!].sort((x,y)=>x-y) as [number,number];
  m.dockPairs=[...(m.dockPairs??[]).filter(p=>!p.includes(pair[0])&&!p.includes(pair[1])),pair];return null;
 }
 if(a.type==='magicTeleport'){
  const from=c.b[a.y*W+a.x];if(from?.k!=='teleportdock'||!operating(from))return 'Chọn Bến dịch chuyển đang hoạt động.';
  const pair=m.dockPairs?.find(p=>p.includes(from.uid!));if(!pair)return 'Bến chưa được ghép cặp.';
  const dest=byUid(c,pair[0]===from.uid?pair[1]:pair[0]);if(!dest||!operating(dest[1]))return 'Bến đích không hoạt động.';
  if(!m.network.bindings[magicSiteId(from)]?.primary||!m.network.bindings[magicSiteId(dest[1])]?.primary)return 'Cả hai bến cần nối nguồn mana.';
  const key=`dock:${pair.join('-')}`;if((m.cooldowns[key]??0)>now)return `Cặp bến đang hồi, còn ${Math.ceil((m.cooldowns[key]-now)/SECOND)} giây.`;
  if(!Number.isSafeInteger(a.amount)||a.amount<1||a.amount>TELEPORT.max)return `Mỗi chuyến chuyển 1–${TELEPORT.max} hàng.`;
  if(!(a.resource in c.res))return 'Loại hàng không hợp lệ.';
  const goods:Partial<Record<ResKey,number>>={[a.resource]:a.amount};goods.rune=(goods.rune??0)+TELEPORT.rune;
  if(!afford(c,goods))return `Thiếu hàng trong kho: cần ${a.amount} hàng và 1 phù văn mỗi chuyến.`;
  const debit=spendMana(m.network,m.mana,magicSiteId(from),TELEPORT.mana);if('error'in debit)return `Thiếu ${TELEPORT.mana} mana: ${debit.error}`;
  pay(c,goods,now);m.cooldowns[key]=now+TELEPORT.cooldown;
  (m.shipments??=[]).push({id:m.nextUid++,from:from.uid!,to:dest[1].uid!,resource:a.resource,amount:a.amount,arriveAt:now+TELEPORT.ms});return null;
 }
 // magicDomain
 if(!Object.hasOwn(DOMAIN_NAMES,a.domain))return 'Lãnh địa không hợp lệ.';
 if(!sorted(c,'riverpalace').some(([,b])=>operating(b)))return 'Cần Thiên Cung Sông Mẹ đã hoàn thành và còn hoạt động.';
 if(fighting(c))return 'Không đổi lãnh địa khi đang có trận chiến.';
 const state=m.domain??={};
 if(state.pending)return `Đang đổi sang ${DOMAIN_NAMES[state.pending.domain]}.`;
 if(state.active===a.domain)return 'Lãnh địa này đang hoạt động.';
 if(!state.chosen){state.active=a.domain;state.chosen=true;delete m.craft;log(c,now,`Thiên Cung chọn lãnh địa ${DOMAIN_NAMES[a.domain]}.`);return null;}
 if(!afford(c,DOMAIN_SWITCH))return 'Đổi lãnh địa cần 100 phù văn + 40 thiên thạch.';
 pay(c,DOMAIN_SWITCH,now);delete state.active;delete m.craft;state.pending={domain:a.domain,doneAt:now+DOMAIN_SWITCH_MS};
 log(c,now,`Bắt đầu đổi lãnh địa sang ${DOMAIN_NAMES[a.domain]}: 6 giờ, không giữ hai hiệu ứng.`,'warn');return null;
}

/* ---------- settlement ---------- */
/** Destination dock: buffers of magic buildings in six tiles first, the rest to
 * stock. Destination lost: back to the origin dock if it still exists; both lost:
 * the parcel is gone, logged once. A rebuilt dock (new uid) never receives it. */
function arrive(c:City,s:Shipment,at:number){
 const dest=byUid(c,s.to),origin=byUid(c,s.from);
 if(dest){
  let left=s.amount;
  const near=magicEntries(c).filter(([t,b])=>PRODUCTION.has(b.k)&&operating(b)&&tileDistance(t,dest[0])<=6).sort((a,b)=>tileDistance(a[0],dest[0])-tileDistance(b[0],dest[0])||a[0]-b[0]);
  for(const [t]of near){if(left<=1e-9)break;left-=deliverMagicSupply(c,t,s.resource,left);}
  if(left>1e-9){c.res[s.resource]+=left;recordResourceFlow(c,at,'received',s.resource,left);}
  return;
 }
 if(origin){c.res[s.resource]+=s.amount;recordResourceFlow(c,at,'received',s.resource,s.amount);log(c,at,`Bến đích đã mất: ${s.amount} hàng dịch chuyển quay về bến gốc.`,'warn');return;}
 log(c,at,`Cả hai bến dịch chuyển đã mất: mất kiện ${s.amount} hàng đang chuyển.`,'warn');
}
/** Every second: package expiry and shipment arrival (breakpoints for offline). */
export function stepMythSecond(c:City,nt:number){
 const m=c.magic!;let changed=false;
 if(m.packages?.length&&m.packages.some(p=>p.expiresAt<=nt)){const n=m.packages.filter(p=>p.expiresAt<=nt).length;m.packages=m.packages.filter(p=>p.expiresAt>nt);log(c,nt,`${n} gói đại phép hết hạn sau 24 giờ; không hoàn phí.`,'warn');changed=true;}
 // Unresolved warnings fizzle once combat stops; combat at `nt` still resolves until===nt.
 if(m.mythEffects?.length)m.mythEffects=m.mythEffects.filter(e=>e.until>=nt);
 if(m.shipments?.some(s=>s.arriveAt<=nt)){
  const due=m.shipments.filter(s=>s.arriveAt<=nt).sort((a,b)=>a.arriveAt-b.arriveAt||a.id-b.id);m.shipments=m.shipments.filter(s=>s.arriveAt>nt);
  for(const s of due)arrive(c,s,nt);changed=true;
 }
 return changed;
}
/** Minute boundary: contract/domain switches finish, packages in a destroyed matrix are lost. */
export function stepMythMinute(c:City,to:number,entries:[number,Building][]){
 const m=c.magic!;let changed=false;
 const contract=m.contract;if(contract?.pending&&to>=contract.pending.doneAt){contract.active=contract.pending.contract;delete contract.pending;log(c,to,`Khế ước ${CONTRACT_NAMES[contract.active]} có hiệu lực.`);changed=true;}
 const domain=m.domain;if(domain?.pending&&to>=domain.pending.doneAt){domain.active=domain.pending.domain;delete domain.pending;log(c,to,`Lãnh địa ${DOMAIN_NAMES[domain.active]} có hiệu lực.`);changed=true;}
 if(m.packages?.length){const alive=new Set(entries.map(([,b])=>b.uid));const lost=m.packages.filter(p=>!p.away&&!alive.has(p.matrix));
  if(lost.length){m.packages=m.packages.filter(p=>!lost.includes(p));log(c,to,`Trận đồ thiên địa bị phá: mất ${lost.length} gói đại phép.`,'warn');changed=true;}}
 return changed;
}
/** Bách Nghệ ledger and the hourly refund: 10% of last hour's ordinary
 * production mana back into the same source, up to its free space. The refund
 * is credited directly and never recorded, so it cannot feed itself. */
export function craftActive(c:City){return c.magic?.domain?.active==='crafts'&&domainActive(c,'crafts');}
export function recordCraftMana(c:City,source:string,amount:number){const craft=c.magic?.craft;if(craft&&amount>0)craft.spent[source]=(craft.spent[source]??0)+amount;}
export function settleCraft(c:City,to:number,active:boolean){
 const m=c.magic!,hour=Math.floor(to/HOUR)*HOUR;
 if(m.craft&&hour>m.craft.hourAt){
  if(active)for(const [source,spent]of Object.entries(m.craft.spent).sort((a,b)=>a[0].localeCompare(b[0]))){const capacity=m.network.sources[source]?.capacity;if(capacity===undefined||!(source in m.mana))continue;m.mana[source]+=Math.max(0,Math.min(spent*.1,capacity-m.mana[source]));}
  delete m.craft;
 }
 if(active&&!m.craft)m.craft={hourAt:hour,spent:{}};
 if(!active&&m.craft)delete m.craft;
}

/* ---------- zombie defence: beasts and spell packages ---------- */
const covered=(guards:ZombieGuard[],target:ZombieGuard)=>guards.some(t=>t.u==='tortoise'&&t.hp>0&&t!==target&&distance(t,target)<=TORTOISE_COVER.radius&&nearest(guards.filter(g=>g!==t&&g.hp>0&&distance(g,t)<=TORTOISE_COVER.radius),t,g=>g.id).slice(0,TORTOISE_COVER.targets).includes(target));
const sheltered=(c:City,p:{x:number;y:number},at:number)=>!!c.magic?.mythEffects?.some(e=>e.kind==='sanctuary'&&e.start<=at&&at<e.until&&distance(e,p)<=MAGIC_SPELLS.sanctuary.radius);
/** Multiplier on zombie damage to a home guard: Linh lộc 10%, Huyền Quy 15%, Hộ giới 25%, at most 30% together. */
export function guardDamageScale(c:City,guards:ZombieGuard[],target:ZombieGuard,at:number){
 let reduction=magicEscort(guards,target)<1?.1:0;
 if(covered(guards,target))reduction+=TORTOISE_COVER.reduction;
 if(sheltered(c,target,at))reduction+=MAGIC_SPELLS.sanctuary.reduction;
 return 1-Math.min(MAX_REDUCTION,reduction);
}
/** Thanh Long: two more zombies within its reach (nearest the target, then id) take 50%. */
export function beastStrike(g:ZombieGuard,target:Zombie,at:number,actors:Zombie[]){
 if(g.u!=='dragon')return;const unit=UNITS.dragon,hit=unit.atk*unit.attackMs!/1000*.5;
 for(const z of nearest(actors.filter(z=>z!==target&&live(z,at)&&distance(z,g)<=unit.range!),target,z=>z.id).slice(0,2)){z.hp-=hit;z.hitAt=at;}
}
const packageReady=(c:City,spell:PackageSpell,at:number)=>{const m=c.magic!,wave=c.zombies?.index??0;if(m.waveSpells?.[spell]===wave)return undefined;return m.packages?.find(p=>p.spell===spell&&!p.away&&p.expiresAt>at&&!!byUid(c,p.matrix));};
const use=(c:City,p:MagicPackage)=>{const m=c.magic!;m.packages=m.packages!.filter(o=>o!==p);(m.waveSpells??={})[p.spell]=c.zombies?.index??0;};
/** Phượng Hoàng heals, Thiên lôi strikes after its 5 s warning, then automatic
 * package casts with the spec thresholds (≥4 enemies / ≥4 guards below half HP). */
export function mythDefense(c:City,at:number,zombies:Zombie[],guards:ZombieGuard[]){
 const m=c.magic!;
 if(due(at,BEAST_HEAL.every))for(const p of guards)if(p.u==='phoenix'&&p.hp>0)
  for(const g of nearest(guards.filter(g=>g!==p&&g.hp>0&&g.hp<magicGuardHp(c,g)&&distance(g,p)<=BEAST_HEAL.radius),p,g=>g.id).slice(0,BEAST_HEAL.targets))g.hp=Math.min(magicGuardHp(c,g),g.hp+BEAST_HEAL.amount);
 if(m.mythEffects?.length){
  const thunder=MAGIC_SPELLS.thunder;
  for(const e of m.mythEffects)if(e.kind==='thunder'&&e.until===at)for(const z of nearest(zombies.filter(z=>z.hp>0&&distance(z,e)<=thunder.radius),e,z=>z.id).slice(0,thunder.targets)){z.hp-=thunder.damage;z.hitAt=at;}
  m.mythEffects=m.mythEffects.filter(e=>e.until>at);
 }
 if(!m.packages?.length||!zombies.length)return;
 const bolt=packageReady(c,'thunder',at);
 if(bolt){const s=MAGIC_SPELLS.thunder,seen=zombies.filter(z=>z.hp>0&&c.seen[Math.floor(z.y)*W+Math.floor(z.x)]);
  const center=seen.slice().sort((a,b)=>a.id-b.id).find(z=>seen.filter(o=>distance(o,z)<=s.radius).length>=4);
  if(center){use(c,bolt);(m.mythEffects??=[]).push({id:m.nextUid++,kind:'thunder',x:center.x,y:center.y,start:at,until:at+s.windup});log(c,at,'Trận đồ gọi Thiên lôi: vùng báo 2 ô, sét đánh sau 5 giây.');}}
 const ward=packageReady(c,'sanctuary',at);
 if(ward){const wounded=guards.filter(g=>g.hp>0&&g.hp<magicGuardHp(c,g)/2);
  if(wounded.length>=4){const s=MAGIC_SPELLS.sanctuary,score=(g:ZombieGuard)=>wounded.filter(o=>distance(o,g)<=s.radius).length;
   const center=wounded.slice().sort((a,b)=>score(b)-score(a)||a.id.localeCompare(b.id))[0];
   use(c,ward);(m.mythEffects??=[]).push({id:m.nextUid++,kind:'sanctuary',x:center.x,y:center.y,start:at,until:at+s.duration});log(c,at,'Trận đồ dựng Hộ giới: quân trong 4 ô giảm 25% sát thương trong 15 giây.');}}
}

/* ---------- PvP packages ---------- */
/** Take at most one ready package of each requested type into battle `battle`. */
export function reservePackages(c:City,battle:string,at:number,wanted:readonly PackageSpell[]=PACKAGE_SPELLS):PackageSpell[]{
 const m=c.magic;if(!m?.packages?.length)return [];const out:PackageSpell[]=[];
 for(const spell of PACKAGE_SPELLS){if(!wanted.includes(spell))continue;const p=m.packages.filter(p=>p.spell===spell&&!p.away&&p.expiresAt>at&&byUid(c,p.matrix)).sort((a,b)=>a.expiresAt-b.expiresAt||a.id-b.id)[0];if(p){p.away=battle;out.push(spell);}}
 return out;
}
/** Used packages are spent; unused ones come home if they have not expired meanwhile. */
export function releasePackages(c:City,battle:string,used:readonly string[]){
 const m=c.magic;if(!m?.packages?.length)return;
 m.packages=m.packages.filter(p=>!(p.away===battle&&used.includes(p.spell)));
 for(const p of m.packages)if(p.away===battle)delete p.away;
}
export const parsePackageSpells=(input:unknown):PackageSpell[]=>Array.isArray(input)?PACKAGE_SPELLS.filter(s=>input.includes(s)):[];
