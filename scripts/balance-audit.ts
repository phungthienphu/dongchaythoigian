/** Reproducible synthetic economy audit. No DB, HTTP or player data. */
import {newCity,settle,idx,G,R,O,GOLD,COAL,MIN,HOUR,RES,B,UNITS,UKEYS,stats,derive,upkeepRates,marchSupplies,type City,type BKey,type ResKey} from '../lib/engine';
import {towerLimit,towerStats} from '../lib/tower-balance';
function fixture(era:number,workers:number,dropDistance=2){
 const c=newCity(0,123);c.era=era;c.t.fill(G);c.seen.fill(1);c.camp=idx(20,20);c.b={};c.herds=[];c.camps=[];c.people=[];c.pop=0;c.manualWorkforce=true;c.wildernessAt=24*HOUR;c.disaster={kind:'flood',at:24*HOUR,level:1,center:0};
 for(let n=0;n<workers;n++)c.people.push({id:c.nextId++,name:`Thợ ${n}`,pos:idx(24,20),task:{t:'idle'}});c.pop=workers;
 for(let n=0;n<4;n++)c.b[idx(24-dropDistance,20+n)]={k:'grandstore',lvl:3,doneAt:null};
 for(const r of RES)c.res[r]=20000;
 settle(c,0);return c;
}
function run(k:BKey,era:number,distance=2,fertile=false,winter=false,duration=HOUR){
 const workers=B[k].jobs??0,c=fixture(era,workers,distance),tile=idx(24,20),r=Object.keys(B[k].prod??{})[0]as ResKey;
 if(winter){c.t0=-18*HOUR;c.seasonIdx=3;}
 c.b[tile]={k,lvl:1,doneAt:null};
 if(k==='smelter')for(let y=17;y<=23;y++)for(let x=25;x<=28;x++)c.t[idx(x,y)]=O;
 if(k==='coalmine')c.t[tile]=COAL;
 if(k==='wheel'||fertile)for(let y=0;y<96;y++)c.t[idx(25,y)]=R;
 for(const p of c.people)p.task={t:'work',at:tile};
 const before={...c.res};settle(c,duration);
 return {building:k,era,distance,fertile,winter,minutes:duration/MIN,workers,net:Object.fromEntries(RES.map(r=>[r,Math.round((c.res[r]-before[r])*100)/100])),outputResource:r,delivered:c.industry?.delivered??null,fertility:c.b[tile].fertility??null,estimatedNetPerHour:Math.round(stats(c,derive(c),c.last).rate[r]*100)/100,people:c.people.length};
}
const scenarios=[];
for(const era of [3,4,5])for(const k of ['gather','farm','wheel']as BKey[])scenarios.push(run(k,era));
for(const k of ['gather','farm']as BKey[])scenarios.push(run(k,4,2,true));
for(const k of ['gather','farm','wheel']as BKey[])scenarios.push(run(k,4,12));
for(const k of ['gather','farm','wheel']as BKey[])scenarios.push(run(k,4,2,false,true));
scenarios.push(run('estate',4));
scenarios.push(run('smelter',5,2,false,false,10*MIN));
for(const k of ['smelter','machine','factory','coalmine']as BKey[])scenarios.push(run(k,5));
function manual(resource:ResKey,workers:number){const c=fixture(5,workers),tile=idx(24,20);c.t[tile]=resource==='gold'?GOLD:O;for(let n=1;n<10;n++)c.t[idx(24+n%3,20+Math.floor(n/3))]=resource==='gold'?GOLD:O;for(const p of c.people)p.task={t:'mine',at:tile};const before=c.res[resource];settle(c,10*MIN);return {resource,workers,minutes:10,delivered:c.industry?.delivered?.[resource]??0,net:c.res[resource]-before,sourceRemaining:c.t[tile]};}
console.log(JSON.stringify({method:'Synthetic 1h, constant staffed population; no market/forge, spring unless winter=true, no attacks, ample inputs/storage. Actual net stock after hauling, upkeep, fuel and field renewal; distance in tiles. Far sources and seasons vary live results.',scenarios,manual:[manual('copper',3),manual('gold',4)],upkeep:[1,2,3,4,5,6].map(era=>({era,...upkeepRates(era)})),towers:[1,2,3,4,5,6].map(era=>({era,limit:towerLimit(era),maxCombinedDps:towerLimit(era)*towerStats(3).damage})),military:UKEYS.map(u=>({u,space:UNITS[u].space,hp:UNITS[u].hp,atk:UNITS[u].atk,homeFoodPer10Min:upkeepRates(3).soldier.food/6,marchFoodOneWay10Min:marchSupplies({[u]:1},10*MIN,3).food}))},null,2));
