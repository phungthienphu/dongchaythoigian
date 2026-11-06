import test from 'node:test';
import assert from 'node:assert/strict';
import { diplomaticView, diplomacyPermission } from './diplomacy';
import type { EnvoyVisit } from './diplomacy-types';
const row:EnvoyVisit={_id:'trip',from:'visitor',to:'host',fromName:'Nước A',toName:'Nước B',arrive:1000,expiresAt:new Date(10000)};
test('arrival messages appear only to the host after arrival and never disclose coordinates or routes',()=>{
 assert.equal(diplomaticView(row,'host',999),null);assert.equal(diplomaticView(row,'visitor',1000),null);assert.equal(diplomaticView(row,'stranger',1000),null);
 assert.deepEqual(diplomaticView({...row,...{world:{x:91,y:87},villageRoute:[8000]}} as EnvoyVisit,'host',1000),{id:'trip',side:'host',name:'Nước A',arrive:1000,requestedAt:undefined,decidedAt:undefined,decision:undefined});
 assert.equal(diplomaticView(row,'host',10000),null);
});
test('only the host requests an arrived visitors origin and only that visitor decides',()=>{
 assert.equal(diplomacyPermission(row,'host','request',1000),null);
 for(const pid of ['visitor','stranger'])assert.ok(diplomacyPermission(row,pid,'request',1000));
 assert.ok(diplomacyPermission(row,'host','request',999));assert.ok(diplomacyPermission(row,'host','request',10000));
 assert.ok(diplomacyPermission(row,'visitor','accept',1000));
 const asked={...row,requestedAt:1100};
 for(const action of ['accept','decline']){
  assert.equal(diplomacyPermission(asked,'visitor',action,1200),null);
  assert.ok(diplomacyPermission(asked,'host',action,1200));assert.ok(diplomacyPermission(asked,'stranger',action,1200));
 }
 assert.ok(diplomacyPermission(asked,'visitor','unknown',1200));
 assert.equal(diplomaticView(asked,'visitor',1200)?.name,'Nước B');
});
