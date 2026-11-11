import test from 'node:test';
import assert from 'node:assert/strict';
import {idx,RES,type City} from './engine';
import {eraFixture} from './era-fixtures.test-utils';
import {initializeMagic} from './magic';
import {advanceBattle,battleCommandError,battleResult,createBattle} from './battle';
function era9(at=0):City{const c=eraFixture(6,at);c.era=9;c.b[idx(19,20)].lvl=9;initializeMagic(c,at);for(const r of RES)c.res[r]=9000;return c;}
test('PvP flyers: only anti-air hits them, mages ×1.5, they cross walls, and flyers alone cannot win or loot',()=>{
 const town=()=>{const c=era9();c.b={'4658':{k:'hut',lvl:1,doneAt:null}};c.camp=4658;c.army={};c.pop=20;return c;};
 const duel=(attacker:string,defender:string,n=1)=>{const d=town();d.army={[defender]:n};const s=createBattle({id:'f',attackerId:'a',defenderId:'d',attacker:town(),defender:d,troops:{[attacker]:1},now:0});
  const a=s.groups.find(g=>g.side==='attacker')!,b=s.groups.find(g=>g.side==='defender')!;a.x=b.x+1;a.y=b.y;a.order={type:'guard',x:a.x,y:a.y};advanceBattle(s,2000);return {a,b,s};};
 {const {a,b}=duel('dragon','golem');assert.equal(a.hp,1000);assert.ok(b.hp<900);}
 {const {a}=duel('dragon','bow',5);assert.ok(a.hp<1000);}
 {const {a}=duel('dragon','firemage');const {a:t}=duel('tortoise','firemage');assert.ok(Math.abs((1000-a.hp)-(1600-t.hp)*1.5)<1e-6);}
 // Walls stop ground troops, not dragons; flyers alone never win by devastation and take no loot.
 const d=town();for(let y=40;y<56;y++)d.b[idx(40,y)]={k:'wall',lvl:1,doneAt:null};
 const s=createBattle({id:'w',attackerId:'a',defenderId:'d',attacker:town(),defender:d,troops:{dragon:2},now:0});
 const dragon=s.groups[0];dragon.x=30.5;dragon.y=48.5;dragon.order={type:'move',x:50.5,y:48.5};advanceBattle(s,6000);assert.ok(dragon.x>40.5,`x ${dragon.x}`);
 dragon.order={type:'attack',targetId:'b:4658'};advanceBattle(s,90_000);
 assert.ok(s.buildings.find(b=>b.tile===4658)!.burned);assert.equal(s.winner,undefined);assert.ok(RES.every(r=>s.loot[r]===0));
});

test('PvP spell packages: Thiên lôi on ≥4 visible enemies after 5 s; used packages are reported once per side',()=>{
 const town=()=>{const c=era9();c.b={'4658':{k:'hut',lvl:1,doneAt:null}};c.camp=4658;c.army={};c.pop=20;return c;};
 const d=town();d.army={spear:5};
 const s=createBattle({id:'t',attackerId:'a',defenderId:'d',attacker:town(),defender:d,troops:{bow:3},now:0,attackerPackages:['thunder','thunder'],defenderPackages:['sanctuary']});
 const bow=s.groups.find(g=>g.u==='bow')!,spear=s.groups.find(g=>g.u==='spear')!;bow.x=spear.x+7;bow.y=spear.y;bow.order={type:'guard',x:bow.x,y:bow.y};spear.x+=0;
 for(const g of s.groups)if(g.u==='spear'&&g!==spear){g.x=spear.x;g.y=spear.y;}
 const hp=spear.hp;advanceBattle(s,100);assert.equal(s.packages!.attacker!.thunder,'used');assert.equal(s.spellEffects!.length,1);
 spear.x=s.spellEffects![0].x;spear.y=s.spellEffects![0].y;
 advanceBattle(s,4900);assert.equal(hp-spear.hp>=0,true);const before=spear.hp;advanceBattle(s,5100);
 assert.ok(before-spear.hp>=Math.min(before,180*5)-1e-6||spear.count===0);
 s.status='finished';s.winner='defender';const r=battleResult(s)!;assert.deepEqual(r.spells!.attacker,['thunder']);
});


test('PvP beasts: dragon breath hits two more squads at 50%, tortoise covers 15%, phoenix heals; melee cannot be ordered onto flyers',()=>{
 const town=()=>{const c=era9();c.b={'4658':{k:'hut',lvl:1,doneAt:null}};c.camp=4658;c.army={};c.pop=20;return c;};
 const d=town();d.army={spear:3};
 const s=createBattle({id:'b',attackerId:'a',defenderId:'d',attacker:town(),defender:d,troops:{dragon:1,golem:1},now:0});
 const dragon=s.groups.find(g=>g.u==='dragon')!,golem=s.groups.find(g=>g.u==='golem')!,spears=s.groups.filter(g=>g.u==='spear');
 // Split the spears into three squads around one point so the breath can chain.
 const base=spears[0];const squads=[base,{...base,id:'defender:spear:x1',count:1,initial:1,hp:40},{...base,id:'defender:spear:x2',count:1,initial:1,hp:40}];
 s.groups=[dragon,golem,...squads];base.count=1;base.initial=1;base.hp=40;squads[1].x=base.x+.5;squads[2].x=base.x-.5;
 golem.x=80.5;golem.y=80.5;golem.order={type:'guard',x:80.5,y:80.5};dragon.x=base.x+3;dragon.y=base.y;dragon.order={type:'attack',targetId:base.id};
 advanceBattle(s,100);const taken=squads.map(g=>40-g.hp).sort((a,b)=>a-b);
 assert.deepEqual(taken,[22.5,22.5,40]);// primary 45 (overkill on a 40 HP squad), two secondaries at 50%
 // Golems cannot be ordered to attack a dragon.
 const t=createBattle({id:'c',attackerId:'a',defenderId:'d',attacker:town(),defender:(()=>{const x=town();x.army={golem:1};return x;})(),troops:{dragon:1},now:0});
 t.defenderOnline=true;const enemy=t.groups.find(g=>g.u==='dragon')!,mine=t.groups.find(g=>g.u==='golem')!;
 assert.match(battleCommandError(t,'defender',{type:'attack',targetId:enemy.id,groupId:mine.id})!,/quân bay/);
 // Tortoise cover and phoenix heal.
 const u=createBattle({id:'h',attackerId:'a',defenderId:'d',attacker:town(),defender:(()=>{const x=town();x.army={tortoise:1,phoenix:1,sword:4};return x;})(),troops:{sword:1},now:0});
 const sword=u.groups.find(g=>g.side==='defender'&&g.u==='sword')!,turtle=u.groups.find(g=>g.u==='tortoise')!,bird=u.groups.find(g=>g.u==='phoenix')!,foe=u.groups.find(g=>g.side==='attacker')!;
 u.groups=[foe,sword,turtle,bird];turtle.x=sword.x+1;turtle.y=sword.y;bird.x=sword.x;bird.y=sword.y+1;foe.x=sword.x-1;foe.y=sword.y;foe.order={type:'attack',targetId:sword.id};
 sword.hp=100;advanceBattle(u,100);const first=100-sword.hp;assert.ok(first>0);
 const alone=createBattle({id:'h2',attackerId:'a',defenderId:'d',attacker:town(),defender:(()=>{const x=town();x.army={sword:4};return x;})(),troops:{sword:1},now:0});
 const s2=alone.groups.find(g=>g.side==='defender')!,f2=alone.groups.find(g=>g.side==='attacker')!;alone.groups=[f2,s2];f2.x=s2.x-1;f2.y=s2.y;f2.order={type:'attack',targetId:s2.id};s2.hp=100;advanceBattle(alone,100);
 assert.ok(Math.abs(first-(100-s2.hp)*.85)<1e-6);
 const hp=sword.hp;advanceBattle(u,10_000);assert.ok(sword.hp>hp-200);// phoenix heals at the 10 s mark
});
