import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAction, CAP, F, G, HL, O, HAUL_CAPACITY, HOUR, idx, newCity, settle, type City } from './engine';
function fixture():City {
 const c=newCity(0,123);c.t.fill(G);c.seen.fill(1);c.camp=idx(20,20);c.b={};c.herds=[];c.camps=[];c.exps=[];c.res={food:100000,wood:0,stone:0,copper:0};c.people=c.people.slice(0,3);c.pop=3;c.popAcc=0;for(const p of c.people){p.task={t:'idle'};p.pos=c.camp;}return c;
}
function assign(c:City,tile=idx(30,20)){c.t[tile]=F;assert.equal(applyAction(c,{type:'assign',ids:[c.people[0].id],task:{t:'chop',at:tile}},0),null);return tile;}
test('wood leaves finite source at gathering and reaches stock only after the return and unload',()=>{
 const c=fixture(),tile=assign(c);settle(c,10_000);assert.equal(c.people[0].haul?.phase,'work');assert.equal(c.res.wood,0);settle(c,20_000);assert.equal(c.dep[tile],HAUL_CAPACITY);assert.equal(c.people[0].haul?.carried,HAUL_CAPACITY);assert.equal(c.res.wood,0);settle(c,30_000);assert.equal(c.people[0].haul?.phase,'unload');assert.equal(c.res.wood,0);settle(c,31_000);assert.equal(c.res.wood,HAUL_CAPACITY);assert.equal(c.people[0].haul?.carried,0);
});
test('one offline settle and arbitrary online polling have identical complete state',()=>{
 const offline=fixture();assign(offline);const online=structuredClone(offline);settle(offline,2*HOUR+731);for(let at=347;at<2*HOUR+731;at+=13753)settle(online,at);settle(online,2*HOUR+731);assert.deepEqual(online,offline);
});
test('full stockpile preserves cargo and resumes unloading after room opens',()=>{
 const c=fixture();c.res.wood=500;assign(c);settle(c,31_000);assert.equal(c.res.wood,500);assert.equal(c.people[0].haul?.carried,10);assert.equal(c.people[0].haul?.phase,'unload');c.res.wood-=6;settle(c,32_000);assert.equal(c.res.wood,500);assert.equal(c.people[0].haul?.carried,4);c.res.wood-=4;settle(c,33_000);assert.equal(c.res.wood,500);assert.equal(c.people[0].haul?.carried,0);
});
test('switching a loaded worker to idle deposits the existing cargo once',()=>{
 const c=fixture(),tile=assign(c);settle(c,20_000);assert.equal(applyAction(c,{type:'assign',ids:[c.people[0].id],task:{t:'idle'}},20_000),null);settle(c,40_000);assert.equal(c.res.wood,10);assert.equal(c.dep[tile],10);assert.equal(c.people[0].haul,undefined);settle(c,110_000);assert.equal(c.res.wood,10);
});
test('finite source partial cargo is never invented and source depletion retargets',()=>{
 const c=fixture(),tile=assign(c);c.dep[tile]=CAP.forest-3;settle(c,31_000);assert.equal(c.res.wood,3);assert.equal(c.t[tile],G);assert.equal(c.people[0].task.t,'idle');
});
test('resource-producing buildings also carry output and cannot credit rates directly',()=>{
 const c=fixture(),tile=idx(30,20);c.b[tile]={k:'gather',lvl:1,doneAt:null};assert.equal(applyAction(c,{type:'assign',ids:[c.people[0].id],task:{t:'work',at:tile}},0),null);settle(c,10_000);assert.ok(c.res.food<100000);assert.equal(c.people[0].haul?.phase,'work');assert.equal(c.people[0].haul?.carried,0);
});
test('burned or flooded drop sites are ignored and old cargo reroutes',()=>{
 const c=fixture(),tile=idx(30,20),drop=idx(29,20);c.b[drop]={k:'wood',lvl:1,doneAt:null};assign(c,tile);settle(c,22_000);assert.equal(c.people[0].haul?.drop,drop);c.b[drop].burned=true;settle(c,24_000);assert.equal(c.res.wood,0);assert.equal(c.people[0].haul?.drop,c.camp);settle(c,40_000);assert.equal(c.res.wood,10);
});
test('client position hints cannot teleport a gathering worker',()=>{
 const c=fixture(),tile=idx(30,20);c.t[tile]=F;assert.equal(applyAction(c,{type:'assign',ids:[c.people[0].id],task:{t:'chop',at:tile},pos:{[c.people[0].id]:tile}},0),null);assert.equal(c.people[0].haul?.phase,'travel');assert.equal(c.people[0].haul?.tile,c.camp);settle(c,9_000);assert.equal(c.people[0].haul?.phase,'travel');assert.equal(c.res.wood,0);
});
test('season and fertility boost changes remain independent of polling intervals',()=>{
 const offline=fixture();offline.oldbed=[idx(30,20)];offline.b[idx(30,20)]={k:'farm',lvl:1,doneAt:null};offline.era=2;offline.boostUntil=4501;assert.equal(applyAction(offline,{type:'assign',ids:[offline.people[0].id],task:{t:'work',at:idx(30,20)}},0),null);const online=structuredClone(offline);settle(offline,30_000);for(const at of [347,2500,4500,4502,6570,10500,30000])settle(online,at);assert.deepEqual(online,offline);
});
test('housing never accepts cargo and a warehouse takes priority over the starter camp',()=>{
 const c=fixture(),tile=assign(c),home=idx(29,20),warehouse=idx(35,20);
 c.b[home]={k:'hut',lvl:1,doneAt:null};
 c.b[warehouse]={k:'storehouse',lvl:1,doneAt:null};
 for(let t=1000;t<=110_000;t+=1000){settle(c,t);if(c.people[0].haul?.phase==='return')break;}
 assert.equal(c.people[0].haul?.drop,warehouse);
 const nearCamp=fixture();assign(nearCamp,idx(21,20));
 nearCamp.b[warehouse]={k:'storehouse',lvl:1,doneAt:null};
 settle(nearCamp,11_000);
 assert.equal(nearCamp.people[0].haul?.drop,warehouse);
});

test('hauling routes around stone and ore and mines from an adjacent ground tile',()=>{
 const c=fixture();
 for(let y=17;y<=23;y++)c.t[idx(25,y)]=y%2?HL:O;
 assign(c);
 const route=c.people[0].haul!.route;
 assert.ok(route.every(tile=>![HL,O].includes(c.t[tile])));
 assert.ok(route.some(tile=>Math.floor(tile/96)<17||Math.floor(tile/96)>23));
 const miner=fixture(),rock=idx(30,20);miner.t[rock]=HL;
 assert.equal(applyAction(miner,{type:'assign',ids:[miner.people[0].id],task:{t:'mine',at:rock}},0),null);
 assert.ok(miner.people[0].haul!.route.every(tile=>miner.t[tile]!==HL));
 settle(miner,10_000);
 assert.equal(miner.people[0].haul?.phase,'work');
 assert.notEqual(miner.people[0].haul?.tile,rock);
 settle(miner,60_000);
 assert.equal(miner.res.stone,10);
});
test('starter wood load takes ten seconds of work and tool upgrades accelerate it',()=>{
 const c=fixture(),source=idx(22,20);assign(c,source);settle(c,2000);
 assert.equal(c.people[0].haul?.phase,'work');
 assert.equal(c.people[0].haul!.nextAt-c.people[0].haul!.at,10_000);
 const upgraded=fixture();upgraded.b[idx(19,19)]={k:'forge',lvl:2,doneAt:null};assign(upgraded,source);
 assert.equal(upgraded.people[0].haul?.workRate,5400);
 const broken=fixture();broken.b[idx(19,19)]={k:'forge',lvl:2,doneAt:null,burned:true};assign(broken,source);
 assert.equal(broken.people[0].haul?.workRate,3600);
});
test('population grows after one minute with housing and food and stops at housing capacity',()=>{
 const c=fixture();c.b[c.camp]={k:'hut',lvl:2,doneAt:null};
 settle(c,59_000);assert.equal(c.people.length,3);
 settle(c,61_000);assert.equal(c.people.length,4);
 settle(c,240_000);assert.equal(c.people.length,6);
});
