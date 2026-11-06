// @ts-expect-error Bun runtime API
import {mock,test,expect} from 'bun:test';
import {newCity,G,R,idx,shipsFree} from '../lib/engine';
let docs:any[]=[],wars:any[]=[],failSchedule=false;
const matches=(d:any,q:any)=>Object.entries(q).every(([k,v])=>d[k]===v);
const update=(d:any,u:any)=>{Object.assign(d,u.$set??{});for(const k of Object.keys(u.$unset??{}))delete d[k];for(const[k,v]of Object.entries(u.$inc??{}))d[k]=(d[k]??0)+(v as number);};
const cities={findOne:async(q:any)=>docs.find(d=>matches(d,q))??null,updateOne:async(q:any,u:any)=>{const d=docs.find(d=>matches(d,q));if(d)update(d,u);}};
const battles={findOne:async(q:any)=>wars.find(d=>matches(d,q))??null,insertOne:async(d:any)=>wars.push(d),updateOne:async(q:any,u:any)=>{const d=wars.find(d=>matches(d,q));if(d)update(d,u);}};
mock.module('../lib/db',()=>({users:async()=>({}),cities:async()=>cities,battles:async()=>battles,mongoClient:async()=>({startSession:()=>({withTransaction:async(fn:any)=>{const before=structuredClone({docs,wars});try{return await fn();}catch(e){docs=before.docs;wars=before.wars;throw e;}},endSession:async()=>{}})})}));
const {launchAttack,returnArmy}=await import('../lib/war');
function reset(){const now=Date.now();wars=[];failSchedule=false;docs=['a','d'].map((id,i)=>{const c=newCity(now,i+1);c.t.fill(G);c.seen.fill(1);c.people=[];c.herds=[];c.camps=[];c.era=2;c.army={club:4};c.b={[idx(14,12)]:{k:'dock',lvl:1,doneAt:null}};c.t[idx(15,12)]=R;c.transportShips=1;c.res.food=500;c.discoveries=['d'];c.visits={d:now+1000000};delete c.shieldUntil;return{_id:id,owner:id,world:{x:10+i,y:10},name:id,state:c,ver:0};});}
test('world march reserves ships, rejects double use and releases them exactly once on return or cancellation',async()=>{
 const originalFetch=globalThis.fetch,url=process.env.BATTLE_WORKER_URL,secret=process.env.BATTLE_SERVER_SECRET;
 globalThis.fetch=(async(input:any)=>new Response('{}',{status:failSchedule&&String(input).includes('/schedule')?503:200})) as typeof fetch;
 process.env.BATTLE_WORKER_URL='https://worker.invalid';process.env.BATTLE_SERVER_SECRET='naval-test-only-secret-'.repeat(3);
 try{
  reset();const w=await launchAttack('a','d',{club:4});expect(w.transportShips).toBe(1);expect(docs[0].state.deployedShips).toBe(1);expect(shipsFree(docs[0].state)).toBe(0);
  w.status='returning';w.back=Date.now()-1;w.result={attackerSurvivors:{club:3},loot:{}} as any;
  await returnArmy(w._id);expect(docs[0].state.deployedShips).toBe(0);expect(shipsFree(docs[0].state)).toBe(1);expect(docs[0].state.army.club).toBe(3);
  await returnArmy(w._id);expect(docs[0].state.army.club).toBe(3);expect(docs[0].state.transportShips).toBe(1);
  reset();failSchedule=true;await expect(launchAttack('a','d',{club:4})).rejects.toThrow();expect(docs[0].state.deployedShips).toBe(0);expect(shipsFree(docs[0].state)).toBe(1);expect(docs[0].state.army.club).toBe(4);
 }finally{globalThis.fetch=originalFetch;if(url===undefined)delete process.env.BATTLE_WORKER_URL;else process.env.BATTLE_WORKER_URL=url;if(secret===undefined)delete process.env.BATTLE_SERVER_SECRET;else process.env.BATTLE_SERVER_SECRET=secret;}
});
