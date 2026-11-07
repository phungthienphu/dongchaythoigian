import test from 'node:test';
import assert from 'node:assert/strict';
import {applyAction,canPlace,derive,idx,newCity,settle,UNITS} from './engine';
import {buildAvailability} from './build-availability';
import {advanceBattle,createBattle} from './battle';
import {selectTowerTiles,towerLimit,towerStats} from './tower-balance';
function city(era=3){const c=newCity(0,123);c.era=era;c.t.fill(0);c.seen.fill(1);c.b={};c.camps=[];c.herds=[];c.army={};c.camp=idx(20,20);c.people=[];c.pop=0;c.res.wood=10000;c.res.stone=10000;return c;}
function firing(level=1,era=3){
 const d=city(era);d.b[idx(8,5)]={k:'watchtower',lvl:level,doneAt:null};
 const s=createBattle({id:'balance',attackerId:'a',defenderId:'d',attacker:city(),defender:d,troops:{sword:100},now:0});
 const g=s.groups[0];g.x=5.5;g.y=5.5;g.order={type:'guard',x:g.x,y:g.y};return s;
}
test('tower build caps match cards and authoritative actions in all six eras; old excess is preserved',()=>{
 for(let era=1;era<=6;era++){
  const c=city(era),limit=towerLimit(era);assert.equal(buildAvailability(c,'watchtower').limit,limit);
  for(let n=0;n<limit;n++)c.b[idx(30+n,30)]={k:'watchtower',lvl:n===0?0:1,doneAt:n===0?1000:null,...(n===1?{burned:true}:{})};
  settle(c,0);const before=structuredClone(c);assert.equal(buildAvailability(c,'watchtower').capped,true);
  assert.match(canPlace(c,derive(c),'watchtower',10,10)!,new RegExp(`${limit}/${limit}`));
  assert.match(applyAction(c,{type:'build',k:'watchtower',x:10,y:10},0)!,/giới hạn/);assert.deepEqual(c,before);
  c.era=era+1;if(era<6)assert.equal(buildAvailability(c,'watchtower').capped,false);
 }
 const c=city(1);for(let n=0;n<8;n++)c.b[idx(30+n,30)]={k:'watchtower',lvl:3,doneAt:null};
 assert.match(applyAction(c,{type:'build',k:'watchtower',x:10,y:10},0)!,/8\/2/);assert.equal(Object.keys(c.b).length,8);
});
test('tower volley has 6/9/12 DPS instead of 20/40/60, real one-second cadence and matching projectiles',()=>{
 for(let lvl=1;lvl<=3;lvl++){
  const s=firing(lvl),hp=s.groups[0].hp,d=towerStats(lvl).damage;
  advanceBattle(s,1000);assert.equal(hp-s.groups[0].hp,d);assert.equal(s.strikes!.length,1);
  advanceBattle(s,1100);assert.equal(hp-s.groups[0].hp,2*d);assert.equal(s.strikes!.at(-1)!.at,1100);
  s.groups[0].x=1.5;s.groups[0].order={type:'guard',x:1.5,y:5.5};advanceBattle(s,2500);assert.equal(hp-s.groups[0].hp,2*d);
 }
 const s=firing(1,5);advanceBattle(s,100);assert.equal(s.strikes![0].kind,'bullet');
});
test('entering range between clock boundaries emits the actual volley and persists cooldown on reload',()=>{
 const s=firing();s.groups[0].x=.5;s.groups[0].order={type:'guard',x:.5,y:5.5};advanceBattle(s,300);
 s.groups[0].x=5.5;s.groups[0].order={type:'guard',x:5.5,y:5.5};advanceBattle(s,400);assert.equal(s.strikes![0].at,400);
 const copy=JSON.parse(JSON.stringify(s));advanceBattle(s,2500);for(const at of [500,999,1400,1857,2500])advanceBattle(copy,at);assert.deepEqual(copy,s);
});
test('over-cap legacy villages use fixed tower slots and never substitute reserves after a tower burns',()=>{
 const s=firing(3,1);for(let n=0;n<5;n++)s.buildings.push({...s.buildings[0],id:`extra:${n}`,tile:idx(7+n,6),lvl:n===4?2:3});
 const before=s.groups[0].hp;advanceBattle(s,100);assert.equal(s.buildings.filter(b=>b.towerEnabled).length,2);assert.equal(before-s.groups[0].hp,24);
 const active=s.buildings.find(b=>b.towerEnabled)!;active.burned=true;advanceBattle(s,1100);assert.equal(s.buildings.filter(b=>b.towerEnabled).length,2);assert.equal(before-s.groups[0].hp,36);
 assert.equal(s.buildings.length,6);assert.deepEqual([...selectTowerTiles([{tile:5,lvl:1},{tile:8,lvl:3},{tile:7,lvl:3}],1,8)],[8,7]);
});
test('a small equipped invasion can destroy a level-three tower while still suffering casualties',()=>{
 const d=city(3);d.b[idx(8,5)]={k:'watchtower',lvl:3,doneAt:null};d.pop=20;d.res.food=1000;
 const s=createBattle({id:'siege',attackerId:'a',defenderId:'d',attacker:city(),defender:d,troops:{sword:8},now:0});
 const g=s.groups[0];g.x=7.5;g.y=5.5;g.order={type:'attack',targetId:s.buildings[0].id};advanceBattle(s,30_000);
 assert.equal(s.buildings[0].burned,true);assert.equal(s.winner,'attacker');assert.ok(g.count>0&&g.count<8);assert.ok(g.hp<8*UNITS.sword.hp);
});
