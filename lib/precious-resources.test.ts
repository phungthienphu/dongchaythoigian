import test from 'node:test';
import assert from 'node:assert/strict';
import {applyAction,CAP,DIAMOND,G,GOLD,idx,newCity,settle,speedBuildCost,enrichPreciousDeposits} from './engine';
function fixture(){const c=newCity(0,123);c.t.fill(G);c.seen.fill(1);c.camp=idx(20,20);c.b={};c.herds=[];c.camps=[];c.era=3;c.res.food=10000;for(const p of c.people){p.task={t:'idle'};p.pos=c.camp;}return c;}
test('precious minerals unlock by era and enter storage only after hauling',()=>{
 for(const [kind,res,era] of [[GOLD,'gold',2],[DIAMOND,'diamond',3]] as const){
 const c=fixture(),tile=idx(23,20);c.t[tile]=kind;c.era=era-1;
 assert.ok(applyAction(c,{type:'assign',ids:[c.people[0].id],task:{t:'mine',at:tile}},0));c.era=era;
 assert.equal(applyAction(c,{type:'assign',ids:[c.people[0].id],task:{t:'mine',at:tile}},0),null);
 settle(c,2000);assert.equal(c.res[res],0);
 const offline=structuredClone(c),online=structuredClone(c);settle(offline,600000);for(let at=3000;at<=600000;at+=1000)settle(online,at);assert.deepEqual(online,offline);assert.ok(offline.res[res]>0);assert.ok(offline.dep[tile]!<=CAP[res]);
 }
});
test('speedup uses diamonds once and follows normal upgrade and wonder completion',()=>{
 const c=fixture();c.b[0]={k:'hall',lvl:1,doneAt:60001};assert.equal(speedBuildCost(c.b[0],0),3);
 assert.ok(applyAction(c,{type:'speedBuild',x:0,y:0},0));assert.equal(c.b[0].lvl,1);
 c.res.wood=10000;c.res.stone=10000;c.res.copper=10000;c.res.diamond=4;assert.equal(applyAction(c,{type:'speedBuild',x:0,y:0},0),null);assert.equal(c.b[0].lvl,2);assert.equal(c.res.diamond,1);assert.equal(c.b[0].doneAt,null);
 assert.ok(applyAction(c,{type:'speedBuild',x:0,y:0},0));assert.equal(c.res.diamond,1);
 c.b[1]={k:'temple',lvl:0,doneAt:30000};assert.equal(applyAction(c,{type:'speedBuild',x:1,y:0},1000),null);assert.equal(c.templeAt,1000);assert.equal(c.b[1].lvl,1);
});
test('legacy resources normalize without resetting progress or replenishing mined ground',()=>{
 const c=fixture();delete (c.res as Partial<typeof c.res>).gold;delete (c.res as Partial<typeof c.res>).diamond;delete c.preciousDepositsVersion;
 const before=structuredClone(c.t);enrichPreciousDeposits(c);assert.equal(c.res.gold,0);assert.equal(c.res.diamond,0);assert.deepEqual(c.t,before);assert.equal(c.era,3);
});
