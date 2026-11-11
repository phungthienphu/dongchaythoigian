import test from 'node:test';
import assert from 'node:assert/strict';
import {applyAction, B, ERA_REQ, G, buildingCost, derive, canPlace, idx, newCity, levelCost, trainingCost, repairCost, farmTendCost} from './engine';
const now=1_000_000;
function city(era=3){const c=newCity(now,123);c.era=era;c.t.fill(G);c.seen.fill(1);c.b={};c.res={food:10000,wood:10000,stone:10000,copper:10000, gold: 0, diamond:0,coal:0,aetherCrystal:0,rune:0,essence:0,celestialStone:0};return c;}
test('early-era prices stay unchanged and iron costs apply to old buildings and units too',()=>{
 for(const era of [1,2]){assert.deepEqual(buildingCost('storehouse',era),B.storehouse.cost);assert.deepEqual(trainingCost('bow',era),{food:40,wood:30});assert.deepEqual(levelCost('hall',3,era),{wood:1200,stone:800,copper:80});}
 assert.deepEqual(buildingCost('stonehouse',3),{stone:750,copper:90});
 assert.deepEqual(buildingCost('storehouse',3),{wood:120,stone:30});
 assert.deepEqual(trainingCost('sword',3),{food:160,copper:50});
 assert.deepEqual(ERA_REQ[3].cost,{food:3000,wood:1000,stone:2000,copper:600});
});
test('placement rejects base-price budgets and construction pays the displayed iron price',()=>{
 const c=city();c.res.wood=40;c.res.stone=10;
 assert.match(canPlace(c,derive(c),'storehouse',10,10)!,/Thiếu/);
 assert.ok(applyAction(c,{type:'build',k:'storehouse',x:10,y:10},now));assert.equal(c.b[idx(10,10)],undefined);assert.equal(c.res.wood,40);
 c.res.wood=120;c.res.stone=30;assert.equal(applyAction(c,{type:'build',k:'storehouse',x:10,y:10},now),null);
 assert.equal(c.res.wood,0);assert.equal(c.res.stone,0);
});
test('iron upgrades, repairs and farm renewal charge the UI quote',()=>{
 const c=city();c.b[0]={k:'hall',lvl:3,doneAt:null};c.b[1]={k:'storehouse',lvl:1,doneAt:null};
 let before={...c.res},quote=levelCost('storehouse',2,c.era);
 assert.equal(applyAction(c,{type:'upgradeStorage',resource:'wood',x:1,y:0},now),null);assert.equal(c.res.wood,before.wood-quote.wood!);assert.equal(c.res.stone,before.stone-quote.stone!);
 c.b[2]={k:'watchtower',lvl:2,doneAt:null,burned:true};before={...c.res};quote=repairCost('watchtower',2,true,c.era);
 assert.equal(applyAction(c,{type:'repair',x:2,y:0},now),null);assert.equal(c.res.wood,before.wood-quote.wood!);
 c.b[3]={k:'farm',lvl:2,doneAt:null,fertility:0};before={...c.res};quote=farmTendCost(c.b[3],c.era);
 assert.deepEqual(quote,{food:80,wood:20});assert.equal(applyAction(c,{type:'tendFarm',x:3,y:0},now),null);assert.equal(c.res.food,before.food-80);assert.equal(c.res.wood,before.wood-20);
});
test('recruitment cannot use old prices and multiplies the iron quote by batch size',()=>{
 const c=city();c.b[0]={k:'barracks',lvl:3,doneAt:null};c.res.food=80;c.res.copper=25;
 assert.ok(applyAction(c,{type:'train',u:'sword',n:1},now));assert.equal(c.queue.length,0);assert.equal(c.res.food,80);
 c.res.food=800;c.res.copper=250;assert.equal(applyAction(c,{type:'train',u:'sword',n:5},now),null);assert.equal(c.queue.length,5);assert.equal(c.res.food,0);assert.equal(c.res.copper,0);
});
test('advancing eras cannot turn demolition into a resource profit',()=>{
 const c=city(2);assert.equal(applyAction(c,{type:'build',k:'hut',x:10,y:10},now),null);const spent=10000-c.res.wood;c.era=3;
 const before=c.res.wood;assert.equal(applyAction(c,{type:'demolish',x:10,y:10},now),null);assert.ok(c.res.wood-before<=spent/2);
});
