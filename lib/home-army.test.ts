import test from 'node:test';
import assert from 'node:assert/strict';
import { newCity, G, HL, R, idx, UNITS, applyAction, settle, homeSoldiers, pruneHomeOrders, canPlace, derive, type City } from './engine';
function fixture():City {
 const c=newCity(0,123);c.t.fill(G);c.seen.fill(1);c.b={};c.herds=[];c.camps=[];c.camp=idx(10,10);c.army={club:1};
 c.b[idx(10,10)]={k:'barracks',lvl:1,doneAt:null};c.res={food:10000,wood:10000,stone:10000,copper:10000, gold: 0, diamond:0,coal:0,aetherCrystal:0,rune:0,essence:0};return c;
}
test('training records progress clocks, completes serially and walks from entrance to guard post',()=>{
 const c=fixture();c.army={};c.guardPosts=[{x:18,y:10}];assert.equal(applyAction(c,{type:'train',u:'club',n:2},0),null);
 assert.equal(c.queue[0].startedAt,0);assert.equal(c.queue[1].startedAt,c.queue[0].doneAt);
 const done=c.queue[0].doneAt;settle(c,done);assert.equal(c.army.club,1);assert.equal(c.queue.length,1);
 const actor=homeSoldiers(c,done)[0];assert.equal(actor.moving,true);assert.ok(Math.hypot(actor.x-10.5,actor.y-10.5)<2);
 const arrived=homeSoldiers(c,done+20000)[0];assert.equal(arrived.x,18.5);assert.equal(arrived.y,10.5);assert.equal(arrived.moving,false);
});
test('orders route around rock, water and buildings; retargeting preserves exact current position',()=>{
 const c=fixture();for(let y=8;y<=12;y++)c.t[idx(14,y)]=HL;c.b[idx(13,13)]={k:'house',lvl:1,doneAt:null};c.t[idx(13,7)]=R;
 assert.equal(applyAction(c,{type:'moveSoldier',id:'club:0',x:18,y:10},0),null);
 assert.ok(c.homeOrders!['club:0'].route.every(i=>c.t[i]!==HL&&c.t[i]!==R&&!c.b[i]));
 const before=homeSoldiers(c,777)[0];assert.equal(applyAction(c,{type:'moveSoldier',id:'club:0',x:18,y:15},777),null);
 const after=homeSoldiers(c,777)[0];assert.equal(after.x,before.x);assert.equal(after.y,before.y);
 assert.equal(canPlace(c,derive(c),'hut',18,15)?.includes('lối'),true);
});
test('sealed, hidden, invalid and deployed troop orders reject without replacing a valid order',()=>{
 const c=fixture();assert.equal(applyAction(c,{type:'moveSoldier',id:'club:0',x:12,y:10},0),null);const old=structuredClone(c.homeOrders);
 for(let x=19;x<=21;x++)for(let y=19;y<=21;y++)if(x!==20||y!==20)c.b[idx(x,y)]={k:'wall',lvl:1,doneAt:null};
 assert.ok(applyAction(c,{type:'moveSoldier',id:'club:0',x:20,y:20},0));assert.deepEqual(c.homeOrders,old);
 c.seen[idx(12,12)]=0;assert.ok(applyAction(c,{type:'moveSoldier',id:'club:0',x:12,y:12},0));
 assert.ok(applyAction(c,{type:'moveSoldier',id:'club:9',x:12,y:10},0));assert.ok(applyAction(c,{type:'moveSoldier',id:'club:0',x:96,y:0},0));
 c.army={};pruneHomeOrders(c);assert.deepEqual(c.homeOrders,{});assert.equal(homeSoldiers(c,0).length,0);
});
test('training and rally orders settle identically offline and at irregular intervals',()=>{
 const a=fixture();a.guardPosts=[{x:18,y:10}];applyAction(a,{type:'train',u:'club',n:3},0);const b=structuredClone(a),end=UNITS.club.sec*1000*4;
 settle(a,end);for(let t=371;t<end;t+=1733)settle(b,t);settle(b,end);assert.deepEqual(a,b);
});
