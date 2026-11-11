import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newCity,G,idx,settle,applyAction,MIN,HOUR,RES,type City} from './engine';
import {recentResourceFlow,recordResourceFlow} from './resource-history';
function fixture():City{
 const c=newCity(0,123);c.t.fill(G);c.seen.fill(1);c.camp=idx(20,20);c.b={[idx(19,20)]:{k:'storehouse',lvl:3,doneAt:null},[idx(22,20)]:{k:'gather',lvl:1,doneAt:null}};c.people=c.people.slice(0,2);c.herds=[];c.camps=[];c.res.food=500;c.res.wood=200;
 for(const p of c.people){p.pos=idx(22,20);p.task={t:'work',at:idx(22,20)};}return c;
}
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
test('history records actual unloads and paid costs, reconciling stock without hourly-rate income',()=>{
 const c=fixture(),before={...c.res};settle(c,1000);assert.equal(recentResourceFlow(c,1000).received.food,0);
 settle(c,4*MIN);const flow=recentResourceFlow(c,c.last);assert.ok(flow.received.food>0);assert.equal(flow.elapsedMs,4*MIN);
 close(c.res.food-before.food,flow.received.food-flow.spent.food);close(before.wood-c.res.wood,flow.spent.wood);
});
test('care is charged once and unaffordable hunger does not invent paid food',()=>{
 const c=fixture();c.era=2;c.b[idx(22,20)]={k:'farm',lvl:1,doneAt:null,fertility:0};
 assert.equal(applyAction(c,{type:'tendFarm',x:22,y:20},0),null);const flow=recentResourceFlow(c,0);assert.equal(flow.spent.food,20);assert.equal(flow.spent.wood,5);
 assert.ok(applyAction(c,{type:'tendFarm',x:22,y:20},0));assert.equal(recentResourceFlow(c,0).spent.food,20);
 const starving=fixture();starving.res.food=0;for(const p of starving.people)p.task={t:'idle'};settle(starving,MIN);assert.equal(recentResourceFlow(starving,MIN).spent.food,0);
});
test('flow history is deterministic across offline catch-up, fragmented reads and serialization',()=>{
 const a=fixture(),b=structuredClone(a);settle(a,10*MIN);for(let t=137;t<10*MIN;t+=1731)settle(b,t);settle(b,10*MIN);assert.deepEqual(a,b);
 const restored=JSON.parse(JSON.stringify(a)) as City;settle(restored,11*MIN);settle(a,11*MIN);assert.deepEqual(restored,a);
});
test('a day of events retains at most thirty buckets and excludes stale data from the display',()=>{
 const c=fixture();for(let at=0;at<=24*HOUR;at+=10000)recordResourceFlow(c,at,'received','wood',1);
 assert.equal(c.resourceHistory!.buckets.length,30);assert.ok(JSON.stringify(c.resourceHistory).length<5000);
 assert.equal(recentResourceFlow(c,24*HOUR).received.wood,30);assert.equal(recentResourceFlow(c,25*HOUR).received.wood,0);
});

test('every resource, including magic goods, starts at zero and accumulates finite receipts and costs',()=>{
 const c=fixture();for(const r of RES){const empty=recentResourceFlow(c,0);assert.equal(empty.received[r],0);assert.equal(empty.spent[r],0);recordResourceFlow(c,1000,'received',r,7);recordResourceFlow(c,2000,'spent',r,3);}
 const flow=recentResourceFlow(c,3000);for(const r of RES){assert.equal(flow.received[r],7);assert.equal(flow.spent[r],3);}
});
