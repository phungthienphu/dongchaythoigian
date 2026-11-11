import test from 'node:test';
import assert from 'node:assert/strict';
import {newCity,G,idx,stats,derive,RES,applyAction,settle,storageLevel,buildMs} from './engine';
import {isMagicResource} from './magic-data';
function fixture(lvl=1){const c=newCity(0,123);c.t.fill(G);c.seen.fill(1);c.people=[];c.b={};c.b[idx(10,10)]={k:'storehouse',lvl,doneAt:null};c.b[idx(15,15)]={k:'hall',lvl:5,doneAt:null};for(const r of RES)c.res[r]=1000;return c;}
const caps=(c:ReturnType<typeof newCity>)=>stats(c,derive(c),c.last).storage;
test('legacy capacities remain intact and only upgraded compartment increases',()=>{
 const c=fixture(2),before=caps(c);
 assert.equal(before.wood,500+2000+2500);
 assert.equal(applyAction(c,{type:'upgradeStorage',x:10,y:10,resource:'wood'},0),null);
 assert.deepEqual(caps(c),before);
 assert.match(applyAction(c,{type:'upgradeStorage',x:10,y:10,resource:'stone'},0)!,/đang/);
 const offline=structuredClone(c),end=buildMs('storehouse',3);
 settle(c,end);for(let t=1000;t<=end;t+=1000)settle(offline,t);
 assert.deepEqual(c,offline);
 for(const r of RES)assert.equal(caps(c)[r],before[r]+(r==='wood'?1000:0));
 assert.equal(storageLevel(c.b[idx(10,10)],'stone'),2);
});
test('diamond completion and a second compartment upgrade do not leak levels',()=>{
 const c=fixture(),before=caps(c);
 for(const resource of ['wood','stone'] as const){
 assert.equal(applyAction(c,{type:'upgradeStorage',x:10,y:10,resource},0),null);
 assert.equal(applyAction(c,{type:'speedBuild',x:10,y:10},0),null);
 }
 for(const r of RES)assert.equal(caps(c)[r],before[r]+(['wood','stone'].includes(r)?1000:0));
 assert.match(applyAction(c,{type:'upgrade',x:10,y:10},0)!,/ngăn/);
});
test('legacy construction completes and independent limits clamp the right stock',()=>{
 const c=fixture(2),b=c.b[idx(10,10)];b.doneAt=1000;
 // Magic compartments open separately at level 1 (era 7 spec 2.1).
 settle(c,1000);for(const r of RES)assert.equal(storageLevel(b,r),isMagicResource(r)?1:3);
 b.storageLevels={wood:4};c.res.wood=7000;c.res.stone=7000;
 settle(c,2000);assert.equal(c.res.wood,7000);assert.equal(c.res.stone,6000);
});
test('invalid compartments and missing hall cannot mutate a save',()=>{
 const c=fixture();const before=structuredClone(c);
 assert.ok(applyAction(c,{type:'upgradeStorage',x:10,y:10,resource:'bad'} as never,0));assert.deepEqual(c,before);
 delete c.b[idx(15,15)];assert.match(applyAction(c,{type:'upgradeStorage',x:10,y:10,resource:'gold'},0)!,/Đình/);
});
test('full wood compartment does not prevent stone delivery',()=>{
 const c=fixture();c.people=newCity(0,123).people.slice(0,2);c.herds=[];c.camps=[];
 c.b={[idx(10,10)]:{k:'storehouse',lvl:1,doneAt:null,storageLevels:{stone:2}}};
 const limits=caps(c);c.res.wood=limits.wood;c.res.stone=limits.stone-10;
 for(const [i,r] of (['wood','stone'] as const).entries()){
 const p=c.people[i];p.pos=idx(10,10);p.task={t:'idle'};p.haul={phase:'unload',taskKey:'idle',at:0,nextAt:1000,tile:p.pos,route:[p.pos],routeStart:0,resource:r,carried:10,capacity:10,drop:p.pos};
 }
 settle(c,1000);assert.equal(c.res.wood,limits.wood);assert.ok(Math.abs(c.people[0].haul!.carried-(10-2/3600))<1e-8);assert.equal(c.res.stone,limits.stone);assert.equal(c.people[1].haul,undefined);
});
test('era food goal cannot be reached by extra gathering camps until storage is expanded',()=>{
 const c=newCity(0,123);c.era=2;c.t.fill(G);c.seen.fill(1);c.camp=idx(20,20);c.herds=[];c.camps=[];
 c.b={[idx(19,20)]:{k:'hall',lvl:3,doneAt:null},[idx(22,20)]:{k:'gather',lvl:1,doneAt:null}};
 c.people=c.people.slice(0,2);for(const p of c.people){p.task={t:'work',at:idx(22,20)};p.pos=idx(22,20);}
 c.res.food=1900;settle(c,2*60_000);assert.equal(caps(c).food,2000);assert.ok(c.res.food>1950&&c.res.food<=2000);
 c.b[idx(23,20)]={k:'gather',lvl:1,doneAt:null};assert.equal(caps(c).food,2000);
 c.b[idx(21,20)]={k:'storehouse',lvl:1,doneAt:null};assert.equal(caps(c).food,3000);
 settle(c,5*60_000);assert.ok(c.res.food>2000&&c.res.food<=3000,'production can exceed the old food compartment after storage expansion');
});
