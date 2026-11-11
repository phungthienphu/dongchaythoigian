import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newCity,G,idx,applyAction,armyReleaseQuote,derive,stats,type City} from './engine';
import {isActionInput} from './action-input';
function fixture():City{
 const c=newCity(0,123);c.t.fill(G);c.seen.fill(1);c.camp=idx(20,20);c.b={[idx(19,20)]:{k:'house',lvl:3,doneAt:null}};c.army={club:4,sling:2};c.deployedArmy={club:3};c.queue=[{u:'club',startedAt:0,doneAt:100000}];return c;
}
test('release removes only home troops, never creates civilians, and prunes only removed actor slots',()=>{
 const c=fixture(),before=stats(c,derive(c),0),ids=c.people.map(p=>p.id);c.homeOrders={'club:0':{route:[c.camp],at:0,x:20.5,y:20.5},'club:3':{route:[c.camp],at:0,x:20.5,y:20.5}};
 assert.equal(applyAction(c,{type:'releaseTroops',mode:'expel',units:{club:2}},0),null);assert.equal(c.army.club,2);assert.equal(c.deployedArmy!.club,3);assert.equal(c.queue.length,1);assert.equal(c.people.length,5);assert.equal(c.pop,5);assert.deepEqual(c.people.map(p=>p.id),ids);assert.ok(c.homeOrders!['club:0']);assert.equal(c.homeOrders!['club:3'],undefined);
 assert.equal(stats(c,derive(c),0).upkeep.food,before.upkeep.food-480);assert.equal(c.res.food,100);
});
test('expulsion is permanent, gives no refund or civilians and never cancels returning empty ships',()=>{
 const c=fixture();c.ferryBookings=[{id:'club:3',ships:1,at:-10000,arrive:0,back:10000}];const before=structuredClone(c.res);
 assert.equal(applyAction(c,{type:'releaseTroops',mode:'expel',units:{club:1,sling:2}},0),null);assert.equal(c.people.length,5);assert.equal(c.army.club,3);assert.equal(c.army.sling,0);assert.deepEqual(c.res,before);assert.equal(c.ferryBookings.length,1);
});
test('insufficient home troops, active attacks and ferry crossings reject atomically',()=>{
 for(const reason of ['away','battle','ferry','raid']as const){const c=fixture();let units={club:1};
  if(reason==='away')units={club:5};if(reason==='battle')c.battleId='active';if(reason==='ferry')c.ferryBookings=[{id:'club:3',ships:1,arrive:5000,back:10000}];if(reason==='raid')c.raid={at:1000,warn:0,power:10,from:0};
  const before=structuredClone(c);assert.ok(applyAction(c,{type:'releaseTroops',mode:'expel',units},0));assert.deepEqual(c,before);
 }
});
test('legacy civilian conversion is rejected without expelling troops or producing population',()=>{
 const c=fixture(),before=structuredClone(c);
 assert.match(applyAction(c,{type:'releaseTroops',mode:'demobilize',units:{club:2}},0)!,/Không còn chuyển quân thành dân/);
 assert.deepEqual(c,before);
});
test('JSON rejects malformed counts and mode, empty selection is refused, expulsion works without housing',()=>{
 for(const units of [{club:-1},{club:.5},{club:Infinity},{club:301},{kraken:1}])assert.equal(isActionInput({type:'releaseTroops',mode:'expel',units}),false);
 assert.equal(isActionInput({type:'releaseTroops',mode:'lend',units:{club:1}}),false);
 const c=fixture();c.b={};assert.match(applyAction(c,{type:'releaseTroops',mode:'expel',units:{}},0)!,/Chọn/);assert.equal(armyReleaseQuote(c,{club:2},'expel').foodSavedPerMinute,8);assert.equal(applyAction(c,{type:'releaseTroops',mode:'expel',units:{club:2}},0),null);
});
