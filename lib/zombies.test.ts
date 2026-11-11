import test from 'node:test';
import assert from 'node:assert/strict';
import {newCity,idx,canPlace,derive,applyAction,homeSoldiers,settle,F,type City} from './engine';
import {createBattle} from './battle';
import {zombiePath,zombieWave,zombieWeeks,zombieStats,stepZombies,zombiePressure} from './zombies';
function city(){const c=newCity(0,123);c.t.fill(0);c.seen.fill(1);c.b={};return c;}
test('population scales waves and unlocks variants without increasing the total',()=>{
 assert.deepEqual(zombieWave(680,5,1),{total:17,normal:12,super:2,breaker:3,interval:30*60000});
 assert.equal(zombieWave(1,3,3).super,0);assert.equal(zombieWave(1,4,3).super,1);
 assert.equal(zombieWave(1100,6,1).interval,15*60000);
 assert.equal(zombieStats('super',4).civilianDamage,3);
});
test('observed defensive fire changes path while walls remain impassable',()=>{
 const c=city(),from=idx(10,10),to=idx(20,10);
 const direct=zombiePath(c,from,to)!;
 const avoid=zombiePath(c,from,to,[{tile:idx(15,10),range:2,until:10000,dps:20}],25)!;
 assert.ok(avoid.length>direct.length);
 assert.ok(avoid.every(i=>Math.hypot(i%96-15,Math.floor(i/96)-10)>2));
 for(let y=0;y<96;y++)c.b[idx(12,y)]={k:'wall',lvl:1,doneAt:null};
 assert.equal(zombiePath(c,from,to),null);
});
test('idle recovery releases civilians after the last zombie disappears',()=>{
 const c=city();c.zombies!.nextAt=1e9;
 const p=c.people[0];p.vital={hp:80,last:0,paused:true,x:10.5,y:11.5,shelter:idx(10,11)};
 stepZombies(c,1000);
 assert.equal(p.vital.paused,false);assert.equal(p.vital.shelter,undefined);assert.equal(p.pos,idx(10,11));
});
test('five-minute first wave and minute warning survive save/reload replay',()=>{
 const a=city();a.people=[];a.pop=0;const b=structuredClone(a);
 for(let at=1000;at<=1200000;at+=1000)stepZombies(a,at);
 for(let at=1000;at<=240000;at+=1000)stepZombies(b,at);
 assert.notEqual(b.zombies!.warning,undefined);assert.equal(b.zombies!.actors.length,0);
 const loaded=JSON.parse(JSON.stringify(b));
 for(let at=241000;at<=1200000;at+=1000)stepZombies(loaded,at);
 assert.deepEqual(loaded.zombies,a.zombies);assert.equal(a.zombies!.report.waves,1);
});
test('PvP pause preserves remaining rescue and infection deadlines',()=>{
 const c=city();c.battleId='test';const p=c.people[0];p.vital={hp:0,last:1000,downAt:1000,infectedAt:1000,paused:true};
 c.zombies!.last=1000;const due=c.zombies!.nextAt;stepZombies(c,61000);
 assert.equal(p.vital.downAt,61000);assert.equal(p.vital.infectedAt,61000);assert.equal(c.zombies!.nextAt,due+60000);
});
test('destroyed buildings cannot heal on reload and training in their queue is lost',()=>{
 const c=city(),tile=idx(12,10);c.people=[];c.pop=0;c.army={};c.b={};c.b[tile]={k:'house',lvl:1,doneAt:null,zombieDamage:100000};c.queue=[{u:'club',source:tile,doneAt:100000}];
 c.zombies!.nextAt=1e9;c.zombies!.actors=[{id:1,kind:'breaker',hp:240,maxHp:240,x:11.5,y:10.5,era:5,until:100000,nextHit:0,repath:0}];
 stepZombies(c,1000);assert.equal(c.b[tile],undefined);assert.equal(c.queue.length,0);assert.equal(c.zombies!.report.destroyed,1);
 const loaded=JSON.parse(JSON.stringify(c));stepZombies(loaded,2000);assert.equal(loaded.b[tile],undefined);
});
test('rescue occupies the doctor, preserves the down deadline, and releases both on recovery',()=>{
 const c=city();c.zombies!.nextAt=1e9;c.b={};const clinic=idx(10,10);c.b[clinic]={k:'healer',lvl:1,doneAt:null};c.res.food=100;
 c.people=[{id:1,name:'Bệnh nhân',task:{t:'idle'},pos:idx(11,10),vital:{hp:0,last:1000,downAt:1000,paused:true,x:11.5,y:10.5}},{id:2,name:'Thầy thuốc',task:{t:'work',at:clinic},pos:clinic}];c.pop=2;
 stepZombies(c,2000);const patient=c.people[0],doctor=c.people[1];assert.ok(patient.vital!.care);assert.equal(doctor.vital!.rescuing,1);assert.equal(c.res.food,60);
 const end=patient.vital!.care!.end;
 for(let at=3000;at<=end+1000;at+=1000)stepZombies(c,at);
 assert.equal(c.people.length,2);assert.equal(patient.vital!.care,undefined);assert.equal(patient.vital!.downAt,undefined);assert.ok(patient.vital!.hp>=50);assert.equal(doctor.vital!.rescuing,undefined);assert.equal(doctor.vital!.paused,false);
});
test('defense observations are learned only from Industrial onward',()=>{
 for(const era of [4,5]){const c=city();c.era=era;c.people=[];c.pop=0;c.army={};c.b={};c.b[idx(15,10)]={k:'watchtower',lvl:1,doneAt:null};c.zombies!.nextAt=1e9;c.zombies!.actors=[{id:1,kind:'super',hp:160,maxHp:160,x:10.5,y:10.5,era,until:100000,nextHit:10000,repath:0}];stepZombies(c,1000);assert.equal((c.zombies!.actors[0].known??[]).length,era===5?1:0);}
});

test('six-hour pressure retains the population immediately before a later loss',()=>{
 const c=city();c.zombies!.population=1100;c.zombies!.peaks=[{at:0,pop:1100}];c.zombies!.last=7*3600000-1000;c.zombies!.nextAt=1e12;c.zombies!.healthAt=7*3600000;c.people=c.people.slice(0,1);
 stepZombies(c,7*3600000);assert.equal(zombiePressure(c,12*3600000),1100);assert.equal(zombiePressure(c,13*3600000+1000),1);
});

test('the warning reserves its tile against building even at tile zero',()=>{
 const c=city();c.zombies!.warning=0;assert.match(canPlace(c,derive(c),'hut',0,0)!,/zombie/);const logs=c.log.length;c.zombies!.nextAt=60000;stepZombies(c,1000);assert.equal(c.log.length,logs);
});
test('manual guard commands remain authoritative during a zombie wave',()=>{
 const c=city();c.people=[];c.pop=0;c.camp=idx(10,10);c.b={};c.b[idx(10,10)]={k:'barracks',lvl:1,doneAt:null};c.army={club:1};c.zombies!.nextAt=1e9;c.zombies!.actors=[{id:1,kind:'normal',hp:25,maxHp:25,x:80.5,y:80.5,era:1,until:100000,nextHit:10000,repath:0}];
 stepZombies(c,1000);assert.equal(applyAction(c,{type:'moveSoldier',id:'club:0',x:18,y:10},1000),null);stepZombies(c,2000);
 const rendered=homeSoldiers(c,2000)[0],commanded=homeSoldiers(c,2000,undefined,false)[0];assert.equal(rendered.x,commanded.x);assert.equal(rendered.y,commanded.y);assert.equal(c.zombies!.guards[0].anchor,idx(18,10));
});

test('PvP does not restore zombie damage on a surviving building',()=>{
 const c=city(),tile=idx(10,10);c.b[tile]={k:'house',lvl:1,doneAt:null,zombieDamage:40};const battle=createBattle({id:'zombie-hp',attackerId:'a',defenderId:'d',attacker:city(),defender:c,troops:{club:1},now:0});const b=battle.buildings.find(b=>b.tile===tile)!;assert.equal(b.hp,b.maxHp-40);
});
test('infection reduces actual gathering deliveries while preserving the old cargo flow',()=>{
 const healthy=city();healthy.b={};healthy.camp=idx(10,10);healthy.manualWorkforce=true;healthy.people=[{id:1,name:'Thợ',task:{t:'chop',at:idx(11,10)},pos:idx(10,10)}];healthy.pop=1;healthy.t[idx(11,10)]=F;healthy.res.wood=0;healthy.res.food=500;const sick=structuredClone(healthy);sick.people[0].vital={hp:100,infectedAt:1,last:0};
 settle(healthy,120000);settle(sick,120000);assert.ok(healthy.res.wood>sick.res.wood);assert.ok(sick.res.wood>0);
});

test('wave interval shrinks five minutes per whole week since activation, floored at fifteen',()=>{
 assert.equal(zombieWave(40,1,2,0).interval,60*60000);assert.equal(zombieWave(40,1,2,1).interval,55*60000);
 assert.equal(zombieWave(450,7,2,2).interval,30*60000);assert.equal(zombieWave(450,7,2,9).interval,15*60000);assert.equal(zombieWave(1100,7,2,3).interval,15*60000);
 assert.equal(zombieWeeks({activatedAt:1000},1000+7*24*3600000-1),0);assert.equal(zombieWeeks({activatedAt:1000},1000+7*24*3600000),1);
 // The interval is fixed when the wave spawns, from the activation timestamp alone.
 const c=city();c.people=c.people.slice(0,3);c.pop=3;const s=c.zombies!;const at=s.activatedAt+15*24*3600000;s.nextAt=at;s.last=at-1000;s.peaks=[{at:at-1000,pop:3}];s.population=3;
 const reloaded=JSON.parse(JSON.stringify(c));stepZombies(c,at);stepZombies(reloaded,at);
 assert.equal(c.zombies!.nextAt,at+50*60000);assert.deepEqual(reloaded.zombies,c.zombies);
});

test('legacy rollout starts in the present without retroactive waves and never resets an active village',async()=>{
 const {activateZombies}=await import('./zombies');
 const c=city();delete c.zombies;const activation=20*60000;
 activateZombies(c,activation);const original=structuredClone((c as City).zombies!);
 activateZombies(c,activation+60000,true);assert.deepEqual(c.zombies,original);
 settle(c,activation);assert.equal((c as City).zombies!.report.waves,0);assert.equal((c as City).zombies!.last,activation);assert.equal((c as City).zombies!.nextAt,activation+5*60000);
 stepZombies(c,activation+4*60000);assert.equal((c as City).zombies!.actors.length,0);assert.notEqual((c as City).zombies!.warning,undefined);
 stepZombies(c,activation+5*60000);assert.equal((c as City).zombies!.report.waves,1);
});
