import assert from 'node:assert/strict';
import test from 'node:test';
import { isActionInput } from './action-input';
import { applyAction, BKEYS, newCity, UKEYS, type Action } from './engine';
test('all supported action variants accept their valid JSON forms',()=>{
 const values:unknown[]=[...BKEYS.map(k=>({type:'build',k,x:0,y:95})),...UKEYS.map(u=>({type:'train',u,n:1})),...['upgrade','repair','demolish'].map(type=>({type,x:95,y:0})),{type:'advance'},{type:'alarm'},{type:'recall',exp:1},{type:'attack',camp:1,units:{club:3,elephant:0}},{type:'assign',ids:[1,2],task:{t:'idle'}},{type:'assignN',n:50,task:{t:'chop',at:9215}},{type:'setGuardPosts',posts:[{x:0,y:0},{x:95,y:95}]},{type:'auto',on:true,mix:{food:40,wood:30,stone:20,copper:10}}];
 for(const value of values)assert.equal(isActionInput(value),true,JSON.stringify(value));
 for(const task of [{t:'move',to:0},{t:'explore',to:9215},{t:'hunt',herd:1},{t:'mine',at:0},{t:'work',at:9215}])assert.equal(isActionInput({type:'assign',ids:[1],task,pos:{1:3}}),true);
});
test('forged resource and troop counts reject strings, NaN, infinities and invalid bounds',()=>{
 for(const n of ['foo','1',NaN,Infinity,-Infinity,undefined,null,0,-1,51,1.5])assert.equal(isActionInput({type:'train',u:'club',n}),false,String(n));
 for(const n of [NaN,Infinity,-1,301,1.5,'1'])assert.equal(isActionInput({type:'attack',camp:1,units:{club:n}}),false);
 assert.equal(isActionInput({type:'attack',camp:1,units:{club:300,bow:1}}),false);
 assert.equal(isActionInput({type:'assignN',n:'5',task:{t:'idle'}}),false);
});
test('prototype names and coordinate aliasing cannot address engine definitions or tiles',()=>{
 for(const k of ['__proto__','constructor','toString','tower'])assert.equal(isActionInput({type:'build',k,x:0,y:0}),false);
 for(const u of ['__proto__','constructor','toString'])assert.equal(isActionInput({type:'train',u,n:1}),false);
 assert.equal(isActionInput({type:'attack',camp:1,units:JSON.parse('{"__proto__":1}')}),false);
 for(const [x,y] of [[96,-1],[-1,1],[96,0],[0,96],[1.2,0],[NaN,0]])assert.equal(isActionInput({type:'demolish',x,y}),false);
 assert.equal(isActionInput(Object.create({type:'build',k:'hut',x:0,y:0})),false);
});
test('malformed tasks, IDs, mixes and guard posts reject at the JSON boundary',()=>{
 for(const value of [null,[],5,'build',{}, {type:'unknown'}, {type:'assign',ids:'1',task:{t:'idle'}},{type:'assign',ids:[1,1],task:{t:'idle'}},{type:'assign',ids:[1],task:{t:'move',to:9216}},{type:'assign',ids:[1],task:{t:'hunt',herd:-1}},{type:'assign',ids:[1],task:null},{type:'assign',ids:[1],task:{t:'idle'},pos:{1:NaN}},{type:'setGuardPosts',posts:new Array(21).fill({x:0,y:0})},{type:'setGuardPosts',posts:[{x:96,y:0}]},{type:'auto',on:'true',mix:{food:25,wood:25,stone:25,copper:25}},{type:'auto',on:true,mix:{food:NaN,wood:25,stone:25,copper:25}},{type:'auto',on:true,mix:{food:25,wood:25,stone:25}},{type:'recall',exp:0}])assert.equal(isActionInput(value),false,JSON.stringify(value));
});
test('engine rejects malformed actions before settlement or any state mutation',()=>{
 const c=newCity(0,123),before=structuredClone(c);
 for(const value of [{type:'train',u:'club',n:'foo'},{type:'build',k:'__proto__',x:0,y:0},{type:'demolish',x:96,y:-1},null,{type:'attack',camp:1,units:{club:NaN}}]){assert.equal(applyAction(c,value as Action,3600000),'Yêu cầu không hợp lệ.');assert.deepEqual(c,before);}
});
