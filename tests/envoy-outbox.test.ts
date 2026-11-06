// Isolated save/outbox recovery check: no MongoDB or live notifications.
// @ts-expect-error Bun test API
import { mock, test, expect } from 'bun:test';
import { newCity, type City } from '../lib/engine';
const now=Date.now(),state=newCity(now-10000,1);
state.trips=[{id:1,target:'host',targetName:'Host',depart:now-20000,arrive:now-15000,back:now-5000}];
const doc:{_id:string;name:string;state:City;ver:number;envoyOutbox?:any[]}={_id:'visitor',name:'Visitor',state,ver:0};
let fail=true,delivered:any[]=[];
mock.module('next/headers',()=>({cookies:async()=>({get:()=>undefined})}));
mock.module('../lib/auth',()=>({SESSION_COOKIE:'session',readSession:()=>null,currentUser:async()=>null}));
mock.module('../lib/world',()=>({resolveDiscoveries:async()=>{}}));
mock.module('../lib/diplomacy',()=>({registerEnvoyVisits:async(_pid:string,_name:string,trips:any[])=>{if(fail)throw new Error('offline');delivered.push(...structuredClone(trips));}}));
mock.module('../lib/db',()=>({users:async()=>({}),cities:async()=>({
 findOne:async()=>structuredClone(doc),
 updateOne:async(query:any,update:any)=>{
  if(query.ver!==undefined&&query.ver!==doc.ver)return {modifiedCount:0};
  if(update.$set)Object.assign(doc,structuredClone(update.$set));if(update.$inc)doc.ver+=update.$inc.ver;
  if(update.$pull)doc.envoyOutbox=doc.envoyOutbox?.filter(entry=>!update.$pull.envoyOutbox.key.$in.includes(entry.key));
  return {modifiedCount:1};
 },
})}));
const {withCity}=await import('../lib/city-store');
test('committed city keeps arrival in durable outbox on delivery failure, even after the envoy has returned',async()=>{
 const first=await withCity('visitor',()=>null);expect(first).not.toBeNull();expect(doc.state.trips).toEqual([]);expect(doc.envoyOutbox?.length).toBe(1);expect(delivered.length).toBe(0);
 fail=false;await withCity('visitor',()=>null);expect(delivered.length).toBe(1);expect(delivered[0].target).toBe('host');expect(doc.envoyOutbox).toEqual([]);
 await withCity('visitor',()=>null);expect(delivered.length).toBe(1);
});
