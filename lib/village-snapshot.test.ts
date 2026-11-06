import test from 'node:test';
import assert from 'node:assert/strict';
import { newCity, settle, MAX_SETTLE_MS } from './engine';
import { villageView } from './world-discovery';
import { VillageSnapshots } from './village-snapshot';
function source() {
 const state=newCity(0,123);state.upkeepStartsAt=0;state.wheelFuelStartsAt=0;state.gatherFoodStartsAt=0;
 state.discoveries=['secret'];state.visits={secret:123};
 return {_id:'a',ver:1,state};
}
test('cached visits match full replay, do not change stored state and never leak intelligence or aliases',()=>{
 const snapshots=new VillageSnapshots(),doc=source(),original=structuredClone(doc);
 for(const now of [60_000,65_731,100_123,180_900]){
  const expected=structuredClone(doc.state);settle(expected,now);
  const actual=snapshots.view(doc,now);assert.deepEqual(actual,villageView(expected));
  assert.equal(actual.discoveries,undefined);assert.equal(actual.visits,undefined);
  actual.res.food=999999;actual.people.splice(0); // caller cannot poison checkpoint
 }
 assert.deepEqual(doc,original);
});
test('revision, battle, rewind and TTL invalidate checkpoints and unchanged revisions replay only the new interval',()=>{
 const inputs:number[]=[],cache=new VillageSnapshots(8,2_000_000,10000,(c,now)=>{inputs.push(c.last);settle(c,now);}),doc=source();
 cache.view(doc,60000);cache.view(doc,65000);assert.deepEqual(inputs,[0,60000]);
 doc.ver++;doc.state.res.gold=47;assert.equal(cache.view(doc,66000).res.gold,47);
 cache.view(doc,64000);assert.equal(inputs.at(-1),0);
 cache.view(doc,80000);assert.equal(inputs.at(-1),0);
 doc.ver++;doc.state.battleId='private-room';const frozen=cache.view(doc,90000);
 assert.equal(frozen.last,0);assert.equal(frozen.battleId,'active');
});
test('cache retention remains bounded, oversized entries are not retained and legacy activation replays from source',()=>{
 const cache=new VillageSnapshots(2,2_000_000),doc=source();
 for(let n=0;n<50;n++)cache.view({...doc,_id:String(n)},60000);
 assert.equal(cache.size,2);assert.ok(cache.weight<=2_000_000);
 const tiny=new VillageSnapshots(2,10);tiny.view(doc,60000);assert.equal(tiny.size,0);
 const inputs:number[]=[],legacy=new VillageSnapshots(8,2_000_000,10000,(c,now)=>{inputs.push(c.last);c.last=now;});
 delete doc.state.upkeepStartsAt;legacy.view(doc,60000);legacy.view(doc,65000);
 assert.deepEqual(inputs,[0,0]);assert.equal(legacy.size,0);
 doc.state.upkeepStartsAt=0;legacy.view(doc,MAX_SETTLE_MS+60000);assert.equal(legacy.size,0);
});
