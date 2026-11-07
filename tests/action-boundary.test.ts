// @ts-expect-error Bun runtime API
import {mock,test,expect} from 'bun:test';
import {newCity} from '../lib/engine';
import './skip-command-metrics';
let settlements=0;
mock.module('../lib/city-store',()=>({playerId:async()=> 'guest',withCity:async(_pid:string,mutate:any)=>{settlements++;const state=newCity(Date.now(),123);return{doc:{state},result:mutate(state,Date.now()),now:Date.now()};}}));
const {POST}=await import('../app/api/city/action/route');
test('invalid actions are rejected before costly settlement and valid inputs still reach the engine',async()=>{
 for(const body of ['{}','[]','null','{"type":"build","k":"unknown","x":0,"y":0}','{"type":"assign","ids":[1],"task":{"t":"move","to":99999}}']){
  expect((await POST(new Request('http://localhost/api/city/action',{method:'POST',body}))).status).toBe(400);
 }
 expect(settlements).toBe(0);
 expect((await POST(new Request('http://localhost/api/city/action',{method:'POST',body:'{"type":"assign","ids":[1],"task":{"t":"idle"}}'}))).status).toBe(200);
 expect(settlements).toBe(1);
});
