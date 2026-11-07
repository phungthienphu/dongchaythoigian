/** Database-free, reproducible matchups. Budget points are a synthetic equal
 * resource-weight test convention, NOT market prices or live player win rates. */
import {G,HL,R,RES,UNITS,buildingCost,levelCost,trainingCost,newCity,idx,type BKey,type City,type Troops,type UKey} from '../lib/engine';
import {advanceBattle,battleResult,createBattle,commandBattle} from '../lib/battle';
import {towerLimit} from '../lib/tower-balance';

const points=(cost:Partial<City['res']>)=>RES.reduce((n,r)=>n+(cost[r]??0),0);
const investment=(k:BKey,level:number,era:number)=>{
 let total=points(buildingCost(k,era));
 for(let next=2;next<=level;next++)total+=points(levelCost(k,next,era));
 return total;
};
const core:UKey[]=['club','spear','sword','crossbow','musket','infantry'];
const alternative:UKey[]=['sling','bow','elephant','cavalry','cannon','armor'];
const rows=[];
for(let era=1;era<=6;era++)for(const layout of ['open','choke','river']as const)for(const online of [false,true])for(const attackingUnit of [core[era-1],alternative[era-1]]){
 const village=(seed:number):City=>{const c=newCity(0,seed);c.era=era;c.t.fill(G);c.seen.fill(1);c.b={};c.army={};c.people=[];c.pop=era*20;c.camps=[];c.herds=[];c.camp=idx(45,48);c.manualWorkforce=true;return c;};
 const attacker=village(1),defender=village(2),level=era===1?1:3;
 // A shared home target is excluded from the combat budget, as are training
 // facilities, their capacity and expedition provisions. Stone has no hall.
 defender.b[idx(45,48)]={k:era===1?'hut':'hall',lvl:era===1?1:Math.max(3,era),doneAt:null};
 let defenseCost=0;
 const towers=towerLimit(era);
 for(let n=0;n<towers;n++){
  const tile=idx(39+n%2*3,44+Math.floor(n/2)*3);defender.b[tile]={k:'watchtower',lvl:level,doneAt:null};
  defenseCost+=investment('watchtower',level,era);
 }
 if(layout==='choke'){
  for(let y=0;y<96;y++)if(y<45||y>51)defender.t[idx(35,y)]=HL;
  for(let y=45;y<=51;y++){defender.b[idx(35,y)]={k:y===48?'gate':'wall',lvl:level,doneAt:null};defenseCost+=investment(y===48?'gate':'wall',level,era);}
 }
 if(layout==='river')for(let y=0;y<96;y++)defender.t[idx(30,y)]=R;
 const capacity=era===1?30:90,cost=points(trainingCost(attackingUnit,era));
 const baseBudget=points(trainingCost(core[era-1],era))*Math.min(capacity,60);
 const budget=Math.max(baseBudget,defenseCost+points(trainingCost(core[era-1],era))*5);
 const attackCount=Math.min(Math.floor(capacity/UNITS[attackingUnit].space),Math.floor(budget/cost));
 const defenseCount=Math.min(capacity,Math.max(0,Math.floor((budget-defenseCost)/points(trainingCost(core[era-1],era)))));
 const troops:Troops={[attackingUnit]:attackCount};defender.army={[core[era-1]]:defenseCount};
 const battle=createBattle({id:`audit-${rows.length}`,attackerId:'synthetic-a',defenderId:'synthetic-d',attacker,defender,troops,now:0,defenderOnline:online});
 // The online strategy explicitly prioritizes invaders; offline uses game AI.
 if(online)for(const g of battle.groups.filter(g=>g.side==='defender'))commandBattle(battle,'defender',{type:'attack',groupId:g.id,targetId:battle.groups.find(g=>g.side==='attacker')!.id});
 advanceBattle(battle,240000);const result=battleResult(battle);
 if(!result)throw new Error(`Match ${battle.id} failed to finish`);
 if(result.attackerCasualties<0||result.defenderCasualties<0)throw new Error('Invalid casualties');
 rows.push({era,layout,online,attackingUnit,attackCount,defenseCount,towers,budget,attackerSpent:attackCount*cost,defenderSpent:defenseCost+defenseCount*points(trainingCost(core[era-1],era)),durationMs:battle.lastTick,...result});
}
console.log(JSON.stringify({method:'72 synthetic fixtures. Same-era budget ceilings; all resource units have equal test weight. Tower/wall/gate investment includes initial construction plus every upgrade at the current era price. Army space ceilings 30/90 and era tower limits; stone towers level 1, later level 3. Home target, training facilities/capacity and march provisions excluded from both budgets. Population 20 per era, existing starting resource stock. Online defender uses explicit attack orders once; offline uses AI. Attackers start at the land component edge: river layout does not test boarding or a crossing. Caps and integer rounding can leave unequal unused budget: inspect spent columns. No live win-rate inference.',rows},null,2));
