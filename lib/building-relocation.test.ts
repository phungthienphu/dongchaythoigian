import test from 'node:test';
import assert from 'node:assert/strict';
import {eraFixture,eraStaff} from './era-fixtures.test-utils';
import {B,RES,idx,buildingRelocationPlan,applyAction,settle,isBuildingActive,MIN,type BKey} from './engine';
const from=idx(23,20),to=idx(29,20),office=idx(21,23);
function fixture(kind:BKey='machine'){
 const c=eraFixture(6);c.b[idx(19,20)].lvl=1;c.b[idx(18,20)].lvl=3;
 c.b[office]={k:'relocationoffice',lvl:1,doneAt:null};
 c.b[from]={k:kind,lvl:3,doneAt:null,uid:17,investment:{stone:1000,gold:100},builtAt:0};
 for(const r of RES)c.res[r]=5000;return c;
}
test('new relocation is gated, costs scale, and invalid orders are atomic',()=>{
 const c=fixture();delete c.b[office];assert.match(buildingRelocationPlan(c,from,to).error!,/Ty/);c.b[office]={k:'relocationoffice',lvl:1,doneAt:null};
 const plan=buildingRelocationPlan(c,from,to);assert.equal(plan.error,null);
 assert.ok(buildingRelocationPlan(c,from,idx(40,20)).cost.stone!>plan.cost.stone!);
 c.res.gold=0;const before=structuredClone(c);assert.ok(applyAction(c,{type:'relocateBuilding',x:23,y:20,to},0));assert.deepEqual(c,before);
});
test('moves once, preserves identity/investment, unloads worker cargo and completes without upgrading',()=>{
 const c=fixture();for(const r of RES)c.res[r]=5000;eraStaff(c,from,1);c.people[0].haul={phase:'return',at:0,nextAt:1000,tile:from,route:[from],routeStart:0,resource:'wood',carried:7,capacity:10,taskKey:'work',source:{kind:'building',key:from}};
 const old=structuredClone(c.b[from]),plan=buildingRelocationPlan(c,from,to),gold=c.res.gold;
 assert.equal(applyAction(c,{type:'relocateBuilding',x:23,y:20,to},0),null);assert.equal(c.b[from],undefined);assert.equal(c.b[to].uid,17);assert.deepEqual(c.b[to].investment,old.investment);assert.equal(c.res.gold,gold-plan.cost.gold!);assert.equal(c.people[0].task.t,'idle');assert.equal(c.people[0].haul?.carried,7);assert.equal(isBuildingActive(c.b[to]),false);
 const after=structuredClone(c);assert.ok(applyAction(c,{type:'relocateBuilding',x:23,y:20,to},0));assert.deepEqual(c,after);
 const online=structuredClone(c);settle(c,plan.duration+MIN);for(let at=MIN;at<plan.duration+MIN;at+=MIN)settle(online,at);settle(online,plan.duration+MIN);assert.deepEqual(c,online);assert.equal(c.b[to].lvl,3);assert.equal(c.b[to].relocation,undefined);assert.equal(c.b[to].doneAt,null);
});
test('fixed structures, occupied routes, recruitment and full storage cannot be moved',()=>{
 for(const kind of ['hall','dam','ironbridge','farm','relocationoffice'] as BKey[]){const c=fixture(kind);assert.ok(buildingRelocationPlan(c,from,to).error,kind);}
 const c=fixture();eraStaff(c,to,1);assert.match(buildingRelocationPlan(c,from,to).error!,/tuyến/);c.people=[];c.queue=[{u:'club',doneAt:10000,source:from}];assert.match(buildingRelocationPlan(c,from,to).error!,/tuyển/);
 const store=fixture('grandstore');for(const r of RES)store.res[r]=20000;assert.match(buildingRelocationPlan(store,from,to).error!,/kho|Kho/);
});
test('new building has a reviewed era and input boundary accepts movement',()=>{assert.equal(B.relocationoffice.era,6);const c=fixture('house');assert.equal(applyAction(c,{type:'relocateBuilding',x:23,y:20,to},0),null);});
test('relocation disables passive electricity and tool bonuses while retaining warehouse compartments',async()=>{
 const {stepPower}=await import('./modern');
 const solar=fixture('solar');solar.b[from].lvl=1;assert.equal(applyAction(solar,{type:'relocateBuilding',x:23,y:20,to},0),null);stepPower(solar,0,MIN,B);assert.equal(solar.modern!.supply,0);
 const tools=fixture('forge');assert.equal(isBuildingActive(tools.b[from]),true);assert.equal(applyAction(tools,{type:'relocateBuilding',x:23,y:20,to},0),null);assert.equal(isBuildingActive(tools.b[to]),false);
 const store=fixture('grandstore');store.b[from].storageLevels={wood:2,food:3};const plan=buildingRelocationPlan(store,from,to);assert.equal(plan.error,null);assert.equal(applyAction(store,{type:'relocateBuilding',x:23,y:20,to},0),null);settle(store,plan.duration);assert.deepEqual(store.b[to].storageLevels,{wood:2,food:3});assert.equal(store.b[to].lvl,3);
});
