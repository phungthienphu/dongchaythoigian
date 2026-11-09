import test from 'node:test';
import assert from 'node:assert/strict';
import {newCity,G,R,HL,H,idx,settle,applyAction,haulPosition,type City} from './engine';
function fixture():City{
 const c=newCity(0,123);c.t.fill(G);c.seen.fill(0);c.b={};c.camp=idx(20,20);c.herds=[];c.camps=[];c.era=2;c.manualWorkforce=true;c.people=c.people.slice(0,3);c.pop=3;c.res.food=500;
 c.disaster={kind:'earthquake',at:1e10,center:0,level:1};
 for(const p of c.people){p.pos=c.camp;p.task={t:'idle'};}
 for(let y=18;y<=22;y++)for(let x=18;x<=22;x++)c.seen[idx(x,y)]=1;
 c.b[idx(40,20)]={k:'farm',lvl:1,doneAt:null};c.seen[idx(40,20)]=1;
 assert.equal(applyAction(c,{type:'assign',ids:[c.people[0].id],task:{t:'work',at:idx(40,20)}},0),null);return c;
}
test('farm workers uncover fog at their actual walking position without revealing the future route',()=>{
 const c=fixture(),p=c.people[0],route=p.haul!.route.slice();
 assert.ok(route.some(tile=>!c.seen[tile]));assert.equal(c.seen[idx(30,20)],0);
 settle(c,4000);const point=haulPosition(p,4000)!;assert.equal(c.seen[idx(Math.floor(point.x),Math.floor(point.y))],1);
 assert.equal(c.seen[idx(30,20)],0,'distant route is still hidden');assert.equal(c.seen[idx(60,60)],0);
 settle(c,20000);for(const tile of route)assert.equal(c.seen[tile],1,`walked tile ${tile} must be visible`);
 assert.equal(c.seen[idx(60,60)],0);assert.equal(p.task.t,'work');
});
test('one offline settlement, short online ticks and JSON reload yield identical fog and economy',()=>{
 const c=fixture(),online=structuredClone(c),resumed=structuredClone(c);settle(c,180000);
 for(let at=1000;at<=180000;at+=1000)settle(online,at);
 settle(resumed,73000);const restored=JSON.parse(JSON.stringify(resumed));settle(restored,180000);
 assert.deepEqual(online,c);assert.deepEqual(restored,c);
});
test('loaded return trips also reveal their traversed ground, and preserve cargo until unloading',()=>{
 const c=fixture(),p=c.people[0];p.task={t:'idle'};p.pos=idx(40,20);
 const route=Array.from({length:21},(_,n)=>idx(40-n,20));
 p.haul={phase:'return',at:0,nextAt:20000,tile:route[0],route,routeStart:0,resource:'food',carried:10,capacity:10,drop:c.camp,taskKey:JSON.stringify(p.task)};
 settle(c,5000);assert.equal(c.seen[idx(35,20)],1);assert.equal(c.seen[idx(30,20)],0);assert.equal(p.haul!.carried,10);
 settle(c,21000);for(const tile of route)assert.equal(c.seen[tile],1);
});
test('workers reveal the actual detour around rock, not a straight shortcut through fog',()=>{
 const c=fixture();
 for(let y=10;y<=30;y++)c.t[idx(30,y)]=HL;
 const p=c.people[0];delete p.haul;p.pos=c.camp;
 assert.equal(applyAction(c,{type:'assign',ids:[p.id],task:{t:'work',at:idx(40,20)}},0),null);
 const route=p.haul!.route.slice();assert.ok(route.every(tile=>c.t[tile]!==HL));
 settle(c,Math.ceil(route.length*1.5)*1000);for(const tile of route)assert.equal(c.seen[tile],1);
 assert.equal(c.seen[idx(30,20)],0,'middle of the rock wall is outside actual sight');
});
test('swimming workers uncover their real river crossing as well as land',()=>{
 const c=fixture();for(let y=0;y<H;y++)for(const x of [28,29])c.t[idx(x,y)]=R;
 const p=c.people[0];delete p.haul;p.pos=c.camp;applyAction(c,{type:'assign',ids:[p.id],task:{t:'work',at:idx(40,20)}},0);
 settle(c,10000);assert.equal(c.seen[idx(28,20)],1);assert.equal(c.seen[idx(29,20)],1);assert.equal(c.seen[idx(60,60)],0);
});
