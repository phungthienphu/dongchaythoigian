import test from 'node:test';
import assert from 'node:assert/strict';
import { newCity, MIN, derive, stats } from './engine';
import { marchSupplies, reserveMarchFood } from './march-supplies';
test('march food grows with distance and army load; missing food never mutates stock',()=>{
 assert.ok(marchSupplies({club:10},20*MIN).food>marchSupplies({club:10},MIN).food);
 assert.ok(marchSupplies({elephant:1},MIN).food>marchSupplies({club:1},MIN).food);
 const c=newCity(0,123);c.res.food=0;const prior=JSON.stringify(c);assert.throws(()=>reserveMarchFood(c,{club:10},20*MIN),/lương thực/);assert.equal(JSON.stringify(c),prior);
 c.res.food=1000;const paid=reserveMarchFood(c,{club:10},20*MIN);assert.equal(c.res.food,1000-paid);
});
test('prepaid deployed soldiers keep army slots but do not charge food upkeep twice',()=>{
 const c=newCity(0,123),d=derive(c);c.deployedArmy={club:10};const unprovisioned=stats(c,d,0).rate.food;c.provisionedSoldiers=10;
 assert.equal(stats(c,d,0).rate.food-unprovisioned,20);
});
