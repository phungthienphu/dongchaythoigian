import test from 'node:test';
import assert from 'node:assert/strict';
import {newCity,RES,buildMs,levelCost,speedBuildQuote,applyAction,type Building} from './engine';

test('rush materials scale with target level and remaining time',()=>{
 const c=newCity(0,123);
 for(const target of [1,2,3]){
  const duration=buildMs('house',target),b:Building={k:'house',lvl:target-1,doneAt:duration};
  const base=levelCost('house',target,c.era),rate=target===1?.25:target===2?.5:1;
  assert.equal(speedBuildQuote(c,b,0).wood,Math.ceil(base.wood!*rate));
  assert.equal(speedBuildQuote(c,b,duration/2).wood,Math.ceil(base.wood!*rate/2));
  assert.deepEqual(speedBuildQuote(c,b,duration),{});
 }
});
test('storage rush prices the selected compartment rather than building level',()=>{
 const c=newCity(0,123),b:Building={k:'storehouse',lvl:1,doneAt:buildMs('storehouse',3),storageLevels:{wood:2},storageUpgrade:'wood'};
 assert.equal(speedBuildQuote(c,b,0).wood,levelCost('storehouse',3,c.era).wood);
});
test('magic rush includes rare materials from that building recipe',()=>{
 const c=newCity(0,123);c.era=8;
 const b:Building={k:'essenceforge',lvl:2,doneAt:buildMs('essenceforge',3)};
 const fee=speedBuildQuote(c,b,0),base=levelCost(b.k,3,c.era);
 assert.equal(fee.rune,base.rune);assert.equal(fee.copper,base.copper);assert.equal(fee.stone,base.stone);
 assert.ok(fee.diamond!>0);
});
test('rush rejects missing materials atomically, charges once and excludes fee from investment',()=>{
 const c=newCity(0,123);c.people=[];const b:Building={k:'house',lvl:2,doneAt:buildMs('house',3),investment:{wood:100}};c.b[0]=b;
 for(const r of RES)c.res[r]=100000;
 const fee=speedBuildQuote(c,b,0);c.res.wood=fee.wood!-1;
 const before=structuredClone(c);
 assert.ok(applyAction(c,{type:'speedBuild',x:0,y:0},0));assert.deepEqual(c,before);
 c.res.wood=fee.wood!;const stock={...c.res};
 assert.equal(applyAction(c,{type:'speedBuild',x:0,y:0},0),null);
 for(const r of RES)assert.equal(c.res[r],stock[r]-(fee[r]??0));
 assert.equal(b.lvl,3);assert.equal(b.doneAt,null);assert.deepEqual(b.investment,{wood:100});
 const after={...c.res};assert.ok(applyAction(c,{type:'speedBuild',x:0,y:0},0));assert.deepEqual(c.res,after);
});
