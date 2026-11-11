import test from 'node:test';
import assert from 'node:assert/strict';
import {newCity,G,F,HL,idx,applyAction,settle,MIN,workforceCounts,isScout,availableForWork,availableForQuickAssign,quickAssignBlockedReason,type City,type Res} from './engine';
const zero:Res={food:0,wood:0,stone:0,copper:0,gold:0,diamond:0,coal:0,aetherCrystal:0,rune:0,essence:0,celestialStone:0};
const mix={...zero,wood:100};
function fixture():City {
 const c=newCity(0,123);c.t.fill(G);c.seen.fill(1);c.camp=idx(20,20);c.herds=[];c.camps=[];
 c.b={[idx(19,20)]:{k:'hall',lvl:3,doneAt:null},[idx(22,20)]:{k:'gather',lvl:1,doneAt:null}};
 c.t[idx(20,22)]=F;c.t[idx(22,22)]=HL;c.res.food=1000;
 for(const p of c.people){p.pos=c.camp;p.task={t:'idle'};delete p.haul;}
 return c;
}
test('explicit movement and rest cannot be stolen by auto assignment or new building completion',()=>{
 const c=fixture(),p=c.people[0];c.auto={on:true,mix};
 assert.equal(applyAction(c,{type:'assign',ids:[p.id],task:{t:'move',to:idx(24,20)}},0),null);
 c.b[idx(23,21)]={k:'gather',lvl:0,doneAt:1000};settle(c,10_000);
 assert.deepEqual(p.task,{t:'idle',at:idx(24,20)});assert.equal(p.pos,idx(24,20));
 assert.equal(applyAction(c,{type:'assign',ids:[p.id],task:{t:'idle'}},10_000),null);
 settle(c,11_000);assert.equal(p.task.t,'idle');assert.equal(p.assignment,'manual');
});
test('completed scouts keep their group through automation and can receive another exploration order',()=>{
 const c=fixture(),p=c.people[0];c.auto={on:true,mix};
 assert.equal(applyAction(c,{type:'assign',ids:[p.id],task:{t:'explore',to:idx(24,20)}},0),null);
 settle(c,20_000);assert.equal(isScout(p),true);assert.equal(p.task.t,'idle');assert.equal(p.pos,idx(24,20));assert.equal(availableForWork(p),false);
 assert.equal(applyAction(c,{type:'assign',ids:[p.id],task:{t:'explore',to:idx(26,20)}},20_000),null);
 settle(c,30_000);assert.equal(p.pos,idx(26,20));assert.equal(isScout(p),true);
 assert.equal(applyAction(c,{type:'assign',ids:[p.id],task:{t:'idle'}},30_000),null);assert.equal(isScout(p),false);assert.equal(availableForWork(p),true);
});
test('legacy parked orders and explorers stay protected without a save reset',()=>{
 const c=fixture(),[parked,scout]=c.people;c.auto={on:true,mix};
 parked.task={t:'idle',at:idx(23,20)};scout.task={t:'explore',from:c.camp,to:idx(24,20),start:0};
 settle(c,20_000);assert.equal(parked.task.t,'idle');assert.equal(parked.pos,idx(23,20));assert.equal(isScout(scout),true);assert.equal(scout.task.t,'idle');
});
test('manual targets set exact headcounts, turn off auto, and keep new villagers idle',()=>{
 const c=fixture();c.auto={on:true,mix};
 const counts={...zero,food:2,wood:1,stone:1};
 assert.equal(applyAction(c,{type:'setWorkforce',counts,scouts:1},0),null);
 assert.deepEqual(workforceCounts(c),{counts,scouts:1});assert.equal(c.auto?.on,false);assert.equal(c.manualWorkforce,true);
 c.popAcc=.9999;c.b[idx(23,21)]={k:'gather',lvl:0,doneAt:1000};settle(c,1000);
 assert.deepEqual(workforceCounts(c),{counts,scouts:1});assert.equal(c.people.length,6);assert.equal(c.people.at(-1)?.task.t,'idle');
});
test('reducing one resource group frees exactly those workers without borrowing scouts',()=>{
 const c=fixture();assert.equal(applyAction(c,{type:'setWorkforce',counts:{...zero,food:2,wood:2},scouts:1},0),null);
 const scout=c.people.find(isScout)!.id;
 const counts={...zero,wood:3,stone:1};assert.equal(applyAction(c,{type:'setWorkforce',counts,scouts:1},0),null);
 assert.deepEqual(workforceCounts(c),{counts,scouts:1});assert.equal(c.people.find(isScout)!.id,scout);
});
test('failed targets never partially move workers, turn off auto, or discard cargo',()=>{
 for(const counts of [{...zero,wood:5,food:1},{...zero,gold:1},{...zero,food:3}]){
  const c=fixture();c.auto={on:true,mix};const before=structuredClone(c);
  assert.ok(applyAction(c,{type:'setWorkforce',counts,scouts:0},0));assert.deepEqual(c,before);
 }
 const c=fixture(),p=c.people[0];p.assignment='manual';p.task={t:'idle',at:idx(24,20)};
 const before=structuredClone(c);assert.ok(applyAction(c,{type:'setWorkforce',counts:{...zero,wood:5},scouts:0},0));assert.deepEqual(c,before);
});
test('unreachable jobs and protected refugees fail atomically',()=>{
 const c=fixture();for(let y=21;y<=23;y++)for(let x=19;x<=21;x++)if(x!==20||y!==22)c.b[idx(x,y)]={k:'wall',lvl:1,doneAt:null};
 const before=structuredClone(c);assert.ok(applyAction(c,{type:'setWorkforce',counts:{...zero,wood:1},scouts:0},0));assert.deepEqual(c,before);
 const a=fixture(),p=a.people[0];p.assignment='scout';p.refuge={route:[a.camp],at:0,arrive:0,pausedAt:0,x:20.5,y:20.5};
 const frozen=structuredClone(a);assert.ok(applyAction(a,{type:'setWorkforce',counts:zero,scouts:0},0));assert.deepEqual(a,frozen);
});
test('reassigning exact counts preserves and deposits existing food cargo only once',()=>{
 const c=fixture(),p=c.people[0];p.task={t:'work',at:idx(22,20)};
 p.haul={phase:'unload',at:0,nextAt:1000,tile:idx(19,20),route:[idx(19,20)],routeStart:0,resource:'food',carried:20,capacity:20,taskKey:JSON.stringify(p.task),drop:idx(19,20)};
 assert.equal(applyAction(c,{type:'setWorkforce',counts:{...zero,wood:1},scouts:0},0),null);
 assert.equal(c.people.reduce((n,p)=>n+(p.haul?.resource==='food'?p.haul.carried:0),0),20);
 settle(c,2000);assert.ok(Math.abs(c.res.food-(1020-5*120*2/3600))<1e-7);
 assert.equal(c.people.reduce((n,p)=>n+(p.haul?.resource==='food'?p.haul.carried:0),0),0);
});
test('quick assignment supports more than fifty and never takes the reserved scout group',()=>{
 const c=fixture();c.people=Array.from({length:80},(_,i)=>({id:i+1,name:`Dân ${i+1}`,task:{t:'idle'},pos:c.camp}));c.pop=80;c.nextId=81;
 c.people[0].assignment='scout';assert.equal(applyAction(c,{type:'assignN',n:60,task:{t:'chop',at:idx(20,22)}},0),null);
 assert.equal(c.people.filter(p=>p.task.t==='chop').length,60);assert.equal(isScout(c.people[0]),true);
});
test('manual headcounts and scout arrival settle identically online and offline',()=>{
 const a=fixture();assert.equal(applyAction(a,{type:'setWorkforce',counts:{...zero,food:2,wood:1},scouts:1},0),null);
 const scout=a.people.find(isScout)!;applyAction(a,{type:'assign',ids:[scout.id],task:{t:'explore',to:idx(25,20)}},0);
 const b=structuredClone(a);settle(a,MIN);for(let t=137;t<MIN;t+=1731)settle(b,t);settle(b,MIN);assert.deepEqual(a,b);
});
test('invalid headcounts are rejected before settlement',()=>{
 for(const patch of [{counts:{...zero,food:-1},scouts:0},{counts:{...zero,food:1.5},scouts:0},{counts:{food:1},scouts:0},{counts:zero,scouts:NaN},{counts:{...zero,foo:0},scouts:0}]){
  const c=fixture(),before=structuredClone(c);assert.ok(applyAction(c,{type:'setWorkforce',...patch} as never,MIN));assert.deepEqual(c,before);
 }
});

test('quick resource assignment can reuse parked idle civilians without automation taking their order',()=>{
 const c=fixture();c.auto={on:true,mix};
 const [parked,...others]=c.people;
 for(const p of others){p.assignment='scout';p.task={t:'idle'};}
 assert.equal(applyAction(c,{type:'assign',ids:[parked.id],task:{t:'move',to:idx(23,20)}},0),null);
 settle(c,10_000);assert.equal(availableForWork(parked),false);assert.equal(parked.pos,idx(23,20));
 assert.equal(applyAction(c,{type:'assignN',n:1,task:{t:'chop',at:idx(20,22)}},10_000),null);
 assert.equal(parked.task.t,'chop');assert.ok(parked.haul);assert.equal(parked.haul!.resource,'wood');
 assert.ok(others.every(p=>isScout(p)&&p.task.t==='idle'));
 const wood=c.res.wood;settle(c,50_000);assert.ok(c.res.wood>wood);
});
test('quick assignment may replace an unfinished move but never silently grabs scouts or sheltered people',()=>{
 const c=fixture(),[walker,...others]=c.people;
 for(const p of others){p.assignment='scout';p.task={t:'idle'};}
 applyAction(c,{type:'assign',ids:[walker.id],task:{t:'move',to:idx(30,20)}},0);
 assert.equal(applyAction(c,{type:'assignN',n:1,task:{t:'chop',at:idx(20,22)}},1000),null);
 assert.equal(walker.task.t,'chop');
 assert.match(applyAction(c,{type:'assignN',n:1,task:{t:'chop',at:idx(20,22)}},1000)!,/nhóm khám phá/);
 assert.ok(others.every(p=>isScout(p)));
});

test('quick availability rejects refugees and scouts and explains empty or reserved groups',()=>{
 const c=fixture(),p=c.people[0];p.task={t:'idle',at:c.camp};
 assert.equal(availableForQuickAssign(p),true);
 p.assignment='scout';assert.equal(availableForQuickAssign(p),false);assert.match(quickAssignBlockedReason(c),/nhóm khám phá/);
 p.assignment='manual';p.refuge={route:[c.camp],at:0,arrive:0,pausedAt:0,x:20.5,y:20.5};
 assert.equal(availableForQuickAssign(p),false);assert.match(quickAssignBlockedReason(c),/tránh địch/);
 c.people=[];assert.match(quickAssignBlockedReason(c),/chưa có dân/);
});
