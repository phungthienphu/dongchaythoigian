import {UKEYS,UNITS,troopCount,type Troops,type UKey} from './engine';
export type RoadFight={last:number;rounds:number;attackers:Troops;defenders:Troops;attackerHp:Partial<Record<UKey,number>>;defenderHp:Partial<Record<UKey,number>>;finished:boolean;won?:boolean};
const health=(t:Troops)=>Object.fromEntries(UKEYS.map(u=>[u,(t[u]??0)*UNITS[u].hp]));
const damage=(t:Troops)=>UKEYS.reduce((n,u)=>n+(t[u]??0)*UNITS[u].atk,0);
function hit(t:Troops,hp:Partial<Record<UKey,number>>,amount:number){for(const u of ['armor','cavalry','elephant','infantry','sword','spear','club','crossbow','musket','cannon','bow','sling','wagon','medic'] as UKey[]){const n=Math.min(hp[u]??0,amount);hp[u]=(hp[u]??0)-n;t[u]=Math.ceil(hp[u]!/UNITS[u].hp);amount-=n;if(amount<=0)break;}}
function heal(t:Troops,hp:Partial<Record<UKey,number>>){let available=(t.medic??0)*3;for(const u of UKEYS){const n=Math.min(available,Math.max(0,(t[u]??0)*UNITS[u].hp-(hp[u]??0)));hp[u]=(hp[u]??0)+n;available-=n;}}
export function startRoadFight(attackers:Troops,defenders:Troops,at:number):RoadFight{return{last:at,rounds:0,attackers:{...attackers},defenders:{...defenders},attackerHp:health(attackers),defenderHp:health(defenders),finished:false};}
/** Simultaneous damage on persisted seconds: opening the screen cannot change losses. */
export function advanceRoadFight(f:RoadFight,now:number){
 while(!f.finished&&f.last+1000<=now){f.last+=1000;f.rounds++;const a=damage(f.attackers),d=damage(f.defenders);hit(f.attackers,f.attackerHp,d);hit(f.defenders,f.defenderHp,a);heal(f.attackers,f.attackerHp);heal(f.defenders,f.defenderHp);
  if(!damage(f.attackers)||!troopCount(f.defenders)||f.rounds>=60){f.finished=true;f.won=!!damage(f.attackers)&&!troopCount(f.defenders);}
 }
 return f;
}
