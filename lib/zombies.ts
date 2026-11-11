import {B,W,H,R,N4,UNITS,UKEYS,buildings,isBuildingActive,haulPosition,explorerPos,homeSoldiers,stats,derive,rng,type City,type Person,type Building,type UKey} from './engine';
import {bridgeDeck} from './bridges';
import {towerStats,selectTowerTiles} from './tower-balance';
import {magicStructureDefense,mageAction,zombieSlow,magicGuardHp} from './magic';
import {magicWallAt,hitMagicWall} from './magic-elements';
import {beastStrike,careCapacity,eyeActive,guardDamageScale,patrolReach,EYE_WARNING} from './magic-myth';
const SECOND=1000,MINUTE=60*SECOND,HOUR=60*MINUTE;
export type ZombieKind='normal'|'super'|'breaker';
export type Vital={hp:number;infectedAt?:number;downAt?:number;care?:{tile:number;end:number;pickupAt:number;arrive:number;doctor:number;route:number[];start:number};x?:number;y?:number;paused?:boolean;rescuing?:number;shelter?:number;last:number};
export type Zombie={id:number;kind:ZombieKind;hp:number;maxHp:number;x:number;y:number;era:number;until:number;emergesAt?:number;nextHit:number;path?:number[];repath:number;target?:string;walking?:boolean;hitAt?:number;known?:{tile:number;until:number;dps:number;range:number}[];slows?:Record<string,{amount:number;until:number}>};
export type ZombieGuard={id:string;u:UKey;x:number;y:number;hp:number;nextHit:number;anchor:number;orderAt?:number;path?:number[];walking?:boolean;castAt?:number};
export type ZombieState={activatedAt:number;last:number;nextAt:number;index:number;warning?:number;actors:Zombie[];guards:ZombieGuard[];peaks:{at:number;pop:number}[];population:number;patrol:boolean;healthAt:number;idleUntil?:number;idlePopulation?:number;resumeAt?:number;survivorsAt?:number;report:{waves:number;killed:number;lost:number;infected:number;destroyed:number};};
export function zombieStats(kind:ZombieKind,era:number){
 if(kind==='super')return {hp:era>=6?260:160,speed:era>=6?.9:.8,damage:era>=6?10:6,civilianDamage:era>=6?4:3,attackMs:1500,civilianAttackMs:2000,building:1};
 if(kind==='breaker')return {hp:240,speed:.25,damage:12,civilianDamage:12,attackMs:2500,civilianAttackMs:2500,building:2};
 return {hp:era>=6?90:era>=3?55:25,speed:era>=6?.35:era>=3?.3:.25,damage:era>=6?8:era>=3?5:2,civilianDamage:era>=6?8:era>=3?5:2,attackMs:2000,civilianAttackMs:2000,building:1};
}
export function zombiePressure(c:City,at=c.last){const s=c.zombies;return Math.max(c.people.length,...(s?.peaks??[]).filter(p=>p.at>at-6*HOUR).map(p=>p.pop));}
export const WEEK=7*24*HOUR;
/** Whole weeks since activation, on server timestamps: identical online and offline. */
export const zombieWeeks=(s:Pick<ZombieState,'activatedAt'>,at:number)=>Math.max(0,Math.floor((at-s.activatedAt)/WEEK));
/** I(P,w)=max(15,60−5·floor(P/100)−5·w) minutes; N(P)=max(1,ceil(P/40)). */
export function zombieWave(pop:number,era:number,index:number,weeks=0){const total=Math.max(1,Math.ceil(pop/40)),superCount=era<4?0:total===1?(index%3===0?1:0):Math.max(1,Math.floor(total/6)),breaker=era>=5?Math.floor(total/5):0;return {total,normal:total-superCount-breaker,super:superCount,breaker,interval:Math.max(15,60-5*Math.floor(pop/100)-5*Math.max(0,Math.floor(weeks)))*MINUTE};}
export function activateZombies(c:City,at:number,patrol=false){if(c.zombies)return;c.zombies={activatedAt:at,last:at,nextAt:at+5*MINUTE,index:0,actors:[],guards:[],peaks:[{at,pop:c.people.length}],population:c.people.length,patrol,healthAt:at,report:{waves:0,killed:0,lost:0,infected:0,destroyed:0}};notice(c,at,'Zombie sẽ trồi sau 5 phút. Tuyển lính, đặt vị trí bảo vệ và dựng lều cứu thương. Công trình bị phá mất vĩnh viễn!');}
export function notice(c:City,at:number,msg:string){c.log.push({at,msg,cls:'warn'});if(c.log.length>60)c.log.splice(0,c.log.length-60);}
const tileOf=(x:number,y:number)=>Math.max(0,Math.min(H-1,Math.floor(y)))*W+Math.max(0,Math.min(W-1,Math.floor(x)));
const point=(tile:number)=>({x:tile%W+.5,y:Math.floor(tile/W)+.5});
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
/** Zombies engage any guard within two tiles and bite within 1.1, flying units
 * included: a flying unit swoops to attack, so it is never immune (11/11). */
export const ZOMBIE_ENGAGE_RANGE=2,ZOMBIE_MELEE_RANGE=1.1;
export const zombieCanEngage=(_unit:{flying?:boolean},range:number)=>range<=ZOMBIE_ENGAGE_RANGE;
export function zombieBuildingHp(b:Building){return Math.max(60,Object.values(B[b.k].cost).reduce((n,v)=>n+(v??0),0)*2*Math.max(1,b.lvl));}
export const buildingIntegrity=(b:Building)=>Math.max(0,zombieBuildingHp(b)-(b.zombieDamage??0));
export function zombieBusy(c:City,at=c.last){return !!c.zombies&&(c.zombies.actors.length>0||c.zombies.nextAt-at<=MINUTE);}
export const zombiePersonPosition=(c:City,p:Person,at:number)=>position(c,p,at);
function position(c:City,p:Person,at:number){if(p.vital?.paused&&p.vital.x!==undefined)return {x:p.vital.x,y:p.vital.y!};const h=haulPosition(p,at);if(h)return h;if(p.task.t==='explore'){const [x,y]=explorerPos(p.task,at);return {x,y};}return point(p.pos??c.camp);}
function active(b:Building|undefined){return !!b&&isBuildingActive(b);}
function passable(c:City,tile:number,deck:ReadonlySet<number>,friendly=false){if(tile<0||tile>=W*H||c.t[tile]===R&&!deck.has(tile)||[2,4,5,6,7].includes(c.t[tile]))return false;if(!friendly&&c.magic?.walls?.length&&magicWallAt(c,tile))return false;const b=c.b[tile];return !b||['farm','estate','canal','levee','ironbridge','bridgehead'].includes(b.k)||friendly&&b.k==='gate';}
/** Bounded A* over real cardinal topology. Danger only uses observations
 * persisted by this actor. No global omniscience. The binary heap bounds queue work per expansion. */
export function zombiePath(c:City,from:number,to:number,known:NonNullable<Zombie['known']>=[],hp=100,friendly=false,deck=bridgeDeck(c)){
 if(from===to)return [from];const costs=new Map<number,number>([[from,0]]),prev=new Map<number,number>(),open:[number,number][]=[[from,0]];
 const heuristic=(tile:number)=>Math.max(0,Math.abs(tile%W-to%W)+Math.abs(Math.floor(tile/W)-Math.floor(to/W))-1);
 const less=(a:[number,number],b:[number,number])=>{const pa=a[1]+heuristic(a[0]),pb=b[1]+heuristic(b[0]);return pa<pb||pa===pb&&(a[1]>b[1]||a[1]===b[1]&&a[0]<b[0]);};
 const push=(entry:[number,number])=>{let i=open.length;open.push(entry);while(i){const parent=(i-1)>>1;if(!less(entry,open[parent]))break;open[i]=open[parent];i=parent;}open[i]=entry;};
 const pop=()=>{const first=open[0],last=open.pop()!;if(open.length){let i=0;while(i*2+1<open.length){let child=i*2+1;if(child+1<open.length&&less(open[child+1],open[child]))child++;if(!less(open[child],last))break;open[i]=open[child];i=child;}open[i]=last;}return first;};
 let visits=0,goal=-1;
 while(open.length&&visits++<900){const [i,cost]=pop();if(cost!==costs.get(i))continue;
  if(i===to||Math.abs(i%W-to%W)+Math.abs(Math.floor(i/W)-Math.floor(to/W))===1){goal=i;break;}
  for(const [dx,dy]of N4){const x=i%W+dx,y=Math.floor(i/W)+dy;if(x<0||x>=W||y<0||y>=H)continue;const next=y*W+x;if(!passable(c,next,deck,friendly))continue;let threat=0;for(const k of known)if(Math.hypot(x-k.tile%W,y-Math.floor(k.tile/W))<=k.range)threat+=k.dps;const nc=cost+1+Math.min(20,30*threat/Math.max(1,hp));if(nc<(costs.get(next)??Infinity)){costs.set(next,nc);prev.set(next,i);push([next,nc]);}}
 }
 if(goal<0)return null;const result=[goal];while(result[result.length-1]!==from)result.push(prev.get(result[result.length-1])!);return result.reverse();
}
function move(actor:{x:number;y:number;path?:number[];walking?:boolean},speed:number){actor.walking=false;let left=speed;while(actor.path?.length){const q=point(actor.path[0]),d=distance(actor,q);if(d>.001){const travel=Math.min(left,d);actor.x+=(q.x-actor.x)*travel/d;actor.y+=(q.y-actor.y)*travel/d;left-=travel;actor.walking=travel>0;if(left<=.001)return;}actor.path.shift();}}
function occupiedTiles(c:City,at:number){const result=new Set(c.people.map(p=>{const pos=position(c,p,at);return tileOf(pos.x,pos.y);}));if(UKEYS.some(u=>(c.army[u]??0)>0))for(const g of homeSoldiers(c,at))result.add(tileOf(g.x,g.y));return result;}
function spawnChoices(c:City,at:number){const occupied=occupiedTiles(c,at),result:number[]=[];for(let i=0;i<c.t.length;i++)if(c.seen[i]&&!c.b[i]&&c.t[i]===0&&!occupied.has(i))result.push(i);return result;}
function freeSpawn(c:City,start:number,at:number){const occupied=occupiedTiles(c,at);if(!occupied.has(start)&&!c.b[start])return start;const deck=bridgeDeck(c),queue=[start],visited=new Set(queue);for(let n=0;n<queue.length&&n<128;n++){const tile=queue[n];if(!occupied.has(tile)&&!c.b[tile]&&c.seen[tile]&&c.t[tile]===0)return tile;for(const [dx,dy]of N4){const x=tile%W+dx,y=Math.floor(tile/W)+dy,next=y*W+x;if(x<0||x>=W||y<0||y>=H||visited.has(next)||!passable(c,next,deck))continue;visited.add(next);queue.push(next);}}return undefined;}
function spawn(c:City,at:number){const s=c.zombies!,w=zombieWave(zombiePressure(c,at),c.era,++s.index,zombieWeeks(s,at)),random=rng(c.seed^Math.imul(s.index,0x9e3779b1));let tile=s.warning;
 if(tile===undefined||c.b[tile]){const choices=spawnChoices(c,at);tile=choices.length?choices[Math.floor(random()*choices.length)]:undefined;}
 if(tile!==undefined)tile=freeSpawn(c,tile,at);
 delete s.idleUntil;s.actors=[];if(tile!==undefined){const counts={normal:w.normal,super:w.super,breaker:w.breaker};let id=0;while(id<w.total){for(const kind of ['normal','super','normal','breaker'] as const)if(counts[kind]>0){counts[kind]--;const spec=zombieStats(kind,c.era);s.actors.push({id:s.index*10000+id++,emergesAt:at+(id-1)*2000,kind,hp:spec.hp,maxHp:spec.hp,...point(tile),era:c.era,until:at+15*MINUTE,nextHit:at+spec.attackMs,repath:at});}}
  notice(c,at,`${w.total} zombie đã trồi! ${w.super?`${w.super} Super; `:''}${w.breaker?`${w.breaker} phá hoại; `:''}lính bảo vệ đang ứng chiến.`);s.report.waves++;}
 delete s.warning;s.nextAt=at+w.interval;
}
function destroy(c:City,tile:number,at:number){const b=c.b[tile];if(!b)return;notice(c,at,`${B[b.k].n} bị zombie phá hủy vĩnh viễn. Phải xây mới, không thể sửa.`);delete c.b[tile];c.queue=c.queue.filter(q=>q.source!==tile);c.zombies!.report.destroyed++;for(const p of c.people)if(p.task.t==='work'&&p.task.at===tile){p.task={t:'idle'};resumeCargo(p,at);}const capacity=stats(c,derive(c),at).storage;for(const key of Object.keys(capacity) as (keyof City['res'])[])c.res[key]=Math.min(c.res[key],capacity[key]);for(const z of c.zombies!.actors){delete z.path;z.repath=at;} }
function attackPerson(c:City,p:Person,z:Zombie,at:number){const v=p.vital??={hp:100,last:at};const spec=zombieStats(z.kind,z.era);v.hp=Math.max(0,v.hp-spec.civilianDamage);if(!v.infectedAt&&rng(c.seed^z.id^p.id^at)()<.1){v.infectedAt=at;c.zombies!.report.infected++;if(p.haul?.phase==='work'){p.haul.nextAt=at+Math.max(0,p.haul.nextAt-at)*2;if(p.haul.workRate)p.haul.workRate*=.5;}}if(v.hp<=0){v.downAt??=at;v.paused=true;Object.assign(v,position(c,p,at));}z.nextHit=Math.max(z.nextHit,at-spec.civilianAttackMs)+spec.civilianAttackMs;z.hitAt=at;}
function resumeCargo(p:Person,at:number){if(p.vital?.x!==undefined)p.pos=tileOf(p.vital.x,p.vital.y!);if(p.task.t==='explore'){p.task={t:'idle'};p.assignment='scout';}if(p.haul?.carried){p.haul.tile=p.pos??p.haul.tile;p.haul.route=[p.haul.tile];p.haul.at=at;p.haul.phase='unload';p.haul.nextAt=at+SECOND;delete p.haul.drop;}else delete p.haul;}
function health(c:City,at:number){let changed=false;const s=c.zombies!;const facilities=buildings(c).filter(([,b])=>active(b)&&(b.k==='healer'||b.k==='hospital'));
 const patients=new Map<number,number>();for(const p of c.people)if(p.vital?.care)patients.set(p.vital.care.tile,(patients.get(p.vital.care.tile)??0)+1);
 const nearbyActors=spatial(s.actors.filter(z=>(z.emergesAt??0)<=at),z=>z);
 const removed=new Set<number>();
 for(const p of c.people){const v=p.vital;if(!v)continue;const elapsed=Math.max(0,at-v.last);v.last=at;
  if(v.care){
   const ca=v.care,b=c.b[ca.tile],doctor=c.people.find(d=>d.id===ca.doctor);
   const validDoctor=doctor&&!doctor.vital?.downAt&&doctor.task.t==='work'&&doctor.task.at===ca.tile;
   const releaseDoctor=()=>{if(doctor?.vital?.rescuing===p.id){delete doctor.vital.rescuing;doctor.vital.paused=false;resumeCargo(doctor,at);}};
   if(!active(b)||!validDoctor){releaseDoctor();delete v.care;changed=true;}
   else if(b!.k==='hospital'&&!((c.modern?.allocation[ca.tile]??0)>0)){
    ca.end+=elapsed;ca.pickupAt+=elapsed;ca.arrive+=elapsed;ca.start+=elapsed;
    if(v.infectedAt!==undefined&&at-v.infectedAt>=2*HOUR){v.hp=Math.max(0,v.hp-10*elapsed/HOUR);if(v.hp<=0)v.downAt??=at;}
    if(v.downAt!==undefined&&at>=v.downAt+10*MINUTE){releaseDoctor();removed.add(p.id);s.report.lost++;changed=true;continue;}
   }else{
    if(v.infectedAt!==undefined)v.infectedAt+=elapsed;
    if(v.downAt!==undefined&&at>=ca.pickupAt)v.downAt+=elapsed;
    if(at>=ca.end){releaseDoctor();v.hp=Math.max(50,v.hp);delete v.infectedAt;delete v.downAt;delete v.care;v.paused=false;resumeCargo(p,at);changed=true;}
    else if(at>=ca.pickupAt){const duration=Math.max(1,ca.arrive-ca.pickupAt),i=Math.min(ca.route.length-1,Math.floor(Math.max(0,at-ca.pickupAt)/duration*ca.route.length));const pos=point(ca.route[i]??ca.tile);Object.assign(v,pos);if(doctor.vital)Object.assign(doctor.vital,pos);}
    else{const route=ca.route.slice().reverse(),travel=Math.max(1,ca.pickupAt-ca.start-30*SECOND),i=Math.min(route.length-1,Math.floor(Math.max(0,at-ca.start)/travel*route.length));if(doctor.vital)Object.assign(doctor.vital,point(route[i]));}
   }
  }
  if(!v.care&&(v.infectedAt||v.downAt)){const pos=position(c,p,at);const heldDoctors=new Set(c.people.flatMap(q=>q.vital?.care?[q.vital.care.doctor]:[]));
   for(const [tile,b]of facilities){if(b.k==='hospital'&&!((c.modern?.allocation[tile]??0)>0))continue;if(distance(pos,point(tile))>6||(patients.get(tile)??0)>=careCapacity(c,b.k==='healer'?[0,2,3,4][b.lvl]:12))continue;const doctor=c.people.find(worker=>!worker.vital?.paused&&!heldDoctors.has(worker.id)&&worker.task.t==='work'&&worker.task.at===tile);if(!doctor)continue;const route=zombiePath(c,tile,tileOf(pos.x,pos.y),[],100,true);if(!route)continue;const travel=Math.max(1,route.length-1)*1000/1.2,pickupAt=at+travel+30*SECOND;if(v.downAt&&pickupAt>=v.downAt+10*MINUTE)continue;
    const food=b.k==='healer'?40:80,gold=b.k==='hospital'?10:0;if(c.res.food<food||c.res.gold<gold)continue;c.res.food-=food;c.res.gold-=gold;v.care={tile,end:pickupAt+travel+(c.magic?.boosted.includes(tile)?20:30)*MINUTE,pickupAt,arrive:pickupAt+travel,doctor:doctor.id,route:route.slice().reverse(),start:at};v.paused=true;const dv=doctor.vital??={hp:100,last:at};dv.paused=true;dv.rescuing=p.id;Object.assign(dv,point(tile));patients.set(tile,(patients.get(tile)??0)+1);changed=true;break;}}

  if(!v.care){if(v.downAt&&at>=v.downAt+10*MINUTE){removed.add(p.id);s.report.lost++;changed=true;continue;}if(v.infectedAt&&at-v.infectedAt>=2*HOUR){v.paused=true;v.hp=Math.max(0,v.hp-10*elapsed/HOUR);if(v.hp<=0){v.downAt??=at;v.paused=true;}}else if(!v.infectedAt&&!nearbyActors(position(c,p,at),6).some(z=>distance(z,position(c,p,at))<6))v.hp=Math.min(100,v.hp+20*elapsed/HOUR);}
 }
 if(removed.size){c.people=c.people.filter(p=>!removed.has(p.id));c.pop=c.people.length;notice(c,at,`${removed.size} dân chết vì zombie/bệnh; cần lính bảo vệ và thợ cứu thương.`);}return changed;
}
/** Eight-tile buckets keep target searches local without storing derived indexes. */
function spatial<T>(items:T[],locate:(item:T)=>{x:number;y:number}){
 const cells=new Map<number,T[]>();
 for(const item of items){const p=locate(item),key=Math.floor(p.y/8)*16+Math.floor(p.x/8),bucket=cells.get(key);if(bucket)bucket.push(item);else cells.set(key,[item]);}
 return (p:{x:number;y:number},radius:number)=>{const result:T[]=[];for(let y=Math.max(0,Math.floor((p.y-radius)/8));y<=Math.min(11,Math.floor((p.y+radius)/8));y++)for(let x=Math.max(0,Math.floor((p.x-radius)/8));x<=Math.min(11,Math.floor((p.x+radius)/8));x++){const bucket=cells.get(y*16+x);if(bucket)result.push(...bucket);}return result;};
}
function closest<T>(items:T[],origin:{x:number;y:number},locate:(item:T)=>{x:number;y:number},valid:(item:T)=>boolean,id:(item:T)=>number){let best:T|undefined,score=Infinity,key=Infinity;for(const item of items){if(!valid(item))continue;const p=locate(item),d=(p.x-origin.x)**2+(p.y-origin.y)**2,k=id(item);if(d<score||d===score&&k<key){best=item;score=d;key=k;}}return best;}
function combat(c:City,at:number){const s=c.zombies!,deck=bridgeDeck(c);let dirty=false;
 // Reconcile actor IDs with surviving troops. Existing home orders/guard posts
 // remain the authoritative staging and are used as patrol anchors.
 const soldiers=UKEYS.some(u=>(c.army[u]??0)>0)?homeSoldiers(c,at,undefined,false):[];const old=new Map(s.guards.map(g=>[g.id,g]));s.guards=soldiers.filter(g=>UNITS[g.u].atk>0).map(g=>{const previous=old.get(g.id),order=c.homeOrders?.[g.id],orderAt=order?.at,anchor=order?.route.at(-1)??tileOf(g.x,g.y);if(previous&&previous.orderAt===orderAt&&previous.anchor===anchor)return previous;return {...g,hp:previous?.hp??magicGuardHp(c,g),nextHit:previous?.nextHit??at,anchor,orderAt};});
 const towers=buildings(c).filter(([,b])=>b.k==='watchtower'&&active(b)).map(([tile,b])=>({tile,lvl:b.lvl}));const enabled=selectTowerTiles(towers,c.era,c.camp);
 for(const tower of towers)if(enabled.has(tower.tile)){const weapon=towerStats(tower.lvl);if(Math.floor((at-SECOND)/weapon.attackMs)===Math.floor(at/weapon.attackMs))continue;const target=s.actors.find(z=>z.hp>0&&(z.emergesAt??0)<=at&&distance(z,point(tower.tile))<=weapon.range);if(target){target.hp-=weapon.damage;target.hitAt=at;}}
 magicStructureDefense(c,at,s.actors,s.guards);
 const reach=s.patrol&&c.magic?patrolReach(c):{radius:10,speed:1};
 for(const g of s.guards){const home=soldiers.find(h=>h.id===g.id);if(home?.moving){g.x=home.x;g.y=home.y;g.walking=true;continue;}if(g.u==='watermage'&&g.hp>0&&g.nextHit<=at&&mageAction(c,g,undefined,at,s.actors,s.guards)){g.nextHit=Math.max(g.nextHit,at-(UNITS[g.u].attackMs??1000))+(UNITS[g.u].attackMs??1000);continue;}const spec=UNITS[g.u],range=spec.range??(g.u==='bow'?5:g.u==='sling'?4:1.1);const target=s.actors.filter(z=>z.hp>0&&(z.emergesAt??0)<=at&&distance(g,z)<= (s.patrol?reach.radius:range)&&(!s.patrol||distance(point(g.anchor),z)<=reach.radius)).sort((a,b)=>distance(g,a)-distance(g,b)||a.id-b.id)[0];if(!target){if(distance(g,point(g.anchor))>1.1){if(!g.path?.length||at%2000===0)g.path=zombiePath(c,tileOf(g.x,g.y),g.anchor,[],100,true,deck)??undefined;move(g,(spec.speed??1)*1.9);}else g.walking=false;continue;}
  if(distance(g,target)<=range){if(g.nextHit<=at){if(!mageAction(c,g,target,at,s.actors,s.guards)){target.hp-=spec.atk*(spec.attackMs??1000)/1000;target.hitAt=at;beastStrike(g,target,at,s.actors);}g.nextHit=Math.max(g.nextHit,at-(spec.attackMs??1000))+(spec.attackMs??1000);}}
  else if(s.patrol){if(!g.path?.length||at%2000===0)g.path=zombiePath(c,tileOf(g.x,g.y),tileOf(target.x,target.y),[],100,true,deck)??undefined;move(g,(spec.speed??1)*1.9*reach.speed);}}
 const people=c.people.map(p=>({p,...position(c,p,at)}));const bells=buildings(c).filter(([,b])=>b.k==='warningbell'&&active(b)).map(([tile])=>point(tile));const structures=buildings(c),localPeople=spatial(people,p=>p),localStructures=spatial(structures,p=>point(p[0]));const contacts=new Map<number,number>(),melee=new Map<string,number>(),occupancy=new Map<number,number>();for(const z of s.actors)if((z.emergesAt??0)<=at){const tile=tileOf(z.x,z.y);occupancy.set(tile,(occupancy.get(tile)??0)+1);}
 for(const z of s.actors){if(z.hp<=0||(z.emergesAt??0)>at)continue;const spec=zombieStats(z.kind,z.era);let target:{id:string;x:number;y:number;p?:Person;g?:ZombieGuard;tile?:number}|undefined;
  const guard=s.guards.filter(g=>g.hp>0&&zombieCanEngage(UNITS[g.u],distance(g,z))).sort((a,b)=>distance(a,z)-distance(b,z)||a.id.localeCompare(b.id))[0];
  if(guard&&z.kind!=='breaker')target={...guard,id:'g:'+guard.id,g:guard};
  if(!target&&z.kind!=='breaker'){const victim=closest(localPeople(z,z.kind==='super'?12:10),z,p=>p,p=>!p.p.vital?.downAt&&!p.p.vital?.care&&!p.p.vital?.shelter&&distance(p,z)<=(z.kind==='super'?12:10)&&(contacts.get(p.p.id)??0)<2,p=>p.p.id);if(victim){target={...victim,id:'p:'+victim.p.id};contacts.set(victim.p.id,(contacts.get(victim.p.id)??0)+1);}}
  if(!target){const b=localStructures(z,18).filter(([tile])=>c.b[tile]&&distance(point(tile),z)<18).sort((a,b)=>distance(point(a[0]),z)-distance(point(b[0]),z)||a[0]-b[0])[0];if(b)target={...point(b[0]),id:'b:'+b[0],tile:b[0]};else if(guard)target={...guard,id:'g:'+guard.id,g:guard};}
  if(!target){delete z.target;z.walking=false;continue;}
  if(z.era>=5){const known=(z.known??[]).filter(k=>k.until>at);for(const t of towers)if(enabled.has(t.tile)&&distance(z,point(t.tile))<=12){const w=towerStats(t.lvl),k=known.find(k=>k.tile===t.tile);if(k){k.until=at+10*SECOND;k.dps=w.damage/(w.attackMs/1000);}else known.push({tile:t.tile,until:at+10*SECOND,dps:w.damage/(w.attackMs/1000),range:w.range});}for(const g of s.guards)if(distance(z,g)<=6){const tile=tileOf(g.x,g.y),k=known.find(k=>k.tile===tile),unit=UNITS[g.u];if(k)k.until=at+10*SECOND;else known.push({tile,until:at+10*SECOND,dps:unit.atk,range:unit.range??1.1});}z.known=known;}
  if(distance(z,target)<=1.1){z.walking=false;if((melee.get(target.id)??0)>=4)continue;melee.set(target.id,(melee.get(target.id)??0)+1);if(z.nextHit>at)continue;if(target.p)attackPerson(c,target.p,z,at);else if(target.g){target.g.hp-=spec.damage*guardDamageScale(c,s.guards,target.g,at);z.nextHit=Math.max(z.nextHit,at-spec.attackMs)+spec.attackMs;}else if(target.tile!==undefined){const b=c.b[target.tile];if(b){b.zombieDamage=(b.zombieDamage??0)+spec.damage*spec.building;if(buildingIntegrity(b)<=0){destroy(c,target.tile,at);dirty=true;}}z.nextHit=Math.max(z.nextHit,at-spec.attackMs)+spec.attackMs;}z.hitAt=at;continue;}
  if(at>=z.repath||z.target!==target.id){z.target=target.id;z.path=zombiePath(c,tileOf(z.x,z.y),tileOf(target.x,target.y),z.known,z.hp,false,deck)??undefined;z.repath=at+2*SECOND;
   if(!z.path){const barriers=localStructures(z,12).filter(([i,b])=>c.b[i]&&['wall','gate'].includes(b.k)&&distance(z,point(i))<12).sort((a,b)=>distance(point(a[0]),z)-distance(point(b[0]),z));for(const [tile]of barriers){const route=zombiePath(c,tileOf(z.x,z.y),tile,z.known,z.hp,false,deck);if(route){z.path=route;z.target='b:'+tile;break;}}}}
  if(!z.path&&c.magic?.walls?.length&&hitMagicWall(c,z,at,spec.damage*spec.building,spec.attackMs)){z.walking=false;continue;}
  // A blocking wall is a real combat target until it is breached.
  if(z.target?.startsWith('b:')){const tile=Number(z.target.slice(2)),b=c.b[tile];if(b&&distance(z,point(tile))<=1.1&&z.nextHit<=at){b.zombieDamage=(b.zombieDamage??0)+spec.damage*spec.building;z.nextHit=Math.max(z.nextHit,at-spec.attackMs)+spec.attackMs;z.hitAt=at;if(buildingIntegrity(b)<=0){destroy(c,tile,at);dirty=true;}continue;}}
  const from=tileOf(z.x,z.y),next=z.path?.find(tile=>tile!==from);if(next!==undefined&&(occupancy.get(next)??0)>=4){z.walking=false;continue;}occupancy.set(from,Math.max(0,(occupancy.get(from)??1)-1));move(z,spec.speed*(1-zombieSlow(z,at)));const moved=tileOf(z.x,z.y);occupancy.set(moved,(occupancy.get(moved)??0)+1);
 }
 for(const u of UKEYS){const all=s.guards.filter(g=>g.u===u),alive=all.filter(g=>g.hp>0),lost=all.length-alive.length;if(!lost)continue;c.army[u]=Math.max(0,(c.army[u]??0)-lost);for(let i=0;i<alive.length;i++)alive[i].id=`${u}:${i}`;s.guards=s.guards.filter(g=>g.u!==u).concat(alive);for(const id of Object.keys(c.homeOrders??{}))if(id.startsWith(u+':')&&+id.split(':')[1]>=(c.army[u]??0))delete c.homeOrders![id];dirty=true;}
 const dead=s.actors.filter(z=>z.hp<=0);s.report.killed+=dead.length;s.actors=s.actors.filter(z=>z.hp>0&&z.until>at);
 if(!s.actors.length)for(const g of s.guards){const from=tileOf(g.x,g.y),route=zombiePath(c,from,g.anchor,[],100,true,deck)??[from];if(route.at(-1)!==g.anchor&&passable(c,g.anchor,deck,true)&&distance(point(route.at(-1)!),point(g.anchor))<=1.1)route.push(g.anchor);(c.homeOrders??={})[g.id]={at,x:g.x,y:g.y,route};}
 const localActors=spatial(s.actors.filter(z=>(z.emergesAt??0)<=at),z=>z);
 // People flee along actual topology, preserving carried cargo and work intent.
 for(const item of people){const p=item.p;if(p.vital?.care||p.vital?.downAt||p.vital?.rescuing!==undefined)continue;if(p.vital?.shelter&&!c.b[p.vital.shelter]){delete p.vital.shelter;}const near=localActors(item,8).filter(z=>distance(z,item)<6||bells.some(b=>distance(b,z)<=8&&distance(b,item)<=8));if(near.length){const v=p.vital??={hp:100,last:at};if(!v.paused)dirty=true;v.x=item.x;v.y=item.y;v.paused=true;const from=tileOf(item.x,item.y);const shelters=structures.filter(([tile,b])=>b.k==='refuge'&&active(b)&&distance(item,point(tile))<=6&&c.people.filter(q=>q.vital?.shelter===tile).length<[0,6,10,14][b.lvl]);let shelterRoute:number[]|null=null;let shelterTile:number|undefined;for(const [tile]of shelters){const route=zombiePath(c,from,tile,[],100,true,deck);if(route){shelterRoute=route;shelterTile=tile;break;}}if(shelterTile!==undefined){if(distance(item,point(shelterTile))<=1.1){v.shelter=shelterTile;Object.assign(v,point(shelterTile));continue;}const actor={x:item.x,y:item.y,path:shelterRoute??undefined};move(actor,1.2);v.x=actor.x;v.y=actor.y;continue;}const candidates=N4.map(([dx,dy])=>from+dx+dy*W).filter(i=>Math.abs(i%W-from%W)+Math.abs(Math.floor(i/W)-Math.floor(from/W))===1&&passable(c,i,deck,true));candidates.sort((a,b)=>Math.min(...near.map(z=>distance(point(b),z)))-Math.min(...near.map(z=>distance(point(a),z)))||a-b);if(candidates.length){const q=point(candidates[0]),d=distance(item,q)||1;v.x+=(q.x-item.x)*Math.min(1,1.2/d);v.y+=(q.y-item.y)*Math.min(1,1.2/d);}}else if(p.vital?.paused&&!(p.vital.infectedAt!==undefined&&at-p.vital.infectedAt>=2*HOUR)){p.pos=tileOf(p.vital.x??item.x,p.vital.y??item.y);p.vital.paused=false;delete p.vital.shelter;resumeCargo(p,at);dirty=true;}}
 if(s.actors.every(z=>!z.target)&&!s.guards.some(g=>g.walking)&&!c.people.some(p=>p.vital?.paused&&!p.vital.care&&!p.vital.downAt&&p.vital.rescuing===undefined)){s.idleUntil=Math.min(at+4*SECOND,...s.actors.filter(z=>(z.emergesAt??0)>at).map(z=>z.emergesAt!));s.idlePopulation=c.people.length;}else delete s.idleUntil;
 return dirty;
}
export function stepZombies(c:City,at:number){const s=c.zombies;if(!s||at<=s.last)return false;let dirty=false;const elapsed=at-s.last;s.last=at;
 if(c.people.length!==s.population){s.peaks.push({at,pop:s.population},{at,pop:c.people.length});s.population=c.people.length;}if(at%MINUTE===0)s.peaks=s.peaks.filter(p=>p.at>at-6*HOUR);
 if(c.battleId){s.nextAt+=elapsed;s.healthAt+=elapsed;
  for(const z of s.actors){z.until+=elapsed;if(z.emergesAt!==undefined)z.emergesAt+=elapsed;z.nextHit+=elapsed;z.repath+=elapsed;for(const k of z.known??[])k.until+=elapsed;for(const slow of Object.values(z.slows??{}))slow.until+=elapsed;}
  for(const g of s.guards){g.nextHit+=elapsed;if(g.castAt!==undefined)g.castAt+=elapsed;}
  for(const p of c.people){const v=p.vital;if(!v)continue;v.last+=elapsed;if(v.infectedAt!==undefined)v.infectedAt+=elapsed;if(v.downAt!==undefined)v.downAt+=elapsed;if(v.care){v.care.end+=elapsed;v.care.pickupAt+=elapsed;v.care.arrive+=elapsed;v.care.start+=elapsed;}}
  return false;}
 // Thiên nhãn (era 9 observatory) reports the spawn point 180 s ahead instead of 60 s.
 if(s.warning===undefined&&at>=s.nextAt-EYE_WARNING){const eye=at<s.nextAt-MINUTE?c.era>=9&&eyeActive(c):false;if(eye||at>=s.nextAt-MINUTE){const choices=spawnChoices(c,at);if(choices.length){s.warning=choices[Math.floor(rng(c.seed^s.index^0x61ba)()*choices.length)];notice(c,at,eye?`Thiên nhãn: zombie sẽ trồi trong ${Math.ceil((s.nextAt-at)/SECOND)} giây tại điểm đã đánh dấu.`:'Đất nứt! Zombie sẽ trồi trong 60 giây; lính hãy bảo vệ dân.');}}}
 if(at>=s.nextAt){spawn(c,at);dirty=true;}
 if(s.actors.length){
  const idle=s.idleUntil!==undefined&&at<s.idleUntil&&s.idlePopulation===c.people.length&&UKEYS.reduce((n,u)=>n+(UNITS[u].atk>0?(c.army[u]??0):0),0)===s.guards.length&&!Object.values(c.homeOrders??{}).some(order=>order.at>=s.idleUntil!-4*SECOND);
  if(idle)s.actors=s.actors.filter(z=>z.until>at);else dirty=combat(c,at)||dirty;
 }
 // Recovery also runs after the final actor expires or a save resumes without actors.
 if(!s.actors.length)for(const p of c.people){const v=p.vital;if(v?.paused&&!v.downAt&&!v.care&&v.rescuing===undefined&&!(v.infectedAt!==undefined&&at-v.infectedAt>=2*HOUR)){v.paused=false;delete v.shelter;resumeCargo(p,at);dirty=true;}}
 if(at-s.healthAt>=SECOND&&(c.people.some(p=>p.vital&&(p.vital.infectedAt||p.vital.downAt||p.vital.care)))||at-s.healthAt>=MINUTE){s.healthAt=at;dirty=health(c,at)||dirty;}
 if(s.survivorsAt&&at>=s.survivorsAt&&c.people.length===0){for(let n=0;n<3;n++)c.people.push({id:c.nextId++,name:'Người sống sót',task:{t:'idle'}});c.pop=c.people.length;delete s.survivorsAt;dirty=true;}
 return dirty;
}
