import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newCity,settle,MIN,HOUR,G,idx,type City} from './engine';
function fixture():City{
 const c=newCity(0,123);c.t.fill(G);c.seen.fill(1);c.camps=[];c.herds=[];c.b={};c.res.food=0;c.res.wood=100;c.wildernessAt=2*HOUR;c.disaster={kind:'flood',at:2*HOUR,level:1,center:0};return c;
}
test('short hunger recovers; sustained hunger warns, departures precede deaths, last three survive',()=>{
 const c=fixture();for(let i=0;i<5;i++)c.people.push({id:c.nextId++,name:`Thợ ${i}`,task:{t:'chop',at:idx(20,20)}});c.pop=c.people.length;
 settle(c,MIN);assert.equal(c.people.length,10);assert.ok(c.log.some(l=>l.msg.includes('10 phút')));
 settle(c,10*MIN);assert.equal(c.people.length,9);assert.ok(c.log.some(l=>l.msg.includes('bỏ đi')));
 settle(c,20*MIN);assert.equal(c.people.length,8);assert.equal(c.log.some(l=>l.msg.includes('đã chết')),false);
 settle(c,30*MIN);assert.equal(c.people.length,7);assert.ok(c.log.some(l=>l.msg.includes('đã chết')));
 settle(c,80*MIN);assert.equal(c.people.length,3);assert.equal(c.pop,3);
});
test('food recovers accumulated hunger over time without resetting jobs, no births during recovery',()=>{
 const c=fixture();settle(c,5*MIN);const ids=c.people.map(p=>p.id);c.res.food=500;settle(c,6*MIN);assert.equal(c.hunger!.stressMs,3*MIN);settle(c,8*MIN);assert.equal(c.hunger!.stressMs,0);assert.deepEqual(c.people.map(p=>p.id),ids);assert.ok(c.log.some(l=>l.msg.includes('qua cơn đói')));
});
test('offline losses match irregular polling and legacy catch-up does not add retroactive deaths',()=>{
 const a=fixture(),b=structuredClone(a);settle(a,40*MIN);for(let at=137;at<40*MIN;at+=7291)settle(b,at);settle(b,40*MIN);assert.deepEqual(a,b);
 const c=fixture();delete c.hungerStartsAt;delete c.hunger;settle(c,40*MIN);assert.equal(c.log.some(l=>l.msg.includes('đã chết')),false);assert.equal(c.hunger,undefined);settle(c,41*MIN);assert.equal(c.hunger!.stressMs,MIN);
});
