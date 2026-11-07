// Run alone: authenticated synthetic city, no real DB/network.
// @ts-expect-error Bun test runtime
import {test,expect,mock} from 'bun:test';
import {syncFixture} from './sync-workload';
import {settle} from '../lib/engine';
let doc:any={_id:'mine',owner:'owner',ver:1,state:syncFixture(),name:'Fixture'},writes=0;
doc.state.copperDepositsVersion=1;doc.state.preciousDepositsVersion=1;
mock.module('next/headers',()=>({cookies:async()=>({get:()=>({value:'cookie'})})}));
mock.module('../lib/auth',()=>({SESSION_COOKIE:'sid',readSession:()=> 'owner',currentUser:async()=>({_id:'owner',cityId:'mine'})}));
mock.module('../lib/db',()=>({cities:async()=>({findOne:async()=>structuredClone(doc),updateOne:async(_q:any,u:any)=>{writes++;Object.assign(doc,structuredClone(u.$set??{}));doc.ver+=u.$inc?.ver??0;return {modifiedCount:1};}})}));
mock.module('../lib/world',()=>({resolveDiscoveries:async()=>{}}));
mock.module('../lib/diplomacy',()=>({registerEnvoyVisits:async()=>{}}));
const {withCity}=await import('../lib/city-store');
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
test('bootstrap still persists one checkpoint and subsequent reads do not repeat it',async()=>{
 const clock=Date.now;Date.now=()=>180000;
 try{delete doc.state.copperDepositsVersion;
 await withCity('mine',()=>null,{readOnlyFallback:true});expect(writes).toBe(1);
 await withCity('mine',()=>null,{readOnlyFallback:true});expect(writes).toBe(1);
 }finally{Date.now=clock;}
});
