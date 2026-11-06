import test from 'node:test';
import assert from 'node:assert/strict';
import {CAP, G, HL, O, idx, cheb, enrichCopperDeposits, newCity} from './engine';
test('new worlds have several nearby deposits across many seeds without consuming the starting stone supply',()=>{
 for(let seed=1;seed<=40;seed++){
  const c=newCity(0,seed),ore=c.t.flatMap((t,i)=>t===O?[i]:[]);
  assert.ok(ore.filter(i=>cheb(i,c.camp)<=18).length>=3,`seed ${seed}`);
  assert.ok(c.t.some(t=>t===HL));assert.ok(ore.length>=12);assert.equal(c.copperDepositsVersion,1);
  assert.deepEqual(newCity(0,seed),c);
 }
 assert.equal(CAP.ore,1200);
});
test('old maps enrich once without touching buildings, active miners, depleted hills or progress',()=>{
 const c=newCity(0,123);delete c.copperDepositsVersion;c.t.fill(G);c.camp=idx(30,30);c.b={};c.herds=[];c.camps=[];c.dep={};
 for(let x=5;x<85;x++)c.t[idx(x,35)]=HL;
 c.t[idx(31,35)]=O;c.dep[idx(31,35)]=250;
 c.b[idx(32,35)]={k:'quarry',lvl:2,doneAt:null};c.dep[idx(33,35)]=20;
 c.people[0].task={t:'mine',at:idx(34,35)};
 const before=structuredClone(c),added=enrichCopperDeposits(c);
 assert.ok(added>0);assert.ok(c.t.filter(t=>t===HL).length>=Math.floor(79*.75));
 for(const x of [32,33,34])assert.equal(c.t[idx(x,35)],HL);
 assert.deepEqual(c.dep,before.dep);assert.deepEqual(c.people,before.people);assert.deepEqual(c.b,before.b);assert.deepEqual(c.res,before.res);assert.deepEqual(c.seen,before.seen);assert.equal(c.last,before.last);
 assert.ok(c.t.every((t,i)=>t===before.t[i]||before.t[i]===HL&&t===O));
 const once=structuredClone(c);assert.equal(enrichCopperDeposits(c),0);assert.deepEqual(c,once);
});
test('maps with no untouched hills do not create blocking terrain on player land',()=>{
 const c=newCity(0,1);delete c.copperDepositsVersion;c.t.fill(G);
 const before=[...c.t];assert.equal(enrichCopperDeposits(c),0);assert.deepEqual(c.t,before);
});
