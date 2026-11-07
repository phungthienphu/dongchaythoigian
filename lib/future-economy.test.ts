import {test} from 'node:test';
import assert from 'node:assert/strict';
import {B,applyAction,canPlace,COAL,derive,G,HOUR,idx,MAX_SETTLE_MS,MIN,normalizeResources,RES,settle,stats,type City} from './engine';
import {LOCAL_RULES} from './eras';
import {eraFixture as fixture,eraStaff as staff} from './era-fixtures.test-utils';
import {initializeIndustry,plantTree,stepIndustry,transportSpeed} from './industry';
import {completedWonder,finalWonderError,floodProtection,initializeModern,powerFraction,recoverModernFloods,scheduleModernFlood,stepPower} from './modern';
import {droughtFactor} from './medieval';
test('legacy resources migrate without NaN; coal opens once and preserves existing mine state/compartments',()=>{
 const c=fixture(4);delete (c.res as Partial<City['res']>).coal;normalizeResources(c);assert.equal(c.res.coal,0);
 for(let n=0;n<5;n++)c.t[idx(30+n,30)]=2;
 c.era=5;initializeIndustry(c,100);const deposits=c.t.flatMap((t,i)=>t===COAL?[i]:[]);assert.equal(deposits.length,3);
 c.dep[deposits[0]]=100;const old=structuredClone(c);initializeIndustry(c,10000);assert.deepEqual(c,old);assert.equal(c.b[idx(18,20)].storageLevels!.coal,1);
 const blocked=fixture(5);assert.equal(Object.values(blocked.b).some(b=>b.k==='charcoal'),false);assert.equal(canPlace(blocked,derive(blocked),'charcoal',22,21,LOCAL_RULES),null);
});
test('industrial packet input is paid exactly once; copper enters stock only after delivery',()=>{
 const c=fixture(),tile=idx(21,20);c.b[tile]={k:'machine',lvl:1,doneAt:null};staff(c,tile,4);c.res.copper=0;
 settle(c,1000);assert.equal(c.res.copper,0);const ready=c.people[0].haul!.nextAt;
 settle(c,ready);assert.equal(c.res.copper,0);assert.equal(c.industry!.inputsSpent!.stone,10);assert.equal(c.industry!.inputsSpent!.coal,4);
 const before=c.res.stone;settle(c,ready+10000);assert.equal(c.res.copper,40);assert.equal(c.res.stone,before);assert.equal(c.res.coal,996);
 const noInput=fixture();noInput.b[tile]={k:'factory',lvl:1,doneAt:null};staff(noInput,tile,4);noInput.res.coal=0;const gold=noInput.res.gold;settle(noInput,HOUR);assert.equal(noInput.res.gold,gold);
});
test('pollution integrates productive work, treatment and natural recovery at absolute minute boundaries',()=>{
 const c=fixture(),tile=idx(21,20);c.b[tile]={k:'charcoal',lvl:1,doneAt:null};staff(c,tile,2);c.industry!.pollution=35;
 for(const p of c.people)p.haul={phase:'work',at:0,nextAt:HOUR,tile,route:[tile],routeStart:0,carried:0,capacity:10,resource:'coal',source:{kind:'building',key:tile},taskKey:JSON.stringify(p.task)};
 stepIndustry(c,0,HOUR,B);assert.ok(Math.abs(c.industry!.pollution-35)<1e-9);
 c.b[tile].off=true;stepIndustry(c,HOUR,2*HOUR,B);assert.ok(Math.abs(c.industry!.pollution-34)<1e-9);
});
test('nursery prepaid seeds finish even after workers leave; cap prevents overbooking, refresh cannot overwrite seedlings',()=>{
 const c=fixture(),tile=idx(21,20);c.b[tile]={k:'nursery',lvl:1,doneAt:null};staff(c,tile,2);
 for(let n=0;n<4;n++)assert.equal(plantTree(c,idx(24+n,20),0),null);
 const before=c.res.food;assert.match(plantTree(c,idx(24,21),0)!,/tối đa 4/);assert.equal(c.res.food,before);
 c.people=[];c.res.food=0;stepIndustry(c,0,30*MIN,B);assert.equal(Object.keys(c.industry!.seedlings).length,0);assert.equal(c.t[idx(24,20)],1);
});
test('electric priority is proportional within groups, supports reorder and zero-fuel recovery without negative stock',()=>{
 const c=fixture(6),solar=idx(21,20),hospital=idx(22,20),uni=idx(23,20),home=idx(24,20);c.b[solar]={k:'solar',lvl:1,doneAt:null};c.b[hospital]={k:'hospital',lvl:3,doneAt:null};c.b[uni]={k:'university',lvl:1,doneAt:null};c.b[home]={k:'apartment',lvl:1,doneAt:null};
 stepPower(c,0,1000,B);assert.equal(c.modern!.supply,15);assert.equal(c.modern!.demand,40);assert.equal(powerFraction(c,hospital),1);assert.equal(powerFraction(c,uni),0);assert.equal(powerFraction(c,home),0);
 assert.equal(applyAction(c,{type:'setPowerPriority',priority:['production','housing','essential']},0,LOCAL_RULES),null);stepPower(c,0,1000,B);assert.equal(powerFraction(c,uni),.75);assert.equal(powerFraction(c,hospital),0);
 const thermal=idx(25,20);c.b[thermal]={k:'thermal',lvl:1,doneAt:null};staff(c,thermal,4);c.res.coal=.01;stepPower(c,1000,2000,B);assert.equal(c.res.coal,0);assert.ok(c.modern!.supply>15&&c.modern!.supply<95);stepPower(c,2000,3000,B);assert.equal(c.modern!.supply,15);
 const snapshot=structuredClone(c);assert.match(applyAction(c,{type:'setPowerPriority',priority:['essential','essential','production']} as never,0,LOCAL_RULES)!,/hợp lệ/);assert.deepEqual(c,snapshot);
});
test('unpowered apartments keep housing and powered factories cannot produce for free',()=>{
 const c=fixture(6),home=idx(22,20),factory=idx(23,20);c.b[home]={k:'apartment',lvl:3,doneAt:null};c.b[factory]={k:'complex',lvl:1,doneAt:null};staff(c,factory,6);c.res.gold=0;
 assert.ok(stats(c,derive(c),0).housing>=150);settle(c,30*MIN);assert.equal(c.res.gold,0);
 c.b[idx(24,20)]={k:'solar',lvl:1,doneAt:null};settle(c,31*MIN);assert.ok(powerFraction(c,factory)>0);
});
test('final wonders require explicit prerequisites, one permanent branch, and no stop after paid construction',()=>{
 const c=fixture(6),tile=idx(25,20);staff(c,idx(40,40),400);c.people=c.people.slice(0,400);
 assert.match(finalWonderError(c,'dam',0)!,/2 thủy điện/);
 for(let n=0;n<2;n++){const i=idx(26+n,20);c.b[i]={k:'hydro',lvl:1,doneAt:null};staff(c,i,3);}
 assert.equal(finalWonderError(c,'dam',0),null);c.industry!.pollution=65;assert.match(finalWonderError(c,'dam',0)!,/dưới 60/);c.industry!.pollution=0;
 c.b[tile]={k:'dam',lvl:0,doneAt:1000};c.res.food=0;c.people=[];settle(c,1000);assert.equal(c.modern!.choice,'dam');assert.equal(completedWonder(c,'dam'),true);assert.match(finalWonderError(c,'green',1000)!,/một kỳ quan/);
 assert.match(applyAction(c,{type:'demolish',x:25,y:20},c.last,LOCAL_RULES)!,/không phá/);c.b[tile].burned=true;assert.equal(completedWonder(c,'dam'),false);
});
test('one catch-up equals fragmented reads with power, missing inputs, pollution, water and newborns',()=>{
 const a=fixture(6,123),i=idx(22,20);a.b[i]={k:'factory',lvl:1,doneAt:null};staff(a,i,4);a.b[idx(23,20)]={k:'solar',lvl:1,doneAt:null};a.b[idx(24,20)]={k:'hospital',lvl:1,doneAt:null};staff(a,idx(24,20),4);a.industry!.pollution=30.2;const b=structuredClone(a);
 settle(a,30*MIN+123);for(let at=1000;at<30*MIN;at+=27133)settle(b,at);settle(b,30*MIN+123);assert.deepEqual(a,b);for(const r of RES)assert.ok(a.res[r]>=0&&Number.isFinite(a.res[r]));
});

test('modern flood forecasts are stable, near 25 percent and timed water recovery never clears enemy damage',()=>{
 let majors=0;
 for(let seed=1;seed<=1000;seed++){const c=fixture(6);c.seed=seed;scheduleModernFlood(c,1);assert.equal(c.modern!.floodForecast!.at,12*HOUR);if(c.modern!.floodForecast!.major)majors++;const forecast=structuredClone(c.modern!.floodForecast);scheduleModernFlood(c,2);assert.deepEqual(c.modern!.floodForecast,forecast);}
 assert.ok(majors>200&&majors<300,`${majors} / 1000`);
 const c=fixture(6),tile=idx(22,20);c.b[tile]={k:'factory',lvl:1,doneAt:null,flooded:true,burned:true,floodUntil:1000};
 assert.equal(recoverModernFloods(c,999),false);settle(c,1000);assert.equal(c.b[tile].flooded,false);assert.equal(c.b[tile].burned,true);assert.equal(c.b[tile].floodUntil,undefined);
});

test('all power devices can turn off, while apartment housing survives shutdown and power loss',()=>{
 const c=fixture(6),tile=idx(22,20);c.b[tile]={k:'apartment',lvl:3,doneAt:null};const housing=stats(c,derive(c),0).housing;
 assert.equal(applyAction(c,{type:'toggleBuilding',x:22,y:20},0,LOCAL_RULES),null);assert.equal(stats(c,derive(c),0).housing,housing);
 c.b[tile]={k:'solar',lvl:1,doneAt:null};assert.equal(applyAction(c,{type:'toggleBuilding',x:22,y:20},0,LOCAL_RULES),null);stepPower(c,0,1000,B);assert.equal(c.modern!.supply,0);
});

test('pollution helper keeps minute clipping equivalent at saturation and clean threshold',()=>{
 const a=fixture(5);a.industry!.pollution=.3;const b=structuredClone(a);stepIndustry(a,0,2*HOUR,B);for(let i=0;i<120;i++)stepIndustry(b,i*MIN,(i+1)*MIN,B);assert.deepEqual(a,b);
});

test('upgraded thermal and production need additional workers; hospitals keep fixed staff and power',()=>{
 const c=fixture(6),tile=idx(22,20);c.b[tile]={k:'thermal',lvl:3,doneAt:null};staff(c,tile,4);stepPower(c,0,1000,B);
 assert.ok(Math.abs(c.modern!.supply-76.8)<1e-9);staff(c,tile,6);stepPower(c,1000,2000,B);assert.equal(c.modern!.supply,192);
 const hospital=idx(23,20);c.b[hospital]={k:'hospital',lvl:3,doneAt:null};staff(c,hospital,4);stepPower(c,2000,3000,B);assert.equal(c.modern!.demand,15);
 c.people.push({id:c.nextId++,name:'Thợ rảnh',task:{t:'idle'},pos:tile});c.pop=c.people.length;
 assert.match(applyAction(c,{type:'assignN',n:1,task:{t:'work',at:tile}},3000,LOCAL_RULES)!,/tối đa 10/);
});

test('missing future state starts now without retroactive fuel, emissions or free historical power',()=>{
 const c=fixture(6),tile=idx(22,20);c.b[tile]={k:'thermal',lvl:1,doneAt:null};staff(c,tile,4);delete c.industry;delete c.modern;
 initializeIndustry(c,HOUR);initializeModern(c,HOUR);const coal=c.res.coal;
 stepPower(c,0,HOUR/2,B);stepIndustry(c,0,HOUR/2,B);assert.equal(c.modern!.supply,0);assert.equal(c.res.coal,coal);assert.equal(c.industry!.emission,0);
 stepPower(c,0,HOUR,B);stepIndustry(c,0,HOUR,B);assert.equal(c.res.coal,coal);assert.equal(c.industry!.pollution,0);
 stepPower(c,HOUR,HOUR+MIN,B);assert.ok(Math.abs(c.res.coal-(coal-4))<1e-9);
});

test('green wonder branch persists after damage and repair and protects only retention areas from floods',()=>{
 const c=fixture(6),tile=idx(25,20);staff(c,idx(40,40),400);c.people=c.people.slice(0,400);
 for(let n=0;n<4;n++)c.b[idx(26+n,20)]={k:'park',lvl:1,doneAt:null};
 c.modern!.supply=100;c.modern!.clean=80;c.industry!.cleanSince=0;c.industry!.pollution=20;
 assert.match(finalWonderError(c,'green',12*HOUR-1)!,/12 giờ/);assert.equal(finalWonderError(c,'green',12*HOUR),null);
 c.b[tile]={k:'green',lvl:0,doneAt:1000};c.people=[];c.res.food=0;settle(c,1000);assert.equal(c.modern!.choice,'green');assert.equal(completedWonder(c,'green'),true);
 c.b[idx(26,21)]={k:'retention',lvl:1,doneAt:null};assert.equal(floodProtection(c,idx(27,21)),true);assert.equal(floodProtection(c,idx(60,60)),false);
 c.medieval!.drought={warnAt:0,start:0,end:HOUR};assert.equal(droughtFactor(c,idx(60,60),'estate',1000),1);
 c.b[tile].burned=true;assert.equal(completedWonder(c,'green'),false);assert.equal(floodProtection(c,idx(27,21)),false);assert.match(finalWonderError(c,'dam',1000)!,/một kỳ quan/);
 c.b[tile].burned=false;assert.equal(completedWonder(c,'green'),true);
});
