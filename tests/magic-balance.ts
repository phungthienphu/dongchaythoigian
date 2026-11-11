/** Era 7–9 balance simulation (manual, no database or network). Builds a
 * representative walled village from game content only, then settles it
 * offline with the real engine (`settle`: hauling, food, power, magic, zombies).
 *
 *   bun tests/magic-balance.ts village 450 7 [days=14] [--no-magic] [--json=out.json]
 *   bun tests/magic-balance.ts pvp
 *
 * Damage, kills and mana are attributed by instrumenting the zombie and mana
 * objects (stack of the function that changed them); the engine is unchanged. */
import {readFileSync,writeFileSync} from 'node:fs';
import {B,F,G,HL,COAL,R,HOUR,MIN,RES,UNITS,W,idx,newCity,settle,stats,derive,type BKey,type City,type Res,type Troops,type UKey} from '../lib/engine';
import {initializeMedieval} from '../lib/medieval';
import {initializeIndustry} from '../lib/industry';
import {initializeModern} from '../lib/modern';
import {initializeMagic,magicSiteId,SOURCES} from '../lib/magic';
import {MAGIC_BUILDINGS,MAGIC_ERA_REQUIREMENTS,MAGIC_HALL_UPGRADES,MAGIC_SPELLS,type MagicBuilding} from '../lib/magic-data';
import {activateZombies,zombieWave,type ZombieState} from '../lib/zombies';
import {mythAction} from '../lib/magic-myth';
import {advanceBattle,createBattle,unitHp,type BattleGroup,type BattleState} from '../lib/battle';

const DAY=24*HOUR;
/* ---------------- instrumentation ---------------- */
const zombieSource=readFileSync(new URL('../lib/zombies.ts',import.meta.url),'utf8').split('\n');
const TOWER_LINE=zombieSource.findIndex(l=>l.includes('target.hp-=weapon.damage'))+1;
type Tally={damage:Record<string,number>;kills:Record<string,number>;mana:Record<string,number>;income:number;spawned:number};
const tally=():Tally=>({damage:{},kills:{},mana:{},income:0,spawned:0});
let T=tally();
const add=(o:Record<string,number>,k:string,v:number)=>{o[k]=(o[k]??0)+v;};
const MAGIC_UNITS=new Set<UKey>(['firemage','watermage','golem','spiritdeer','dragon','tortoise','phoenix']);
let hitByAmount=new Map<string,string>();
function setArmyHits(army:Troops){hitByAmount=new Map();for(const u of Object.keys(army) as UKey[]){const s=UNITS[u],key=(s.atk*(s.attackMs??1000)/1000).toFixed(3);if(hitByAmount.has(key)&&hitByAmount.get(key)!==u)throw new Error(`ambiguous hit ${key}: ${u}/${hitByAmount.get(key)}`);hitByAmount.set(key,u);}}
function damageSource(amount:number):string{
 const stack=new Error().stack??'';
 if(stack.includes('mythDefense'))return 'Thiên lôi';
 if(stack.includes('elementSpells'))return 'Bão lửa';
 if(stack.includes('beastStrike'))return 'Thanh Long (đòn lan)';
 if(stack.includes('mageAction'))return 'Hỏa cầu';
 if(stack.includes('magicStructureDefense')){const close=(n:number)=>Math.abs(amount-n)<1e-6;return close(MAGIC_SPELLS.lightpulse.damage)?'Linh quang':close(MAGIC_SPELLS.firecircle.damage)?'Hỏa trận':'phép công trình';}
 const line=stack.match(/zombies\.ts:(\d+)/)?.[1];if(line&&+line===TOWER_LINE)return 'tháp canh';
 const u=hitByAmount.get(amount.toFixed(3));return u?`quân ${u}`:'khác';
}
const isMagicSource=(k:string)=>!k.startsWith('quân ')&&k!=='tháp canh'&&k!=='khác'||MAGIC_UNITS.has(k.slice(5) as UKey);
function wrapZombie(z:{hp:number}&Record<string,unknown>){
 if(z.__w)return z;let hp=z.hp;T.spawned++;
 Object.defineProperty(z,'__w',{value:true,enumerable:false});
 Object.defineProperty(z,'hp',{enumerable:true,configurable:true,get:()=>hp,set:(v:number)=>{const d=hp-v;if(d>0&&hp>0){const src=damageSource(d);add(T.damage,src,Math.min(d,hp));if(v<=0)add(T.kills,src,1);}hp=v;}});
 return z;
}
function wrapArray<T extends object>(list:T[]):T[]{for(const z of list)wrapZombie(z as never);return new Proxy(list,{set(target,key,value){if(typeof key==='string'&&/^\d+$/.test(key)&&value&&typeof value==='object')wrapZombie(value);return Reflect.set(target,key,value);}});}
function instrumentZombies(c:City){const s=c.zombies!;s.actors=wrapArray(s.actors);c.zombies=new Proxy(s,{set(target,key,value){if(key==='actors')value=wrapArray(value);return Reflect.set(target,key,value);}}) as ZombieState;}
function manaSink(amount:number):string{
 const stack=new Error().stack??'';const close=(n:number)=>Math.abs(amount-n)<1e-6;
 if(stack.includes('stepMagicProduction'))return 'duy trì nhà nhận';
 if(stack.includes('mageAction'))return close(MAGIC_SPELLS.fireball.mana)?'Hỏa cầu':'Thủy hồi (pháp sư)';
 if(stack.includes('magicStructureDefense'))return close(MAGIC_SPELLS.lightpulse.mana)?'Linh quang':close(MAGIC_SPELLS.firecircle.mana)?'Hỏa trận':close(MAGIC_SPELLS.roots.mana)?'Trói rễ':'Thủy hồi (điện thờ)';
 for(const [fn,label] of [['firestorm','Bão lửa'],['stonewall','Thạch bích'],['purify','Thanh tẩy'],['cleanse','Tịnh hóa'],['growthRain','Mưa sinh trưởng'],['leg','linh mộc'],['chargeMagicCargo','lò tinh chất/thiên thạch'],['chargeTraining','tuyển quân'],['mythAction','gói đại phép']] as const)if(stack.includes(fn))return label;
 return 'khác';
}
function instrumentMana(c:City){const m=c.magic!;m.mana=new Proxy(m.mana,{set(target,key,value:number){const before=target[key as string]??0,d=value-before;if(d<0)add(T.mana,manaSink(-d),-d);else if(d>0)T.income+=d;return Reflect.set(target,key,value);}});}

/* ---------------- village ---------------- */
type Scenario={pop:number;era:7|8|9;magic:boolean};
const SLOT_X=[22,72],SLOT_Y=[22,84],WALL={x0:12,x1:84,y1:86},RIVER_Y=21;
/** Guard posts on lanes (odd tiles): 3×3 grid; magic nodes are the four corners. */
const POSTS=[[31,33],[47,33],[63,33],[31,53],[47,53],[63,53],[31,73],[47,73],[63,73]] as const;
const NODES=[0,2,6,8];
export function village(s:Scenario):City{
 const c=newCity(0,4242+s.pop);delete c.zombies;c.era=s.era;c.manualWorkforce=false;c.auto={on:false,mix:c.auto?.mix??({} as never)};
 c.b={};c.people=[];c.pop=0;c.army={};c.herds=[];c.camps=[];c.exps=[];c.raid=null;c.shift=null;c.queue=[];c.log=[];
 c.wildernessAt=1e15;c.disaster={kind:'flood',at:1e15,level:0,center:0};
 c.upkeepStartsAt=0;c.wheelFuelStartsAt=0;c.gatherFoodStartsAt=0;c.economyBalanceStartsAt=0;c.hungerStartsAt=0;c.farmAutoStartsAt=0;
 c.t.fill(G);c.seen.fill(0);
 for(let y=RIVER_Y;y<=WALL.y1+6;y++)for(let x=WALL.x0-6;x<=WALL.x1+6;x++)c.seen[idx(x,y)]=1;
 for(let x=0;x<W;x++)c.t[idx(x,RIVER_Y)]=R;
 // West forest band (15 columns, ~380.000 wood; felled tiles turn to grass and never regrow offline), east hills.
 for(let y=RIVER_Y+1;y<WALL.y1;y++){for(let x=6;x<=20;x++)c.t[idx(x,y)]=F;for(let x=76;x<=83;x++)c.t[idx(x,y)]=HL;}
 for(const y of [30,40,50,60,70,80])c.t[idx(74,y)]=COAL;
 c.camp=idx(47,51);
 const put=(k:BKey,x:number,y:number,lvl=1)=>{const tile=idx(x,y);if(c.b[tile])throw new Error(`occupied ${k} ${x},${y}`);c.b[tile]={k,lvl,doneAt:null,...(MAGIC_BUILDINGS[k as MagicBuilding]?{uid:0}:{}),builtAt:-DAY};return tile;};
 const free=(x:number,y:number)=>x>=SLOT_X[0]&&x<=SLOT_X[1]&&y>=SLOT_Y[0]&&y<=SLOT_Y[1]&&x%2===0&&y%2===0&&!c.b[idx(x,y)]&&c.t[idx(x,y)]===G;
 const near=(k:BKey,x:number,y:number,lvl=1)=>{for(let r=0;r<40;r++){const cand:[number,number][]=[];for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)if(Math.max(Math.abs(dx),Math.abs(dy))===r&&free(x+dx,y+dy))cand.push([x+dx,y+dy]);cand.sort((a,b)=>Math.hypot(a[0]-x,a[1]-y)-Math.hypot(b[0]-x,b[1]-y)||a[1]-b[1]||a[0]-b[0]);if(cand.length)return put(k,cand[0][0],cand[0][1],lvl);}throw new Error('no slot for '+k);};
 // No outer wall: zombies spawn anywhere explored, inside the town too, and an outer
 // ring is chewed down by outside spawns (see docs/magic-balance-2026-11-11.md §1).
 // Core village.
 put('hall',46,52,s.era);
 for(let n=0;n<14;n++)near('grandstore',47,58,3);
 const houses:number[]=[];let housing=0;while(housing+150<=s.pop){houses.push(near('apartment',40,46,3));housing+=150;}if(housing<s.pop)houses.push(near('apartment',40,46,Math.ceil((s.pop-housing)/50)));
 near('forge',36,40,3);near('forge',58,40,3);for(let n=0;n<3;n++)near('market',52,46);
 // Wood camps on the forest edge and on clearings inside it (a camp reaches 6 tiles).
 for(const y of [30,42,54,66])put('wood',22,y,3);for(const y of [26,34,42,50,58,66,74,82]){c.t[idx(13,y)]=G;put('wood',13,y,3);}
 for(const y of [24,34,44,56,66,76])put('quarry',76,y,3);
 put('coalmine',74,40,3);put('coalmine',74,60,3);
 // No factory or artisan: gold starts in stock and wood is the scarce input offline.
 near('machine',66,42,3);near('machine',66,46,3);near('complex',62,58,3);
 for(let n=0;n<6;n++)near('solar',56,64);near('thermal',66,62,1);near('hospital',47,49);
 for(let n=0;n<3;n++)near('barracks',52,52,3);
 // Army: era 6 troops at every post; mages beside ward circles; magic units at the corner nodes.
 const ground:Troops=s.pop>=900?{infantry:38,musket:10,armor:3}:s.pop>=800?{infantry:34,musket:10,armor:3}:s.pop>=600?{infantry:30,musket:10,armor:2}:{infantry:24,musket:8,armor:2};
 const magicArmy:Troops=!s.magic?{}:{firemage:8,watermage:4,...(s.era>=8?{golem:4,spiritdeer:4}:{}),...(s.era>=9?{dragon:2}:{})};
 // Fields south. A staffed level-3 estate delivers ~10.000 food/h (measured without
 // zombies); size them for civilians (480/h) and units (960/h) plus 15% margin.

 // Defence at every post: refuge, healer; towers at eight posts, bells at four.
 POSTS.forEach(([x,y],i)=>{near('refuge',x,y,3);near('healer',x+2,y,3);if(i!==4)near('watchtower',x,y+2,3);if(i%2===0)near('warningbell',x,y-2);});
 // Magic.
 if(s.era>=7){
  const L=s.era===7?1:s.era===8?2:3;
  // A source and a ward circle at each corner node; academy/shrines/garden in the north core.
  const nodeSource=['aetherwell','aetherwell','aetherwell','manaspire'] as const;
  NODES.forEach((p,i)=>{const [x,y]=POSTS[p];near(nodeSource[i],x+1,y-1,L);near('wardcircle',x-1,y+1);});
  // Two spires feed the north core, one feeds the east workshops (essence/celestial forges).
  near('manaspire',43,27,L);near('manaspire',47,33,L);near('manaspire',64,48,L);
  near('mageacademy',45,29);near('mageacademy',49,29);put('rivershrine',44,22);put('rivershrine',50,22);near('manarelay',46,24);near('spiritgarden',33,35);
  // Up to two more ward circles (if the cap allows): beside the core spire, and on the south post through relays.
  near('manarelay',37,72);near('manarelay',42,72);
  if((MAGIC_BUILDINGS.wardcircle.max??4)>=5)near('wardcircle',45,34);if((MAGIC_BUILDINGS.wardcircle.max??4)>=6)near('wardcircle',47,72);
  near('crystalworks',37,40,3);near('crystalworks',57,40,3);near('runeworks',62,40,3);near('runeworks',62,44,3);
  if(s.era>=8){near('awakeningtower',40,30);near('harmonizer',47,27);for(const k of ['firealtar','watertemple','woodgrove','earthtemple'] as const)near(k,47,30);
   near('golemworks',44,32);near('spiritstable',50,32);near('essenceforge',64,42,L);near('essenceforge',64,46,L);
   // A second Mộc grove beside the fields for Mưa sinh trưởng.
   near('manarelay',46,76);near('woodgrove',47,78);}
  if(s.era>=9){near('fourspirits',54,30);near('observatory',42,34);near('spiritgate',46,35);near('covenantaltar',50,35);near('worldmatrix',48,26);near('manarelay',64,52);near('celestialforge',64,56,L);}
 }
 // Fields are placed last so the magic and defence posts keep their slots.
 const units=Object.values({...ground,...magicArmy}).reduce((n,v)=>n+(v??0),0);
 for(let n=0;n<Math.ceil((s.pop*480+units*960)*1.15/10000);n++)near('estate',47,82,3);
 for(const b of Object.values(c.b))if(b.uid===0)delete b.uid;
 // People: fill every job, the rest live in the apartments.
 const jobs:number[]=[];for(const [tile,b]of Object.entries(c.b)){const d=B[b.k];let n=d.jobs??0;if(n&&d.up&&['thermal'].includes(b.k))n=[0,4,7,10][b.lvl];for(let k=0;k<n;k++)jobs.push(+tile);}
 for(let n=0;n<s.pop;n++){const at=jobs[n];c.people.push({id:c.nextId++,name:`Dân ${n+1}`,task:at!==undefined?{t:'work',at}:{t:'idle'},pos:at??houses[n%houses.length]});}
 c.pop=c.people.length;
 c.army={...ground,...magicArmy};setArmyHits(c.army);
 c.homeOrders={};let k=0;
 for(const u of Object.keys(c.army) as UKey[])for(let n=0;n<c.army[u]!;n++,k++){
  const posts=MAGIC_UNITS.has(u)?NODES:POSTS.map((_,i)=>i),[px,py]=POSTS[posts[n%posts.length]];
  const x=MAGIC_UNITS.has(u)&&(u==='firemage'||u==='watermage')?px-1+(n%2):px,y=py+(Math.floor(n/posts.length)%2);const tile=free(x,y)||!c.b[idx(x,y)]?idx(x,y):idx(px,py);
  c.homeOrders[`${u}:${n}`]={at:0,x:tile%W+.5,y:Math.floor(tile/W)+.5,route:[tile]};
 }
 initializeMedieval(c,0);initializeIndustry(c,0);initializeModern(c,0);
 if(s.era>=7){initializeMagic(c,0);const m=c.magic!;m.researched.push('conduction','warcraft','lifecraft');if(s.era>=8)m.researched.push('elements','pact');if(s.era>=9){m.researched.push('gatecraft','dragonPact');m.contract={active:'dragon'};}
  if(s.era>=8){m.specialization={element:'fire'};m.cooldowns.specialized=0;for(const [tile,b]of Object.entries(c.b))if(b.k==='harmonizer')(m.harmony??={})[magicSiteId(b)]=['earth','fire'];}
  if(!s.magic){for(const [tile,b]of Object.entries(c.b))if(['wardcircle','aetherwell'].includes(b.k))b.off=true;}}
 // Stock as just after entering the era (half of a new compartment for magic goods).
 const storage=stats(c,derive(c),0).storage;for(const r of RES)c.res[r]=Math.min(storage[r],r==='diamond'?0:['aetherCrystal','rune','essence','celestialStone'].includes(r)?600:storage[r]*(r==='wood'?1:.35));
 if(c.medieval)for(const [i,b]of Object.entries(c.b))if(b.k==='reservoir'||b.k==='retention')c.medieval.water[i]=6*HOUR;
 if(c.industry)c.industry.pollution=10;
 return c;
}

/* ---------------- run ---------------- */
const next=(era:number)=>era===7?{goods:MAGIC_ERA_REQUIREMENTS[8].goods,wonder:'awakeningtower',hall:MAGIC_HALL_UPGRADES[8].goods}:era===8?{goods:MAGIC_ERA_REQUIREMENTS[9].goods,wonder:'fourspirits',hall:MAGIC_HALL_UPGRADES[9].goods}:{goods:{},wonder:'riverpalace',hall:{}};
function goal(era:number){const n=next(era),total:Partial<Res>={};for(const g of [n.goods,B[n.wonder as BKey].cost,n.hall] as Partial<Res>[])for(const [r,v]of Object.entries(g))total[r as keyof Res]=(total[r as keyof Res]??0)+(v??0);return {wonder:n.wonder,total};}
const round=(n:number)=>Math.round(n);
export function runVillage(s:Scenario,days=14,log=console.log){
 const c=village(s);
 // Warm-up hour without zombies: workers walk to work, buffers fill, network binds.
 settle(c,HOUR);
 if(s.era>=9&&s.magic)for(const spell of ['thunder','thunder'] as const){const e=mythAction(c,{type:'magicPrepare',spell},c.last);if(e)log('gói phép:',e);}
 activateZombies(c,c.last,true);instrumentZombies(c);if(c.magic)instrumentMana(c);
 const start=c.last,initialBuildings=Object.keys(c.b).length,initialSoldiers=Object.values(c.army).reduce((n,v)=>n+(v??0),0);
 const rows:Record<string,unknown>[]=[];let before={...c.res},report={...c.zombies!.report},gained:Partial<Res>={},wallsBefore=Object.values(c.b).filter(b=>b.k==='wall'||b.k==='gate').length;
 log(`# P=${s.pop} thời ${s.era}${s.magic?'':' (không phép)'}: ${initialBuildings} công trình, ${c.people.length} dân, quân ${JSON.stringify(c.army)}`);
 const wave=zombieWave(s.pop,s.era,1);log(`đợt mỗi ${wave.interval/MIN} phút: ${wave.total} con (${wave.super} Super, ${wave.breaker} phá hoại)`);
 for(let d=1;d<=days;d++){
  T=tally();const t0=performance.now();
  for(let h=1;h<=24;h++)settle(c,start+(d-1)*DAY+h*HOUR);
  const z=c.zombies!.report,walls=Object.values(c.b).filter(b=>b.k==='wall'||b.k==='gate').length,delta=Object.fromEntries(RES.map(r=>[r,c.res[r]-before[r]])) as Res;
  for(const r of RES)gained[r]=(gained[r]??0)+delta[r];
  const totalDamage=Object.values(T.damage).reduce((n,v)=>n+v,0),magicDamage=Object.entries(T.damage).reduce((n,[k,v])=>n+(isMagicSource(k)?v:0),0);
  const kills=Object.values(T.kills).reduce((n,v)=>n+v,0),magicKills=Object.entries(T.kills).reduce((n,[k,v])=>n+(isMagicSource(k)?v:0),0);
  const spend=Object.values(T.mana).reduce((n,v)=>n+v,0);
  const sources=c.magic?Object.entries(c.b).filter(([,b])=>SOURCES.has(b.k)).map(([,b])=>c.magic!.mana[magicSiteId(b)]??0):[];
  const row={day:d,cpuS:Math.round((performance.now()-t0)/100)/10,people:c.people.length,soldiers:Object.values(c.army).reduce((n,v)=>n+(v??0),0),army:{...c.army},
   destroyed:z.destroyed-report.destroyed-(wallsBefore-walls),wallsDestroyed:wallsBefore-walls,lost:z.lost-report.lost,infected:z.infected-report.infected,waves:z.waves-report.waves,spawned:T.spawned,killed:z.killed-report.killed,
   killsMagic:magicKills,killsOther:kills-magicKills,damageMagicPct:totalDamage?round(100*magicDamage/totalDamage):0,damage:Object.fromEntries(Object.entries(T.damage).map(([k,v])=>[k,round(v)])),
   manaIncome:round(T.income),manaSpend:round(spend),mana:Object.fromEntries(Object.entries(T.mana).map(([k,v])=>[k,round(v)])),manaStored:round(sources.reduce((n,v)=>n+v,0)),
   food:round(delta.food),stock:Object.fromEntries(RES.filter(r=>r!=='diamond').map(r=>[r,round(c.res[r])])),delta:Object.fromEntries(RES.filter(r=>r!=='diamond').map(r=>[r,round(delta[r])]))};
  rows.push(row);
  log(JSON.stringify({day:d,cpuS:row.cpuS,people:row.people,soldiers:row.soldiers,destroyed:row.destroyed,walls:row.wallsDestroyed,lost:row.lost,infected:row.infected,spawned:row.spawned,killed:row.killed,killsMagic:row.killsMagic,killsOther:row.killsOther,damageMagicPct:row.damageMagicPct,manaIncome:row.manaIncome,manaSpend:row.manaSpend,manaStored:row.manaStored,food:row.food}));
  log('  sát thương',JSON.stringify(row.damage),'| mana tiêu',JSON.stringify(row.mana));
  log('  tồn kho',JSON.stringify(row.stock));
  before={...c.res};report={...z};wallsBefore=walls;
 }
 // Pace: average daily net gain against the next era (or Thiên Cung) requirement.
 const g=goal(s.era),pace:Record<string,number|null>={};
 for(const [r,need]of Object.entries(g.total) as [keyof Res,number][]){const perDay=(gained[r]??0)/days;pace[r]=perDay>0?Math.round(10*need/perDay)/10:null;}
 const destroyedKinds:Record<string,number>={};const survivors=new Set(Object.keys(c.b));for(const [tile,b]of Object.entries(village(s).b))if(!survivors.has(tile))add(destroyedKinds,b.k,1);
 const summary={scenario:s,days,buildings:{start:initialBuildings,end:Object.keys(c.b).length,destroyed:destroyedKinds},people:{end:c.people.length},soldiers:{start:initialSoldiers,end:Object.values(c.army).reduce((n,v)=>n+(v??0),0)},goal:g.wonder,daysToGoal:pace};
 log('tổng kết',JSON.stringify(summary));
 return {rows,summary};
}

/* ---------------- PvP ---------------- */
function town(era=9){const c=newCity(0,99);c.t.fill(G);c.seen.fill(1);c.era=era;c.b={'4658':{k:'hut',lvl:1,doneAt:null}};c.camp=4658;c.army={};c.pop=20;c.people=c.people.slice(0,20);initializeMagic(c,0);return c;}
const cost=(t:Troops)=>Object.entries(t).reduce((n,[u,k])=>n+(k??0)*Object.values(UNITS[u as UKey].cost).reduce((a,v)=>a+(v??0),0)+(k??0)*(UNITS[u as UKey].mana??0),0);
const space=(t:Troops)=>Object.entries(t).reduce((n,[u,k])=>n+(k??0)*UNITS[u as UKey].space,0);
type Duel={attacker:Troops;defender:Troops;gap?:number;flask?:boolean;attackerPackages?:('thunder'|'sanctuary')[];defenderPackages?:('thunder'|'sanctuary')[];cluster?:boolean;seconds?:number};
/** Open field, both squads start `gap` tiles apart; the attacker charges the nearest enemy, the defender holds and fires. */
export function duel(d:Duel){
 const att=town(),def=town();def.army={...d.defender};
 const mages=(t:Troops)=>((t.firemage??0)+(t.watermage??0))*100;
 const s=createBattle({id:'duel',attackerId:'a',defenderId:'d',attacker:att,defender:def,troops:d.attacker,now:0,...(d.flask!==false?{attackerFlask:mages(d.attacker),defenderFlask:mages(d.defender)}:{}),...(d.attackerPackages?{attackerPackages:d.attackerPackages}:{}),...(d.defenderPackages?{defenderPackages:d.defenderPackages}:{})});
 const A=s.groups.filter(g=>g.side==='attacker'),D=s.groups.filter(g=>g.side==='defender');
 const gap=d.gap??9,cx=48.5,cy=48.5;
 D.forEach((g,i)=>{g.x=cx+(d.cluster?0:(i%3)*.6);g.y=cy+(d.cluster?0:Math.floor(i/3)*.6);g.order={type:'guard',x:g.x,y:g.y};});
 A.forEach((g,i)=>{g.x=cx-gap;g.y=cy+(i%3)*.6;g.order={type:'attack',targetId:D[0].id};});
 const hp=(gs:BattleGroup[])=>gs.reduce((n,g)=>n+g.hp,0),full=(gs:BattleGroup[])=>gs.reduce((n,g)=>n+g.initial*unitHp(g),0);
 let at=0;const limit=(d.seconds??120)*1000;
 while(at<limit&&hp(A)>0&&hp(D)>0&&s.status!=='finished'){at+=1000;advanceBattle(s,at);
  // Re-target the attacker at whatever defender is still alive.
  const alive=D.find(g=>g.count>0);for(const g of A)if(g.order.type==='attack'&&!D.some(e=>e.id===(g.order as {targetId:string}).targetId&&e.count>0)&&alive)g.order={type:'attack',targetId:alive.id};}
 const res=(gs:BattleGroup[])=>{const units:Troops={};for(const g of gs)units[g.u]=(units[g.u]??0)+g.count;return {hpPct:Math.round(100*hp(gs)/full(gs)),units};};
 return {seconds:at/1000,winner:hp(A)<=0?'phòng thủ':hp(D)<=0?'tấn công':'hòa (hết giờ)',attacker:{troops:d.attacker,space:space(d.attacker),cost:cost(d.attacker),...res(A)},defender:{troops:d.defender,space:space(d.defender),cost:cost(d.defender),...res(D)}};
}
/** Thiên lôi on a clustered, standing squad: losses with the package minus losses without it. */
export function thunder(troops:Troops){
 const run=(packages:boolean)=>{const def=town();def.army={tortoise:1};
  const s=createBattle({id:'bolt',attackerId:'a',defenderId:'d',attacker:town(),defender:def,troops,now:0,...(packages?{defenderPackages:['thunder' as const]}:{})});
  for(const g of s.groups){if(g.side==='attacker'){g.x=48.5;g.y=48.5;g.order={type:'guard',x:48.5,y:48.5};}else{g.x=48.5;g.y=40.5;g.order={type:'guard',x:48.5,y:40.5};}}
  s.defenderOnline=true;advanceBattle(s,5200);const A=s.groups.filter(g=>g.side==='attacker');return {units:A.reduce((n,g)=>n+g.count,0),hp:A.reduce((n,g)=>n+g.hp,0)};};
 const a=run(true),b=run(false),start=Object.values(troops).reduce((n,v)=>n+(v??0),0);
 return {start,killedByThunder:b.units-a.units,damageByThunder:Math.round(b.hp-a.hp)};
}
export function pvpChecks(log=console.log){
 const cases:[string,Duel][]=[
  ['Quân đất thời 6 tấn công pháp sư (20 chỗ)',{attacker:{infantry:20},defender:{firemage:8,watermage:2}}],
  ['Pháp sư tấn công quân đất thời 6 (20 chỗ)',{attacker:{firemage:8,watermage:2},defender:{infantry:20}}],
  ['Mốc so sánh: bộ binh đánh bộ binh (20 chỗ)',{attacker:{infantry:20},defender:{infantry:20}}],
  ['Pháp sư + lính chắn tấn công bộ binh (20 chỗ)',{attacker:{firemage:5,infantry:10},defender:{infantry:20}}],
  ['Bộ binh tấn công lính + pháp sư phòng thủ (20 chỗ)',{attacker:{infantry:20},defender:{firemage:4,watermage:1,infantry:10}}],
  ['Mốc so sánh: thiết giáp tấn công bộ binh (20 chỗ)',{attacker:{armor:4},defender:{infantry:20}}],
  ['Kỵ binh áp sát pháp sư (20 chỗ, cách 8 ô)',{attacker:{cavalry:10},defender:{firemage:8,watermage:2},gap:8}],
  ['Kiếm sĩ áp sát pháp sư (20 chỗ)',{attacker:{sword:20},defender:{firemage:8,watermage:2},gap:8}],
  ['Golem tiến vào hàng lính súng (24 chỗ, cách 12 ô)',{attacker:{golem:4},defender:{musket:24},gap:12}],
  ['Golem tiến vào bộ binh hiện đại (24 chỗ, cách 12 ô)',{attacker:{golem:4},defender:{infantry:24},gap:12}],
  ['Golem đánh kiếm sĩ (24 chỗ)',{attacker:{golem:4},defender:{sword:24},gap:4}],
  ['Golem đánh kỵ binh (24 chỗ)',{attacker:{golem:4},defender:{cavalry:12},gap:4}],
  ['Golem đánh thiết giáp (24 chỗ)',{attacker:{golem:4},defender:{armor:5},gap:6}],
  ['Thanh Long tấn công bộ binh (24 chỗ)',{attacker:{dragon:2},defender:{infantry:24}}],
  ['Thanh Long tấn công cung thủ (24 chỗ)',{attacker:{dragon:2},defender:{bow:24}}],
  ['Thanh Long tấn công pháp sư (24 chỗ)',{attacker:{dragon:2},defender:{firemage:12}}],
  ['Thanh Long tấn công kiếm sĩ (24 chỗ)',{attacker:{dragon:2},defender:{sword:24}}],
  ['Phượng Hoàng tấn công bộ binh (24 chỗ)',{attacker:{phoenix:2},defender:{infantry:24}}],
  ['Huyền Quy tấn công bộ binh (24 chỗ)',{attacker:{tortoise:2},defender:{infantry:24}}],
  ['Huyền Quy đánh kỵ binh (24 chỗ)',{attacker:{tortoise:2},defender:{cavalry:12},gap:4}],
  ['Bộ binh tấn công Thanh Long phòng thủ (24 chỗ)',{attacker:{infantry:24},defender:{dragon:2}}],
 ];
 const out:Record<string,unknown>[]=cases.map(([label,d])=>{const r=duel(d);log(label,'→',JSON.stringify(r));return {label,...r};});
 for(const troops of [{club:30},{infantry:20},{armor:6},{golem:4}] as Troops[]){const r=thunder(troops);log(`Thiên lôi vào ${JSON.stringify(troops)} đứng cụm →`,JSON.stringify(r));out.push({label:'Thiên lôi',troops,...r});}
 return out;
}

if(import.meta.main){
 const [mode='village',...rest]=process.argv.slice(2),flags=rest.filter(a=>a.startsWith('--')),args=rest.filter(a=>!a.startsWith('--'));
 const json=flags.find(f=>f.startsWith('--json='))?.slice(7);
 if(mode==='pvp'){const r=pvpChecks();if(json)writeFileSync(json,JSON.stringify(r,null,1));}
 else{const pop=Number(args[0]??450),era=Number(args[1]??(pop>=850?9:pop>=650?8:7)) as 7|8|9,days=Number(args[2]??14);
  const r=runVillage({pop,era,magic:!flags.includes('--no-magic')},days);if(json)writeFileSync(json,JSON.stringify(r,null,1));}
}
