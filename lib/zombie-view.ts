import type {City} from './engine';
import type {Zombie} from './zombies';
export const zombieName=(kind:Zombie['kind'])=>kind==='super'?'Zombie Super':kind==='breaker'?'Zombie phá hoại':'Zombie thường';
/** Never present not-yet-emerged, dead or expired actors as visible attackers. */
export function zombiePresence(c:Pick<City,'zombies'>,now:number){
 const alive=(c.zombies?.actors??[]).filter(z=>z.hp>0&&z.until>now);
 return {active:alive.filter(z=>(z.emergesAt??0)<=now),pending:alive.filter(z=>(z.emergesAt??0)>now)};
}
export function locateNextZombie(c:Pick<City,'zombies'>,now:number,previous:number|null=null){
 const {active,pending}=zombiePresence(c,now),list=active.length?active:pending;
 return list.length?list[(list.findIndex(z=>z.id===previous)+1)%list.length]:undefined;
}

/** Interpolate the last simulated step; never extrapolate across unknown terrain. */
export function zombieDrawPosition(z:Zombie,last:number,now:number){
 const progress=Math.max(0,Math.min(1,(now-last)/1000));
 return z.walking&&z.fromX!==undefined&&z.fromY!==undefined?{x:z.fromX+(z.x-z.fromX)*progress,y:z.fromY+(z.y-z.fromY)*progress}:{x:z.x,y:z.y};
}
