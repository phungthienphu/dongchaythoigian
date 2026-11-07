import test from 'node:test';
import assert from 'node:assert/strict';
import { ENGINE_VER, applyAction, settle, idx } from './engine';
import { applyCommandBatch, validBatch, QUEUE_AGE_MS, type SyncCommand } from './city-sync';
import { syncFixture, syncCommands } from '../tests/sync-workload';

const command=(seq:number,at:number,action:SyncCommand['action']):SyncCommand=>({seq,at,action,id:`id-${seq}`,anchor:'signed'});
test('batch preserves work, delivery, construction and recruitment timeline without losing the ten seconds',()=>{
  for(const pop of [3,50,200]) {
    const direct=syncFixture(pop),batched=structuredClone(direct);
    const commands=syncCommands().map((c,n)=>command(n+1,c.at,c.action));
    for(const c of commands)applyAction(direct,c.action,c.at);
    settle(direct,10_000);
    const results=applyCommandBatch(batched,commands,10_000);
    assert.deepEqual(batched,direct);assert.ok(results.every(r=>!r.error));
  }
});
test('domain rejection consumes only its sequence and later valid commands still run',()=>{
  const c=syncFixture();
  const results=applyCommandBatch(c,[command(1,500,{type:'upgrade',x:1,y:1}),command(2,800,{type:'assign',ids:[1],task:{t:'idle'}})],10000);
  assert.ok(results[0].error);assert.equal(results[1].error,null);assert.equal(c.people[0].task.t,'idle');
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
