import test from 'node:test';
import assert from 'node:assert/strict';
import {applyAction,buildingCost,buildMs,DEMOLITION_FULL_RATE_MS,demolitionQuote,G,HOUR,idx,levelCost,newCity,R,RES,settle,type Building} from './engine';
const now=1_800_000_000_000, tile=idx(10,10);
function fixture(){
 const c=newCity(now,123);c.t.fill(G);c.seen.fill(1);c.b={};c.people=[];c.pop=0;c.camps=[];c.herds=[];
 c.wildernessAt=now+1e10;c.disaster={kind:'earthquake',at:now+1e10,center:c.camp,level:0};
 for(const r of RES)c.res[r]=200;
 return c;
}
function place(b:Partial<Building>={}){const c=fixture();c.b[tile]={k:'hut',lvl:1,doneAt:null,builtAt:now,investment:{wood:20},...b};return c;}
test('refund switches from 50 to 20 percent exactly six real hours after completion',()=>{
 const c=place();assert.equal(DEMOLITION_FULL_RATE_MS,6*HOUR);
 assert.deepEqual(demolitionQuote(c,tile,now+6*HOUR-1).refund,{wood:10});
 assert.deepEqual(demolitionQuote(c,tile,now+6*HOUR).refund,{wood:4});
 assert.deepEqual(demolitionQuote(c,tile,now+48*HOUR).refund,{wood:4});
});
test('construction records actual era price and starts age on completion, including offline',()=>{
 const c=fixture();c.era=3;
 assert.equal(applyAction(c,{type:'build',k:'hut',x:10,y:10},now),null);
 assert.deepEqual(c.b[tile].investment,buildingCost('hut',3));assert.equal(c.b[tile].builtAt,undefined);
 assert.equal(demolitionQuote(c,tile,now).percent,50);
 settle(c,now+buildMs('hut',1)+7000);
 assert.equal(c.b[tile].builtAt,now+buildMs('hut',1));
 assert.equal(demolitionQuote(c,tile,now+buildMs('hut',1)+6*HOUR).percent,20);
});
test('era changes cannot inflate paid basis; duplicate demolition cannot pay twice',()=>{
 const c=fixture();assert.equal(applyAction(c,{type:'build',k:'hut',x:10,y:10},now),null);c.era=3;
 const before=c.res.wood;
 assert.equal(applyAction(c,{type:'demolish',x:10,y:10},now),null);assert.equal(c.res.wood,before+10);
 assert.match(applyAction(c,{type:'demolish',x:10,y:10},now)!,/trống/);assert.equal(c.res.wood,before+10);
});
test('upgrades add their actual cost without resetting old building age',()=>{
 const c=place({builtAt:now-7*HOUR});c.era=3;c.b[0]={k:'hall',lvl:3,doneAt:null};
 assert.equal(applyAction(c,{type:'upgrade',x:10,y:10},now),null);
 assert.deepEqual(c.b[tile].investment,{wood:20+levelCost('hut',2,3).wood!});
 assert.equal(demolitionQuote(c,tile,now).percent,20); // pending upgrades are paid too
 settle(c,now+buildMs('hut',2));assert.equal(c.b[tile].builtAt,now-7*HOUR);
 assert.equal(demolitionQuote(c,tile,c.last).percent,20);
});
test('each warehouse compartment investment is counted, including an unfinished upgrade',()=>{
 const c=place({k:'storehouse',investment:{wood:40,stone:10}});c.era=2;c.b[0]={k:'hall',lvl:3,doneAt:null};
 for(const resource of ['wood','food'] as const){
  assert.equal(applyAction(c,{type:'upgradeStorage',x:10,y:10,resource},c.last),null);
  if(resource==='wood')settle(c,c.last+buildMs('storehouse',2));
 }
 assert.deepEqual(c.b[tile].investment,{wood:200,stone:50});
 assert.deepEqual(demolitionQuote(c,tile,c.last).gross,{wood:100,stone:25});assert.equal(c.b[tile].builtAt,now);
});
test('legacy buildings keep unknown age and conservative basis even after a new upgrade',()=>{
 const c=place({builtAt:undefined,investment:undefined});c.era=2;c.b[0]={k:'hall',lvl:3,doneAt:null};
 assert.equal(demolitionQuote(c,tile,now).age,null);assert.equal(demolitionQuote(c,tile,now).percent,20);
 assert.equal(applyAction(c,{type:'upgrade',x:10,y:10},now),null);
 settle(c,now+buildMs('hut',2));const q=demolitionQuote(c,tile,c.last);
 assert.equal(c.b[tile].builtAt,undefined);assert.equal(q.percent,20);assert.equal(q.estimated,true);assert.deepEqual(q.gross,{wood:12});
});
test('repairs and speed-up diamonds are not recoverable investment or age resets',()=>{
 const c=place({burned:true,builtAt:now-7*HOUR});c.res.diamond=100;
 assert.equal(applyAction(c,{type:'repair',x:10,y:10},now),null);
 c.b[0]={k:'hall',lvl:3,doneAt:null};assert.equal(applyAction(c,{type:'upgrade',x:10,y:10},now),null);
 const invested={...c.b[tile].investment};assert.equal(applyAction(c,{type:'speedBuild',x:10,y:10},now),null);
 assert.deepEqual(c.b[tile].investment,invested);assert.equal(c.b[tile].builtAt,now-7*HOUR);assert.equal(c.b[tile].investment?.diamond,undefined);
});
test('dock relocation retains age and paid building basis, excluding relocation fees',()=>{
 const c=place({k:'dock',builtAt:now-7*HOUR,investment:{wood:600,stone:400,copper:120,gold:40}});c.era=2;
 const to=idx(11,10);c.t[idx(12,10)]=R;c.res.wood=500;c.res.food=500;
 assert.equal(applyAction(c,{type:'relocateDock',x:10,y:10,to},now),null);
 settle(c,c.b[to].doneAt!);assert.equal(c.b[to].builtAt,now-7*HOUR);
 assert.deepEqual(c.b[to].investment,{wood:600,stone:400,copper:120,gold:40});assert.equal(demolitionQuote(c,to,c.last).percent,20);
});
test('demolishing storage is blocked before existing stock is lost; accepted refund uses remaining capacity',()=>{
 const c=place({k:'storehouse',investment:{wood:40,stone:10}});c.res.food=700;
 const before=structuredClone(c.res);assert.match(demolitionQuote(c,tile,now).error!,/thiếu chỗ/);
 assert.match(applyAction(c,{type:'demolish',x:10,y:10},now)!,/thiếu chỗ/);assert.ok(c.b[tile]);assert.deepEqual(c.res,before);
 c.res.food=200;c.res.wood=495;
 const quote=demolitionQuote(c,tile,now);assert.equal(quote.error,null);assert.deepEqual(quote.refund,{wood:5,stone:5});assert.deepEqual(quote.overflow,{wood:15});
 assert.equal(applyAction(c,{type:'demolish',x:10,y:10},now),null);assert.equal(c.res.wood,500);assert.equal(c.res.stone,205);
 settle(c,now+2000);assert.equal(c.res.wood,500);
});
test('demolition releases assigned workers and preserves their carried resource',()=>{
 const c=place({k:'gather',investment:{wood:15}});
 c.people=[{id:1,name:'Thử',task:{t:'work',at:tile},pos:tile,haul:{phase:'work',route:[tile],at:now,nextAt:now+10000,tile,routeStart:now,capacity:10,taskKey:`work:${tile}`,resource:'food',carried:3,source:{kind:'building',key:tile}}}];c.pop=1;
 assert.equal(applyAction(c,{type:'demolish',x:10,y:10},now),null);
 assert.equal(c.people[0].task.t,'idle');assert.equal(c.people[0].haul?.carried,3);assert.equal(c.people[0].haul?.phase,'unload');
});
test('queued ships retain demolition restriction',()=>{
 const c=place({k:'dock',shipQueue:[now+60000]});
 assert.match(applyAction(c,{type:'demolish',x:10,y:10},now)!,/đóng thuyền/);assert.ok(c.b[tile]);
});
