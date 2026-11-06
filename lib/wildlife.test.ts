import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newCity, settle, G, W, MIN, derive, stats, wildlifePosition, ERA_REQ } from './engine';
function fixture(){
 const c=newCity(0,123);c.t.fill(G);c.seen.fill(1);c.b={};c.res.food=500;c.people=c.people.slice(0,1);c.pop=1;
 const tile=48*W+50;c.b[tile]={k:'farm',lvl:1,doneAt:null};c.people[0].task={t:'work',at:tile};
 c.wildlife={route:[tile-2,tile-1,tile],start:0,arrive:MIN,end:MIN+15000};return c;
}
test('boars follow persisted path, warn before arrival and only temporarily reduce one farm yield',()=>{
 const c=fixture(),tile=c.wildlife!.route[2];assert.deepEqual(wildlifePosition(c,MIN/2),[49.5,48.5]);
 const before=stats(c,derive(c),0).rate.food;settle(c,MIN);assert.equal(c.cropDamage?.tile,tile);assert.equal(stats(c,derive(c),MIN).rate.food+4,(before+4)/2);
 assert.ok(c.log.some(e=>e.msg.includes('50%')));assert.equal(c.b[tile].burned,undefined);
 settle(c,3*MIN);assert.equal(c.cropDamage,undefined);assert.equal(c.wildlife,undefined);assert.ok(c.log.some(e=>e.msg.includes('phục hồi')));
});
test('nearby intact tower repels wildlife while burned towers cannot',()=>{
 const c=fixture(),tile=c.wildlife!.route[2];c.b[tile+2]={k:'watchtower',lvl:1,doneAt:null};settle(c,MIN);assert.equal(c.cropDamage,undefined);assert.ok(c.log.some(e=>e.msg.includes('xua đàn')));
 const d=fixture();d.b[tile+2]={k:'watchtower',lvl:1,doneAt:null,burned:true};settle(d,MIN);assert.ok(d.cropDamage);
});
test('wildlife effects are identical for offline and frequent settlement and later era costs grow',()=>{
 const a=fixture(),b=structuredClone(a);settle(a,4*MIN);for(let t=1000;t<=4*MIN;t+=1000)settle(b,t);assert.deepEqual(a,b);
 assert.ok(ERA_REQ[3].pop>ERA_REQ[2].pop);assert.ok(ERA_REQ[3].cost.food!>ERA_REQ[2].cost.food!);assert.ok(ERA_REQ[3].hall);
});
