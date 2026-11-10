import test from 'node:test';
import assert from 'node:assert/strict';
import {newCity,derive,stats,idx,type Haul} from './engine';
import {villageAttention} from './game-attention';
import {BKEYS} from './engine';
import {BUILD_GROUPS,buildingGroup,panelGroup,searchText} from './game-ui';
function fixture(){const c=newCity(1000,123);c.manualWorkforce=true;c.raid=null;c.raidEncounter=undefined;c.disaster=undefined;c.hunger=undefined;const storage=stats(c,derive(c),1000).storage;return {c,storage};}
test('multiple urgent dangers remain visible before routine suggestions and never mutate the city',()=>{
  const {c,storage}=fixture();c.res.food=0;
  const before=JSON.stringify(c),items=villageAttention(c,storage,'offline',[{_id:'battle-a',side:'defender',status:'fighting',attackerName:'Đối thủ',defenderName:'Làng'}],4);
  assert.deepEqual(items.slice(0,3).map(i=>i.id),['sync','war:battle-a','hunger']);
  assert.deepEqual(items[1].target,{kind:'battle',id:'battle-a'});
  assert.equal(JSON.stringify(c),before);
});
test('people carrying a shipment are not reported as waiting until they reach storage or rest',()=>{
  const {c,storage}=fixture();c.res.wood=storage.wood;
  const haul:Haul={phase:'return',at:0,nextAt:5000,tile:c.camp,route:[c.camp],routeStart:0,resource:'wood',carried:10,capacity:10,taskKey:'test'};
  c.people[0].haul={...haul};c.people[1].haul={...haul,phase:'unload'};c.people[2].haul={...haul,resting:true};
  const items=villageAttention(c,storage,'saved',[],0),waiting=items.filter(i=>i.id==='storage:wood');
  assert.equal(waiting.length,1);assert.match(waiting[0].title,/2 người/);
  c.res.wood-=100;assert.ok(!villageAttention(c,storage,'saved',[],0).some(i=>i.id==='storage:wood'));
});
test('reading notices does not clear an ongoing famine; expired dangers disappear from current state',()=>{
  const {c,storage}=fixture();c.res.food=0;
  assert.ok(villageAttention(c,storage,'saved',[],0).some(i=>i.id==='hunger'));
  c.res.food=100;c.hunger={stressMs:60000,lossMs:0,warned:1};
  assert.equal(villageAttention(c,storage,'saved',[],0).find(i=>i.id==='hunger')?.severity,'warning');
  c.hunger.stressMs=0;assert.ok(!villageAttention(c,storage,'saved',[],0).some(i=>i.id==='hunger'));
});
test('cancelled and returning armies do not leave a stale incoming attack warning',()=>{
  const {c,storage}=fixture();
  const wars=['cancelled','completed','returning','marching'].map(status=>({_id:status,side:'defender',status,attackerName:'Đối thủ',defenderName:'Làng'}));
  assert.deepEqual(villageAttention(c,storage,'saved',wars,0).filter(i=>i.id.startsWith('war:')).map(i=>i.id),['war:marching']);
});
test('only exhausted fields that are not already tending need soil care',()=>{
  const {c,storage}=fixture();c.b[idx(30,30)]={k:'farm',lvl:1,doneAt:null,fertility:0};c.b[idx(31,30)]={k:'farm',lvl:1,doneAt:null,fertility:0,tendUntil:60000};
  const field=villageAttention(c,storage,'saved',[],0).find(i=>i.id==='fields');assert.match(field!.title,/1 ruộng/);assert.deepEqual(field!.target,{kind:'tile',tile:idx(30,30)});
});
test('every building has a known category and Vietnamese search accepts unaccented queries',()=>{
  assert.ok(BKEYS.every(k=>BUILD_GROUPS.includes(buildingGroup(k))));assert.equal(searchText('Đình Làng'),'dinh lang');
  assert.equal(panelGroup('market'),'worldmenu');assert.equal(panelGroup('resources'),'manage');assert.equal(panelGroup('people'),'people');
});
