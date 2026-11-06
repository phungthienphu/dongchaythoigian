import test from 'node:test';
import assert from 'node:assert/strict';
import {nextCaravanEvent,caravanRecoveryAt} from './caravan-clock';
import type {Caravan} from './market-types';
const ship=()=>({status:'travelling',arrive:10000,back:20000} as Caravan);
test('convoy recovery follows unfinished delivery, payment, escort and raider milestones',()=>{
 const s=ship();assert.equal(nextCaravanEvent(s),10000);
 s.goodsDelivered=true;s.paymentDelivered=true;assert.equal(nextCaravanEvent(s),20000);
 s.escortsReturned=true;s.status='completed';assert.equal(nextCaravanEvent(s),Infinity);
 const r=ship();r.raid={meetAt:5000} as Caravan['raid'];assert.equal(nextCaravanEvent(r),5000);
 r.raid!.fight={last:6000,finished:false} as any;assert.equal(nextCaravanEvent(r),7000);
 r.raid!.won=true;r.robbed=true;r.raid!.fight!.finished=true;r.raid!.backAt=30000;
 assert.equal(nextCaravanEvent(r),6000);r.paymentDelivered=true;assert.equal(nextCaravanEvent(r),20000);
 r.escortsReturned=true;assert.equal(nextCaravanEvent(r),30000);
 r.goodsDelivered=true;r.raid!.returned=true;assert.equal(nextCaravanEvent(r),Infinity);
});
test('blocked transfers retry each minute while future travel waits until its next milestone',()=>{
 const s=ship();assert.equal(caravanRecoveryAt(s,10000),70000);
 s.arrive=15000;s.back=200000;assert.equal(caravanRecoveryAt(s,10000),15000);
 s.arrive=100000;assert.equal(caravanRecoveryAt(s,10000),100000);
});
