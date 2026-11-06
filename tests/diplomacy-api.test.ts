// Isolated mocked MongoDB: never reaches real accounts or sends live notifications.
// @ts-expect-error Bun test API
import { mock, test, expect } from 'bun:test';
import { newCity } from '../lib/engine';
import { knowsNation } from '../lib/world-discovery';
let pid:string|null='host', failCityWrite=false;
const time=Date.now();
const docs=[{_id:'host',state:newCity(time,1),ver:0},{_id:'visitor',state:newCity(time,2),ver:0}];
let rows:Record<string,any>[]=[];
delete process.env.BATTLE_WORKER_URL;
function matches(d:Record<string,any>,q:Record<string,any>):boolean {
 return Object.entries(q).every(([k,v])=>{
  if(k==='$or')return v.some((part:Record<string,any>)=>matches(d,part));
  const value=k.split('.').reduce((a,key)=>a?.[key],d);
  if(v&&typeof v==='object'&&!(v instanceof Date))return Object.entries(v).every(([op,x])=>op==='$gt'?value>(x as any):op==='$lte'?value<=(x as any):op==='$exists'?(value!==undefined)===x:op==='$in'?(x as any[]).includes(value):false);
  return value===v;
 });
}
const visits={
 find:(q:Record<string,any>)=>{let found=rows.filter(d=>matches(d,q));const cursor={sort:(order:Record<string,number>)=>{const [k,dir]=Object.entries(order)[0];found.sort((a,b)=>(a[k]-b[k])*dir);return cursor;},limit:(n:number)=>{found=found.slice(0,n);return cursor;},toArray:async()=>structuredClone(found)};return cursor;},
 findOne:async(q:Record<string,any>,options?:any)=>{let found=rows.filter(d=>matches(d,q));if(options?.sort)found.sort((a,b)=>a.arrive-b.arrive);return structuredClone(found[0]??null);},
 updateOne:async(q:Record<string,any>,update:any,opts?:any)=>{let d=rows.find(d=>matches(d,q));let inserted=0;if(!d&&opts?.upsert){d={_id:q._id,...structuredClone(update.$setOnInsert)};rows.push(d!);inserted=1;}if(d&&update.$set)Object.assign(d,update.$set);return {matchedCount:d?1:0,upsertedCount:inserted};},
};
const cityCol={findOne:async(q:Record<string,any>)=>structuredClone(docs.find(d=>matches(d,q))??null),updateOne:async(q:Record<string,any>,update:any)=>{
 if(failCityWrite)throw new Error('simulated write failure');const d=docs.find(d=>matches(d,q));if(!d)return {matchedCount:0};
 if(update.$addToSet){for(const [key,value]of Object.entries(update.$addToSet)){if(key==='state.discoveries')d.state.discoveries=[...new Set([...(d.state.discoveries??[]),value as string])];}}
 if(update.$inc?.ver)d.ver+=update.$inc.ver;return {matchedCount:1};
}};
const session={withTransaction:async(fn:()=>Promise<void>)=>{const oldRows=structuredClone(rows),oldDocs=structuredClone(docs);try{await fn();}catch(e){rows=oldRows;docs.splice(0,docs.length,...oldDocs);throw e;}},endSession:async()=>{}};
mock.module('../lib/db',()=>({envoyVisits:async()=>visits,cities:async()=>cityCol,mongoClient:async()=>({startSession:()=>session})}));
mock.module('../lib/city-store',()=>({playerId:async()=>pid}));
const route=await import('../app/api/diplomacy/route');
const {registerEnvoyVisits}=await import('../lib/diplomacy');
const send=(id:string,action:string)=>route.POST(new Request('http://localhost/api/diplomacy',{method:'POST',body:JSON.stringify({id,action})}));
const trip=(id:number,arrive=time-1000)=>({id,target:'host',targetName:'Nước B',depart:time-2000,arrive});
test('arrivals persist idempotently, inbox hides future identities and all world intelligence',async()=>{
 await registerEnvoyVisits('visitor','Nước A',[trip(1)]);await registerEnvoyVisits('visitor','Nước A',[trip(1),trip(2,time+60000)]);expect(rows.length).toBe(2);
 pid='host';let data=await(await route.GET()).json();expect(data.messages.length).toBe(1);expect(data.messages[0].name).toBe('Nước A');expect(data.nextArrival).toBe(time+60000);
 for(const key of ['from','to','depart','world','route','x','y'])expect(Object.keys(data.messages[0])).not.toContain(key);
 pid='visitor';data=await(await route.GET()).json();expect(data.messages).toEqual([]);
});
test('a stranger cannot request or answer; host cannot approve itself; decline preserves hidden origin',async()=>{
 const id=rows[0]._id;pid='stranger';expect((await send(id,'request')).status).toBe(409);expect((await send(id,'accept')).status).toBe(409);
 pid='host';expect((await send(id,'request')).status).toBe(200);expect((await send(id,'request')).status).toBe(200);expect((await send(id,'accept')).status).toBe(409);
 pid='visitor';expect((await(await route.GET()).json()).messages[0].side).toBe('visitor');expect((await send(id,'decline')).status).toBe(200);expect(knowsNation(docs[0].state,'visitor')).toBe(false);
 expect((await send(id,'accept')).status).toBe(409);
});
test('accept is atomic and idempotent, grants discovery only one way, never a scouting report',async()=>{
 await registerEnvoyVisits('visitor','Nước A',[trip(3)]);const id=rows.find(r=>r._id.endsWith(':3'))!._id;
 pid='host';expect((await send(id,'request')).status).toBe(200);
 pid='visitor';failCityWrite=true;expect((await send(id,'accept')).status).toBe(409);expect(rows.find(r=>r._id===id)!.decision).toBeUndefined();expect(knowsNation(docs[0].state,'visitor')).toBe(false);
 failCityWrite=false;expect((await send(id,'accept')).status).toBe(200);expect((await send(id,'accept')).status).toBe(200);
 expect(docs[0].ver).toBe(1);expect(knowsNation(docs[0].state,'visitor')).toBe(true);expect(docs[0].state.visits?.visitor).toBeUndefined();expect(knowsNation(docs[1].state,'host')).toBe(false);
 pid='host';expect((await(await route.GET()).json()).messages.find((m:any)=>m.id===id).decision).toBe('accepted');
});
test('future, expired and unauthenticated messages cannot be acted on',async()=>{
 pid='host';expect((await send(rows.find(r=>r._id.endsWith(':2'))!._id,'request')).status).toBe(409);
 rows.push({_id:'expired',from:'visitor',to:'host',fromName:'A',toName:'B',arrive:time-10000,expiresAt:new Date(time-1)});expect((await send('expired','request')).status).toBe(409);
 expect((await send('expired','forge')).status).toBe(400);pid=null;expect((await route.GET()).status).toBe(401);expect((await send('expired','request')).status).toBe(401);
});
