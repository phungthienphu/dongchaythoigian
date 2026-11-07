import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preflightVillage,transferChecksum,type TransferCity,type MigrationRelations } from '../lib/village-preflight';
import { syncFixture } from './sync-workload';
const relations:MigrationRelations={consistentSnapshot:true,marketOrders:0,caravans:0,battles:0,envoyVisits:0};
function fixture():TransferCity {
  return {_id:'qa-source',owner:'qa-owner',name:'QA',world:{x:20,y:30},state:syncFixture(),ver:12,score:100,era:3,pop:50,templeAt:null,createdAt:new Date(0),updatedAt:new Date(10000),actionReceipts:[{id:'old-action',result:{paid:true}}],citySync:{session:2,ack:1000,lastAt:10000,results:[{seq:1000,id:'last-id',error:null,at:10000,digest:'abc'}]}};
}
test('preflight is read-only and preserves full state, legacy receipts and high-water ACK',async()=>{
  const doc=fixture(),before=structuredClone(doc),result=await preflightVillage(doc,relations,2,10000);
  assert.deepEqual(doc,before);assert.equal(result.ready,true);if(!result.ready)return;
  assert.deepEqual(result.envelope.city,JSON.parse(JSON.stringify(doc)));
  assert.equal((result.envelope.city.citySync as {ack:number}).ack,1000);
  assert.equal(result.checksum,await transferChecksum(result.envelope));
  assert.equal((await preflightVillage(doc,relations,2,10000)).ready,true);
});
test('transfer checksum ignores key order but detects resources, ACK and owner changes',async()=>{
  const result=await preflightVillage(fixture(),relations,2,10000);assert.ok(result.ready);if(!result.ready)return;
  const reversed=Object.fromEntries(Object.entries(result.envelope).reverse());
  assert.equal(await transferChecksum(reversed),result.checksum);
  for(const mutate of [
    (e:any)=>e.city.state.res.wood++,
    (e:any)=>e.city.citySync.ack++,
    (e:any)=>e.city.owner='another',
    (e:any)=>e.epoch++,
  ]){const next=structuredClone(result.envelope);mutate(next);assert.notEqual(await transferChecksum(next),result.checksum);}
});
test('active external operations are postponed, never removed from the city',async()=>{
  for(const key of ['marketOrders','caravans','battles','envoyVisits'] as const){
    const doc=fixture(),before=structuredClone(doc),r=await preflightVillage(doc,{...relations,[key]:1},2,10000);
    assert.equal(r.ready,false);if(!r.ready)assert.ok(r.blockers.includes('active-relation:'+key));assert.deepEqual(doc,before);
  }
});
test('stale session, migration ownership, missing relation proof and old engine fail closed',async()=>{
  const cases:[(c:TransferCity)=>void,string][]=[
    [c=>{c.villageOwner={backend:'migrating',epoch:1};},'source-is-not-mongo-owner'],
    [c=>{c.villageOwner={backend:'durable-object',epoch:2};},'source-is-not-mongo-owner'],
    [c=>{c.state.ver=999;},'unsupported-engine'],
    [c=>{c.citySync!.session=1;},'ledger-session-mismatch'],
    [c=>{c.citySync!.results[0].seq=1001;},'invalid-ledger-receipts'],
  ];
  for(const [change,blocker]of cases){const doc=fixture();change(doc);const r=await preflightVillage(doc,relations,2,10000);assert.equal(r.ready,false);if(!r.ready)assert.ok(r.blockers.includes(blocker));}
  assert.equal((await preflightVillage(fixture(),{...relations,consistentSnapshot:false},2,10000)).ready,false);
});
test('city-held deployment and outbox references block transfer even if collection counts are zero',async()=>{
  for(const change of [
    (c:TransferCity)=>{c.incomingBattleId='war';},
    (c:TransferCity)=>{c.state.deployedArmy={club:1};},
    (c:TransferCity)=>{c.envoyOutbox=[{key:'envoy',trip:{id:1,depart:0,target:'other',targetName:'Other',arrive:100}}];},
  ]){const doc=fixture();change(doc);assert.equal((await preflightVillage(doc,relations,2,10000)).ready,false);}
});
test('non-finite data and oversized checkpoints are rejected without changing source',async()=>{
  const bad=fixture();bad.state.res.food=NaN;const r=await preflightVillage(bad,relations,2,10000);assert.equal(r.ready,false);
  const big=fixture();big.name='x'.repeat(1600*1024);const large=await preflightVillage(big,relations,2,10000);assert.equal(large.ready,false);if(!large.ready)assert.deepEqual(large.blockers,['checkpoint-too-large']);
});
