import {buildingIntegrity} from './zombies';
import {assignFormation,formationSlots} from './formation';
import {unitCounter} from './era-military';
import {selectTowerTiles,towerDamage,towerStats} from './tower-balance';
import {bridgeReady,SHORT_BRIDGE_WATER_TILES,type BridgeSpan} from './bridges';
import {MAGIC_SPELLS,type Element} from './magic-data';
/** Serializable, deterministic battle simulation. All time advances in 100 ms ticks.
 * Balance defaults: loot cap is 25% of each starting resource; civilian loss is
 * capped at floor(pop/2). Retreating armies can be pursued until they leave. */
import { homeSoldiers, isRock, shipsFree, shipsNeeded, B, H, HL, O, R, RES, UKEYS, UNITS, W, type City, type Res, type Troops, type UKey } from './engine';
export const BATTLE_TICK_MS = 100;
export const BATTLE_TIMEOUT_MS = 180_000;
export type BattleSide = 'attacker' | 'defender';
export type BattleOrder = { type: 'move'; x: number; y: number } | { type: 'attack'; targetId: string } | { type: 'guard'; x: number; y: number } | { type: 'retreat' };
export type BattleGroup = {/** Flask mana carried by this squad (≤100 per mage). */ flask?:number; castAt?:number; /** Per-unit max HP locked at recruitment (golems hardened by Thổ). */ unitHp?:number; nextAttackAt?:number; naval?: boolean; id: string; side: BattleSide; u: UKey; count: number; initial: number; hp: number; x: number; y: number; order: BattleOrder; moving?: boolean; blocked?: boolean; entry?: {x:number;y:number}; resumeOrder?: BattleOrder; breachRetryAt?: number; retreatExit?: {x:number;y:number}; escaped?: boolean; path?: number[] | null; pathGoal?: number; pathVersion?: number };
export type BattleBuilding = { bridge?:BridgeSpan; nextAttackAt?:number; towerEnabled?:boolean; id: string; tile: number; k: string; lvl: number; hp: number; maxHp: number; inactive?: boolean; burned: boolean; initiallyBurned: boolean; value: number };
type BattleSelection = { groupId: string; groupIds?: never } | { groupIds: string[]; groupId?: never };
export type BattleCommand = ({ type: 'move'; x: number; y: number } & BattleSelection) | ({ type: 'attack'; targetId: string } & BattleSelection) | { type: 'retreat' } | { type: 'presence'; online: boolean };
export type BattleStrike = { id: string; at: number; source: string; kind: 'arrow' | 'stone' | 'melee'|'bullet'|'shell'; from: {x:number;y:number}; to: {x:number;y:number} };
/** Era 9 prepared spell packages carried into this battle, one per type per side. */
export type BattlePackage = 'thunder' | 'sanctuary';
export type BattleSpellEffect = { id: string; side: BattleSide; kind: BattlePackage; x: number; y: number; start: number; until: number };
export type BattleState = { packages?: Partial<Record<BattleSide, Partial<Record<BattlePackage, 'ready' | 'used'>>>>; spellEffects?: BattleSpellEffect[]; specialization?: Partial<Record<BattleSide, Element>>; towerSlotsReady?:boolean; defenseCenter?:number; strikes?: BattleStrike[]; defenderEra?:number; id: string; attackerId: string; defenderId: string; startedAt: number; lastTick: number; terrain: number[]; groups: BattleGroup[]; buildings: BattleBuilding[]; status: 'fighting' | 'retreating' | 'finished'; winner?: BattleSide; defenderOnline: boolean; initialPopulation: number; populationLoss: number; startingResources: Res; loot: Res; devastation: number };
export type BattleResult = { winner: BattleSide; attackerSurvivors: Troops; defenderSurvivors: Troops; attackerCasualties: number; defenderCasualties: number; populationLoss: number; burnedTiles: number[]; loot: Res; devastation: number; /** Unused flask mana per side, returned up to the source's free space. */ flask?: Record<BattleSide, number>; /** Spell packages actually cast per side; unused ones go home. */ spells?: Record<BattleSide, BattlePackage[]> };
const emptyRes = (): Res => ({ food: 0, wood: 0, stone: 0, copper: 0 , gold: 0, diamond:0,coal:0,aetherCrystal:0,rune:0,essence:0,celestialStone:0});
const MAGES=new Set<UKey>(['firemage','watermage']);
/** Spec 7.2: flying beasts are hit only by anti-air tags (bows, crossbows,
 * infantry bullets, watchtowers, mages) and by other flyers. Golems and melee never. */
const ANTI_AIR=new Set<UKey>(['bow','crossbow','musket','infantry','firemage','watermage','dragon','phoenix']);
export const canHit=(u:UKey,target:UKey)=>!UNITS[target].flying||ANTI_AIR.has(u);
/** Mages ×1.5 and modern infantry ×1.25 against flying beasts. */
const antiAir=(u:UKey,target:UKey)=>UNITS[target].flying&&UNITS[target].contract?MAGES.has(u)?1.5:u==='infantry'?1.25:1:1;
const flying=(g:Pick<BattleGroup,'u'>)=>!!UNITS[g.u].flying;
const PHOENIX={every:10_000,amount:30,radius:3,targets:4},COVER={radius:2,targets:4},VISION=8;
export const unitHp=(g:Pick<BattleGroup,'u'|'unitHp'>)=>g.unitHp??UNITS[g.u].hp;
const dist = (a: {x:number;y:number}, b: {x:number;y:number}) => Math.hypot(a.x-b.x,a.y-b.y);
const xy = (tile:number) => ({ x: tile % W + .5, y: Math.floor(tile / W) + .5 });
const living = (g:BattleGroup) => g.count > 0 && !g.escaped;
const range = (u:UKey) => UNITS[u].range??(u === 'bow' ? 6 : u === 'sling' ? 4 : 1.4);
const flatBuilding=(k:string)=>['farm','estate','canal','levee','ironbridge','bridgehead'].includes(k);
const blockingBuilding=(b:BattleBuilding,side:BattleSide)=>!b.burned&&!flatBuilding(b.k)&&!(b.k==='gate'&&side==='defender');
const blockedTerrain=(terrain:number,naval=false)=>(terrain===R&&!naval)||isRock(terrain);
export function battleBridgeTiles(s:Pick<BattleState,'buildings'>):ReadonlySet<number>{
  const deck=new Set<number>();
  for(const b of s.buildings){
    if(b.k!=='ironbridge'||!b.bridge?.ready||b.burned||b.inactive)continue;
    const head=s.buildings.find(x=>x.tile===b.bridge!.to&&x.k==='bridgehead');
    if(b.bridge.tiles.length>SHORT_BRIDGE_WATER_TILES&&(!head||head.burned||head.inactive))continue;
    for(const tile of b.bridge.tiles)deck.add(tile);
  }
  return deck;
}
function safeSpawn(terrain:number[],buildings:BattleBuilding[],side:BattleSide,p:{x:number;y:number},deck:ReadonlySet<number>=new Set()){
  const blocked=new Set(buildings.filter(b=>blockingBuilding(b,side)).map(b=>b.tile));
  const start=Math.max(0,Math.min(H-1,Math.floor(p.y)))*W+Math.max(0,Math.min(W-1,Math.floor(p.x)));
  const queue=[start],seen=new Set(queue);
  for(let head=0;head<queue.length;head++){const tile=queue[head];if(!blockedTerrain(terrain[tile],deck.has(tile))&&!blocked.has(tile))return tile===start?{...p}:xy(tile);
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const x=tile%W+dx,y=Math.floor(tile/W)+dy,t=y*W+x;if(x>=0&&x<W&&y>=0&&y<H&&!seen.has(t)){seen.add(t);queue.push(t);}}
  }
  return p;
}

/** Enter from the perimeter of the village's land component, never across a river.
 * Buildings are deliberately ignored here: fortifications must still be breached. */
function invasionEntry(terrain:number[],center:{x:number;y:number},preferredY:number,deck:ReadonlySet<number>){
  const origin=safeSpawn(terrain,[],'attacker',center,deck),start=Math.floor(origin.y)*W+Math.floor(origin.x);
  const queue=[start],seen=new Set(queue);let best=start,score=Infinity;
  for(let head=0;head<queue.length;head++){
    const tile=queue[head],value=(tile%W)*H+Math.abs(Math.floor(tile/W)+.5-preferredY);
    if(value<score){score=value;best=tile;}
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const x=tile%W+dx,y=Math.floor(tile/W)+dy,t=y*W+x;
      if(x<0||x>=W||y<0||y>=H||seen.has(t)||blockedTerrain(terrain[t],deck.has(t)))continue;seen.add(t);queue.push(t);
    }
  }
  return xy(best);
}

/** Flask mana is a snapshot poured before the battle (attacker before marching,
 * defender from home sources at the start); the frame never reads village stock. */
export function createBattle(o: { id: string; attackerId: string; defenderId: string; attacker: City; defender: City; troops: Troops; now: number; attackerShips?: number; defenderOnline?: boolean; attackerFlask?: number; defenderFlask?: number; attackerPackages?: readonly BattlePackage[]; defenderPackages?: readonly BattlePackage[] }): BattleState {
  const buildings: BattleBuilding[] = Object.entries(o.defender.b).filter(([,b]) => b.lvl > 0).map(([tile,b]) => {
    const value = Object.values(B[b.k].cost).reduce((s,n)=>s+(n??0),0)*b.lvl;
    const maxHp = Math.max(60,value*2);
    return {id:`b:${tile}`,tile:Number(tile),k:b.k,lvl:b.lvl,hp:(b as typeof b & {burned?:boolean}).burned?0:Math.min(maxHp,buildingIntegrity(b)),maxHp,burned:!!(b as typeof b & {burned?:boolean}).burned,initiallyBurned:!!(b as typeof b & {burned?:boolean}).burned,inactive:!!b.flooded,value,...(b.k==='ironbridge'&&bridgeReady(o.defender,+tile)?{bridge:structuredClone(b.bridge)}:{})};
  });
  const deck=battleBridgeTiles({buildings});
  const center = xy(Number(Object.keys(o.defender.b).find(k=>o.defender.b[k].k==='hall') ?? o.defender.camp));
  const groups:BattleGroup[]=[];
  // Golems recruited under Thổ have +10% HP; squads aggregate units, so the
  // hardened share is spread evenly over that side's golems.
  const golemHp=(side:BattleSide)=>{const city=side==='attacker'?o.attacker:o.defender,total=side==='attacker'?o.troops.golem??0:city.army.golem??0,hard=Math.min(total,city.magic?.hardened??0);return UNITS.golem.hp*(10*total+hard)/(10*Math.max(1,total));};
  const add=(side:BattleSide,u:UKey,count:number,p:{x:number;y:number},naval:boolean,suffix='')=>{
    const spawn=safeSpawn(o.defender.t,buildings,side,p,deck);
    const hp=u==='golem'?golemHp(side):UNITS[u].hp;
    groups.push({naval,id:`${side}:${u}${suffix}`,side,u,count,initial:count,hp:count*hp,...(hp!==UNITS[u].hp?{unitHp:hp}:{}),...spawn,...(side==='attacker'&&p.x>1?{entry:p}:{}),order:{type:'guard',...spawn}});
  };
  const attackerNaval=(o.attackerShips??shipsFree(o.attacker,o.now))>=shipsNeeded(o.troops);
  for(const u of UKEYS){
    const count=Math.max(0,Math.floor(o.troops[u]??0));if(!count)continue;
    add('attacker',u,count,invasionEntry(o.defender.t,center,Math.min(H-2,Math.max(1,center.y+groups.length*2)),deck),attackerNaval);
  }
  // Preserve the actual home defence deployment. Aggregate only soldiers of the
  // same type already sharing a tile; opposite banks remain independent groups.
  const home=homeSoldiers(o.defender,o.now),defenderNaval=shipsFree(o.defender,o.now)>=shipsNeeded(o.defender.army);
  for(const u of UKEYS){
    const count=Math.max(0,Math.floor(o.defender.army[u]??0));if(!count)continue;
    const positions=new Map<number,{count:number;x:number;y:number}>();
    for(const actor of home.filter(a=>a.u===u)){
      const tile=Math.floor(actor.y)*W+Math.floor(actor.x),entry=positions.get(tile);
      if(entry){entry.x+=actor.x;entry.y+=actor.y;entry.count++;}
      else positions.set(tile,{count:1,x:actor.x,y:actor.y});
    }
    let total=0;
    for(const [tile,p] of positions){
      add('defender',u,p.count,{x:p.x/p.count,y:p.y/p.count},defenderNaval||o.defender.t[tile]===R&&!deck.has(tile),total?`:${tile}`:'');total+=p.count;
    }
    if(total<count)add('defender',u,count-total,center,defenderNaval,total?':reserve':'');
  }
  for(const [side,amount] of [['attacker',o.attackerFlask],['defender',o.defenderFlask]] as [BattleSide,number|undefined][]){let left=Math.max(0,amount??0);for(const g of groups)if(g.side===side&&MAGES.has(g.u)){g.flask=Math.min(100*g.count,left);left-=g.flask;}}
  const specialization:Partial<Record<BattleSide,Element>>={};const sa=o.attacker.magic?.specialization?.element,sd=o.defender.magic?.specialization?.element;if(sa)specialization.attacker=sa;if(sd)specialization.defender=sd;
  const packages:BattleState['packages']={};
  for(const [side,list] of [['attacker',o.attackerPackages],['defender',o.defenderPackages]] as [BattleSide,readonly BattlePackage[]|undefined][])for(const spell of new Set(list??[]))if(spell==='thunder'||spell==='sanctuary')(packages[side]??={})[spell]='ready';
  const s:BattleState={...(packages.attacker||packages.defender?{packages}:{}),...(sa||sd?{specialization}:{}),defenseCenter:o.defender.camp,defenderEra:o.defender.era,id:o.id,attackerId:o.attackerId,defenderId:o.defenderId,startedAt:o.now,lastTick:o.now,terrain:[...o.defender.t],groups,buildings,status:'fighting',defenderOnline:!!o.defenderOnline,initialPopulation:o.defender.pop,populationLoss:0,startingResources:{...o.defender.res},loot:emptyRes(),devastation:0};
  for(const g of groups) if(g.side==='attacker') { const target=buildings.find(b=>b.k==='hall'&&!b.burned)??buildings.find(b=>!b.burned); if(target)g.order={type:'attack',targetId:target.id}; }
  return s;
}
export function commandBattle(s:BattleState,side:BattleSide,c:BattleCommand):boolean {
  if(s.status==='finished')return false;
  if(c.type==='presence'){if(side!=='defender')return false;s.defenderOnline=c.online;return true;}
  if(c.type==='retreat'){if(side!=='attacker'||s.status!=='fighting')return false;s.status='retreating';for(const g of s.groups)if(g.side==='attacker'){g.order={type:'retreat'};delete g.resumeOrder;delete g.retreatExit;}return true;}
  const destinations=new Map<string,number>();
  if(battleCommandError(s,side,c,destinations))return false;
  const ids=new Set(c.groupIds??[c.groupId]);
  for(const g of s.groups)if(ids.has(g.id)){
    delete g.resumeOrder;delete g.breachRetryAt;
    g.order=c.type==='move'?{type:'move',...(destinations.has(g.id)?xy(destinations.get(g.id)!):{x:c.x,y:c.y})}:{type:'attack',targetId:c.targetId};
    delete g.path;g.blocked=false;g.moving=false;
  }
  return true;
}
/** Four-neighbour BFS respects transports and intact fortifications. */
function move(s:BattleState,g:BattleGroup,target:{x:number;y:number},deck:ReadonlySet<number>=battleBridgeTiles(s),escape=false):boolean {
  const obstacles = new Set(s.buildings.filter(b=>blockingBuilding(b,g.side)).map(b=>b.tile));
  const version=flying(g)?0:(escape?-1:1)*(obstacles.size*(W*H+1)+deck.size+1);
  // Flying beasts cross rivers, rock and buildings inside the battle bounds.
  const air=flying(g),impassable=(tile:number)=>tile<0||tile>=W*H||!air&&(blockedTerrain(s.terrain[tile],g.naval||deck.has(tile))||obstacles.has(tile));
  const start=Math.floor(g.y)*W+Math.floor(g.x), goal=Math.max(0,Math.min(H-1,Math.floor(target.y)))*W+Math.max(0,Math.min(W-1,Math.floor(target.x)));
  if(g.pathGoal!==goal||g.pathVersion!==version||g.path===undefined){
    g.pathGoal=goal;g.pathVersion=version;
    if(start===goal)g.path=[];
    else {
      const prev=new Int32Array(W*H).fill(-1),q=[start];prev[start]=start;let found=-1;
      for(let i=0;i<q.length;i++){
        const n=q[i];
        if(n===goal||impassable(goal)&&s.terrain[n]!==R&&Math.abs(n%W-goal%W)+Math.abs(Math.floor(n/W)-Math.floor(goal/W))===1){found=n;break;}
        for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
          const x=n%W+dx,y=Math.floor(n/W)+dy,t=y*W+x;
          if(x<0||x>=W||y<0||y>=H||prev[t]!==-1||impassable(t))continue;
          prev[t]=n;q.push(t);
        }
      }
      if(found<0)g.path=null;
      else{const route:number[]=[];for(let tile=found;tile!==start;tile=prev[tile])route.push(tile);g.path=route.reverse();}
    }
  }
  if(g.path===null){g.blocked=true;return false;}
  while(g.path.length&&dist(g,xy(g.path[0]))<.01)g.path.shift();
  const p=g.path.length?xy(g.path[0]):impassable(goal)?xy(start):target,d=dist(g,p);if(d===0)return true;
  g.moving=true;const speed=UNITS[g.u].speed!==undefined?UNITS[g.u].speed!*.25:g.u==='elephant'?.15:.25;g.x+=(p.x-g.x)/d*Math.min(speed,d);g.y+=(p.y-g.y)/d*Math.min(speed,d);return true;
}
/** Validate a defender move before replacing its current order. Own houses are
 * never demolished automatically; a river still requires transport capacity. */
export function battleCommandError(s:BattleState,side:BattleSide,c:BattleCommand,destinations?:Map<string,number>):string|null {
  if(s.status==='finished')return 'Trận đã kết thúc, không thể điều quân trong báo cáo trận.';
  if(c.type==='presence'||c.type==='retreat')return null;
  if(s.status==='retreating'&&side==='attacker')return 'Đoàn quân đang rút khỏi trận.';
  const ids=c.groupIds??[c.groupId];
  if(!Array.isArray(ids)||!ids.length||ids.length>360||new Set(ids).size!==ids.length||c.groupIds&&c.groupId!==undefined)return 'Nhóm quân được chọn không hợp lệ.';
  const groups=ids.map(id=>s.groups.find(g=>g.id===id&&g.side===side&&living(g)));
  if(groups.some(g=>!g))return 'Một số nhóm quân không còn khả dụng hoặc không thuộc phe của bạn. Hãy chọn lại.';
  if(c.type==='attack'){const unit=s.groups.find(t=>t.id===c.targetId&&t.side!==side&&living(t));if(unit&&!groups.some(g=>canHit(g!.u,unit.u)))return 'Quân đã chọn không đánh được quân bay; cần cung, nỏ, bộ binh súng, pháp sư hoặc thần thú bay.';return unit||side==='attacker'&&s.buildings.some(b=>b.id===c.targetId&&!b.burned)?null:'Mục tiêu không còn khả dụng.';}
  if(!Number.isFinite(c.x)||!Number.isFinite(c.y)||c.x<0||c.y<0||c.x>=W||c.y>=H)return 'Vị trí nằm ngoài bản đồ.';
  if(c.groupIds)return battleFormation(s,side,groups as BattleGroup[],c,destinations);
  if(side!=='defender')return null;
  const tile=Math.floor(c.y)*W+Math.floor(c.x);
  if(s.terrain[tile]===R&&groups.some(g=>!g!.naval)&&!battleBridgeTiles(s).has(tile))return 'Không thể qua sông: cần cầu hoàn chỉnh hoặc đủ thuyền vận tải chưa được sử dụng. Chọn vị trí cùng bờ.';
  if(isRock(s.terrain[tile]))return 'Không thể đứng trên núi hoặc mỏ đá. Chọn ô đất trống.';
  if(s.buildings.some(b=>b.tile===tile&&blockingBuilding(b,side)))return 'Công trình của mình đang chiếm ô này. Chọn đất trống hoặc đi qua cổng.';
  for(const g of groups){const probe={...g!,path:undefined};if(!move(s,probe,c))return 'Không có đường tới vị trí này cho toàn bộ nhóm đã chọn. Kiểm tra sông, núi và lối ra qua cổng; quân phòng thủ không tự phá nhà mình.';}
  return null;
}

/** One flood per transport profile, rather than a new full-map path search per
 * soldier. Attackers may breach buildings; terrain still cannot be bypassed. */
function battleFormation(s:BattleState,side:BattleSide,groups:BattleGroup[],target:{x:number;y:number},destinations?:Map<string,number>):string|null {
  const deck=battleBridgeTiles(s),blocks=new Set(s.buildings.filter(b=>blockingBuilding(b,side)).map(b=>b.tile));
  const tile=Math.floor(target.y)*W+Math.floor(target.x),naval=groups.every(g=>g.naval);
  const ground=(t:number)=>!blockedTerrain(s.terrain[t],naval||deck.has(t));
  const stand=(t:number)=>ground(t)&&!blocks.has(t),traverse=(t:number)=>ground(t)&&(side==='attacker'||!blocks.has(t));
  const chosen=new Set(groups.map(g=>g.id)),reserved=new Set<number>();
  for(const g of s.groups)if(g.side===side&&living(g)&&!chosen.has(g.id)){
    reserved.add(Math.floor(g.y)*W+Math.floor(g.x));
    for(const order of [g.order,g.resumeOrder])if(order&&(order.type==='move'||order.type==='guard'))reserved.add(Math.floor(order.y)*W+Math.floor(order.x));
  }
  const slots=formationSlots(W,H,tile,groups.length,stand,traverse,reserved);
  if(!slots)return 'Không đủ chỗ dàn quân quanh điểm này. Chọn vùng đất trống rộng hơn, ngoài núi và công trình; qua sông cần cầu hoặc thuyền.';
  const reachable=new Map<boolean,Set<number>>();
  for(const g of groups){
    const onWater=!!g.naval;
    let seen=reachable.get(onWater);
    if(!seen){
      seen=new Set([tile]);const queue=[tile];
      for(let head=0;head<queue.length;head++)for(const [dx,dy] of [[0,-1],[-1,0],[1,0],[0,1]]){
        const at=queue[head],x=at%W+dx,y=Math.floor(at/W)+dy,t=y*W+x;
        if(x<0||x>=W||y<0||y>=H||seen.has(t)||blockedTerrain(s.terrain[t],onWater||deck.has(t))||side==='defender'&&blocks.has(t))continue;
        seen.add(t);queue.push(t);
      }
      reachable.set(onWater,seen);
    }
    const from=Math.floor(g.y)*W+Math.floor(g.x);
    // A legacy spawn inside a house can still leave through an open neighbour.
    const canExit=side==='defender'&&blocks.has(from)&&[[0,-1],[-1,0],[1,0],[0,1]].some(([dx,dy])=>{const x=Math.floor(g.x)+dx,y=Math.floor(g.y)+dy;return x>=0&&x<W&&y>=0&&y<H&&seen!.has(y*W+x);});
    if(!seen.has(from)&&!canExit)return 'Không có đường cho toàn bộ nhóm tới điểm gác. Kiểm tra cầu, thuyền, núi và cổng; chưa thay đổi lệnh của nhóm.';
  }
  if(destinations)for(const [id,to] of assignFormation(groups,slots,W))destinations.set(id,to);
  return null;
}

/** Pick a blocker with a reachable attack face, favouring progress toward the order.
 * Never target an unreachable inner wall while an outer barrier still seals it. */
function breach(s:BattleState,g:BattleGroup,target:{x:number;y:number},deck:ReadonlySet<number>){
  if(g.side!=='attacker'||UNITS[g.u].atk<=0 || (g.breachRetryAt??0)>s.lastTick)return false;
  g.breachRetryAt=s.lastTick+1000;
  const blockers=new Map(s.buildings.filter(b=>blockingBuilding(b,g.side)).map(b=>[b.tile,b]));
  const start=Math.floor(g.y)*W+Math.floor(g.x),queue=[start],distance=new Int32Array(W*H).fill(-1);distance[start]=0;
  let best:BattleBuilding|undefined,score=Infinity;
  for(let head=0;head<queue.length;head++){const tile=queue[head];
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const x=tile%W+dx,y=Math.floor(tile/W)+dy,t=y*W+x;if(x<0||x>=W||y<0||y>=H)continue;
      const block=blockers.get(t);if(block){const value=distance[tile]+dist(xy(t),target);if(value<score){best=block;score=value;}continue;}
      if(distance[t]!==-1||blockedTerrain(s.terrain[t],g.naval||deck.has(t)))continue;distance[t]=distance[tile]+1;queue.push(t);
    }
  }
  if(!best)return false;
  if(!g.resumeOrder)g.resumeOrder={...g.order};
  g.order={type:'attack',targetId:best.id};delete g.path;delete g.breachRetryAt;return true;
}

function retreatExit(s:BattleState,g:BattleGroup,deck:ReadonlySet<number>){
  if(g.retreatExit)return g.retreatExit;
  if(g.entry)return g.retreatExit={...g.entry};
  const blocks=new Set(s.buildings.filter(b=>blockingBuilding(b,g.side)).map(b=>b.tile)),start=Math.floor(g.y)*W+Math.floor(g.x),queue=[start],seen=new Set(queue);
  for(let head=0;head<queue.length;head++){const tile=queue[head];if(tile%W===0){g.retreatExit={x:0,y:Math.floor(tile/W)+.5};return g.retreatExit;}
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const x=tile%W+dx,y=Math.floor(tile/W)+dy,t=y*W+x;if(x<0||x>=W||y<0||y>=H||seen.has(t)||blocks.has(t)||blockedTerrain(s.terrain[t],g.naval||deck.has(t)))continue;seen.add(t);queue.push(t);}
  }
  return {x:0,y:g.y};
}

/** A flask belongs to its mage: fallen mages lose theirs. */
function damage(g:BattleGroup,amount:number){g.hp=Math.max(0,g.hp-amount);g.count=Math.ceil(g.hp/unitHp(g));if(g.flask!==undefined)g.flask=Math.min(g.flask,100*g.count);}
/** Linh lộc escort: at most four allies in three tiles take 10% less; never stacks. */
function escort(s:BattleState,target:BattleGroup){
  for(const deer of s.groups)if(deer.u==='spiritdeer'&&deer.side===target.side&&living(deer)&&deer!==target&&dist(deer,target)<=3){
    const near=s.groups.filter(a=>a.side===deer.side&&a!==deer&&living(a)&&dist(a,deer)<=3).sort((a,b)=>dist(a,deer)-dist(b,deer)||a.id.localeCompare(b.id)).slice(0,4);
    if(near.includes(target))return .9;
  }
  return 1;
}
/** Huyền Quy: up to four nearest allies within two tiles of a tortoise take 15% less. */
function cover(s:BattleState,target:BattleGroup){
  return s.groups.some(t=>t.u==='tortoise'&&t.side===target.side&&living(t)&&t!==target&&dist(t,target)<=COVER.radius&&s.groups.filter(a=>a.side===t.side&&a!==t&&living(a)&&dist(a,t)<=COVER.radius).sort((a,b)=>dist(a,t)-dist(b,t)||a.id.localeCompare(b.id)).slice(0,COVER.targets).includes(target));
}
const sheltered=(s:BattleState,target:BattleGroup)=>!!s.spellEffects?.some(e=>e.kind==='sanctuary'&&e.side===target.side&&e.start<=s.lastTick&&s.lastTick<e.until&&dist(e,target)<=MAGIC_SPELLS.sanctuary.radius);
/** Linh lộc 10%, Huyền Quy 15%, Hộ giới 25%: different names add, at most 30% (spec 2.3). */
const mitigation=(s:BattleState,target:BattleGroup)=>1-Math.min(.3,(escort(s,target)<1?.1:0)+(cover(s,target)?.15:0)+(sheltered(s,target)?MAGIC_SPELLS.sanctuary.reduction:0));
const hurt=(s:BattleState,target:BattleGroup,amount:number)=>damage(target,amount*mitigation(s,target));
/** Hỏa cầu per mage in the squad: 60 at the target, 30 to four more within 1.5
 * tiles (buildings ×0.5, never the caster's own); 30 flask mana and 20 s each. */
function fireball(s:BattleState,g:BattleGroup,target:BattleGroup):boolean{
  const spell=MAGIC_SPELLS.fireball;if(g.u!=='firemage'||(g.castAt??0)>s.lastTick||(g.flask??0)<spell.mana)return false;
  const casts=Math.min(g.count,Math.floor((g.flask!+1e-9)/spell.mana)),power=casts*(s.specialization?.[g.side]==='fire'?1.1:1);
  hurt(s,target,spell.damage*power);
  const near:(BattleGroup|BattleBuilding)[]=[...s.groups.filter(e=>e.side!==g.side&&e!==target&&living(e)&&dist(e,target)<=spell.radius),...(g.side==='attacker'?s.buildings.filter(b=>!b.burned&&dist(xy(b.tile),target)<=spell.radius):[])];
  const at=(e:BattleGroup|BattleBuilding)=>'tile'in e?xy(e.tile):e;
  for(const e of near.sort((a,b)=>dist(at(a),target)-dist(at(b),target)||a.id.localeCompare(b.id)).slice(0,spell.targets-1)){
    if('tile'in e){e.hp=Math.max(0,e.hp-spell.splash*power*spell.buildingScale);if(!e.hp)e.burned=true;}else hurt(s,e,spell.splash*power);
  }
  g.flask=g.flask!-casts*spell.mana;g.castAt=s.lastTick+spell.cooldown;
  strike(s,g.id,'shell',g,target,true);return true;
}
/** Thủy hồi per mage: 50 HP to up to three wounded allies (four with Thủy) in two tiles,
 * only when they miss at least 50 HP together. Heals never revive a fallen unit. */
function waterheal(s:BattleState,g:BattleGroup):boolean{
  const spell=MAGIC_SPELLS.waterheal;if(g.u!=='watermage'||(g.castAt??0)>s.lastTick||(g.nextAttackAt??0)>s.lastTick||(g.flask??0)<spell.mana)return false;
  const missing=(a:BattleGroup)=>Math.max(0,a.count*unitHp(a)-a.hp);
  const allies=s.groups.filter(a=>a.side===g.side&&living(a)&&dist(a,g)<=spell.radius&&missing(a)>0).sort((a,b)=>dist(a,g)-dist(b,g)||a.id.localeCompare(b.id));
  if(allies.reduce((n,a)=>n+missing(a),0)<50)return false;
  const casts=Math.min(g.count,Math.floor((g.flask!+1e-9)/spell.mana));let pool=casts*spell.heal*(spell.targets+(s.specialization?.[g.side]==='water'?1:0));
  for(const a of allies){const add=Math.min(pool,missing(a));a.hp+=add;pool-=add;if(pool<=0)break;}
  g.flask=g.flask!-casts*spell.mana;g.castAt=s.lastTick+spell.cooldown;g.nextAttackAt=s.lastTick+(UNITS[g.u].attackMs??1000);return true;
}
/** Phượng Hoàng: every 10 s, 30 HP for up to four allies per bird within three tiles; never revives. */
function phoenixHeal(s:BattleState,g:BattleGroup){
  if(g.u!=='phoenix'||(s.lastTick-s.startedAt)%PHOENIX.every!==0)return;
  const missing=(a:BattleGroup)=>Math.max(0,a.count*unitHp(a)-a.hp);let pool=PHOENIX.amount*PHOENIX.targets*g.count;
  for(const a of s.groups.filter(a=>a.side===g.side&&a!==g&&living(a)&&dist(a,g)<=PHOENIX.radius&&missing(a)>0).sort((a,b)=>dist(a,g)-dist(b,g)||a.id.localeCompare(b.id)).slice(0,PHOENIX.targets)){const add=Math.min(pool,missing(a),PHOENIX.amount*g.count*Math.min(a.count,PHOENIX.targets));a.hp+=add;pool-=add;if(pool<=0)break;}
}
/** Thiên lôi strikes five seconds after its warning zone appears (180 per unit, at most
 * six units, buildings ×0.25 for the attacker); then each side may open its packages. */
function bigSpells(s:BattleState){
  const thunder=MAGIC_SPELLS.thunder,sanctuary=MAGIC_SPELLS.sanctuary;
  for(const e of s.spellEffects??[])if(e.kind==='thunder'&&e.until===s.lastTick){
    let left=thunder.targets;
    for(const t of s.groups.filter(t=>t.side!==e.side&&living(t)&&dist(t,e)<=thunder.radius).sort((a,b)=>dist(a,e)-dist(b,e)||a.id.localeCompare(b.id))){if(left<=0)break;const n=Math.min(t.count,left);hurt(s,t,thunder.damage*n);left-=n;}
    if(e.side==='attacker')for(const b of s.buildings.filter(b=>!b.burned&&dist(xy(b.tile),e)<=thunder.radius).sort((a,b)=>dist(xy(a.tile),e)-dist(xy(b.tile),e)||a.tile-b.tile)){if(left<=0)break;b.hp=Math.max(0,b.hp-thunder.damage*thunder.buildingScale);if(!b.hp)b.burned=true;left--;}
    strike(s,e.id,'shell',e,e,true);
  }
  if(s.spellEffects?.length)s.spellEffects=s.spellEffects.filter(e=>e.until>s.lastTick);
  for(const side of ['attacker','defender'] as const){
    const ready=s.packages?.[side];if(!ready)continue;
    if(ready.thunder==='ready'){
      const own=s.groups.filter(a=>a.side===side&&living(a));
      const seen=s.groups.filter(f=>f.side!==side&&living(f)&&(own.some(a=>dist(a,f)<=VISION)||side==='defender'&&s.buildings.some(b=>!b.burned&&dist(xy(b.tile),f)<=VISION)));
      const center=seen.slice().sort((a,b)=>a.id.localeCompare(b.id)).find(f=>seen.reduce((n,o)=>n+(dist(o,f)<=thunder.radius?o.count:0),0)>=4);
      if(center){ready.thunder='used';(s.spellEffects??=[]).push({id:`${side}:thunder`,side,kind:'thunder',x:center.x,y:center.y,start:s.lastTick,until:s.lastTick+thunder.windup});}
    }
    if(ready.sanctuary==='ready'){
      const wounded=s.groups.filter(a=>a.side===side&&living(a)&&a.hp<.5*a.initial*unitHp(a));
      if(wounded.reduce((n,a)=>n+a.count,0)>=4){
        const score=(g:BattleGroup)=>wounded.reduce((n,o)=>n+(dist(o,g)<=sanctuary.radius?o.count:0),0);
        const center=wounded.slice().sort((a,b)=>score(b)-score(a)||a.id.localeCompare(b.id))[0];
        ready.sanctuary='used';(s.spellEffects??=[]).push({id:`${side}:sanctuary`,side,kind:'sanctuary',x:center.x,y:center.y,start:s.lastTick,until:s.lastTick+sanctuary.duration});
      }
    }
  }
}
function strike(s:BattleState,source:string,kind:BattleStrike['kind'],from:{x:number;y:number},to:{x:number;y:number},force=false) {
  // One visual volley per second; damage remains on the authoritative 100 ms clock.
  if (!force&&!s.groups.some(g=>g.id===source&&UNITS[g.u].attackMs)&& (s.lastTick-s.startedAt-BATTLE_TICK_MS)%1000!==0) return;
  (s.strikes ??= []).push({id:`${source}:${s.lastTick}`,at:s.lastTick,source,kind,from:{x:from.x,y:from.y},to:{x:to.x,y:to.y}});
}
function volley(s:BattleState,g:BattleGroup,target:BattleGroup|BattleBuilding){
  const unit=UNITS[g.u];if(unit.attackMs&&(g.nextAttackAt??0)>s.lastTick)return;
  const position='tile'in target?xy(target.tile):target;
  if(unit.attackMs)g.nextAttackAt=s.lastTick+unit.attackMs;
  // A mage casts instead of its basic attack within the same action cooldown.
  if(!('tile'in target)&&fireball(s,g,target))return;
  const close=(g.u==='crossbow'&&dist(g,position)<1.5)?.6:(g.u==='cannon'&&dist(g,position)<1.5)?.45:1;
  const base=unit.atk*g.count*(unit.attackMs?unit.attackMs/1000:.1)*close,hit=base*('tile'in target?(unit.buildingAtk??1):unitCounter(g.u,target.u)*antiAir(g.u,target.u));
  strike(s,g.id,unit.shot??(g.u==='bow'?'arrow':g.u==='sling'?'stone':'melee'),g,position);
  if('tile'in target){target.hp=Math.max(0,target.hp-hit);if(!target.hp)target.burned=true;}else hurt(s,target,hit);
  // Thanh Long: two more enemies within reach (nearest the target, then id) take 50%.
  if(g.u==='dragon'&&!('tile'in target))for(const e of s.groups.filter(e=>e.side!==g.side&&e!==target&&living(e)&&dist(e,g)<=range(g.u)).sort((a,b)=>dist(a,target)-dist(b,target)||a.id.localeCompare(b.id)).slice(0,2))hurt(s,e,base*.5*unitCounter(g.u,e.u)*antiAir(g.u,e.u));
}
function tick(s:BattleState){
  s.strikes=(s.strikes??[]).filter(e=>s.lastTick-e.at<1200);

  let deck=battleBridgeTiles(s);
  if(s.status==='fighting'&&s.lastTick-s.startedAt>=BATTLE_TIMEOUT_MS)commandBattle(s,'attacker',{type:'retreat'});
  for(const g of s.groups){g.moving=false;g.blocked=false;if(!living(g))continue;
    // A destroyed span closes to new crossings. Troops caught on it withdraw
    // continuously along that span to the nearest safe bank, keeping their order.
    const here=Math.floor(g.y)*W+Math.floor(g.x);
    if(!g.naval&&!flying(g)&&s.terrain[here]===R&&!deck.has(here)){
      const bridge=s.buildings.find(b=>b.bridge?.tiles.includes(here));
      if(bridge?.bridge){
        const ends=[bridge.tile,bridge.bridge.to].filter(tile=>!blockedTerrain(s.terrain[tile])&&!s.buildings.some(b=>b.tile===tile&&blockingBuilding(b,g.side))).sort((a,b)=>dist(g,xy(a))-dist(g,xy(b))||a-b);
        if(ends.length){move(s,g,xy(ends[0]),new Set(bridge.bridge.tiles),true);continue;}
      }
    }
    const enemy=s.groups.filter(e=>e.side!==g.side&&living(e)&&canHit(g.u,e.u)).sort((a,b)=>dist(g,a)-dist(g,b)||a.id.localeCompare(b.id))[0];
    phoenixHeal(s,g);
    if(waterheal(s,g))continue;
    if(g.order.type==='retreat'){const exit=retreatExit(s,g,deck);if(!move(s,g,exit,deck))breach(s,g,exit,deck);if(dist(g,exit)<=.3)g.escaped=true;continue;}
    if(g.u==='wagon'||g.u==='medic'){
      const allies=s.groups.filter(a=>a.side===g.side&&living(a)&&UNITS[a.u].atk>0);
      const wounded=allies.filter(a=>a.hp<a.count*unitHp(a)).sort((a,b)=>dist(g,a)-dist(g,b))[0];
      const lead=(g.u==='medic'?wounded:undefined)??allies.sort((a,b)=>dist(g,a)-dist(g,b))[0];
      if(g.u==='medic'&&wounded&&dist(g,wounded)<=3)wounded.hp=Math.min(wounded.count*unitHp(wounded),wounded.hp+g.count*.4);
      if(g.order.type==='move')move(s,g,g.order,deck);
      else if(lead&&dist(g,lead)>2)move(s,g,{x:Math.max(.5,Math.min(W-.5,lead.x+(g.side==='attacker'?-2:2))),y:lead.y},deck);
      continue;
    }
    // Explicit repositioning overrides automatic melee/ranged attacks on both
    // sides, so an engaged attacker can disengage rather than ignore the order.
    if((g.side==='attacker'||s.defenderOnline)&&g.order.type==='move'){
      const destination=g.order;if(!move(s,g,destination,deck))breach(s,g,destination,deck);
      if(dist(g,destination)<.01){g.order={type:'guard',x:g.x,y:g.y};delete g.path;}
      continue;
    }
    const tile=Math.floor(g.y)*W+Math.floor(g.x),aboard=!flying(g)&&s.terrain[tile]===R&&!deck.has(tile);
    if(!aboard&&enemy&&dist(g,enemy)<=range(g.u)){volley(s,g,enemy);continue;}
    if(g.side==='defender'){
      if(enemy&&!s.defenderOnline&&(s.status==='retreating'||dist(g,enemy)<10)){move(s,g,enemy,deck);continue;}
      if(!s.defenderOnline&&g.order.type!=='guard'){g.order={type:'guard',x:g.x,y:g.y};}
    }
    if(g.order.type==='move'||g.order.type==='guard'){if(!move(s,g,g.order,deck))breach(s,g,g.order,deck);}
    else if(g.order.type==='attack'){
      const target=s.groups.find(e=>e.id===(g.order as {targetId:string}).targetId&&living(e)&&canHit(g.u,e.u))??s.buildings.find(b=>b.id===(g.order as {targetId:string}).targetId&&!b.burned);
      if(target){const p='tile'in target?xy(target.tile):target;if(!aboard&&dist(g,p)<=range(g.u)){volley(s,g,target);if('tile'in target&&target.burned)deck=battleBridgeTiles(s);}else if(!move(s,g,p,deck))breach(s,g,p,deck);}
      else if(g.resumeOrder){g.order=g.resumeOrder;delete g.resumeOrder;delete g.path;}
      else if(g.side==='attacker'){const next=s.buildings.filter(b=>!b.burned).sort((a,b)=>dist(g,xy(a.tile))-dist(g,xy(b.tile)))[0];if(next)g.order={type:'attack',targetId:next.id};else if(enemy)g.order={type:'attack',targetId:enemy.id};}
    }
  }
  bigSpells(s);
  if(!s.towerSlotsReady){
    const center=s.buildings.find(b=>b.k==='hall')?.tile??s.defenseCenter??Math.floor(W*H/2);
    const enabled=selectTowerTiles(s.buildings.filter(b=>b.k==='watchtower'&&!b.burned&&!b.inactive),s.defenderEra??3,center);
    for(const b of s.buildings)if(b.k==='watchtower')b.towerEnabled=enabled.has(b.tile);
    s.towerSlotsReady=true;
  }
  for(const b of s.buildings)if(b.k==='watchtower'&&b.towerEnabled&&!b.burned&&!b.inactive&&(b.nextAttackAt??0)<=s.lastTick){
    const weapon=towerStats(b.lvl),origin=xy(b.tile);
    let target:BattleGroup|undefined,nearest=weapon.range;
    for(const g of s.groups)if(g.side==='attacker'&&living(g)){const distance=dist(g,origin);if(distance<=nearest){target=g;nearest=distance;}}
    if(target){b.nextAttackAt=s.lastTick+weapon.attackMs;strike(s,b.id,(s.defenderEra??3)>=5?'bullet':'arrow',origin,target,true);hurt(s,target,towerDamage(b.lvl,target.u,s.defenderEra??3));}
  }
  const total=s.buildings.reduce((n,b)=>n+(b.initiallyBurned?0:b.value),0),burned=s.buildings.reduce((n,b)=>n+(b.burned&&!b.initiallyBurned?b.value:0),0),fraction=total?burned/total:0;
  s.populationLoss=Math.min(Math.floor(s.initialPopulation/2),Math.floor(fraction*s.initialPopulation/2));
  // Flyers cannot take the stores or the hall: loot and a devastation win need ground troops.
  const ground=s.groups.some(g=>g.side==='attacker'&&living(g)&&!flying(g));
  if(s.status==='fighting'&&ground)for(const r of RES)s.loot[r]=Math.max(s.loot[r],Math.floor((s.startingResources[r]??0)*.25*fraction));
  const cap=RES.reduce((n,r)=>n+(s.startingResources[r]??0)*.25,0),looted=RES.reduce((n,r)=>n+s.loot[r],0);
  s.devastation=.5*fraction+.3*(s.initialPopulation>=2?s.populationLoss/Math.floor(s.initialPopulation/2):0)+.2*(cap?looted/cap:0);
  if(s.status==='fighting'&&ground&&s.devastation>=(s.defenderOnline?.5:.4)){s.status='finished';s.winner='attacker';return;}
  if(!s.groups.some(g=>g.side==='attacker'&&living(g))){s.status='finished';s.winner='defender';}
}
export function advanceBattle(s:BattleState,now:number):BattleState {
  if(!Number.isFinite(now))return s;
  while(s.status!=='finished'&&s.lastTick+BATTLE_TICK_MS<=now){s.lastTick+=BATTLE_TICK_MS;tick(s);}
  if(s.status==='finished')for(const g of s.groups)g.moving=false;return s;
}
export function battleResult(s:BattleState):BattleResult|null {
  if(s.status!=='finished'||!s.winner)return null;const survivors=(side:BattleSide):Troops=>{const troops:Troops={};for(const g of s.groups)if(g.side===side)troops[g.u]=(troops[g.u]??0)+g.count;return troops;};
  const casualties=(side:BattleSide)=>s.groups.filter(g=>g.side===side).reduce((n,g)=>n+g.initial-g.count,0);
  const flask=(side:BattleSide)=>s.groups.reduce((n,g)=>n+(g.side===side?g.flask??0:0),0);
  const used=(side:BattleSide)=>(['thunder','sanctuary'] as const).filter(k=>s.packages?.[side]?.[k]==='used');
  return{...(s.packages?{spells:{attacker:used('attacker'),defender:used('defender')}}:{}),...(s.groups.some(g=>g.flask!==undefined)?{flask:{attacker:flask('attacker'),defender:flask('defender')}}:{}),winner:s.winner,attackerSurvivors:survivors('attacker'),defenderSurvivors:survivors('defender'),attackerCasualties:casualties('attacker'),defenderCasualties:casualties('defender'),populationLoss:s.populationLoss,burnedTiles:s.buildings.filter(b=>b.burned&&!b.initiallyBurned).map(b=>b.tile),loot:{...s.loot},devastation:s.devastation};
}
