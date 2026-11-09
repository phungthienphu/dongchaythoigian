/** Shared construction and PvP rules. Existing excess towers are never deleted. */
export const TOWER_LIMITS=[0,2,3,4,5,6,8] as const;
export function towerLimit(era:number){return TOWER_LIMITS[Math.max(1,Math.min(6,Math.floor(Number.isFinite(era)?era:1)))];}
export function towerStats(level:number){
 const lvl=Math.max(1,Math.min(3,Math.floor(level)));
 return {damage:[0,6,9,12][lvl],range:10,attackMs:1500};
}
/** Thick hide resists tower arrows, not gunpowder or other units' attacks. */
export function towerDamage(level:number,target:string,defenderEra:number){
 return towerStats(level).damage*(target==='elephant'&&defenderEra<5?.5:1);
}
type TowerCandidate={tile:number;lvl:number};
/** Select once per battle: highest level, then nearest hall/camp, then tile id.
 * Reserves do not replace destroyed towers during that battle. */
export function selectTowerTiles(candidates:TowerCandidate[],era:number,center:number){
 const distance=(tile:number)=>Math.hypot(tile%96-center%96,Math.floor(tile/96)-Math.floor(center/96));
 return new Set(candidates.slice().sort((a,b)=>b.lvl-a.lvl||distance(a.tile)-distance(b.tile)||a.tile-b.tile).slice(0,towerLimit(era)).map(b=>b.tile));
}
