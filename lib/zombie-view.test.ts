import test from 'node:test';
import assert from 'node:assert/strict';
import {newCity} from './engine';
import {zombiePresence,locateNextZombie,zombieDrawPosition} from './zombie-view';
import type {Zombie} from './zombies';
const actor=(id:number,extra:Partial<Zombie>={}):Zombie=>({id,kind:'normal',hp:90,maxHp:90,x:id,y:10,era:6,until:10000,nextHit:0,repath:0,...extra});
test('locator cycles living emerged attackers and reports pending separately',()=>{
 const c=newCity(0,123);c.zombies!.actors=[actor(1),actor(2,{emergesAt:5000}),actor(3,{hp:0}),actor(4,{until:1000}),actor(5)];
 assert.deepEqual(zombiePresence(c,1000).active.map(z=>z.id),[1,5]);
 assert.deepEqual(zombiePresence(c,1000).pending.map(z=>z.id),[2]);
 assert.equal(locateNextZombie(c,1000)?.id,1);assert.equal(locateNextZombie(c,1000,1)?.id,5);assert.equal(locateNextZombie(c,1000,5)?.id,1);
 c.zombies!.actors=[actor(2,{emergesAt:5000})];assert.equal(locateNextZombie(c,1000)?.id,2);
 c.zombies!.actors=[];assert.equal(locateNextZombie(c,1000),undefined);
});

test('drawing interpolates a simulated step without extrapolating',()=>{
 const z=actor(1,{x:11,y:10,fromX:10,fromY:10,walking:true});
 assert.deepEqual(zombieDrawPosition(z,1000,1500),{x:10.5,y:10});
 assert.deepEqual(zombieDrawPosition(z,1000,3000),{x:11,y:10});
 assert.deepEqual(zombieDrawPosition({...z,walking:false},1000,1500),{x:11,y:10});
});
