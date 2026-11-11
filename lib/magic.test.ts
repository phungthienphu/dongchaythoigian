import test from 'node:test';
import assert from 'node:assert/strict';
import {applyAction,armyCap,buildMs,canPlace,derive,ERA_REQ,HOUR,idx,MIN,reqMet,RES,settle,stats,UNITS,type City,type Building} from './engine';
import {RELEASE_RULES} from './eras';
import {eraFixture,eraStaff} from './era-fixtures.test-utils';
import {initializeMagic,stepMagic,magicSiteId,deliverMagicSupply,pourFlask,pourDefenseFlask,returnFlask,type ManaFlask,mageAction,magicStructureDefense,zombieSlow} from './magic';
import {activateZombies,stepZombies,zombieCanEngage,type Zombie,type ZombieGuard} from './zombies';
import {advanceBattle,battleResult,createBattle} from './battle';
const RULES={maxEra:7};
/** Era 7 village with stores, a staffed university and one-minute-aligned magic. */
function era7(at=0):City{
 const c=eraFixture(6,at);c.era=7;c.b[idx(19,20)].lvl=7;initializeMagic(c,at);
 c.b[idx(17,20)]={k:'grandstore',lvl:1,doneAt:null};
 for(const r of RES)c.res[r]=5000;return c;
}
function place(c:City,k:Building['k'],x:number,y:number,staff=0){const tile=idx(x,y);c.b[tile]={k,lvl:1,doneAt:null,uid:c.magic!.nextUid++,builtAt:0};if(staff)eraStaff(c,tile,staff);return c.b[tile];}
function zombie(id:number,x:number,y:number):Zombie{return {id,kind:'normal',hp:90,maxHp:90,x:x+.5,y:y+.5,era:7,until:1e9,nextHit:1e9,repath:1e9};}
function zombies(c:City,actors:Zombie[]){activateZombies(c,0);const s=c.zombies!;s.nextAt=1e12;s.actors=actors;c.log=[];}

test('era 7 opens from either final wonder; hall 7 costs the spec price and eight hours',()=>{
 for(const wonder of ['dam','green'] as const){
  const c=eraFixture(6);c.b[idx(19,20)].lvl=6;eraStaff(c,c.camp,450);
  for(const r of RES)c.res[r]=ERA_REQ[7].cost[r]??0;for(let n=0;n<12;n++)c.b[idx(30+n,30)]={k:'grandstore',lvl:3,doneAt:null};
  assert.equal(reqMet(c,RULES),false);
  c.b[idx(40,40)]={k:wonder,lvl:1,doneAt:null};
  assert.equal(reqMet(c,RELEASE_RULES),false);assert.match(applyAction(c,{type:'advance'},c.last)!,/sắp ra mắt/);
  assert.equal(reqMet(c,RULES),true);assert.equal(applyAction(c,{type:'advance'},c.last,RULES),null);
  assert.equal(c.era,7);assert.ok(c.magic);assert.equal(c.res.coal,0);
  assert.ok(stats(c,derive(c),c.last).storage.aetherCrystal>=10000);
  for(const r of RES)c.res[r]=50000;
  const before={...c.res};assert.equal(applyAction(c,{type:'upgrade',x:19,y:20},c.last,RULES),null);
  assert.deepEqual({stone:before.stone-c.res.stone,copper:before.copper-c.res.copper,gold:before.gold-c.res.gold},{stone:25000,copper:10000,gold:4000});
  assert.equal(c.b[idx(19,20)].doneAt!-c.last,8*HOUR);assert.equal(buildMs('hall',7),8*HOUR);
 }
});

test('era 7 buildings stay locked in production rules and respect research and river placement',()=>{
 const c=era7(),D=derive(c);
 assert.match(canPlace(c,D,'aetherwell',30,30)!,/sắp ra mắt/);
 assert.equal(canPlace(c,D,'aetherwell',30,30,RULES),null);
 assert.match(canPlace(c,D,'manaspire',30,30,RULES)!,/Dẫn linh/);
 assert.match(canPlace(c,D,'rivershrine',30,30,RULES)!,/sông/);
 c.t[idx(31,30)]=3;assert.equal(canPlace(c,derive(c),'rivershrine',30,30,RULES),null);
 c.magic!.researched.push('conduction');assert.equal(canPlace(c,D,'manaspire',30,30,RULES),null);
 assert.match(canPlace(c,D,'awakeningtower',40,40,RULES)!,/550 dân/);
 assert.equal(applyAction(c,{type:'build',k:'aetherwell',x:30,y:32},0,RULES),null);assert.equal(c.b[idx(30,32)].uid,1);
});

test('aether well yields 240 mana/h up to 1200; the academy turns 6 runes and 20 mana into 24 knowledge',()=>{
 const c=era7(),well=place(c,'aetherwell',30,30,2),academy=place(c,'mageacademy',32,30,4);c.res.rune=100;
 stepMagic(c,MIN);assert.equal(deliverMagicSupply(c,idx(32,30),'rune',50),12);
 for(let at=2*MIN;at<=HOUR+MIN;at+=MIN)stepMagic(c,at);
 const m=c.magic!;assert.equal(m.network.bindings[magicSiteId(academy)].primary,magicSiteId(well));
 assert.ok(Math.abs(m.mana[magicSiteId(well)]-(244-20))<1e-6);assert.ok(Math.abs(m.knowledge-24)<1e-6);
 // The minute step never draws from village stock; only carriers fill buffers.
 assert.equal(c.res.rune,100);assert.ok(Math.abs(m.factories[magicSiteId(academy)].input.rune!-6)<1e-6);
 for(let at=HOUR+MIN;at<=8*HOUR;at+=MIN)stepMagic(c,at);
 assert.ok(m.mana[magicSiteId(well)]>1199&&m.mana[magicSiteId(well)]<=1200);
});

test('Linh quang pulses every ten seconds only with zombies within six tiles of the well, 2 mana for 20 damage and a 40% slow',()=>{
 const c=era7(),well=place(c,'aetherwell',30,30);stepMagic(c,MIN);const id=magicSiteId(well);c.magic!.mana[id]=10;
 const near=zombie(1,32,30),far=zombie(2,40,30);
 magicStructureDefense(c,9000,[near,far],[]);assert.equal(near.hp,90);
 magicStructureDefense(c,10000,[near,far],[]);assert.equal(near.hp,70);assert.equal(far.hp,90);assert.equal(c.magic!.mana[id],8);assert.equal(zombieSlow(near,11000),.4);
 magicStructureDefense(c,11000,[near,far],[]);assert.equal(near.hp,70);assert.equal(zombieSlow(near,14000),0);
 magicStructureDefense(c,20000,[far],[]);assert.equal(c.magic!.mana[id],8);
});

test('Hỏa trận hits at most six zombies for 40 each, one mana per hit, and stops when the source is empty',()=>{
 const c=era7(),well=place(c,'aetherwell',30,30),circle=place(c,'wardcircle',36,30);stepMagic(c,MIN);
 assert.equal(c.magic!.network.bindings[magicSiteId(circle)].primary,magicSiteId(well));
 const id=magicSiteId(well),actors=Array.from({length:8},(_,n)=>zombie(n+1,38+n%3,29+Math.floor(n/3)));
 c.magic!.mana[id]=100;magicStructureDefense(c,62000,actors,[]);
 assert.equal(actors.filter(z=>z.hp===50).length,6);assert.equal(c.magic!.mana[id],94);
 c.magic!.mana[id]=2;magicStructureDefense(c,64000,actors,[]);
 assert.equal(c.magic!.mana[id],0);assert.equal(actors.reduce((n,z)=>n+90-z.hp,0),6*40+2*40);
});

test('research queue pays atomically, needs academy and university, completes offline and can be cancelled',()=>{
 const c=era7();place(c,'mageacademy',32,30,4);c.magic!.knowledge=300;c.res.rune=100;
 assert.match(applyAction(c,{type:'magicResearch',key:'conduction'},0,RULES)!,/đại học/);
 c.b[idx(25,25)]={k:'university',lvl:1,doneAt:null};
 assert.match(applyAction(c,{type:'magicResearch',key:'conduction'},0,RELEASE_RULES)!,/sắp ra mắt/);
 assert.match(applyAction(c,{type:'magicResearch',key:'warcraft'},0,RULES)!,/tiền đề/);
 assert.equal(applyAction(c,{type:'magicResearch',key:'conduction'},0,RULES),null);assert.equal(c.magic!.knowledge,180);assert.equal(c.res.rune,70);
 assert.match(applyAction(c,{type:'magicResearch',key:'lifecraft'},0,RULES)!,/đang thực hiện/);
 settle(c,2*HOUR);assert.deepEqual(c.magic!.researched,['conduction']);
 assert.equal(applyAction(c,{type:'magicResearch',key:'warcraft'},2*HOUR,RULES),null);const rune=c.res.rune;
 assert.equal(applyAction(c,{type:'cancelMagicResearch'},2*HOUR,RULES),null);assert.equal(c.res.rune,rune+25);assert.equal(c.magic!.research,undefined);
});

test('mages need research, academy space and mana paid once at the start of training',()=>{
 const c=era7(),well=place(c,'aetherwell',30,30),academy=place(c,'mageacademy',32,30);c.b[idx(10,10)]={k:'barracks',lvl:1,doneAt:null};stepMagic(c,MIN);
 assert.equal(armyCap(c),50+12);
 assert.match(applyAction(c,{type:'train',u:'firemage',n:2},MIN,RULES)!,/Chiến pháp/);
 c.magic!.researched.push('conduction','warcraft');const id=magicSiteId(well);c.magic!.mana[id]=70;const before=structuredClone(c);
 assert.match(applyAction(c,{type:'train',u:'firemage',n:2},MIN,RULES)!,/mana/);assert.deepEqual(c.res,before.res);assert.equal(c.magic!.mana[id],70);
 c.magic!.mana[id]=100;const res={...c.res};
 assert.equal(applyAction(c,{type:'train',u:'firemage',n:2},MIN,RULES),null);
 assert.equal(c.magic!.mana[id],20);assert.equal(res.aetherCrystal-c.res.aetherCrystal,40);assert.equal(res.rune-c.res.rune,20);assert.equal(res.food-c.res.food,400);
 assert.ok(c.queue.every(q=>q.source===idx(32,30)));assert.match(applyAction(c,{type:'train',u:'firemage',n:1},MIN,RELEASE_RULES)!,/sắp ra mắt/);
 settle(c,MIN+20*MIN);assert.equal(c.army.firemage,2);void academy;
});

test('mage spells: fireball splash and water heal cast from a nearby source, then wait for cooldown',()=>{
 const c=era7(),well=place(c,'aetherwell',30,30);stepMagic(c,MIN);const id=magicSiteId(well);c.magic!.mana[id]=100;
 const mage:ZombieGuard={id:'firemage:0',u:'firemage',x:31.5,y:30.5,hp:110,nextHit:0,anchor:idx(31,30)};
 const target=zombie(1,35,30),side=zombie(2,36,30),far=zombie(3,39,30);
 assert.equal(mageAction(c,mage,target,MIN,[target,side,far],[mage]),true);
 assert.deepEqual([target.hp,side.hp,far.hp],[0,45,90]);// 90 at the target, 45 splash (cân bằng 11/11)assert.equal(c.magic!.mana[id],70);
 assert.equal(mageAction(c,mage,target,MIN+1000,[target,side,far],[mage]),false);
 const healer:ZombieGuard={id:'watermage:0',u:'watermage',x:31.5,y:31.5,hp:130,nextHit:0,anchor:idx(31,31)},hurt:ZombieGuard={...mage,id:'firemage:1',hp:40};
 assert.equal(mageAction(c,healer,undefined,MIN,[],[healer,hurt]),true);assert.equal(hurt.hp,120);assert.equal(c.magic!.mana[id],45);
 c.magic!.mana[id]=0;const away:ZombieGuard={...mage,id:'firemage:2',castAt:0};assert.equal(mageAction(c,away,target,MIN,[target],[away]),false);
});

test('zombies engage flying units in melee exactly like ground units',()=>{
 assert.equal(zombieCanEngage({flying:true},1.1),true);assert.equal(zombieCanEngage({flying:true},2),true);assert.equal(zombieCanEngage({},2.5),false);
 const original=UNITS.firemage;(UNITS as Record<string,unknown>).firemage={...original,flying:true};
 try{
  const c=era7();c.people=[];c.pop=0;c.camp=idx(10,10);c.b={[idx(10,10)]:{k:'barracks',lvl:1,doneAt:null}};c.army={firemage:1};
  zombies(c,[]);stepZombies(c,1000);const guard=c.zombies!.guards[0]??{x:11.5,y:10.5};
  c.zombies!.actors=[{...zombie(1,0,0),x:guard.x+.5,y:guard.y,nextHit:0}];
  for(let at=2000;at<=6000;at+=1000)stepZombies(c,at);
  assert.ok(c.zombies!.guards[0].hp<UNITS.firemage.hp);
 }finally{(UNITS as Record<string,unknown>).firemage=original;}
});

test('PvP uses the same per-hit mage damage as the village (DPS × interval)',()=>{
 assert.equal(UNITS.firemage.atk*UNITS.firemage.attackMs!/1000,24);assert.equal(UNITS.watermage.atk*UNITS.watermage.attackMs!/1000,12);
 const town=()=>{const c=era7();c.b={'4658':{k:'hut',lvl:1,doneAt:null}};c.camp=4658;c.army={};c.pop=20;return c;};
 const defender=town();defender.army={club:10};
 const s=createBattle({id:'mage',attackerId:'a',defenderId:'d',attacker:town(),defender,troops:{firemage:1},now:0});
 const mage=s.groups.find(g=>g.u==='firemage')!,guards=s.groups.find(g=>g.side==='defender')!;mage.x=guards.x+3;mage.y=guards.y;const hp=guards.hp;
 advanceBattle(s,1000);assert.equal(hp-guards.hp,24);
});

test('purification and gardens act at minute boundaries from bound sources',()=>{
 const c=era7(),well=place(c,'aetherwell',30,30);c.t[idx(31,31)]=3;place(c,'rivershrine',31,30);const clinic=idx(33,32);c.b[clinic]={k:'healer',lvl:1,doneAt:null};
 const garden=place(c,'spiritgarden',32,32,3);c.magic!.researched.push('conduction','lifecraft');
 stepMagic(c,MIN);c.magic!.mana[magicSiteId(well)]=200;
 c.people.push({id:900,name:'A',task:{t:'idle'},pos:idx(30,31),vital:{hp:100,last:0,infectedAt:1}},{id:901,name:'B',task:{t:'idle'},pos:idx(29,31),vital:{hp:100,last:0,infectedAt:1}});
 stepMagic(c,2*MIN);
 assert.equal(c.people.filter(p=>p.vital?.infectedAt!==undefined).length,0);assert.equal(c.magic!.cooldowns.purify,2*MIN+20*MIN);
 assert.deepEqual(c.magic!.boosted,[clinic]);void garden;
});

test('online and split/reloaded settlement agree with mana, research and zombie waves',()=>{
 const a=era7();a.b[idx(25,25)]={k:'university',lvl:1,doneAt:null};place(a,'aetherwell',30,30,2);place(a,'mageacademy',32,30,4);place(a,'wardcircle',30,33);
 eraStaff(a,a.camp,20);a.res.rune=200;a.magic!.knowledge=200;
 activateZombies(a,0);a.zombies!.nextAt=20*MIN;a.zombies!.warning=idx(31,35);// first wave rises inside the ward circle's reach
 assert.equal(applyAction(a,{type:'magicResearch',key:'conduction'},0,RULES),null);
 let b=JSON.parse(JSON.stringify(a)) as City;
 settle(a,3*HOUR);
 for(let at=7*MIN+311;at<3*HOUR;at+=7*MIN+311){settle(b,at);b=JSON.parse(JSON.stringify(b));}
 settle(b,3*HOUR);
 assert.ok(a.zombies!.report.waves>=1);assert.ok(a.zombies!.report.killed>=1);assert.ok(a.magic!.mana.m1<3*240-3*20);assert.deepEqual(a.magic!.researched,['conduction']);assert.ok(a.magic!.knowledge>200-120);
 assert.deepEqual(b.magic,a.magic);assert.deepEqual(b.zombies,a.zombies);assert.deepEqual(b.res,a.res);assert.deepEqual(b.people,a.people);
});

test('carriers walk runes and crystals from the store into academy and spire buffers; loads in transit reserve space',()=>{
 const c=era7();c.magic!.researched.push('conduction');place(c,'aetherwell',26,22,2);const academy=place(c,'mageacademy',24,20,4),spire=place(c,'manaspire',24,23,2);
 c.res.rune=100;c.res.aetherCrystal=100;let carried=0;
 for(let at=10_000;at<=HOUR;at+=10_000){settle(c,at);const m=c.magic!;
  for(const [site,tile,r,cap] of [[academy,idx(24,20),'rune',12],[spire,idx(24,23),'aetherCrystal',12]] as const){
   const f=m.factories[magicSiteId(site)];if(!f)continue;const transit=c.people.reduce((n,p)=>n+(p.haul?.supply===tile&&p.haul.resource===r?p.haul.carried||p.haul.capacity:0),0);
   if(transit)carried++;assert.ok((f.input[r]??0)+transit<=cap+1e-9);
  }}
 const m=c.magic!,a=m.factories[magicSiteId(academy)].input.rune!,s=m.factories[magicSiteId(spire)].input.aetherCrystal!;
 assert.ok(carried>0);assert.ok(a>0&&s>0);
 const inHand=(r:string)=>c.people.reduce((n,p)=>n+(p.haul?.resource===r?p.haul.carried:0),0);
 // Conservation: stock + buffer + cargo + what the buildings consumed equals the start.
 assert.ok(Math.abs(c.res.rune+a+inHand('rune')+m.knowledge/4-100)<1e-6);
 assert.ok(c.res.aetherCrystal+s+inHand('aetherCrystal')<100);
});

test('mana flasks: up to 100 per mage from the chosen source; only unused mana returns, up to free space',()=>{
 const c=era7(),well=place(c,'aetherwell',30,30);stepMagic(c,MIN);const id=magicSiteId(well);c.magic!.mana[id]=150;
 assert.match(pourFlask(c,{firemage:2},idx(31,30)) as string,/giếng/);assert.match(pourFlask(c,{club:2},idx(30,30)) as string,/pháp sư/);
 const flask=pourFlask(c,{firemage:1,watermage:1,club:5},idx(30,30)) as ManaFlask;
 assert.deepEqual(flask,{mana:150,from:{[id]:150}});assert.equal(c.magic!.mana[id],0);
 assert.equal(returnFlask(c,flask,999),150);assert.equal(c.magic!.mana[id],150);// never more than poured
 c.magic!.mana[id]=1150;assert.equal(returnFlask(c,flask,80),50);assert.equal(c.magic!.mana[id],1200);// capped by free space
 c.army={firemage:3};c.magic!.mana[id]=500;const home=pourDefenseFlask(c)!;assert.equal(home.mana,300);assert.equal(c.magic!.mana[id],200);
});

test('PvP Hỏa cầu and Thủy hồi spend squad flask mana with village cooldowns; fallen mages lose their flask',()=>{
 const town=()=>{const c=era7();c.b={'4658':{k:'hut',lvl:1,doneAt:null}};c.camp=4658;c.army={};c.pop=20;return c;};
 const defender=town();defender.army={club:10,spear:10};
 const s=createBattle({id:'fire',attackerId:'a',defenderId:'d',attacker:town(),defender,troops:{firemage:1},now:0,attackerFlask:100});
 const mage=s.groups.find(g=>g.u==='firemage')!,clubs=s.groups.find(g=>g.u==='club')!,spears=s.groups.find(g=>g.u==='spear')!;
 s.groups=[mage,clubs,spears];for(const g of [clubs,spears]){g.count=10;g.hp=10*UNITS[g.u].hp;}
 assert.equal(mage.flask,100);mage.x=clubs.x+3;mage.y=clubs.y;spears.x=clubs.x;spears.y=clubs.y+1;const c0=clubs.hp,s0=spears.hp;
 // One cast hits one unit per squad: a 20 HP club absorbs 20 of the 90, a 40 HP spear 40 of the 45.
 advanceBattle(s,100);assert.equal(c0-clubs.hp,20);assert.equal(s0-spears.hp,40);assert.equal(mage.flask,70);
 mage.x=clubs.x+3;mage.y=clubs.y;spears.x=clubs.x;spears.y=clubs.y+2;advanceBattle(s,2100);assert.equal(c0-clubs.hp,44);assert.equal(mage.flask,70);// basic attack while the spell cools down
 assert.equal(battleResult({...s,status:'finished',winner:'attacker'})!.flask!.attacker,70);
 const healer=createBattle({id:'water',attackerId:'a',defenderId:'d',attacker:town(),defender:town(),troops:{watermage:2,club:10},now:0,attackerFlask:150});
 const water=healer.groups.find(g=>g.u==='watermage')!,friends=healer.groups.find(g=>g.side==='attacker'&&g.u==='club')!;
 assert.equal(water.flask,150);
 friends.x=water.x;friends.y=water.y;friends.hp-=40;advanceBattle(healer,100);assert.equal(water.flask,150);// under 50 missing: no cast
 friends.hp-=60;advanceBattle(healer,200);assert.equal(friends.hp,200);assert.equal(water.flask,100);
 friends.hp-=60;advanceBattle(healer,2300);assert.equal(water.flask,100);// 25 s cooldown per caster
 const foe=town();foe.army={sword:40};
 const lone=createBattle({id:'loss',attackerId:'a',defenderId:'d',attacker:town(),defender:foe,troops:{firemage:2},now:0,attackerFlask:200});
 const pair=lone.groups[0],swords=lone.groups.find(g=>g.u==='sword')!;lone.groups=[pair,swords];swords.count=40;swords.hp=40*70;swords.x=pair.x+.5;swords.y=pair.y;
 for(let at=100;pair.count===2&&at<20000;at+=100)advanceBattle(lone,at);
 assert.equal(pair.count,1);assert.ok(pair.flask!<=100);
});
