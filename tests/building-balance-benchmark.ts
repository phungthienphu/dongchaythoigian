/** Isolated hauling comparison, not a self-sustaining village or production FPS benchmark.
 * Full workers; two warehouse distances; inputs/electricity/mana kept available.
 * Actual unloads over 8 simulated hours include first-load delay. No player data.
 * Run: bun tests/building-balance-benchmark.ts > /tmp/building-balance.json
 */
import {B,RES,idx,buildingJobs,settle,MIN,HOUR,type BKey} from '../lib/engine';
import {eraFixture,eraStaff} from '../lib/era-fixtures.test-utils';
import {initializeMagic,stepMagic,magicSiteId} from '../lib/magic';
import {magicDef} from '../lib/magic-data';
const keys=['crystalworks','crystalrefinery','runeworks','runepress','essenceforge','essencedistillery','celestialforge','starrefinery','hydroponics','herbalconservatory','tidalorchard','skyharvest','forestenclave','livinglumberyard','worldtreenursery','stonecircle','geomine','recyclingworks','emberkiln','transmutationhall','celestialmint'] as BKey[];
const results=[];
for(const k of keys)for(const level of [1,3])for(const distance of [2,8]){
 const d=B[k],c=eraFixture(Math.max(7,d.era));c.b={};c.b[idx(19,18)]={k:'hall',lvl:1,doneAt:null};c.b[idx(20-distance,20)]={k:'grandstore',lvl:3,doneAt:null};initializeMagic(c,0);
 const tile=idx(20,20),source=idx(22,22);c.b[tile]={k,lvl:level,doneAt:null,uid:c.magic!.nextUid++};eraStaff(c,tile,buildingJobs(c.b[tile]));
 const md=magicDef(k as never);for(const [n,support]of (md?.support??[]).entries())c.b[idx(22,18+n)]={k:support as BKey,lvl:1,doneAt:null};
 c.b[source]={k:'aetherwell',lvl:3,doneAt:null,uid:c.magic!.nextUid++};eraStaff(c,source,5);
 c.b[idx(20,23)]={k:'solar',lvl:3,doneAt:null};c.b[idx(21,23)]={k:'solar',lvl:3,doneAt:null};
 for(const r of RES)c.res[r]=30000;const output=Object.keys(d.prod!)[0] as typeof RES[number];c.res[output]=0;stepMagic(c,0);
 let received=0;for(let m=1;m<=480;m++){
  for(const r of RES)c.res[r]=r===output&&r!=='food'?0:30000;
  c.resourceHistory={since:(m-1)*MIN,buckets:[]};
  c.magic!.mana[magicSiteId(c.b[source])]=2880;
  settle(c,m*MIN);received+=c.resourceHistory!.buckets.reduce((n,b)=>n+(b.received[output]??0),0);
 }
 results.push({kind:k,name:d.n,level,distance,jobs:buildingJobs(c.b[tile]),resource:output,receivedPerHour:Math.round(received/8),nominal:(d.prod![output]??0)*[0,1,1.6,2.4][level]*(output==='food'?4:1)});
}
console.log(JSON.stringify(results,null,2));
