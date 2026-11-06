import test from 'node:test';
import assert from 'node:assert/strict';
import {newCity} from './engine';
import {caravanView,caravanPosition,caravanMapPosition,interception,validMarketAction} from './market-rules';
import {startRoadFight,advanceRoadFight} from './road-combat';
import type {Caravan} from './market-types';
const ship=():Caravan=>({_id:'ship',orderId:'lot',seller:'a',buyer:'b',sellerName:'A',buyerName:'B',resource:'stone',amount:100,currency:'gold',price:20,from:{x:10,y:10},to:{x:30,y:10},depart:0,arrive:600000,back:1200000,escorts:{club:2},initialEscorts:{club:2},createdAt:0,status:'travelling'});
test('market validates integer lots, currencies, troop bounds and request keys',()=>{
 const action={type:'create',resource:'stone',amount:100,currency:'gold',price:20,escorts:{club:2},requestId:'request_123'};
 assert.ok(validMarketAction(action));for(const patch of [{amount:-1},{price:1.2},{currency:'stone'},{escorts:{club:101}},{escorts:{hacker:1}},{requestId:'x'}])assert.equal(validMarketAction({...action,...patch}),false);
 assert.equal(validMarketAction(Object.assign(Object.create({secret:1}),action)),false);assert.equal(validMarketAction({type:'raid',id:'',units:{club:1},requestId:'request_123'}),false);
});
test('trade and friendship never reveal undiscovered route endpoints',()=>{
 const c=newCity(0,1),s=ship();assert.equal(caravanView(s,'stranger',c),null);
 let v=caravanView(s,'a',c)!;assert.ok(v.mine);assert.equal(v.from,undefined);assert.equal(v.to,undefined);
 c.discoveries=['b'];v=caravanView(s,'a',c)!;assert.deepEqual(v.to,s.to);assert.equal(v.canRaid,false);
 c.discoveries=['a','b'];v=caravanView(s,'stranger',c)!;assert.ok(v.canRaid);
 s.raid={by:'r',name:'R',requestId:'secret_key',from:{x:70,y:70},to:{x:20,y:10},depart:0,meetAt:300000,units:{club:2},initial:{club:2}};
 v=caravanView(s,'stranger',c)!;assert.equal(v.raid?.from,undefined);assert.equal('requestId' in v.raid!,false);
});
test('interception catches moving convoys, rejects unreachable origins and pauses during fights',()=>{
 const s=ship(),r=interception(s,{x:20,y:10},60000)!;assert.ok(r.meetAt>60000&&r.meetAt<s.arrive);
 assert.ok(Math.hypot(20-r.point.x,10-r.point.y)/4*60000<=r.meetAt-60000+1);
 assert.equal(interception(s,{x:190,y:190},599000),null);
 s.raid={by:'r',name:'R',requestId:'request_123',from:{x:20,y:10},to:r.point,depart:60000,meetAt:r.meetAt,units:{club:2},initial:{club:2}};
 assert.deepEqual(caravanPosition(s,r.meetAt+10000),r.point);
});
test('road combat causes real casualties and remains deterministic after reload/offline replay',()=>{
 const f=startRoadFight({club:5},{club:5},0),online=structuredClone(f),offline=structuredClone(f);
 for(let t=1000;t<=60000;t+=1000)advanceRoadFight(online,t);advanceRoadFight(offline,60000);assert.deepEqual(online,offline);assert.ok(offline.finished);assert.equal(offline.won,false);assert.ok((offline.attackers.club??0)<5);
 const strong=startRoadFight({sword:20},{club:1},0);advanceRoadFight(strong,60000);assert.equal(strong.won,true);
 const empty=startRoadFight({club:1},{},0);advanceRoadFight(empty,1000);assert.equal(empty.won,true);
 const weak=startRoadFight({club:1},{sword:20,medic:1},0);advanceRoadFight(weak,60000);assert.equal(weak.won,false);
});

test('world markers require disclosed routes and return without jumping after fights',()=>{
 const s=ship(),c=newCity(0,1);assert.equal(caravanMapPosition(caravanView(s,'a',c)!,1000),null);
 c.discoveries=['b'];let view=caravanView(s,'a',c)!;assert.deepEqual(caravanMapPosition(view,s.back),s.from);
 s.raid={by:'r',name:'R',requestId:'request_123',from:{x:20,y:10},to:{x:20,y:10},depart:0,meetAt:300000,units:{club:2},initial:{club:2},fight:startRoadFight({club:2},{club:2},300000)};
 view=caravanView(s,'a',c)!;assert.deepEqual(caravanMapPosition(view,310000),s.raid.to);
 s.raid.fight!.finished=true;s.raid.fight!.last=310000;s.raid.won=false;s.arrive=610000;
 view=caravanView(s,'a',c)!;assert.deepEqual(caravanMapPosition(view,310000),s.raid.to);
 s.escortsReturned=true;assert.equal(caravanMapPosition(caravanView(s,'a',c)!,700000),null);
});
