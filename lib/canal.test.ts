import test from 'node:test';
import assert from 'node:assert/strict';
import {newCity,G,R,idx,derive,applyAction} from './engine';
test('removing the river intake dries downstream canals but every remaining segment can still be demolished',()=>{
 const c=newCity(0,123);c.t.fill(G);c.seen.fill(1);c.b={};c.people=[];c.camps=[];c.herds=[];c.era=2;c.t[idx(9,10)]=R;
 for(let x=10;x<=13;x++)c.b[idx(x,10)]={k:'canal',lvl:1,doneAt:null};
 assert.ok([10,11,12,13].every(x=>derive(c).wet[idx(x,10)]));
 assert.equal(applyAction(c,{type:'demolish',x:10,y:10},0),null);
 const d=derive(c);assert.ok([11,12,13].every(x=>!d.wet[idx(x,10)]));
 for(const x of [12,11,13]){assert.equal(applyAction(c,{type:'demolish',x,y:10},0),null);assert.equal(c.b[idx(x,10)],undefined);}
 assert.equal(Object.keys(c.b).length,0);
});
