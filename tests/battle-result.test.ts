// @ts-expect-error Bun runtime API
import {test,expect,mock} from 'bun:test';
import {newCity} from '../lib/engine';
const city=newCity(Date.now(),1);city.battleId='battle';city.army={club:3};
const docs:any[]=[{_id:'a',state:newCity(Date.now(),2),ver:0},{_id:'d',state:city,ver:0}];
const war:any={_id:'battle',attackerId:'a',defenderId:'d',attackerName:'Làng A',defenderName:'Làng B',troops:{club:4},duration:1000,status:'fighting',snapshot:{}};
const col={findOne:async(q:any)=>docs.find(d=>d._id===q._id),updateOne:async(q:any,u:any)=>{const d=docs.find(d=>d._id===q._id);Object.assign(d,u.$set);d.ver++;}};
const wars={findOne:async()=>war,updateOne:async(_q:any,u:any)=>{Object.assign(war,u.$set);}};
mock.module('../lib/db',()=>({users:async()=>({}),cities:async()=>col,battles:async()=>wars,mongoClient:async()=>({startSession:()=>({withTransaction:async(fn:any)=>fn(),endSession:async()=>{}})})}));
const originalFetch=globalThis.fetch;
const {finishBattle}=await import('../lib/war');
test('battle result persists reports for both players once, even when callback retries',async()=>{
 const originalUrl=process.env.BATTLE_WORKER_URL,originalSecret=process.env.BATTLE_SERVER_SECRET;
 globalThis.fetch=(async()=>Response.json({ok:true})) as typeof fetch;
 process.env.BATTLE_WORKER_URL='https://battle.invalid';process.env.BATTLE_SERVER_SECRET='test-only-secret-'.repeat(3);
 try{
  const result:any={winner:'defender',attackerSurvivors:{club:0},defenderSurvivors:{club:2},attackerCasualties:4,defenderCasualties:1,populationLoss:0,burnedTiles:[],loot:{food:0,wood:0,stone:0,copper:0},devastation:0};
  await finishBattle('battle',result);
  expect(docs[0].state.log[0].msg).toContain('Tấn công Làng B: THẤT BẠI');
  expect(docs[1].state.log[0].msg).toContain('Làng vừa bị Làng A tấn công: PHÒNG THỦ THÀNH CÔNG');
  const sizes=docs.map(d=>d.state.log.length);await finishBattle('battle',result);
  expect(docs.map(d=>d.state.log.length)).toEqual(sizes);
 }finally{globalThis.fetch=originalFetch;if(originalUrl===undefined)delete process.env.BATTLE_WORKER_URL;else process.env.BATTLE_WORKER_URL=originalUrl;if(originalSecret===undefined)delete process.env.BATTLE_SERVER_SECRET;else process.env.BATTLE_SERVER_SECRET=originalSecret;}
});
