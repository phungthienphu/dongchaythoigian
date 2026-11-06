/** Serializable, deterministic battle simulation. All time advances in 100 ms ticks.
 * Balance defaults: loot cap is 25% of each starting resource; civilian loss is
 * capped at floor(pop/2). Retreating armies can be pursued until they leave. */
import { isRock, shipsFree, shipsNeeded, B, H, HL, O, R, RES, UKEYS, UNITS, W, type City, type Res, type Troops, type UKey } from './engine';
export const BATTLE_TICK_MS = 100;
export const BATTLE_TIMEOUT_MS = 180_000;
export type BattleSide = 'attacker' | 'defender';
export type BattleOrder = { type: 'move'; x: number; y: number } | { type: 'attack'; targetId: string } | { type: 'guard'; x: number; y: number } | { type: 'retreat' };
export type BattleGroup = { naval?: boolean; id: string; side: BattleSide; u: UKey; count: number; initial: number; hp: number; x: number; y: number; order: BattleOrder; moving?: boolean; blocked?: boolean; entry?: {x:number;y:number}; resumeOrder?: BattleOrder; breachRetryAt?: number; retreatExit?: {x:number;y:number}; escaped?: boolean; path?: number[] | null; pathGoal?: number; pathVersion?: number };
export type BattleBuilding = { id: string; tile: number; k: string; lvl: number; hp: number; maxHp: number; inactive?: boolean; burned: boolean; initiallyBurned: boolean; value: number };
export type BattleCommand = { type: 'move'; groupId: string; x: number; y: number } | { type: 'attack'; groupId: string; targetId: string } | { type: 'retreat' } | { type: 'presence'; online: boolean };
export type BattleStrike = { id: string; at: number; source: string; kind: 'arrow' | 'stone' | 'melee'; from: {x:number;y:number}; to: {x:number;y:number} };
export type BattleState = { strikes?: BattleStrike[]; id: string; attackerId: string; defenderId: string; startedAt: number; lastTick: number; terrain: number[]; groups: BattleGroup[]; buildings: BattleBuilding[]; status: 'fighting' | 'retreating' | 'finished'; winner?: BattleSide; defenderOnline: boolean; initialPopulation: number; populationLoss: number; startingResources: Res; loot: Res; devastation: number };
export type BattleResult = { winner: BattleSide; attackerSurvivors: Troops; defenderSurvivors: Troops; attackerCasualties: number; defenderCasualties: number; populationLoss: number; burnedTiles: number[]; loot: Res; devastation: number };
const emptyRes = (): Res => ({ food: 0, wood: 0, stone: 0, copper: 0 , gold: 0, diamond: 0});
const dist = (a: {x:number;y:number}, b: {x:number;y:number}) => Math.hypot(a.x-b.x,a.y-b.y);
const xy = (tile:number) => ({ x: tile % W + .5, y: Math.floor(tile / W) + .5 });
const living = (g:BattleGroup) => g.count > 0 && !g.escaped;
const range = (u:UKey) => u === 'bow' ? 6 : u === 'sling' ? 4 : 1.4;
const flatBuilding=(k:string)=>['farm','canal','levee'].includes(k);
const blockingBuilding=(b:BattleBuilding,side:BattleSide)=>!b.burned&&!flatBuilding(b.k)&&!(b.k==='gate'&&side==='defender');
const blockedTerrain=(terrain:number,naval=false)=>(terrain===R&&!naval)||isRock(terrain);
function safeSpawn(terrain:number[],buildings:BattleBuilding[],side:BattleSide,p:{x:number;y:number}){
  const blocked=new Set(buildings.filter(b=>blockingBuilding(b,side)).map(b=>b.tile));
  const start=Math.max(0,Math.min(H-1,Math.floor(p.y)))*W+Math.max(0,Math.min(W-1,Math.floor(p.x)));
  const queue=[start],seen=new Set(queue);
  for(let head=0;head<queue.length;head++){const tile=queue[head];if(!blockedTerrain(terrain[tile])&&!blocked.has(tile))return xy(tile);
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const x=tile%W+dx,y=Math.floor(tile/W)+dy,t=y*W+x;if(x>=0&&x<W&&y>=0&&y<H&&!seen.has(t)){seen.add(t);queue.push(t);}}
  }
  return p;
}

/** Enter from the perimeter of the village's land component, never across a river.
 * Buildings are deliberately ignored here: fortifications must still be breached. */
function invasionEntry(terrain:number[],center:{x:number;y:number},preferredY:number){
  const origin=safeSpawn(terrain,[],'attacker',center),start=Math.floor(origin.y)*W+Math.floor(origin.x);
  const queue=[start],seen=new Set(queue);let best=start,score=Infinity;
  for(let head=0;head<queue.length;head++){
    const tile=queue[head],value=(tile%W)*H+Math.abs(Math.floor(tile/W)+.5-preferredY);
    if(value<score){score=value;best=tile;}
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const x=tile%W+dx,y=Math.floor(tile/W)+dy,t=y*W+x;
      if(x<0||x>=W||y<0||y>=H||seen.has(t)||blockedTerrain(terrain[t]))continue;seen.add(t);queue.push(t);
    }
  }
  return xy(best);
}

export function createBattle(o: { id: string; attackerId: string; defenderId: string; attacker: City; defender: City; troops: Troops; now: number; attackerShips?: number; defenderOnline?: boolean }): BattleState {
  const buildings: BattleBuilding[] = Object.entries(o.defender.b).filter(([,b]) => b.lvl > 0).map(([tile,b]) => {
    const value = Object.values(B[b.k].cost).reduce((s,n)=>s+(n??0),0)*b.lvl;
    const maxHp = Math.max(60,value*2);
    return {id:`b:${tile}`,tile:Number(tile),k:b.k,lvl:b.lvl,hp:(b as typeof b & {burned?:boolean}).burned?0:maxHp,maxHp,burned:!!(b as typeof b & {burned?:boolean}).burned,initiallyBurned:!!(b as typeof b & {burned?:boolean}).burned,inactive:!!b.flooded,value};
  });
  const guards = (o.defender as City & {guardPosts?:{x:number;y:number}[]}).guardPosts ?? [];
  const center = xy(Number(Object.keys(o.defender.b).find(k=>o.defender.b[k].k==='hall') ?? o.defender.camp));
  const groups:BattleGroup[]=[];
  for(const side of ['attacker','defender'] as const) for(const u of UKEYS) {
    const count=Math.max(0,Math.floor((side==='attacker'?o.troops:o.defender.army)[u]??0));
    if(!count)continue;
    const naval=side==='attacker'?(o.attackerShips??shipsFree(o.attacker,o.now))>=shipsNeeded(o.troops):shipsFree(o.defender,o.now)>=shipsNeeded(o.defender.army);
    const p=side==='attacker'?invasionEntry(o.defender.t,center,Math.min(H-2,Math.max(1,center.y+groups.length*2))):guards[groups.filter(g=>g.side==='defender').length%Math.max(1,guards.length)]??center;
    groups.push({naval,id:`${side}:${u}`,side,u,count,initial:count,hp:count*UNITS[u].hp,...safeSpawn(o.defender.t,buildings,side,p),...(side==='attacker'&&p.x>1?{entry:p}:{}),order:{type:'guard',...p}});
  }
  const s:BattleState={id:o.id,attackerId:o.attackerId,defenderId:o.defenderId,startedAt:o.now,lastTick:o.now,terrain:[...o.defender.t],groups,buildings,status:'fighting',defenderOnline:!!o.defenderOnline,initialPopulation:o.defender.pop,populationLoss:0,startingResources:{...o.defender.res},loot:emptyRes(),devastation:0};
  for(const g of groups) if(g.side==='attacker') { const target=buildings.find(b=>b.k==='hall'&&!b.burned)??buildings.find(b=>!b.burned); if(target)g.order={type:'attack',targetId:target.id}; }
  return s;
}
export function commandBattle(s:BattleState,side:BattleSide,c:BattleCommand):boolean {
  if(s.status==='finished')return false;
  if(c.type==='presence'){if(side!=='defender')return false;s.defenderOnline=c.online;return true;}
  if(c.type==='retreat'){if(side!=='attacker'||s.status!=='fighting')return false;s.status='retreating';for(const g of s.groups)if(g.side==='attacker'){g.order={type:'retreat'};delete g.resumeOrder;delete g.retreatExit;}return true;}
  const g=s.groups.find(g=>g.id===c.groupId&&g.side===side&&living(g));if(!g||s.status==='retreating'&&side==='attacker')return false;
  delete g.resumeOrder;delete g.breachRetryAt;
  if(c.type==='move'){if(!Number.isFinite(c.x)||!Number.isFinite(c.y)||c.x<0||c.y<0||c.x>=W||c.y>=H)return false;g.order={type:'move',x:c.x,y:c.y};}
  else {if(!s.groups.some(t=>t.id===c.targetId&&t.side!==side&&living(t))&&!(side==='attacker'&&s.buildings.some(b=>b.id===c.targetId&&!b.burned)))return false;g.order={type:'attack',targetId:c.targetId};}delete g.path;g.blocked=false;g.moving=false;return true;
}
/** Four-neighbour BFS respects transports and intact fortifications. */
function move(s:BattleState,g:BattleGroup,target:{x:number;y:number}):boolean {
  const obstacles = new Set(s.buildings.filter(b=>blockingBuilding(b,g.side)).map(b=>b.tile));
  const impassable=(tile:number)=>tile<0||tile>=W*H||blockedTerrain(s.terrain[tile],g.naval)||obstacles.has(tile);
  const start=Math.floor(g.y)*W+Math.floor(g.x), goal=Math.max(0,Math.min(H-1,Math.floor(target.y)))*W+Math.max(0,Math.min(W-1,Math.floor(target.x)));
  if(g.pathGoal!==goal||g.pathVersion!==obstacles.size||g.path===undefined){
    g.pathGoal=goal;g.pathVersion=obstacles.size;
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
  g.moving=true;const speed=g.u==='elephant'?.15:.25;g.x+=(p.x-g.x)/d*Math.min(speed,d);g.y+=(p.y-g.y)/d*Math.min(speed,d);return true;
}
/** Pick a blocker with a reachable attack face, favouring progress toward the order.
 * Never target an unreachable inner wall while an outer barrier still seals it. */
function breach(s:BattleState,g:BattleGroup,target:{x:number;y:number}){
  if(g.side!=='attacker'||UNITS[g.u].atk<=0 || (g.breachRetryAt??0)>s.lastTick)return false;
  g.breachRetryAt=s.lastTick+1000;
  const blockers=new Map(s.buildings.filter(b=>blockingBuilding(b,g.side)).map(b=>[b.tile,b]));
  const start=Math.floor(g.y)*W+Math.floor(g.x),queue=[start],distance=new Int32Array(W*H).fill(-1);distance[start]=0;
  let best:BattleBuilding|undefined,score=Infinity;
  for(let head=0;head<queue.length;head++){const tile=queue[head];
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const x=tile%W+dx,y=Math.floor(tile/W)+dy,t=y*W+x;if(x<0||x>=W||y<0||y>=H)continue;
      const block=blockers.get(t);if(block){const value=distance[tile]+dist(xy(t),target);if(value<score){best=block;score=value;}continue;}
      if(distance[t]!==-1||blockedTerrain(s.terrain[t],g.naval))continue;distance[t]=distance[tile]+1;queue.push(t);
    }
  }
  if(!best)return false;
  if(!g.resumeOrder)g.resumeOrder={...g.order};
  g.order={type:'attack',targetId:best.id};delete g.path;delete g.breachRetryAt;return true;
}

function retreatExit(s:BattleState,g:BattleGroup){
  if(g.retreatExit)return g.retreatExit;
  if(g.entry)return g.retreatExit={...g.entry};
  const blocks=new Set(s.buildings.filter(b=>blockingBuilding(b,g.side)).map(b=>b.tile)),start=Math.floor(g.y)*W+Math.floor(g.x),queue=[start],seen=new Set(queue);
  for(let head=0;head<queue.length;head++){const tile=queue[head];if(tile%W===0){g.retreatExit={x:0,y:Math.floor(tile/W)+.5};return g.retreatExit;}
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const x=tile%W+dx,y=Math.floor(tile/W)+dy,t=y*W+x;if(x<0||x>=W||y<0||y>=H||seen.has(t)||blocks.has(t)||blockedTerrain(s.terrain[t],g.naval))continue;seen.add(t);queue.push(t);}
  }
  return {x:0,y:g.y};
}

function damage(g:BattleGroup,amount:number){g.hp=Math.max(0,g.hp-amount);g.count=Math.ceil(g.hp/UNITS[g.u].hp);}
function strike(s:BattleState,source:string,kind:BattleStrike['kind'],from:{x:number;y:number},to:{x:number;y:number}) {
  // One visual volley per second; damage remains on the authoritative 100 ms clock.
  if ((s.lastTick-s.startedAt-BATTLE_TICK_MS)%1000!==0) return;
  (s.strikes ??= []).push({id:`${source}:${s.lastTick}`,at:s.lastTick,source,kind,from:{x:from.x,y:from.y},to:{x:to.x,y:to.y}});
}
function tick(s:BattleState){
  s.strikes=(s.strikes??[]).filter(e=>s.lastTick-e.at<1200);

  if(s.status==='fighting'&&s.lastTick-s.startedAt>=BATTLE_TIMEOUT_MS)commandBattle(s,'attacker',{type:'retreat'});
  for(const g of s.groups){g.moving=false;g.blocked=false;if(!living(g))continue;
    const enemy=s.groups.filter(e=>e.side!==g.side&&living(e)).sort((a,b)=>dist(g,a)-dist(g,b)||a.id.localeCompare(b.id))[0];
    if(g.order.type==='retreat'){const exit=retreatExit(s,g);if(!move(s,g,exit))breach(s,g,exit);if(dist(g,exit)<=.3)g.escaped=true;continue;}
    if(g.u==='wagon'||g.u==='medic'){
      const allies=s.groups.filter(a=>a.side===g.side&&living(a)&&UNITS[a.u].atk>0);
      const wounded=allies.filter(a=>a.hp<a.count*UNITS[a.u].hp).sort((a,b)=>dist(g,a)-dist(g,b))[0];
      const lead=(g.u==='medic'?wounded:undefined)??allies.sort((a,b)=>dist(g,a)-dist(g,b))[0];
      if(g.u==='medic'&&wounded&&dist(g,wounded)<=3)wounded.hp=Math.min(wounded.count*UNITS[wounded.u].hp,wounded.hp+g.count*.4);
      if(g.order.type==='move')move(s,g,g.order);
      else if(lead&&dist(g,lead)>2)move(s,g,{x:Math.max(.5,Math.min(W-.5,lead.x+(g.side==='attacker'?-2:2))),y:lead.y});
      continue;
    }
    const aboard=s.terrain[Math.floor(g.y)*W+Math.floor(g.x)]===R;
    if(!aboard&&enemy&&dist(g,enemy)<=range(g.u)){strike(s,g.id,g.u==='bow'?'arrow':g.u==='sling'?'stone':'melee',g,enemy);damage(enemy,UNITS[g.u].atk*g.count/10);continue;}
    if(g.side==='defender'){
      if(enemy&&(s.status==='retreating'||dist(g,enemy)<10)){move(s,g,enemy);continue;}
      if(!s.defenderOnline&&g.order.type!=='guard'){g.order={type:'guard',x:g.x,y:g.y};}
    }
    if(g.order.type==='move'||g.order.type==='guard'){if(!move(s,g,g.order))breach(s,g,g.order);}
    else if(g.order.type==='attack'){
      const target=s.groups.find(e=>e.id===(g.order as {targetId:string}).targetId&&living(e))??s.buildings.find(b=>b.id===(g.order as {targetId:string}).targetId&&!b.burned);
      if(target){const p='tile'in target?xy(target.tile):target;if(!aboard&&dist(g,p)<=range(g.u)){strike(s,g.id,g.u==='bow'?'arrow':g.u==='sling'?'stone':'melee',g,p);if('tile'in target){target.hp=Math.max(0,target.hp-UNITS[g.u].atk*g.count/10);if(!target.hp)target.burned=true;}else damage(target,UNITS[g.u].atk*g.count/10);}else if(!move(s,g,p))breach(s,g,p);}
      else if(g.resumeOrder){g.order=g.resumeOrder;delete g.resumeOrder;delete g.path;}
      else if(g.side==='attacker'){const next=s.buildings.filter(b=>!b.burned).sort((a,b)=>dist(g,xy(a.tile))-dist(g,xy(b.tile)))[0];if(next)g.order={type:'attack',targetId:next.id};else if(enemy)g.order={type:'attack',targetId:enemy.id};}
    }
  }
  for(const b of s.buildings)if(b.k==='watchtower'&&!b.burned&&!b.inactive){const target=s.groups.find(g=>g.side==='attacker'&&living(g)&&dist(g,xy(b.tile))<=7);if(target){strike(s,b.id,'arrow',xy(b.tile),target);damage(target,2*b.lvl);}}
  const total=s.buildings.reduce((n,b)=>n+(b.initiallyBurned?0:b.value),0),burned=s.buildings.reduce((n,b)=>n+(b.burned&&!b.initiallyBurned?b.value:0),0),fraction=total?burned/total:0;
  s.populationLoss=Math.min(Math.floor(s.initialPopulation/2),Math.floor(fraction*s.initialPopulation/2));
  if(s.status==='fighting')for(const r of RES)s.loot[r]=Math.floor((s.startingResources[r]??0)*.25*fraction);
  const cap=RES.reduce((n,r)=>n+(s.startingResources[r]??0)*.25,0),looted=RES.reduce((n,r)=>n+s.loot[r],0);
  s.devastation=.5*fraction+.3*(s.initialPopulation>=2?s.populationLoss/Math.floor(s.initialPopulation/2):0)+.2*(cap?looted/cap:0);
  if(s.status==='fighting'&&s.devastation>=(s.defenderOnline?.5:.4)){s.status='finished';s.winner='attacker';return;}
  if(!s.groups.some(g=>g.side==='attacker'&&living(g))){s.status='finished';s.winner='defender';}
}
export function advanceBattle(s:BattleState,now:number):BattleState {
  if(!Number.isFinite(now))return s;
  while(s.status!=='finished'&&s.lastTick+BATTLE_TICK_MS<=now){s.lastTick+=BATTLE_TICK_MS;tick(s);}
  if(s.status==='finished')for(const g of s.groups)g.moving=false;return s;
}
export function battleResult(s:BattleState):BattleResult|null {
  if(s.status!=='finished'||!s.winner)return null;const survivors=(side:BattleSide):Troops=>Object.fromEntries(s.groups.filter(g=>g.side===side).map(g=>[g.u,g.count]));
  const casualties=(side:BattleSide)=>s.groups.filter(g=>g.side===side).reduce((n,g)=>n+g.initial-g.count,0);
  return{winner:s.winner,attackerSurvivors:survivors('attacker'),defenderSurvivors:survivors('defender'),attackerCasualties:casualties('attacker'),defenderCasualties:casualties('defender'),populationLoss:s.populationLoss,burnedTiles:s.buildings.filter(b=>b.burned&&!b.initiallyBurned).map(b=>b.tile),loot:{...s.loot},devastation:s.devastation};
}
