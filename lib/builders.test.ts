import test from 'node:test';
import assert from 'node:assert/strict';
import {newCity,G,idx,builders,busyBuilders,applyAction,settle,MIN} from './engine';
function fixture(){const c=newCity(0,123);c.t.fill(G);c.seen.fill(1);c.b={};c.res.wood=500;c.res.stone=500;c.res.food=500;return c;}
test('builder houses add crews only after completion and respect damage and levels',()=>{
 const c=fixture();assert.equal(builders(c),2);
 assert.equal(applyAction(c,{type:'build',k:'builderhouse',x:20,y:20},0),null);
 assert.equal(builders(c),2);assert.equal(busyBuilders(c),1);
 settle(c,MIN);assert.equal(builders(c),3);assert.equal(busyBuilders(c),0);
 const b=c.b[idx(20,20)];b.lvl=3;assert.equal(builders(c),5);
 b.burned=true;assert.equal(builders(c),2);b.burned=false;b.flooded=true;assert.equal(builders(c),2);
});
test('extra crews permit parallel construction; two-house limit applies before completion',()=>{
 const c=fixture();c.b[idx(10,10)]={k:'builderhouse',lvl:1,doneAt:null};
 for(const x of [20,21,22])assert.equal(applyAction(c,{type:'build',k:'hut',x,y:20},0),null);
 assert.match(applyAction(c,{type:'build',k:'hut',x:23,y:20},0)!,/thợ đang bận/);
 const snapshot=structuredClone(c);settle(c,MIN);for(let at=1000;at<=MIN;at+=1000)settle(snapshot,at);assert.deepEqual(snapshot,c);
 assert.equal(applyAction(c,{type:'build',k:'builderhouse',x:30,y:20},MIN),null);
 assert.match(applyAction(c,{type:'build',k:'builderhouse',x:31,y:20},MIN)!,/tối đa/);
});
