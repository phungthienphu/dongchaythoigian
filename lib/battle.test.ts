import assert from 'node:assert/strict';
import test from 'node:test';
import { newCity, type City } from './engine';
import { advanceBattle, battleResult, commandBattle, createBattle } from './battle';
function city():City {const c=newCity(0,1);c.t.fill(0);c.b={'4658':{k:'hut',lvl:1,doneAt:null}};c.camp=4658;c.army={};c.pop=20;return c;}
function battle(){return createBattle({id:'test',attackerId:'a',defenderId:'d',attacker:city(),defender:city(),troops:{club:10},now:0});}
test('fixed tick results survive serialization and irregular polling',()=>{const a=battle(),b=JSON.parse(JSON.stringify(a));advanceBattle(a,2000);for(const at of [99,101,517,1000,2000])advanceBattle(b,at);assert.deepEqual(a,b);});
test('orders cannot control enemy groups or move outside terrain',()=>{const s=battle();assert.equal(commandBattle(s,'defender',{type:'move',groupId:'attacker:club',x:3,y:3}),false);assert.equal(commandBattle(s,'attacker',{type:'move',groupId:'attacker:club',x:NaN,y:3}),false);});
test('retreat finishes only after army exits and preserves survivors',()=>{const s=battle();commandBattle(s,'attacker',{type:'retreat'});assert.equal(s.status,'retreating');advanceBattle(s,1000);assert.equal(battleResult(s)?.winner,'defender');assert.equal(battleResult(s)?.attackerSurvivors.club,10);});
test('devastation stops fighting immediately and caps loot and population losses',()=>{const s=battle();s.groups[0].x=50;s.groups[0].y=48;s.groups[0].hp=20000;s.groups[0].count=1000;advanceBattle(s,1000);const r=battleResult(s);assert.equal(r?.winner,'attacker');assert.ok(r!.populationLoss<=10);assert.ok(r!.loot.food<=s.startingResources.food*.25);const frozen=JSON.stringify(s);advanceBattle(s,999999);assert.equal(JSON.stringify(s),frozen);});
test('offline guards intercept nearby attackers',()=>{const c=city();c.army={club:10};const s=createBattle({id:'x',attackerId:'a',defenderId:'d',attacker:city(),defender:c,troops:{club:1},now:0});s.groups[0].x=49;s.groups[0].y=48;advanceBattle(s,1000);assert.ok(s.groups[0].hp<20);});
test('intact walls block movement and attackers attack obstructions',()=>{const s=battle();s.buildings.push({id:'wall',tile:48*96+2,k:'wall',lvl:1,hp:100,maxHp:100,burned:false,initiallyBurned:false,value:20});s.terrain.fill(3);for(let x=0;x<96;x++)s.terrain[48*96+x]=0;s.groups[0].x=1;s.groups[0].y=48;advanceBattle(s,1000);assert.equal(s.groups[0].order.type,'attack');assert.ok(s.buildings.find(b=>b.id==='wall')!.hp<100);assert.ok(s.groups[0].x<2);});
test('already burned buildings do not count as fresh damage',()=>{const s=battle();s.buildings[0].burned=true;s.buildings[0].initiallyBurned=true;advanceBattle(s,100);assert.equal(s.devastation,0);assert.equal(s.populationLoss,0);});

test('watchtowers damage attackers and stop firing after burning',()=>{const s=battle();s.groups[0].x=5;s.groups[0].y=5;s.groups[0].order={type:'guard',x:5,y:5};s.buildings.push({id:'tower',tile:5*96+8,k:'watchtower',lvl:1,hp:100,maxHp:100,burned:false,initiallyBurned:false,value:20});const hp=s.groups[0].hp;advanceBattle(s,100);assert.ok(s.groups[0].hp<hp);s.buildings[1].burned=true;const after=s.groups[0].hp;advanceBattle(s,200);assert.equal(s.groups[0].hp,after);});

test('tower emits authoritative arrows only in range and retains a bounded recent history',()=>{
  const s=battle();const g=s.groups[0];g.x=5;g.y=5;g.order={type:'guard',x:5,y:5};
  s.buildings.push({id:'tower',tile:5*96+8,k:'watchtower',lvl:1,hp:100,maxHp:100,burned:false,initiallyBurned:false,value:20});
  advanceBattle(s,100);assert.equal(s.strikes?.filter(e=>e.source==='tower').length,1);assert.equal(s.strikes?.find(e=>e.source==='tower')?.kind,'arrow');
  g.x=30;g.y=30;g.order={type:'guard',x:30,y:30};
  advanceBattle(s,1500);assert.equal(s.strikes?.filter(e=>e.source==='tower').length,0);
});

test('flooded towers never fire and combat events contain positions without leaking full group state',()=>{
 const defender=city();defender.b[5*96+8]={k:'watchtower',lvl:1,doneAt:null,flooded:true};
 const s=createBattle({id:'flood',attackerId:'a',defenderId:'d',attacker:city(),defender,troops:{club:10},now:0});
 s.groups[0].x=5;s.groups[0].y=5;s.groups[0].order={type:'guard',x:5,y:5};
 const hp=s.groups[0].hp;advanceBattle(s,100);assert.equal(s.groups[0].hp,hp);assert.equal(s.strikes?.length,0);
 s.buildings.find(b=>b.k==='watchtower')!.inactive=false;advanceBattle(s,1100);
 const e=s.strikes!.find(e=>e.source.startsWith('b:'))!;assert.ok(e);assert.deepEqual(Object.keys(e.to).sort(),['x','y']);assert.deepEqual(Object.keys(e.from).sort(),['x','y']);
});
