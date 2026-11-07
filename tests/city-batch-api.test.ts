// Isolated module mocks: no database, OAuth or Worker network calls.
// @ts-expect-error Bun test runtime
import { test, expect, mock } from 'bun:test';
import { ENGINE_VER, settle } from '../lib/engine';
import { syncFixture } from './sync-workload';
import { citySync } from '../lib/sync-anchor';
import { newCommandMetrics } from '../lib/command-metrics';
import type { CityDoc } from '../lib/db';
process.env.AUTH_SECRET='test-only-sync-secret-with-at-least-32-characters';
let writes=0,reads=0,conflict=false,unauthorized=false;
const makeDoc=():CityDoc=>({_id:'mine',owner:'owner',name:'Fixture',state:syncFixture(),ver:0,score:0,era:3,pop:50,templeAt:null,createdAt:new Date(0),updatedAt:new Date(0)});
let doc=makeDoc();
const user:any={_id:'owner',cityId:'mine',sessionVersion:1};
const jobs:(()=>Promise<void>)[]=[];
const { NextResponse }=await import('next/server');
mock.module('next/server',()=>({NextResponse,after:(fn:()=>Promise<void>)=>jobs.push(fn)}));
mock.module('next/headers',()=>({cookies:async()=>({get:()=>undefined})}));
mock.module('../lib/auth',()=>({SESSION_COOKIE:'sid',readSession:()=>user._id,currentUser:async()=>unauthorized?null:user}));
mock.module('../lib/db',()=>({cities:async()=>({
  findOne:async(q:any)=>{reads++;return q.owner&&q.owner!==doc.owner?null:structuredClone(doc);},
  updateOne:async(q:any,u:any)=>{
    if(conflict){conflict=false;doc.ver++;settle(doc.state,Date.now());return {modifiedCount:0};}
    if(q.ver!==doc.ver)return {modifiedCount:0};
    Object.assign(doc,structuredClone(u.$set));doc.ver+=u.$inc?.ver??0;writes++;return {modifiedCount:1};
  },
}),onlineCommandStats:async()=>({updateOne:async()=>{}})}));
mock.module('../lib/world',()=>({resolveDiscoveries:async()=>{}}));
mock.module('../lib/diplomacy',()=>({registerEnvoyVisits:async()=>{}}));
const {saveCityBatch}=await import('../lib/city-batch-store');
const {POST}=await import('../app/api/city/batch/route');
const clock=Date.now;let now=10000;Date.now=()=>now;
const make=(seq=1,at=500)=>({engine:ENGINE_VER,session:1,commands:[{seq,id:`command-${seq}`,at,anchor:citySync(doc,1,0).anchor,action:{type:'assign' as const,ids:[1],task:{t:'idle' as const}}}]});
const reset=()=>{doc=makeDoc();writes=0;reads=0;now=10000;unauthorized=false;conflict=false;};
test('one batch does one city read/write, ACK survives lost response and duplicate retry does no write',async()=>{
  reset();const req=make(),metrics=newCommandMetrics('city');
  const a=await saveCityBatch(user,req,metrics);expect(a!.sync.ack).toBe(1);expect(writes).toBe(1);expect(reads).toBe(1);
  const before=structuredClone(doc);const b=await saveCityBatch(user,req,newCommandMetrics('city'));
  expect(b!.sync.ack).toBe(1);expect(doc).toEqual(before);expect(writes).toBe(1);
});
test('sequence gaps, changed replay payload, wrong owner and forged anchors cannot change a city',async()=>{
  reset();await expect(saveCityBatch(user,make(2),newCommandMetrics('city'))).rejects.toThrow('Thiếu');expect(writes).toBe(0);
  const req=make();await saveCityBatch(user,req,newCommandMetrics('city'));
  await expect(saveCityBatch(user,{...req,commands:[{...req.commands[0],id:'changed'}]},newCommandMetrics('city'))).rejects.toThrow('Sequence');
  const forged=make(2);forged.commands[0].anchor+='x';await expect(saveCityBatch(user,forged,newCommandMetrics('city'))).rejects.toThrow('Mốc');
  expect(await saveCityBatch({...user,_id:'other'},make(2),newCommandMetrics('city'))).toBeNull();expect(writes).toBe(1);
});
test('CAS retries on fresh state; a restarted process uses the durable high water even after receipt compaction',async()=>{
  reset();conflict=true;const req=make();const a=await saveCityBatch(user,req,newCommandMetrics('city'));
  expect(a!.sync.results[0].rescheduled).toBe(true);expect(writes).toBe(1);expect(reads).toBe(2);
  doc.citySync!.results=[];await saveCityBatch(user,req,newCommandMetrics('city'));expect(writes).toBe(1);
});
test('session, payload limits and impossible future timestamps are checked before simulation',async()=>{
  reset();const send=(body:unknown)=>POST(new Request('http://localhost/api/city/batch',{method:'POST',body:JSON.stringify(body)}));
  unauthorized=true;expect((await send(make())).status).toBe(401);unauthorized=false;
  expect((await send({...make(),session:2})).status).toBe(401);
  expect((await send({...make(),padding:'x'.repeat(262145)})).status).toBe(413);
  expect((await send(make(1,11001))).status).toBe(409);
  expect((await send(make())).status).toBe(200);expect(writes).toBe(1);
  Date.now=clock;
});
