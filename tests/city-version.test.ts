// Isolated mocks; no live database or OAuth calls.
// @ts-expect-error Bun runtime API
import {mock,test,expect} from 'bun:test';
import {newCity} from '../lib/engine';
const doc={_id:'guest',name:'Saved city',ver:4,state:newCity(Date.now(),123)};
let writes=0,settlements=0;
mock.module('next/headers',()=>({cookies:async()=>({get:()=>undefined})}));
mock.module('../lib/auth',()=>({SESSION_COOKIE:'session',readSession:()=>null,currentUser:async()=>null}));
mock.module('../lib/world',()=>({resolveDiscoveries:async()=>{settlements++;}}));
mock.module('../lib/diplomacy',()=>({registerEnvoyVisits:async()=>{}}));
mock.module('../lib/db',()=>({cities:async()=>({findOne:async()=>structuredClone(doc),updateOne:async()=>{writes++;return{modifiedCount:1};}}),users:async()=>({})}));
const {withCity}=await import('../lib/city-store');
test('older and newer saves are rejected before simulation or writes instead of replacing the village',async()=>{
 for(const version of [2,4]){doc.state.ver=version;const before=structuredClone(doc);await expect(withCity('guest',()=>{throw new Error('must not mutate');})).rejects.toThrow('giữ nguyên');expect(doc).toEqual(before);}
 expect(writes).toBe(0);expect(settlements).toBe(0);
});
