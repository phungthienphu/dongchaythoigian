import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAction, newCity, settle, idx, F, G, type Action, type City } from './engine';
import { OptimisticCityQueue, type CityActionResponse } from './optimistic-city';
function deferred<T>() { let resolve!: (value:T)=>void; let reject!: (error:Error)=>void; const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;}); return {promise,resolve,reject}; }
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
const toggle=(on:boolean):Action=>({type:'auto',on,mix:{food:40,wood:30,stone:20,copper:10, gold: 0, diamond:0,coal:0,aetherCrystal:0,rune:0,essence:0,celestialStone:0}});
function city(){const c=newCity(0,1);c.b[c.camp]={k:'hall',lvl:3,doneAt:null};return c;}
function applied(c:City,a:Action){const copy=structuredClone(c);assert.equal(applyAction(copy,a,0),null);return copy;}
test('optimistic state publishes before delayed network and rejects stale background loads',async()=>{
 const gate=deferred<CityActionResponse>(),initial=city();let shown=initial;const q=new OptimisticCityQueue({state:initial,now:()=>0,onState:s=>{shown=s;},send:()=>gate.promise,onUncertain:async()=>initial});const v=q.version;const done=q.enqueue(toggle(true));assert.equal(shown.auto?.on,true);assert.equal(q.isPending,true);assert.equal(q.setAuthoritative(initial,v),false);gate.resolve({state:applied(initial,toggle(true))});assert.equal(await done,true);assert.equal(q.isPending,false);assert.equal(q.setAuthoritative(initial,v),false);
});
test('queued sends never overlap and later optimistic actions survive reconciliation',async()=>{
 const a=deferred<CityActionResponse>(),b=deferred<CityActionResponse>(),initial=city();const calls:{action:Action;id:string}[]=[];let shown=initial;const q=new OptimisticCityQueue({state:initial,now:()=>0,onState:s=>{shown=s;},send:(action,id)=>{calls.push({action,id});return calls.length===1?a.promise:b.promise;},onUncertain:async()=>initial});const p1=q.enqueue(toggle(true)),p2=q.enqueue(toggle(false));assert.equal(calls.length,1);assert.equal(shown.auto?.on,false);const first=applied(initial,toggle(true));a.resolve({state:first});await p1;assert.equal(calls.length,2);assert.equal(shown.auto?.on,false);assert.notEqual(calls[0].id,calls[1].id);b.resolve({state:applied(first,toggle(false))});assert.equal(await p2,true);
});
test('rejected first mutation rolls back then replays a valid later action',async()=>{
 const a=deferred<CityActionResponse>(),initial=city();let shown=initial,calls=0;const errors:string[]=[];const q=new OptimisticCityQueue({state:initial,now:()=>0,onState:s=>{shown=s;},onError:e=>errors.push(e),send:async action=>++calls===1?a.promise:{state:applied(initial,action)},onUncertain:async()=>initial});const p1=q.enqueue(toggle(true)),p2=q.enqueue(toggle(false));a.resolve({state:initial,error:'Rejected'});assert.equal(await p1,false);assert.equal(await p2,true);assert.equal(shown.auto?.on,false);assert.deepEqual(errors,['Rejected']);assert.equal(calls,2);
});
test('ambiguous network failure clears queue and reloads without replaying mutations',async()=>{
 const a=deferred<CityActionResponse>(),initial=city(),fresh=applied(initial,toggle(true));let calls=0,reloads=0;const q=new OptimisticCityQueue({state:initial,now:()=>0,onState:()=>{},send:()=>{calls++;return a.promise;},onUncertain:async()=>{reloads++;return fresh;}});const p1=q.enqueue(toggle(true)),p2=q.enqueue(toggle(false));a.reject(new Error('connection lost'));assert.equal(await p1,false);assert.equal(await p2,false);await flush();assert.equal(calls,1);assert.equal(reloads,1);assert.equal(q.snapshot.auto?.on,true);assert.equal(q.isPending,false);
});
test('reload failure prevents new mutations until a fresh authoritative load',async()=>{
 const initial=city();let calls=0;const q=new OptimisticCityQueue({state:initial,now:()=>0,onState:()=>{},send:async()=>{calls++;throw new Error('lost');},onUncertain:async()=>{throw new Error('offline');}});assert.equal(await q.enqueue(toggle(true)),false);await flush();assert.equal(await q.enqueue(toggle(false)),false);assert.equal(calls,1);assert.equal(q.setAuthoritative(initial,q.version),true);
});

test('live deposits survive the next action and a delayed server snapshot',async()=>{
 const initial=city();initial.t.fill(G);initial.seen.fill(1);initial.herds=[];initial.camps=[];
 const source=idx(initial.camp%96+2,Math.floor(initial.camp/96));initial.t[source]=F;
 initial.res.wood=0;
 assert.equal(applyAction(initial,{type:'assign',ids:[initial.people[0].id],task:{t:'chop',at:source}},0),null);
 const gate=deferred<CityActionResponse>();let clock=0,shown=initial;
 const q=new OptimisticCityQueue({state:initial,now:()=>clock,onState:s=>{shown=s;},send:()=>gate.promise,onUncertain:async()=>initial});
 clock=1_230_000;q.advance();const wood=shown.res.wood;assert.ok(wood>=10);
 const pending=q.enqueue(toggle(false));assert.equal(shown.res.wood,wood);
 gate.resolve({state:applied(initial,toggle(false))});await pending;
 assert.equal(shown.res.wood,wood);
 const old=structuredClone(initial);settle(old,1000);
 assert.equal(q.setAuthoritative(old),true);assert.equal(shown.res.wood,wood);
});

test('revoking a session discards queued commands and ignores an in-flight response',async()=>{
 const gate=deferred<CityActionResponse>(); const initial=city(); let publishes=0, sends=0;
 const q=new OptimisticCityQueue({state:initial,now:()=>0,onState:()=>{publishes++;},send:async()=>{sends++;return gate.promise;},onUncertain:async()=>initial});
 const first=q.enqueue(toggle(false)); const second=q.enqueue(toggle(true));
 q.stop(); const before=publishes;
 assert.equal(await first,false);assert.equal(await second,false);
 gate.resolve({state:applied(initial,toggle(false))});await flush();
 assert.equal(sends,1);assert.equal(publishes,before);
 assert.equal(await q.enqueue(toggle(false)),false);
 assert.equal(q.setAuthoritative(initial),false);q.advance(1000);assert.equal(publishes,before);
});
