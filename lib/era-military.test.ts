import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyAction,homeSoldiers,idx,marchLogistics,shipPlaces,shipsNeeded,trainingCost,UNITS,type UKey} from './engine';
import {LOCAL_RULES} from './eras';
import {ERA_UNITS,unitCounter} from './era-military';
import {eraFixture as fixture} from './era-fixtures.test-utils';
import {advanceBattle,commandBattle,createBattle} from './battle';
import {advanceRoadFight,startRoadFight} from './road-combat';

test('every new unit has explicit training, transport and battle stats, with final prices and era gates',()=>{
 for(const [key,unit]of Object.entries(ERA_UNITS)){
  const u=key as UKey,c=fixture(unit.era);c.b[idx(23,20)]={k:'barracks',lvl:3,doneAt:null};
  for(const r of Object.keys(c.res))c.res[r as keyof typeof c.res]=10000;
  assert.deepEqual(trainingCost(u,unit.era),unit.cost);
  const before=structuredClone(c);assert.match(applyAction(c,{type:'train',u,n:1},0)!,/sắp ra mắt/);assert.deepEqual(c,before);
  c.era=unit.era-1;assert.match(applyAction(c,{type:'train',u,n:1},0,LOCAL_RULES)!,/thời đại/);c.era=unit.era;
  assert.equal(applyAction(c,{type:'train',u,n:1},0,LOCAL_RULES),null);
  assert.equal(c.queue[0].u,u);assert.ok(c.queue[0].doneAt>0);
  assert.equal(shipPlaces(u),unit.space);assert.ok(unit.range&&unit.attackMs&&unit.speed);
 }
 assert.equal(shipsNeeded({cavalry:5,cannon:3,armor:3}),5);
});

function fight(u:UKey){
 const a=fixture(6),d=fixture(6);d.army={armor:20};
 const s=createBattle({id:'new-units',attackerId:'a',defenderId:'d',attacker:a,defender:d,troops:{[u]:1},now:0});
 const attack=s.groups.find(g=>g.side==='attacker')!,defend=s.groups.find(g=>g.side==='defender')!;
 attack.x=10;attack.y=10;attack.order={type:'guard',x:10,y:10};
 defend.x=17.5;defend.y=10;defend.order={type:'guard',x:17.5,y:10};s.defenderOnline=true;
 return {s,attack,defend};
}

test('volleys follow their actual cadence, changing orders cannot reset cooldown, replay survives serialization',()=>{
 const {s,attack,defend}=fight('musket');const hp=defend.hp;
 advanceBattle(s,100);assert.ok(defend.hp<hp);assert.equal(s.strikes?.find(e=>e.source===attack.id)?.kind,'bullet');
 const hit=defend.hp;commandBattle(s,'attacker',{type:'attack',groupId:attack.id,targetId:defend.id});
 advanceBattle(s,1800);assert.equal(defend.hp,hit);advanceBattle(s,1900);assert.ok(defend.hp<hit);
 const split=structuredClone(s);advanceBattle(s,6000);for(const at of [2103,2444,3000,6000])advanceBattle(split,at);assert.deepEqual(split,s);
});

test('cannon breaches buildings, new troops can die on roads and long marches include them',()=>{
 assert.equal(unitCounter('spear','cavalry'),1.8);assert.equal(unitCounter('cannon','armor'),1.4);assert.equal(unitCounter('bow','armor'),.3);
 const {s,attack}=fight('cannon');s.groups=s.groups.filter(g=>g.side==='attacker');
 s.buildings=[{id:'wall',tile:idx(16,10),k:'wall',lvl:1,hp:10000,maxHp:10000,value:10000,burned:false,initiallyBurned:false}];
 attack.order={type:'attack',targetId:'wall'};advanceBattle(s,100);
 assert.equal(s.buildings[0].hp,10000-UNITS.cannon.atk*2.8*3);assert.equal(s.strikes?.[0].kind,'shell');
 for(const u of Object.keys(ERA_UNITS) as UKey[]){
  const road=startRoadFight({[u]:1},{armor:50},0);advanceRoadFight(road,60000);assert.equal(road.attackers[u],0);
  assert.ok(marchLogistics({[u]:100},40*60000).losses>0);
 }
});

test('home movement uses new unit speed without changing the old unit speed',()=>{
 const c=fixture(6);c.army={cavalry:1,cannon:1,club:1};
 for(const u of ['cavalry','cannon','club'])c.homeOrders??={},c.homeOrders[`${u}:0`]={at:0,x:10.5,y:10.5,route:[idx(10,10),idx(20,10)]};
 const soldiers=homeSoldiers(c,1000);const x=(u:string)=>soldiers.find(s=>s.u===u)!.x;
 assert.ok(x('cavalry')>x('club'));assert.ok(x('club')>x('cannon'));assert.equal(x('club'),12.4);
});
