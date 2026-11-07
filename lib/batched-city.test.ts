import test from 'node:test';
import assert from 'node:assert/strict';
import { BatchedCityQueue } from './batched-city';
import { CityLeaseLostError, type CityQueueStorage, type StoredCityQueue } from './city-queue-storage';
import { applyCommandBatch, type CitySync, type BatchRequest, type BatchResponse } from './city-sync';
import { ENGINE_VER, idx, settle } from './engine';
import { syncFixture } from '../tests/sync-workload';

class Timers {
  now=0;id=0;list=new Map<number,{fn:()=>void;at:number}>();
  set=(fn:()=>void,ms:number)=>{const id=++this.id;this.list.set(id,{fn,at:this.now+ms});return id;};
  clear=(id:unknown)=>{this.list.delete(id as number);};
  tick(ms:number){this.now+=ms;for(const [id,t] of [...this.list])if(t.at<=this.now){this.list.delete(id);t.fn();}}
}
function fixture() {
  const time=new Timers();let state=syncFixture(3),ack=0,results:CitySync['results']=[],calls:BatchRequest[]=[],saved:StoredCityQueue|undefined;
  let offline=false,lost=false,failStore=false,leaseLost=false,reloads=0,checkpoints=0,reloadGate:Promise<void>|undefined,batchEnabled:boolean|undefined;
  const errors:string[]=[];
  const sync=():CitySync=>({cityId:'test',session:1,engine:ENGINE_VER,revision:ack,ack,results,anchor:'fixture-anchor',at:time.now,until:time.now+90000,checkpointAt:state.last});
  const response=():BatchResponse=>({state:structuredClone(state),sync:sync(),serverNow:time.now,batchEnabled});
  const storage:CityQueueStorage={load:async()=>structuredClone(saved),save:async value=>{if(leaseLost)throw new CityLeaseLostError();if(failStore)throw new Error('disk');saved=structuredClone(value);}};
  const queue=(delayMs?:number)=>new BatchedCityQueue({state:structuredClone(state),sync:sync(),storage,now:()=>time.now,timers:time,delayMs,onState:()=>{},onError:s=>errors.push(s),
    reload:async()=>{reloads++;if(offline)throw new Error('offline');const captured=response();await reloadGate;return captured;},
    checkpoint:async()=>{checkpoints++;settle(state,time.now);return response();},
    send:async request=>{
      calls.push(structuredClone(request));if(offline)throw new Error('offline');
      const fresh=request.commands.filter(c=>c.seq>ack);
      results=applyCommandBatch(state,fresh,time.now);if(fresh.length)ack=fresh.at(-1)!.seq;
      if(lost){lost=false;throw new Error('lost ACK');}return response();
    },
  });
  return {time,queue,storage,errors,get saved(){return saved;},get calls(){return calls;},get reloads(){return reloads;},get state(){return state;},get checkpoints(){return checkpoints;},
    offline:(v:boolean)=>offline=v,lost:()=>lost=true,failStore:()=>failStore=true,leaseLost:()=>leaseLost=true,setDelayEnabled:(v:boolean)=>batchEnabled=v,
    holdReload:()=>{let release!:()=>void;reloadGate=new Promise<void>(r=>{release=r;});return ()=>{release();reloadGate=undefined;};}};
}
const idle={type:'assign' as const,ids:[1],task:{t:'idle' as const}};
const work={type:'assign' as const,ids:[1],task:{t:'work' as const,at:idx(25,25)}};
test('local acceptance is durable and immediate; 10s deadline does not slide, idle sends nothing',async()=>{
  const f=fixture(),q=f.queue();await q.initialize();
  assert.equal(await q.enqueue(idle),true);assert.equal(f.calls.length,0);assert.equal(f.saved!.commands.length,1);assert.equal(q.snapshot.people[0].task.t,'idle');
  f.time.tick(9000);await q.enqueue(work);assert.equal(f.calls.length,0);
  f.time.tick(999);assert.equal(f.calls.length,0);f.time.tick(1);await q.flush();
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].commands.length,2);assert.equal(q.status,'saved');assert.equal(f.saved!.commands.length,0);
  f.time.tick(100000);assert.equal(f.calls.length,1);q.stop();
});
test('delay rollback flushes existing pending IDs and keeps the same durable queue protocol',async()=>{
  const f=fixture(),q=f.queue();await q.initialize();await q.enqueue(idle);const id=f.saved!.commands[0].id;
  f.setDelayEnabled(false);await q.refresh();f.time.tick(0);await q.flush();
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].commands[0].id,id);assert.equal(f.time.now,0);
  await q.enqueue(work);await q.flush();assert.equal(f.calls.length,2);assert.equal(f.saved!.commands.length,0);q.stop();
});
test('reload restores the exact pending IDs and never repeats an ACKed command after lost response',async()=>{
  const f=fixture();let q=f.queue();await q.initialize();await q.enqueue(idle);const id=f.saved!.commands[0].id;q.stop();
  q=f.queue();await q.initialize();await q.flush();assert.equal(f.calls[0].commands[0].id,id);assert.equal(q.isPending,false);
  await q.enqueue(work);f.lost();assert.equal(await q.flush(),false);assert.equal(q.status,'offline');
  const before=f.calls.length;f.time.tick(1000);await q.flush();assert.equal(f.calls.length,before);assert.equal(f.reloads,1);assert.equal(q.isPending,false);q.stop();
});
test('offline retry keeps the queue; barrier flushes first, blocks concurrent actions and reloads afterward',async()=>{
  const f=fixture(),q=f.queue();await q.initialize();await q.enqueue(idle);f.offline(true);
  assert.equal(await q.flush(),false);assert.equal(f.saved!.commands.length,1);f.offline(false);
  const order:string[]=[];
  await q.exclusive(async()=>{order.push('external');assert.equal(q.isPending,false);assert.equal(await q.enqueue(work),false);});
  assert.deepEqual(order,['external']);assert.ok(f.reloads>=2);assert.equal(q.status,'saved');q.stop();
});
test('storage failure switches to immediate send; lost lease stops instead of bypassing the writer fence',async()=>{
  const f=fixture(),q=f.queue();await q.initialize();f.failStore();assert.equal(await q.enqueue(idle),true);await q.flush();assert.equal(f.calls.length,1);assert.ok(f.errors.some(s=>s.includes('giữ trang')));q.stop();
  const g=fixture(),other=g.queue();await other.initialize();g.leaseLost();assert.equal(await other.enqueue(idle),false);assert.equal(g.calls.length,0);assert.equal(other.status,'readonly');
});
test('unreadable or corrupt saved queues are preserved and cannot be overwritten by refresh or new actions',async()=>{
  for(const unreadable of [false,true]) {
    const f=fixture(),first=f.queue();await first.initialize();await first.enqueue(idle);first.stop();
    const original=structuredClone(f.saved!);
    if(unreadable)f.storage.load=async()=>{throw new Error('read failed');};
    else f.saved!.commands[0].seq=0;
    const q=f.queue();await q.initialize();assert.equal(q.status,'error');
    assert.equal(await q.enqueue(work),false);assert.equal(await q.refresh(),false);assert.equal(await q.flush(),false);
    assert.equal(f.calls.length,0);assert.equal(f.saved!.commands.length,1);
    assert.equal(f.saved!.commands[0].id,original.commands[0].id);q.stop();
  }
});
test('a replaced session cannot send more commands or be revived by a late reply',async()=>{
  const f=fixture(),q=f.queue();await q.initialize();await q.enqueue(idle);q.stop();assert.equal(await q.enqueue(work),false);assert.equal(await q.flush(),false);assert.equal(f.calls.length,0);
});
test('idle progress uses a five minute checkpoint and never an empty command batch',async()=>{
  const f=fixture(),q=f.queue();await q.initialize();
  f.time.tick(299999);assert.equal(await q.checkpointIfDue(),false);
  f.time.tick(1);assert.equal(await q.checkpointIfDue(),true);assert.equal(f.checkpoints,1);assert.equal(f.calls.length,0);
  f.time.tick(10000);assert.equal(await q.checkpointIfDue(),false);await q.enqueue(idle);
  assert.equal(await q.checkpointIfDue(),false);await q.flush();assert.equal(f.calls.length,1);q.stop();
});
test('100 simulated reconnects across two hours retain ordered ACKs and bounded empty queues',async()=>{
  const f=fixture();
  for(let n=0;n<100;n++) {
    const q=f.queue();await q.initialize();assert.equal(await q.enqueue(idle),true);
    f.time.tick(10000);assert.equal(await q.flush(),true);assert.equal(f.saved!.commands.length,0);
    assert.equal(f.calls.at(-1)!.commands[0].seq,n+1);q.stop();f.time.tick(62000);
  }
  assert.equal(f.time.now,2*60*60*1000);assert.equal(f.calls.length,100);assert.ok(JSON.stringify(f.saved).length<100);
});
test('a slow background GET cannot regress an ACK or reuse its sequence after a newer batch commits',async()=>{
  const f=fixture(),q=f.queue();await q.initialize();const release=f.holdReload(),refresh=q.refresh();
  await q.enqueue(idle);f.time.tick(10000);await q.flush();release();await refresh;
  await q.enqueue(work);await q.flush();assert.equal(f.calls.at(-1)!.commands[0].seq,2);assert.equal(q.snapshot.people[0].task.t,'work');q.stop();
});
test('offline queues cap at 256 commands and clicks do not bypass network retry backoff',async()=>{
  const f=fixture(),q=f.queue();await q.initialize();f.offline(true);
  await q.enqueue(idle);await q.flush();const requests=f.calls.length;
  for(let n=1;n<256;n++)assert.equal(await q.enqueue(idle),true);
  assert.equal(await q.enqueue(idle),false);assert.equal(f.calls.length,requests);assert.equal(f.saved!.commands.length,256);q.stop();
});
