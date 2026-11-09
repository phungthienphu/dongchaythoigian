import test from 'node:test';
import assert from 'node:assert/strict';
import { ENGINE_VER, applyAction, settle, idx } from './engine';
import { applyCommandBatch, validBatch, QUEUE_AGE_MS, type SyncCommand } from './city-sync';
import { syncFixture, syncCommands } from '../tests/sync-workload';

const command=(seq:number,at:number,action:SyncCommand['action']):SyncCommand=>({seq,at,action,id:`id-${seq}`,anchor:'signed'});
test('10s and 30s batches preserve the same work and delivery timeline as immediate commands',()=>{
  for(const end of [10_000,30_000])for(const pop of [3,50,200]) {
    const direct=syncFixture(pop),batched=structuredClone(direct);
    const commands=syncCommands().map((c,n)=>command(n+1,c.at,c.action));
    for(const c of commands)applyAction(direct,c.action,c.at);
    settle(direct,end);
    const results=applyCommandBatch(batched,commands,end);
    assert.deepEqual(batched,direct);assert.ok(results.every(r=>!r.error));
  }
});
test('domain rejection consumes only its sequence and later valid commands still run',()=>{
  const c=syncFixture();
  const results=applyCommandBatch(c,[command(1,500,{type:'upgrade',x:1,y:1}),command(2,800,{type:'assign',ids:[1],task:{t:'idle'}})],10000);
  assert.ok(results[0].error);assert.equal(results[1].error,null);assert.equal(c.people[0].task.t,'idle');
});
test('construction and recruitment complete on the same timestamps as immediate requests',()=>{
  const direct=syncFixture(3);direct.b[idx(22,20)]={k:'barracks',lvl:3,doneAt:null};
  const batched=structuredClone(direct);
  const commands=[command(1,500,{type:'build',k:'house',x:10,y:10}),command(2,900,{type:'train',u:'club',n:2})];
  for(const c of commands)assert.equal(applyAction(direct,c.action,c.at),null);
  settle(direct,600000);
  assert.ok(applyCommandBatch(batched,commands,10000).every(r=>!r.error));settle(batched,600000);
  assert.deepEqual(batched,direct);assert.equal(batched.b[idx(10,10)].doneAt,null);assert.equal(batched.army.club,2);
});
test('external checkpoint is never rewound; active combat and expired commands cannot mutate',()=>{
  const c=syncFixture();settle(c,20000);
  const [r]=applyCommandBatch(c,[command(1,500,{type:'assign',ids:[1],task:{t:'idle'}})],20000);
  assert.equal(r.at,20000);assert.equal(r.rescheduled,true);
  c.battleId='battle';const before=structuredClone(c);
  assert.ok(applyCommandBatch(c,[command(2,21000,{type:'demolish',x:20,y:20})],22000)[0].error);
  assert.deepEqual(c,before);
  delete c.battleId;
  const old=applyCommandBatch(c,[command(3,500,{type:'assign',ids:[1],task:{t:'work',at:idx(25,25)}})],QUEUE_AGE_MS+1000);
  assert.match(old[0].error!,/30 phút/);assert.equal(c.people[0].task.t,'idle');
});
test('batch envelope rejects gaps, malformed actions, unsupported engine and too many commands',()=>{
  const first=command(1,500,{type:'alarm'});
  const body={engine:ENGINE_VER,session:1,commands:[first]};
  assert.equal(validBatch(body),true);
  for(const value of [{...body,engine:0},{...body,session:0},{...body,commands:[]},{...body,commands:[first,{...first,seq:3}]},{...body,commands:[{...first,action:{type:'giveResources',food:99999}}]}, {...body,commands:Array.from({length:33},(_,n)=>({...first,seq:n+1}))}])assert.equal(validBatch(value),false);
});
test('army release has identical home counts, civilian IDs and upkeep with ten second batching',()=>{
 const direct=syncFixture(3);direct.army={club:5};direct.b[idx(19,20)]={k:'house',lvl:3,doneAt:null};
 const batched=structuredClone(direct),commands=[command(1,500,{type:'releaseTroops',mode:'expel',units:{club:2}}),command(2,900,{type:'releaseTroops',mode:'expel',units:{club:1}})];
 for(const c of commands)assert.equal(applyAction(direct,c.action,c.at),null);settle(direct,10000);
 assert.ok(applyCommandBatch(batched,commands,10000).every(r=>!r.error));assert.deepEqual(batched,direct);assert.equal(batched.army.club,2);assert.equal(batched.people.length,3);
});
test('a queued pre-update command never activates new gameplay retroactively',()=>{
 const c=syncFixture(10);c.era=4;delete c.farmAutoStartsAt;delete c.hungerStartsAt;delete c.hunger;
 for(const p of c.people)p.task={t:'idle'};c.res.food=0;c.b[idx(22,20)]={k:'farm',lvl:1,doneAt:null,fertility:0};
 applyCommandBatch(c,[command(1,500,{type:'assign',ids:[1],task:{t:'idle'}})],20*60000);
 assert.equal(c.farmAutoStartsAt,20*60000);assert.equal(c.hungerStartsAt,20*60000);assert.equal(c.hunger,undefined);assert.equal(c.b[idx(22,20)].tendUntil,undefined);
});
