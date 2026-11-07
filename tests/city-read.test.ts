// Run alone: authenticated synthetic city, no real DB/network.
// @ts-expect-error Bun test runtime
import {test,expect,mock} from 'bun:test';
import {syncFixture} from './sync-workload';
import {settle} from '../lib/engine';
let doc:any={_id:'mine',owner:'owner',ver:1,state:syncFixture(),name:'Fixture'},writes=0;
let authenticated=true;
process.env.AUTH_SECRET='synthetic-city-read-secret-at-least-32-characters';
doc.state.copperDepositsVersion=1;doc.state.preciousDepositsVersion=1;
mock.module('next/headers',()=>({cookies:async()=>({get:()=>({value:'cookie'})})}));
mock.module('../lib/auth',()=>({SESSION_COOKIE:'sid',readSession:()=> 'owner',currentUser:async()=>authenticated?({_id:'owner',cityId:'mine',sessionVersion:1}):null}));
mock.module('../lib/db',()=>({cities:async()=>({findOne:async()=>structuredClone(doc),updateOne:async(_q:any,u:any)=>{writes++;Object.assign(doc,structuredClone(u.$set??{}));doc.ver+=u.$inc?.ver??0;return {modifiedCount:1};}})}));
mock.module('../lib/world',()=>({resolveDiscoveries:async()=>{}}));
mock.module('../lib/diplomacy',()=>({registerEnvoyVisits:async()=>{}}));
const {withCity}=await import('../lib/city-store');
const {POST:checkpoint}=await import('../app/api/city/checkpoint/route');
test('ordinary city/world reads project current resources without writing or changing stored state',async()=>{
 const original=structuredClone(doc),now=Date.now;let time=60000;Date.now=()=>time;
 try{
  for(const t of [60000,65000,120000]) {
   time=t;const out=await withCity('mine',()=>null,{readOnlyFallback:true});
   const expected=structuredClone(original.state);settle(expected,t);expect(out!.doc.state).toEqual(expected);
   out!.doc.state.res.food=999999;
  }
  expect(doc).toEqual(original);expect(writes).toBe(0);
  doc.ver++;doc.state.res.gold=47;expect((await withCity('mine',()=>null,{readOnlyFallback:true}))!.doc.state.res.gold).toBe(47);
 }finally{Date.now=now;}
});
test('explicit checkpoint authenticates ownership and returns a durable timestamp without changing the ACK ledger',async()=>{
 const clock=Date.now;Date.now=()=>300000;
 try{
  authenticated=false;expect((await checkpoint()).status).toBe(401);authenticated=true;
  const before=writes;doc.citySync={session:1,ack:7,lastAt:200000,results:[]};
  const res=await checkpoint(),data=await res.json();expect(res.status).toBe(200);
  expect(data.sync.ack).toBe(7);expect(data.sync.checkpointAt).toBe(300000);expect(writes).toBe(before+1);
 }finally{Date.now=clock;}
});
test('bootstrap still persists one checkpoint and subsequent reads do not repeat it',async()=>{
 const clock=Date.now;Date.now=()=>360000;const before=writes;
 try{delete doc.state.copperDepositsVersion;
 await withCity('mine',()=>null,{readOnlyFallback:true});expect(writes).toBe(before+1);
 await withCity('mine',()=>null,{readOnlyFallback:true});expect(writes).toBe(before+1);
 }finally{Date.now=clock;}
});
