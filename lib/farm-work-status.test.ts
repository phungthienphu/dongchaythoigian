import test from 'node:test';
import assert from 'node:assert/strict';
import {newCity,G,idx,applyAction,settle,stats,derive,type City,type Haul} from './engine';
import {farmWorkerState,farmWorkSummary} from './farm-work-status';

function fixture(){
 const c:City=newCity(0,123);c.t.fill(G);c.seen.fill(1);c.b={};c.camp=idx(20,20);c.camps=[];c.herds=[];c.manualWorkforce=true;c.era=2;c.people=c.people.slice(0,2);c.pop=2;
 c.disaster={kind:'earthquake',at:1e10,center:0,level:1};
 const tile=idx(30,20);c.b[tile]={k:'farm',lvl:1,doneAt:null};
 for(const p of c.people){p.pos=c.camp;p.task={t:'idle'};}
 return {c,tile,storage:stats(c,derive(c),0).storage};
}
test('2/2 counts reservations while new farmers are still physically travelling',()=>{
 const {c,tile,storage}=fixture();
 assert.equal(applyAction(c,{type:'assignN',n:2,task:{t:'work',at:tile}},0),null);
 const {workers,counts}=farmWorkSummary(c,tile,storage);
 assert.equal(workers.length,2);assert.equal(counts.travelling,2);assert.equal(counts.working,0);
 settle(c,10000);assert.equal(farmWorkSummary(c,tile,storage).counts.working,2);
});
test('full storage is reported as waiting, and farmers automatically resume after space opens',()=>{
 const {c,tile,storage}=fixture();c.res.food=storage.food;
 for(const p of c.people){
  p.task={t:'work',at:tile};
  p.haul={phase:'unload',at:0,nextAt:1000,tile:c.camp,route:[c.camp],routeStart:0,resource:'food',carried:10,capacity:10,drop:c.camp,taskKey:JSON.stringify(p.task)};
 }
 const waiting=farmWorkSummary(c,tile,storage);assert.equal(waiting.counts['waiting-storage'],2);assert.equal(waiting.counts.working,0);assert.equal(waiting.counts.travelling,0);
 c.res.food-=100;settle(c,12000);
 assert.equal(farmWorkSummary(c,tile,storage).counts.working,2);
 assert.ok(c.people.every(p=>p.pos===tile));
});
test('returning and old cargo are not mistaken for work at the newly assigned farm',()=>{
 const {c,tile,storage}=fixture(),p=c.people[0];p.task={t:'work',at:tile};
 p.haul={phase:'return',at:0,nextAt:10000,tile,route:[tile,c.camp],routeStart:0,resource:'wood',carried:10,capacity:10,drop:c.camp,taskKey:'old'};
 assert.equal(farmWorkerState(c,p,storage),'delivering');
 p.haul.phase='unload';c.res.wood=storage.wood;
 assert.equal(farmWorkerState(c,p,storage),'waiting-storage');
});
test('soil care, blocked routes and damaged fields have separate explanations',()=>{
 const {c,tile,storage}=fixture(),p=c.people[0];p.task={t:'work',at:tile};
 assert.equal(farmWorkerState(c,p,storage),'blocked');
 c.b[tile].fertility=0;assert.equal(farmWorkerState(c,p,storage),'exhausted');
 c.b[tile].tendUntil=30000;assert.equal(farmWorkerState(c,p,storage),'tending');
 c.b[tile].flooded=true;assert.equal(farmWorkerState(c,p,storage),'inactive');
 p.refuge={} as NonNullable<typeof p.refuge>;assert.equal(farmWorkerState(c,p,storage),'sheltering');
});
test('a stale work phase at a warehouse cannot claim the farmer is tilling the field',()=>{
 const {c,tile,storage}=fixture(),p=c.people[0];p.task={t:'work',at:tile};
 p.haul={phase:'work',at:0,nextAt:10000,tile:c.camp,route:[c.camp],routeStart:0,carried:0,capacity:10,workRate:5400} as Haul;
 assert.equal(farmWorkerState(c,p,storage),'blocked');
});
