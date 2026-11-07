/** Loopback-only real workerd/SQLite integration and timing; no production auth. */
import assert from 'node:assert/strict';
import { randomUUID,createHash } from 'node:crypto';
import { readFileSync,writeFileSync } from 'node:fs';
import { applyCommandBatch, type BatchRequest, type BatchResponse } from '../lib/city-sync';
import { HOUR,settle, type Action } from '../lib/engine';
import { prototypeFixture,workloadUntil,type Workload } from '../worker/prototype/index';
import { syncCommands } from '../tests/sync-workload';

const base=new URL(process.env.PROTOTYPE_URL??'http://127.0.0.1:8789');
const secret=process.env.PROTOTYPE_SECRET??'';
assert.ok(base.protocol==='http:'&&['127.0.0.1','localhost'].includes(base.hostname),'Local prototype only');
assert.ok(secret.startsWith('local-prototype-')&&secret.length>=32,'Use a test-only local prototype secret');
const marker='/tmp/dong-song-village-prototype-resume.json';
const catchupMarker='/tmp/dong-song-village-prototype-catchup-resume.json';
const worstMarker='/tmp/dong-song-village-prototype-worst-resume.json';
const mode=process.argv[2]??'run';
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
async function call(id:string,op='',body?:unknown,auth=true) {
  const started=performance.now();
  for(let attempt=0;;attempt++)try{
    const r=await fetch(new URL(`/villages/${id}${op?'/'+op:''}`,base),{method:body===undefined?'GET':'POST',headers:{...(auth?{authorization:`Bearer ${secret}`}:{}) ,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(60_000)});
    // Wrangler hot reload may return a non-JSON 503 after a checkpoint committed.
    // Retry the exact payload; never regenerate command IDs after an uncertain ACK.
    const data=await r.json() as BatchResponse&{catchup?:{target:number;at:number}|null;metrics:{rowsRead:number;rowsWritten:number;storageBytes:number;handlerWallMs:number};error?:string};
    return {status:r.status,data,httpWallMs:performance.now()-started};
  }catch(e){if(attempt>=2)throw e;await new Promise(r=>setTimeout(r,500));}
}
const id=`qa-${randomUUID()}`;
const rows:{scenario:string;httpWallMs:number}[]=[];
async function check(scenario:string,fn:()=>Promise<void>){const t=performance.now();await fn();rows.push({scenario,httpWallMs:Math.round(performance.now()-t)});console.log('PASS '+scenario);}
function command(sync:BatchResponse['sync'],action:Action,seq=sync.ack+1) {
  return {seq,id:randomUUID(),at:sync.at,anchor:sync.anchor,action};
}
const idle:Action={type:'assign',ids:[1],task:{t:'idle'}};
async function snapshot(name=id){const r=await call(name);assert.ok(r.status===200||r.status===202);return r.data;}
if(mode==='resume-worst') {
  const saved=JSON.parse(readFileSync(worstMarker,'utf8'));
  let result=await call(saved.id,'checkpoint',{now:saved.target}),parts=1;
  while(result.status===202){assert.ok(parts++<60);result=await call(saved.id,'checkpoint',{now:saved.target});}
  assert.equal(result.status,200);assert.equal(hash(result.data.state),saved.hash);assert.equal(result.data.sync.ack,20);
  console.log('PASS worst-case resumes to reference state after an interrupted Worker request');
} else if(mode==='pause') {
  await call(id,'seed',{workload:'workers50'});
  const sync=(await snapshot()).sync;
  const batch:BatchRequest={engine:sync.engine,session:sync.session,commands:[command(sync,idle)]};
  await call(id,'batch',{batch,now:0});
  const partial=await call(id,'checkpoint',{now:24*HOUR});assert.equal(partial.status,202);
  const expected=prototypeFixture('workers50');applyCommandBatch(expected,batch.commands,0);settle(expected,24*HOUR);
  writeFileSync(catchupMarker,JSON.stringify({id,hash:hash(partial.data.state),finalHash:hash(expected),ack:partial.data.sync.ack,revision:partial.data.sync.revision,target:24*HOUR}));
  console.log('PASS partial catch-up checkpoint saved; stop and restart local Wrangler before resume-catchup');
} else if(mode==='resume-catchup') {
  const saved=JSON.parse(readFileSync(catchupMarker,'utf8')),current=await snapshot(saved.id);
  assert.equal(hash(current.state),saved.hash);assert.equal(current.sync.ack,saved.ack);assert.equal(current.sync.revision,saved.revision);
  assert.equal(current.catchup?.target,saved.target);
  let result=await call(saved.id,'checkpoint',{now:saved.target}),parts=1;
  while(result.status===202){assert.ok(parts++<60);result=await call(saved.id,'checkpoint',{now:saved.target});}
  assert.equal(result.status,200);assert.equal(hash(result.data.state),saved.finalHash);assert.equal(result.data.sync.ack,saved.ack);
  console.log('PASS restart resumes partial catch-up to the same final state without consuming commands');
} else if(mode==='resume') {
  const saved=JSON.parse(readFileSync(marker,'utf8'));
  const current=await snapshot(saved.id);
  assert.equal(hash(current.state),saved.hash);assert.equal(current.sync.ack,saved.ack);assert.equal(current.sync.revision,saved.revision);
  const replay=await call(saved.id,'batch',saved.retry);assert.equal(replay.status,200);
  assert.equal(hash(replay.data.state),saved.hash);assert.equal(replay.data.sync.revision,saved.revision);
  assert.equal(replay.data.metrics.rowsWritten,0);
  console.log('PASS real Wrangler restart restores ACK/checkpoint and retry stays read-only');
} else if(mode==='run'||mode==='worst') {
  if(mode==='run'){
  await check('router refuses unauthorized callers, real city IDs and oversized streams',async()=>{
    assert.equal((await call(id,'seed',{workload:'workers50'},false)).status,401);
    assert.equal((await call('real-player-city','seed',{workload:'workers50'})).status,404);
    assert.equal((await call(id,'seed',{workload:'workers50',padding:'x'.repeat(262144)})).status,413);
  });
  await check('seed is synthetic-only and cannot overwrite an existing checkpoint',async()=>{
    assert.equal((await call(id,'seed',{state:{},workload:'unknown'})).status,400);
    assert.equal((await call(id,'seed',{workload:'workers50'})).status,200);
    assert.equal((await call(id,'seed',{workload:'workers50'})).status,409);
  });
  let firstBatch:BatchRequest;
  await check('20 commands match shared engine and duplicate does not write',async()=>{
    const sync=(await snapshot()).sync;
    firstBatch={engine:sync.engine,session:sync.session,commands:syncCommands().map((c,n)=>({...c,seq:n+1,id:randomUUID(),anchor:sync.anchor}))};
    const expected=prototypeFixture('workers50');applyCommandBatch(expected,firstBatch.commands,10000);
    const r=await call(id,'batch',{batch:firstBatch,now:10000});assert.equal(r.status,200);assert.equal(r.data.sync.ack,20);
    assert.equal(hash(r.data.state),hash(expected));assert.equal(r.data.metrics.rowsWritten,1);
    const retry=await call(id,'batch',{batch:firstBatch,now:10000});assert.equal(retry.status,200);
    assert.equal(retry.data.sync.revision,r.data.sync.revision);assert.equal(retry.data.metrics.rowsWritten,0);assert.equal(hash(retry.data.state),hash(expected));
  });
  await check('sequence conflicts, gaps, forged anchors and invalid sessions cannot mutate',async()=>{
    const before=await snapshot(),sync=before.sync;
    const req:BatchRequest={engine:sync.engine,session:sync.session,commands:[command(sync,idle)]};
    for(const [value,status]of [
      [{...req,commands:[{...req.commands[0],seq:sync.ack+2}]},409],
      [{...firstBatch!,commands:[{...firstBatch!.commands[0],id:randomUUID()}]},409],
      [{...req,commands:[{...req.commands[0],anchor:'forged.token'}]},409],
      [{...req,session:2},401],
      [{...req,engine:999},400],
    ] as const)assert.equal((await call(id,'batch',{batch:value,now:10000})).status,status);
    assert.equal((await call(id,'batch',{batch:req,now:24*HOUR})).status,409);
    assert.equal((await snapshot()).sync.revision,before.sync.revision);
  });
  await check('domain rejection ACKs once and following valid command succeeds',async()=>{
    const sync=(await snapshot()).sync;
    const req={engine:sync.engine,session:sync.session,commands:[command(sync,{type:'advance'}),command(sync,idle,sync.ack+2)]};
    const r=await call(id,'batch',{batch:req,now:10000});assert.equal(r.status,200);
    assert.ok(r.data.sync.results[0].error);assert.equal(r.data.sync.results[1].error,null);assert.equal(r.data.sync.ack,sync.ack+2);
  });
  await check('concurrent copies serialize and produce exactly one durable commit',async()=>{
    const sync=(await snapshot()).sync,req={engine:sync.engine,session:sync.session,commands:[command(sync,idle)]};
    const results=await Promise.all([call(id,'batch',{batch:req,now:10000}),call(id,'batch',{batch:req,now:10000})]);
    assert.ok(results.every(r=>r.status===200));assert.equal((await snapshot()).sync.revision,sync.revision+1);
    assert.equal(results.reduce((n,r)=>n+r.data.metrics.rowsWritten,0),1);
  });
  await check('SQL failure after write rolls back state and ACK; exact retry succeeds',async()=>{
    const before=await snapshot(),sync=before.sync,req={engine:sync.engine,session:sync.session,commands:[command(sync,idle)]};
    assert.equal((await call(id,'batch',{batch:req,now:10000,failWrite:true})).status,503);
    const failed=await snapshot();assert.equal(hash(failed.state),hash(before.state));assert.equal(failed.sync.ack,sync.ack);assert.equal(failed.sync.revision,sync.revision);
    const retry=await call(id,'batch',{batch:req,now:10000});assert.equal(retry.status,200);assert.equal(retry.data.sync.ack,sync.ack+1);
  });
  await check('receipt retention is bounded and compacted retries cannot execute again',async()=>{
    for(let n=0;n<9;n++){
      const sync=(await snapshot()).sync;
      const req:BatchRequest={engine:sync.engine,session:sync.session,commands:Array.from({length:32},(_,i)=>command(sync,idle,sync.ack+i+1))};
      assert.equal((await call(id,'batch',{batch:req,now:10000})).status,200);
    }
    const before=await snapshot();assert.equal(before.sync.results.length,256);
    const r=await call(id,'batch',{batch:firstBatch!,now:10000});assert.equal(r.status,200);
    assert.equal(r.data.sync.ack,before.sync.ack);assert.equal(r.data.metrics.rowsWritten,0);assert.equal(hash(r.data.state),hash(before.state));
  });
  await check('session replacement fences old queue without erasing checkpoint',async()=>{
    const before=await snapshot();assert.equal((await call(id,'session',{version:2})).status,200);
    assert.equal((await call(id,'batch',{batch:firstBatch!,now:10000})).status,401);
    assert.equal(hash((await snapshot()).state),hash(before.state));
  });
  }
  const measured=[];
  const workloads:Workload[]=mode==='worst'?['offline14d200']:['fresh','workers50','workers200','full','offline1h','offline24h','offline14d'];
  for(const workload of workloads){
    const name=`qa-${randomUUID()}`;await call(name,'seed',{workload});
    const sync=(await snapshot(name)).sync;
    const batch={engine:sync.engine,session:sync.session,commands:syncCommands().map((c,n)=>({...c,seq:n+1,id:randomUUID(),anchor:sync.anchor}))};
    const expected=prototypeFixture(workload);applyCommandBatch(expected,batch.commands,10000);
    const start=await call(name,'batch',{batch,now:10000});assert.equal(start.status,200);assert.equal(hash(start.data.state),hash(expected));
    const until=workloadUntil(workload);
    console.log(JSON.stringify({event:'reference-start',workload}));settle(expected,until);
    console.log(JSON.stringify({event:'reference-complete',workload,hash:hash(expected)}));
    if(mode==='worst')writeFileSync(worstMarker,JSON.stringify({id:name,target:until,hash:hash(expected)}));
    let result=await call(name,'checkpoint',{now:until}),parts=1,totalMs=result.httpWallMs,maxPartMs=result.data.metrics.handlerWallMs;
    const rows={read:result.data.metrics.rowsRead,written:result.data.metrics.rowsWritten};
    if(result.status===202){
      const before=result.data;
      const req:BatchRequest={engine:before.sync.engine,session:before.sync.session,commands:[command(before.sync,idle)]};
      assert.equal((await call(name,'batch',{batch:req,now:before.state.last})).status,409);
      assert.equal((await snapshot(name)).sync.ack,before.sync.ack);
    }
    while(result.status===202){
      assert.ok(parts<60,'Catch-up did not converge');
      result=await call(name,'checkpoint',{now:until});parts++;totalMs+=result.httpWallMs;
      maxPartMs=Math.max(maxPartMs,result.data.metrics.handlerWallMs);rows.read+=result.data.metrics.rowsRead;rows.written+=result.data.metrics.rowsWritten;
    }
    assert.equal(result.status,200);assert.equal(result.data.catchup,null);assert.equal(hash(result.data.state),hash(expected));
    const retry=await call(name,'checkpoint',{now:until});assert.equal(retry.status,200);assert.equal(retry.data.metrics.rowsWritten,0);
    measured.push({workload,checkpointParts:parts,checkpointHttpWallMs:Math.round(totalMs),batchHandlerWallMs:Math.round(start.data.metrics.handlerWallMs),maxPartHandlerWallMs:Math.round(maxPartMs),rowsRead:rows.read,rowsWritten:rows.written,storageBytes:result.data.metrics.storageBytes,stateBytes:Buffer.byteLength(JSON.stringify(result.data.state)),hash:hash(expected).slice(0,16)});
  }
  // Leave one checkpoint/receipt for a genuine stop + restart of workerd.
  if(mode==='run'){
  const stable=await snapshot();const retry={batch:{engine:stable.sync.engine,session:stable.sync.session,commands:[command(stable.sync,idle)]},now:10000};
  const saved=await call(id,'batch',retry);assert.equal(saved.status,200);
  writeFileSync(marker,JSON.stringify({id,hash:hash(saved.data.state),ack:saved.data.sync.ack,revision:saved.data.sync.revision,retry}));
  }
  console.log(JSON.stringify({source:'real local workerd + DO SQLite; wall time only, no cloud quota/CPU claim',rows,measured,restartMarker:marker},null,2));
} else throw new Error('Use run, worst, pause, resume or resume-catchup');
