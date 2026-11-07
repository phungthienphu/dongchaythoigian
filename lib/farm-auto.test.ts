import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newCity,G,idx,settle,farmCapacity,farmRemaining,farmTendCost,MIN,HOUR,type City} from './engine';
function fixture(era=4):City{
 const c=newCity(0,123);c.era=era;c.t.fill(G);c.seen.fill(1);c.camp=idx(20,20);c.b={};c.people=[];c.pop=0;c.herds=[];c.camps=[];c.manualWorkforce=true;
 c.wildernessAt=HOUR;c.disaster={kind:'flood',at:HOUR,level:1,center:0};c.res.food=1000;c.res.wood=200;
 c.b[idx(21,20)]={k:'farm',lvl:1,doneAt:null,fertility:0};settle(c,0);return c;
}
test('only medieval onward auto renews, pays once and completes despite an empty pantry',()=>{
 for(const era of [2,3]){const c=fixture(era);settle(c,MIN);assert.equal(c.res.wood,200);assert.equal(farmRemaining(c.b[idx(21,20)]),0);}
 for(const era of [4,5,6]){const c=fixture(era),b=c.b[idx(21,20)],cost=farmTendCost(b,era);settle(c,1000);assert.equal(c.res.wood,200-cost.wood!);assert.equal(b.tendUntil,30000);c.res.food=0;c.res.wood=0;settle(c,30000);assert.equal(b.tendUntil,undefined);assert.equal(farmRemaining(b),farmCapacity(b));}
});
test('insufficient materials waits, retries after a deposit, preserves jobs and carried goods',()=>{
 const c=fixture(),tile=idx(21,20),b=c.b[tile];c.res.wood=0;const p=newCity(0,1).people[0];p.task={t:'work',at:tile};p.pos=tile;c.people=[p];c.pop=1;
 settle(c,MIN);assert.equal(b.tendUntil,undefined);assert.equal(p.task.t,'work');c.res.wood=20;settle(c,MIN+1000);assert.equal(b.tendUntil,MIN+30000);const paid=c.res.wood;settle(c,MIN+2000);assert.ok(Math.abs(c.res.wood-paid)<.01);
});
test('competing fields pay atomically in tile order, skip damaged fields and do not renew fertile fields',()=>{
 const c=fixture();c.b[idx(22,20)]={k:'farm',lvl:1,doneAt:null,fertility:0};c.b[idx(23,20)]={k:'estate',lvl:1,doneAt:null,fertility:0,burned:true};c.b[idx(24,20)]={k:'farm',lvl:1,doneAt:null};c.res.food=40;c.res.wood=10;
 settle(c,1000);assert.equal(c.b[idx(21,20)].tendUntil,30000);assert.equal(c.b[idx(22,20)].tendUntil,undefined);assert.equal(c.b[idx(23,20)].tendUntil,undefined);assert.equal(c.b[idx(24,20)].tendUntil,undefined);assert.equal(c.res.food,0);assert.equal(c.res.wood,0);
});
test('offline and irregular settlement agree, old saves do not pay retroactively',()=>{
 const a=fixture(),b=structuredClone(a);settle(a,2*MIN);for(let at=347;at<2*MIN;at+=1371)settle(b,at);settle(b,2*MIN);assert.deepEqual(a,b);
 const old=fixture();delete old.farmAutoStartsAt;settle(old,MIN);assert.equal(old.res.wood,200);assert.equal(old.b[idx(21,20)].tendUntil,undefined);settle(old,MIN+1000);assert.equal(old.b[idx(21,20)].tendUntil,MIN+30000);
});
