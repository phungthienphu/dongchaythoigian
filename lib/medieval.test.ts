import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyAction,buildingCost,buildMs,derive,farmCapacity,farmRemaining,foodEraScale,G,HOUR,idx,levelCap,levelCost,MAX_LVL,MIN,newCity,R,reqMet,RES,settle,stats,storageCapacity,upkeepRates,type City} from './engine';
const LOCAL_RULES={maxEra:4};
import {droughtFactor,initializeMedieval,medievalBonus,scheduleDrought,stepMedieval} from './medieval';
function fixture(era=4,at=0):City{
 const c=newCity(at,123);c.t.fill(G);c.seen.fill(1);c.people=[];c.pop=0;c.herds=[];c.camps=[];c.b={};c.camp=idx(20,20);c.era=era;c.manualWorkforce=true;c.army={};
 c.wildernessAt=at+14*24*HOUR;c.disaster={kind:'flood',at:at+14*24*HOUR,level:1,center:0};
 c.b[idx(19,20)]={k:'hall',lvl:3,doneAt:null};c.b[idx(18,20)]={k:'grandstore',lvl:3,doneAt:null};
 for(const r of RES)c.res[r]=20000;initializeMedieval(c,at);return c;
}
function staff(c:City,tile:number,n:number){for(let k=0;k<n;k++)c.people.push({id:c.nextId++,name:'Thợ',task:{t:'work',at:tile},pos:tile});c.pop=c.people.length;}
test('restricted rules cannot be overridden by forged action flags',()=>{
 const c=fixture(3);c.b[idx(17,20)]={k:'temple',lvl:1,doneAt:null};staff(c,idx(30,30),100);
 const before=structuredClone(c);assert.equal(reqMet(c,{maxEra:3}),false);assert.equal(reqMet(c,LOCAL_RULES),true);
 assert.match(applyAction(c,{type:'advance',maxEra:6} as never,0,{maxEra:3})!,/sắp ra mắt/);assert.deepEqual(c,before);
 assert.equal(applyAction(c,{type:'advance'},0,LOCAL_RULES),null);assert.equal(c.era,4);assert.equal(c.res.food,8000);assert.equal(c.medieval?.enteredAt,0);
 assert.deepEqual(c.t,before.t);assert.deepEqual(c.people,before.people);assert.deepEqual(c.b,before.b);
 assert.match(applyAction(c,{type:'advance'},0,LOCAL_RULES)!,/sắp ra mắt/);
 assert.match(applyAction(c,{type:'build',k:'well',x:25,y:25},0,{maxEra:3})!,/sắp ra mắt/);
 c.b[idx(17,20)].burned=true;c.era=3;assert.equal(reqMet(c,LOCAL_RULES),false);
});
test('new prices are final, hall can reach four while other buildings remain capped at three',()=>{
 const c=fixture();assert.deepEqual(buildingCost('grandstore',4),{wood:1200,stone:1800,copper:300});assert.deepEqual(levelCost('grandstore',3,4),{wood:4800,stone:7200,copper:1200});
 assert.equal(levelCap(c,'hall'),4);assert.equal(levelCap(c,'grandstore'),MAX_LVL);assert.equal(buildMs('hall',4),2*HOUR);
 const hall=c.b[idx(19,20)];assert.equal(applyAction(c,{type:'upgrade',x:19,y:20},0,LOCAL_RULES),null);assert.equal(hall.doneAt,2*HOUR);assert.equal(c.res.gold,19800);
 assert.deepEqual(upkeepRates(4),upkeepRates(3));assert.deepEqual(upkeepRates(6),upkeepRates(3));assert.equal(foodEraScale(c,0),4);
 c.era=3;hall.doneAt=null;assert.match(applyAction(c,{type:'upgrade',x:19,y:20},0,LOCAL_RULES)!,/tối đa/);
});
test('grand warehouse upgrades one compartment to 20k then 40k, without leaking to other resources',()=>{
 const c=fixture(),b=c.b[idx(18,20)];b.lvl=1;assert.equal(storageCapacity(b,'wood'),10000);
 for(const capacity of [20000,40000]){
  assert.equal(applyAction(c,{type:'upgradeStorage',resource:'wood',x:18,y:20},0,LOCAL_RULES),null);
  assert.equal(applyAction(c,{type:'speedBuild',x:18,y:20},0,LOCAL_RULES),null);
  assert.equal(storageCapacity(b,'wood'),capacity);assert.equal(storageCapacity(b,'stone'),10000);
 }
 assert.equal(stats(c,derive(c),0).storage.wood,42000);assert.match(applyAction(c,{type:'upgradeStorage',resource:'wood',x:18,y:20},0,LOCAL_RULES)!,/tối đa/);
});
test('reservoir fills in six hours, consumes only during drought and honors live source/staff/damage',()=>{
 const c=fixture(),tile=idx(22,20);c.b[tile]={k:'reservoir',lvl:1,doneAt:null};c.t[idx(23,20)]=R;staff(c,tile,2);const d=derive(c);
 stepMedieval(c,d,0,6*HOUR);assert.equal(c.medieval!.water[tile],12*HOUR);
 c.medieval!.drought={warnAt:0,start:6*HOUR,end:12*HOUR};stepMedieval(c,d,6*HOUR,7*HOUR);assert.equal(c.medieval!.water[tile],11*HOUR);
 const field=idx(24,20);assert.equal(droughtFactor(c,field,'estate',7*HOUR),1);c.b[tile].burned=true;assert.equal(droughtFactor(c,field,'estate',7*HOUR),.6);
 c.b[idx(25,20)]={k:'well',lvl:1,doneAt:null};assert.equal(droughtFactor(c,field,'estate',7*HOUR),.8);assert.equal(droughtFactor(c,field,'wheel',7*HOUR),.75);assert.equal(droughtFactor(c,field,'gather',7*HOUR),1);
 const before=c.medieval!.water[tile];stepMedieval(c,d,7*HOUR,8*HOUR);assert.equal(c.medieval!.water[tile],before);
 c.b[tile].burned=false;c.people[0].task={t:'idle'};stepMedieval(c,d,8*HOUR,9*HOUR);assert.equal(c.medieval!.water[tile],before);
});
test('water updates fractional timestamps at absolute minute boundaries; repeated polling is identical',()=>{
 const a=fixture(4,123),tile=idx(22,20);a.b[tile]={k:'reservoir',lvl:1,doneAt:null};a.t[idx(23,20)]=R;staff(a,tile,2);const b=structuredClone(a);
 settle(a,MIN+123);for(const at of [333,1000,2300,29999,60001,MIN+123])settle(b,at);
 assert.deepEqual(a,b);assert.equal(a.medieval!.water[tile],2*(MIN-123));
});
test('no drought is retroactively applied on a migrated village, first day stays safe and consecutive years are skipped',()=>{
 const c=fixture();c.medieval=undefined;initializeMedieval(c,100*HOUR);assert.equal(c.medieval!.enteredAt,100*HOUR);
 scheduleDrought(c,17);assert.equal(c.medieval!.drought,undefined);
 let successes=0;for(let seed=1;seed<=1000;seed++){const c=fixture();c.seed=seed;scheduleDrought(c,1);assert.equal(c.medieval!.drought,undefined);scheduleDrought(c,5);if(c.medieval!.drought){successes++;const saved=structuredClone(c.medieval!.drought);scheduleDrought(c,9);assert.deepEqual(c.medieval!.drought,saved);}}
 assert.ok(successes>240&&successes<360,`seeded sample: ${successes}/1000`);
});
test('school bonus needs arrived workers; damaged services stop bonus; overlapping production capped at 30%',()=>{
 const c=fixture(),i=idx(21,20);c.b[i]={k:'school',lvl:3,doneAt:null};staff(c,i,2);assert.equal(medievalBonus(c),.12);
 c.people[0].pos=c.camp;assert.equal(medievalBonus(c),.06);c.b[i].burned=true;assert.equal(medievalBonus(c),0);
 c.b[i].burned=false;for(let n=0;n<8;n++)c.b[idx(25+n,20)]={k:'academy',lvl:1,doneAt:null};assert.equal(medievalBonus(c),.3);
});
test('crafting pays inputs once, never multiplies gold by active gathering speed, and deposits real cargo',()=>{
 const c=fixture(),tile=idx(21,20);c.b[tile]={k:'artisan',lvl:1,doneAt:null};staff(c,tile,3);c.res.gold=0;
 assert.equal(stats(c,derive(c),0).rate.gold,6);
 const before={...c.res};settle(c,15*MIN);assert.equal(c.res.gold,0);assert.equal(c.res.stone,before.stone);
 settle(c,1510*1000);assert.equal(c.res.gold,0); // a gold load takes 2.5 hours per worker at 2/h
 settle(c,9010*1000);assert.ok(c.res.gold>=15);assert.equal(c.res.stone,before.stone-150);assert.ok(c.res.wood<before.wood-300);
});
test('estate has four real workers, finite soil and prepaid tending that finishes with an empty pantry',()=>{
 const c=fixture(),tile=idx(21,20);c.b[tile]={k:'estate',lvl:1,doneAt:null,fertility:40};staff(c,tile,4);
 const before=c.res.food;settle(c,10_000);assert.equal(farmRemaining(c.b[tile]),0);assert.ok(c.res.food>before);
 assert.equal(applyAction(c,{type:'tendFarm',x:21,y:20},c.last,LOCAL_RULES),null);c.res.food=0;settle(c,c.last+30_000);assert.equal(c.b[tile].tendUntil,undefined);assert.ok(farmRemaining(c.b[tile])>0);assert.equal(farmCapacity(c.b[tile]),2400);
});
