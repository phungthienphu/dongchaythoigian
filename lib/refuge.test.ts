import test from 'node:test';
import assert from 'node:assert/strict';
import { newCity, idx, G, F, HL, applyAction, settle, updateRefuges, refugePosition, stats, derive, type City } from './engine';
function fixture():City {
 const c=newCity(0,123);c.t.fill(G);c.seen.fill(1);c.b={};c.herds=[];c.camps=[];c.people=c.people.slice(0,2);c.camp=idx(10,10);
 c.b[idx(12,10)]={k:'house',lvl:1,doneAt:null};c.res={food:5000,wood:0,stone:0,copper:0, gold: 0, diamond: 0};
 c.t[idx(20,10)]=F;c.people[0].pos=idx(20,10);c.people[1].pos=idx(19,10);
 applyAction(c,{type:'assign',ids:[c.people[0].id],task:{t:'chop',at:idx(20,10)}},0);
 return c;
}
test('all civilians including workers and explorers run automatically, without a bell, and keep cargo',()=>{
 const c=fixture();settle(c,11000);const p=c.people[0];assert.ok(p.haul!.carried>0);const cargo=p.haul!.carried,task=structuredClone(p.task);
 applyAction(c,{type:"assign",ids:[c.people[1].id],task:{t:"explore",to:idx(30,12)}},11000);
 const explore=structuredClone(c.people[1].task);
 c.raid={warn:11000,at:31000,power:0,from:idx(25,10)};updateRefuges(c,11000);
 assert.ok(c.people.every(p=>p.refuge));const position=refugePosition(p,11000)!;assert.equal(position.moving,true);
 settle(c,25000);assert.equal(p.haul!.carried,cargo);assert.equal(c.res.wood,0);assert.deepEqual(p.task,task);assert.equal(stats(c,derive(c),25000).rate.wood,-2);
 assert.equal(refugePosition(p,25000)!.hidden,true);assert.deepEqual(c.people[1].task,explore);
 settle(c,70000);assert.equal(p.refuge,undefined);assert.ok(c.res.wood>=cargo-1);assert.deepEqual(p.task,task);
});
test('offline and irregular online settlement produce identical shelter, resume and resources',()=>{
 const a=fixture();a.raid={warn:7000,at:23000,power:0,from:idx(25,10)};const b=structuredClone(a);
 settle(a,90000);for(let at=337;at<90000;at+=1733)settle(b,at);settle(b,90000);assert.deepEqual(a,b);
});
test('shelter and return respect rocks, houses and diagonal corners and block construction over the route',()=>{
 const c=fixture();c.people[0].pos=idx(18,10);delete c.people[0].haul;c.people[0].task={t:'idle'};
 for(let y=8;y<=12;y++)c.t[idx(15,y)]=HL;
 c.raid={warn:0,at:20000,power:0,from:idx(25,10)};updateRefuges(c,0);const p=c.people[0];
 assert.ok(p.refuge!.route.every(tile=>c.t[tile]!==HL && !c.b[tile]));
 for(let at=0;at<p.refuge!.arrive;at+=50){const pos=refugePosition(p,at)!;assert.notEqual(c.t[idx(Math.floor(pos.x),Math.floor(pos.y))],HL);}
 const before=refugePosition(p,1000)!;delete c.raid;updateRefuges(c,1000);const after=refugePosition(p,1000)!;
 assert.ok(Math.abs(before.x-after.x)<1e-8);assert.ok(Math.abs(before.y-after.y)<1e-8);
});
test('a sealed villager does not teleport through walls or disappear without reachable shelter',()=>{
 const c=fixture();const p=c.people[1];p.pos=idx(20,20);for(let x=19;x<=21;x++)for(let y=19;y<=21;y++)if(x!==20||y!==20)c.b[idx(x,y)]={k:'wall',lvl:1,doneAt:null};
 c.raid={warn:0,at:20000,power:0,from:idx(25,10)};updateRefuges(c,0);
 assert.deepEqual(p.refuge!.route,[idx(20,20)]);assert.equal(refugePosition(p,5000)!.hidden,false);assert.equal(refugePosition(p,5000)!.x,20.5);
});
test('PvP refuge survives combat freeze and resumes haul clocks exactly once',()=>{
 const c=fixture();settle(c,5000);const p=c.people[0],clock=p.haul!.nextAt;
 c.battleId='battle';updateRefuges(c,5000);assert.ok(p.refuge);
 delete c.battleId;updateRefuges(c,35000);c.last=35000;c.haulAt=35000;
 const back=p.refuge!.back!,pause=back-p.refuge!.pausedAt;updateRefuges(c,back);assert.equal(p.haul!.nextAt,clock+pause);
 updateRefuges(c,back+1000);assert.equal(p.haul!.nextAt,clock+pause);
});
test('distant raid warnings and an early bell do not stop harvesting; shelter starts in the final minute',()=>{
 const c=fixture();c.raid={warn:0,at:30*60_000,power:0,from:idx(25,10)};c.alarm=true;
 updateRefuges(c,0);assert.ok(c.people.every(p=>!p.refuge));
 settle(c,60_000);assert.ok(c.res.wood>0);assert.ok(c.people.every(p=>!p.refuge));
 updateRefuges(c,29*60_000-1);assert.ok(c.people.every(p=>!p.refuge));
 updateRefuges(c,29*60_000);assert.ok(c.people.every(p=>p.refuge));
});
test('legacy early shelter returns workers with cargo intact while the raid is still distant',()=>{
 const c=fixture();settle(c,11000);const p=c.people[0],cargo=p.haul!.carried,task=structuredClone(p.task);
 c.raid={warn:11000,at:31000,power:0,from:idx(25,10)};updateRefuges(c,11000);updateRefuges(c,20000);assert.ok(p.refuge);
 c.raid.at=30*60_000;updateRefuges(c,20000);assert.ok(p.refuge?.returnAt);assert.equal(p.haul!.carried,cargo);
 settle(c,90_000);assert.ok(!p.refuge);assert.deepEqual(p.task,task);assert.ok(c.res.wood>=cargo-1);assert.ok(c.raid);
});
test('warning, final-minute shelter and recovery remain identical offline and online',()=>{
 const a=fixture();a.raid={warn:0,at:180_000,power:0,from:idx(25,10)};a.alarm=true;const b=structuredClone(a);
 settle(a,220_000);for(let at=337;at<220_000;at+=1733)settle(b,at);settle(b,220_000);assert.deepEqual(a,b);
});
