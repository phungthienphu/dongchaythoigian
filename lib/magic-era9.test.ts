import test from 'node:test';
import assert from 'node:assert/strict';
import {applyAction,armyCap,buildMs,canPlace,derive,ENGINE_MAX_ERA,ERA_REQ,HOUR,idx,levelCost,MIN,reqMet,RES,settle,stats,UNITS,type City,type Building} from './engine';
import {RELEASE_RULES} from './eras';
import {eraFixture,eraStaff} from './era-fixtures.test-utils';
import {initializeMagic,stepMagic,magicSiteId,deliverMagicSupply,magicStructureDefense} from './magic';
import {careCapacity,patrolReach,guardDamageScale,eyeActive,PACKAGE_TTL} from './magic-myth';
import {activateZombies,stepZombies,type Zombie,type ZombieGuard} from './zombies';
const RULES={maxEra:9};
const SEC=1000;
function era9(at=0):City{
 const c=eraFixture(6,at);c.era=9;c.b[idx(19,20)].lvl=9;initializeMagic(c,at);
 c.b[idx(17,20)]={k:'grandstore',lvl:1,doneAt:null};c.magic!.researched.push('conduction','warcraft','lifecraft','elements','pact','gatecraft');
 for(const r of RES)c.res[r]=9000;return c;
}
function place(c:City,k:Building['k'],x:number,y:number,staff=0){const tile=idx(x,y);c.b[tile]={k,lvl:1,doneAt:null,uid:c.magic!.nextUid++,builtAt:0};if(staff)eraStaff(c,tile,staff);return c.b[tile];}
const id=(b:Building)=>magicSiteId(b);
function zombie(n:number,x:number,y:number,hp=90):Zombie{return {id:n,kind:'normal',hp,maxHp:hp,x:x+.5,y:y+.5,era:9,until:1e12,nextHit:1e12,repath:1e12};}
/** Three wells, the four seal stations and the era 9 service buildings around them. */
function cluster(c:City){
 const wells=[[30,30],[30,34],[30,38]].map(([x,y])=>place(c,'aetherwell',x,y));
 const stations=([['firealtar',32,30],['watertemple',32,32],['woodgrove',32,34],['earthtemple',32,36]] as const).map(([k,x,y])=>place(c,k,x,y,3));
 const gate=place(c,'spiritgate',34,32),matrix=place(c,'worldmatrix',34,34),altar=place(c,'covenantaltar',34,36);
 stepMagic(c,MIN);for(const w of wells)c.magic!.mana[id(w)]=1200;
 for(const [x,y]of [[32,30],[32,32],[32,34],[32,36]])deliverMagicSupply(c,idx(x,y),'essence',4);
 stepMagic(c,2*MIN);return {wells,stations,gate,matrix,altar};
}
const tileOf=(c:City,b:Building)=>+Object.keys(c.b).find(k=>c.b[k]===b)!;

test('era 9 needs Đại Trận Tứ Linh, hall 8 and 850 people; hall 9 costs 60k stone… 200 essence and 18 h',()=>{
 assert.equal(ENGINE_MAX_ERA,9);
 const c=eraFixture(6);c.era=8;c.b[idx(19,20)].lvl=8;initializeMagic(c,0);eraStaff(c,c.camp,850);
 for(let n=0;n<14;n++)c.b[idx(30+n,30)]={k:'grandstore',lvl:3,doneAt:null};
 for(const r of RES)c.res[r]=ERA_REQ[9].cost[r]??0;
 assert.equal(reqMet(c,RULES),false);c.b[idx(40,40)]={k:'fourspirits',lvl:1,doneAt:null,uid:99};
 assert.equal(reqMet(c,RELEASE_RULES),false);assert.equal(reqMet(c,{maxEra:8}),false);assert.equal(reqMet(c,RULES),true);
 assert.equal(applyAction(c,{type:'advance'},c.last,RULES),null);assert.equal(c.era,9);
 assert.ok(stats(c,derive(c),c.last).storage.celestialStone>=10000);
 assert.deepEqual(levelCost('hall',9),{stone:60000,copper:20000,gold:10000,essence:200});assert.equal(buildMs('hall',9),18*HOUR);
 const young=era9();young.era=8;assert.equal(stats(young,derive(young),0).storage.celestialStone,0);
 assert.match(canPlace(young,derive(young),'observatory',40,40,RULES)!,/thời|Chưa/);
 assert.match(applyAction(era9(),{type:'magicDomain',domain:'river'},0,{maxEra:8})!,/sắp ra mắt/);
});

test('celestial forge: needs a production complex, 180 copper + 12 essence + 12 runes + 60 mana per 24 stones',()=>{
 const c=era9(),well=place(c,'aetherwell',24,24);c.res.celestialStone=0;c.res.copper=3000;c.res.essence=300;c.res.rune=300;
 place(c,'celestialforge',24,22,8);stepMagic(c,MIN);const m=c.magic!;m.mana[id(well)]=2000;
 settle(c,3*HOUR);assert.equal(c.res.celestialStone,0);assert.equal(c.res.copper,3000);// no complex: recipe stops
 place(c,'complex',26,22);settle(c,8*HOUR);
 const made=c.res.celestialStone+c.people.reduce((n,p)=>n+(p.haul?.resource==='celestialStone'?p.haul.carried:0),0);
 assert.ok(made>=20,`made ${made}`);
 assert.ok(Math.abs((3000-c.res.copper)-made*7.5)<1e-6);assert.ok(Math.abs((300-c.res.essence)-made/2)<1e-6);assert.ok(Math.abs((300-c.res.rune)-made/2)<1e-6);
 assert.ok(Math.abs(2000-m.mana[id(well)]-made*2.5)<1e-6);
});

test('Thiên nhãn: a staffed observatory with Khai giới pays 20 mana/h and warns 180 s before a wave',()=>{
 const run=(eye:boolean)=>{const c=era9(),well=place(c,'aetherwell',24,24);if(eye)place(c,'observatory',26,24,4);
  stepMagic(c,MIN);c.magic!.mana[id(well)]=1000;activateZombies(c,0);c.zombies!.nextAt=20*MIN;
  settle(c,20*MIN-170*SEC);return c;};
 const seen=run(true),blind=run(false);
 assert.equal(eyeActive(seen),true);assert.notEqual(seen.zombies!.warning,undefined);assert.equal(blind.zombies!.warning,undefined);
 const well=Object.values(seen.b).find(b=>b.k==='aetherwell')!;assert.ok(Math.abs(1000-seen.magic!.mana[id(well)]-20*(20*MIN-170*SEC-MIN)/HOUR)<1);
 const c=era9();c.magic!.researched=c.magic!.researched.filter(r=>r!=='gatecraft');const w=place(c,'aetherwell',24,24),o=place(c,'observatory',26,24,4);
 stepMagic(c,MIN);c.magic!.mana[id(w)]=1000;stepMagic(c,2*MIN);assert.match(c.magic!.factories[id(o)].blocked!,/Khai giới/);assert.equal(eyeActive(c),false);
});

test('contracts: one research at the covenant altar; beasts need the gate seals, the contract and beast slots (max 2)',()=>{
 const c=era9(),{gate,altar}=cluster(c);place(c,'mageacademy',36,30,4);c.magic!.knowledge=2000;
 assert.deepEqual(c.magic!.seals![id(gate)],['earth','water']);
 assert.match(applyAction(c,{type:'train',u:'dragon',n:1},2*MIN,RULES)!,/khế ước Long/);
 const res={...c.res};assert.equal(applyAction(c,{type:'magicResearch',key:'dragonPact'},2*MIN,RULES),null);
 assert.deepEqual([res.celestialStone-c.res.celestialStone,res.essence-c.res.essence],[100,60]);
 assert.match(applyAction(c,{type:'magicResearch',key:'phoenixPact'},2*MIN,RULES)!,/đang thực hiện|một khế ước/);
 settle(c,2*MIN+4*HOUR);assert.equal(c.magic!.contract!.active,'dragon');
 assert.match(applyAction(c,{type:'magicResearch',key:'phoenixPact'},c.last,RULES)!,/một khế ước/);
 assert.ok(armyCap(c)>=36);
 for(const w of Object.values(c.b))if(w.k==='aetherwell')c.magic!.mana[id(w)]=1200;
 assert.equal(applyAction(c,{type:'train',u:'tortoise',n:1},c.last,RULES)!.includes('Quy'),true);
 c.res.food=9000;assert.equal(applyAction(c,{type:'train',u:'dragon',n:1},c.last,RULES),null,'first dragon');
 assert.equal(applyAction(c,{type:'train',u:'dragon',n:1},c.last,RULES),null,'second dragon');
 assert.match(applyAction(c,{type:'train',u:'dragon',n:1},c.last,RULES)!,/thần thú/);
 // Without the altar no beast slots exist.
 const altarTile=tileOf(c,altar);c.b[altarTile].burned=true;assert.match(applyAction(c,{type:'train',u:'dragon',n:1},c.last,RULES)!,/Đài khế ước/);delete c.b[altarTile].burned;
 settle(c,c.last+5*HOUR);assert.equal(c.army.dragon,2);
});

test('contract switch: recall beasts first, then 12 h + 200 stones + 100 essence with no contract meanwhile',()=>{
 const c=era9();cluster(c);c.magic!.contract={active:'dragon'};c.army={dragon:1};
 assert.match(applyAction(c,{type:'magicContract',contract:'phoenix'},3*MIN,RULES)!,/Thu hồi/);
 assert.equal(applyAction(c,{type:'releaseTroops',mode:'expel',units:{dragon:1}},3*MIN,RULES),null);
 c.res.celestialStone=150;assert.match(applyAction(c,{type:'magicContract',contract:'phoenix'},3*MIN,RULES)!,/200 thiên thạch/);c.res.celestialStone=9000;
 const res={...c.res};assert.equal(applyAction(c,{type:'magicContract',contract:'phoenix'},3*MIN,RULES),null);
 assert.deepEqual([res.celestialStone-c.res.celestialStone,res.essence-c.res.essence],[200,100]);
 assert.equal(c.magic!.contract!.active,undefined);assert.match(applyAction(c,{type:'train',u:'phoenix',n:1},3*MIN,RULES)!,/khế ước Phượng/);
 for(let at=4*MIN;at<3*MIN+12*HOUR;at+=MIN)stepMagic(c,at);assert.equal(c.magic!.contract!.active,undefined);
 stepMagic(c,3*MIN+12*HOUR+MIN);assert.equal(c.magic!.contract!.active,'phoenix');
});

test('zombies bite flying dragons and phoenixes in melee; dragon hits three, tortoise covers 15%, phoenix heals',()=>{
 const c=era9();c.people=[];c.pop=0;c.camp=idx(10,10);c.b={[idx(10,10)]:{k:'barracks',lvl:1,doneAt:null}};c.army={dragon:1,phoenix:1,tortoise:1,club:1};
 activateZombies(c,0);c.zombies!.nextAt=1e12;c.zombies!.actors=[{...zombie(9,80,80),nextHit:0}];stepZombies(c,1000);
 const g=(u:string)=>c.zombies!.guards.find(x=>x.u===u)!;const dragon=g('dragon'),phoenix=g('phoenix'),tortoise=g('tortoise'),club=g('club');
 assert.deepEqual([dragon.hp,phoenix.hp],[2000,1600]);
 dragon.x=40.5;dragon.y=40.5;phoenix.x=60.5;phoenix.y=60.5;tortoise.x=20.5;tortoise.y=20.5;club.x=5.5;club.y=80.5;
 c.zombies!.actors=[{...zombie(1,0,0,5000),x:41.2,y:40.5,nextHit:0},{...zombie(2,0,0,5000),x:61.2,y:60.5,nextHit:0},{...zombie(3,0,0,200),x:43.5,y:40.5},{...zombie(4,0,0,200),x:44.5,y:40.5},{...zombie(5,0,0,200),x:44.5,y:41.5}];
 for(let at=2000;at<=8000;at+=1000)stepZombies(c,at);
 assert.ok(dragon.hp<2000,'zombie must hit a flying dragon');assert.ok(phoenix.hp<1600,'zombie must hit a flying phoenix');
 const splashed=c.zombies!.actors.filter(z=>z.id>=3&&z.hp<200).length;assert.equal(splashed,2);// two secondaries per breath, the third spared
 // Tortoise cover and the 30% cap.
 const ally:ZombieGuard={id:'club:9',u:'club',x:20.5,y:21.5,hp:100,nextHit:0,anchor:0},turtle:ZombieGuard={...tortoise,x:20.5,y:20.5},deer:ZombieGuard={id:'spiritdeer:0',u:'spiritdeer',x:21.5,y:21.5,hp:350,nextHit:0,anchor:0};
 assert.equal(guardDamageScale(c,[turtle,ally],ally,0),.85);
 c.magic!.mythEffects=[{id:1,kind:'sanctuary',x:20.5,y:21.5,start:0,until:15000}];
 assert.equal(guardDamageScale(c,[turtle,ally,deer],ally,1000),.7);assert.equal(guardDamageScale(c,[ally],ally,1000),.75);
 assert.equal(guardDamageScale(c,[ally],ally,15000),1);
 // Phoenix: every 10 s, +60 HP to up to four wounded allies within three tiles (a sword tops out at 70).
 const bird:ZombieGuard={id:'phoenix:5',u:'phoenix',x:50.5,y:50.5,hp:800,nextHit:0,anchor:0},hurt=[0,1,2,3,4].map(n=>({id:`sword:${n+20}`,u:'sword' as const,x:50.5+n*.3,y:51.5,hp:10,nextHit:0,anchor:0}));
 magicStructureDefense(c,19_000,[],[bird,...hurt]);assert.equal(hurt.filter(h=>h.hp===70).length,0);
 magicStructureDefense(c,20_000,[],[bird,...hurt]);assert.equal(hurt.filter(h=>h.hp===70).length,4,JSON.stringify(hurt.map(h=>h.hp)));
});

test('spell packages: seals, 2 per village, 24 h expiry without refund, lost with the matrix; Thiên lôi warns 5 s then strikes 6',()=>{
 const c=era9(),{matrix}=cluster(c),m=c.magic!;
 const res={...c.res};assert.equal(applyAction(c,{type:'magicPrepare',spell:'thunder'},2*MIN,RULES),null);
 assert.equal(res.celestialStone-c.res.celestialStone,10);assert.equal(m.packages!.length,1);
 assert.equal(applyAction(c,{type:'magicPrepare',spell:'sanctuary'},2*MIN,RULES),null);
 assert.match(applyAction(c,{type:'magicPrepare',spell:'thunder'},2*MIN,RULES)!,/Tối đa 2/);
 // Expiry after 24 h, no refund.
 const stone=c.res.celestialStone;for(let at=3*MIN;at<2*MIN+PACKAGE_TTL;at+=HOUR)stepMagic(c,at);assert.equal(m.packages!.length,2);
 stepMagic(c,2*MIN+PACKAGE_TTL);assert.equal(m.packages!.length,0);assert.equal(c.res.celestialStone,stone);
 // A fresh package is lost when the matrix is destroyed.
 const e=era9(),lost=cluster(e);assert.equal(applyAction(e,{type:'magicPrepare',spell:'thunder'},2*MIN,RULES),null);
 delete e.b[tileOf(e,lost.matrix)];stepMagic(e,3*MIN);assert.equal(e.magic!.packages!.length,0);void matrix;
 // Thiên lôi in a zombie wave.
 const d=era9();cluster(d);assert.equal(applyAction(d,{type:'magicPrepare',spell:'thunder'},2*MIN,RULES),null);assert.equal(applyAction(d,{type:'magicPrepare',spell:'thunder'},2*MIN,RULES),null);
 activateZombies(d,0);d.zombies!.index=7;
 const horde=Array.from({length:8},(_,n)=>zombie(n+1,60+n%3*.4,60+Math.floor(n/3)*.4,400));
 magicStructureDefense(d,200_000,horde.slice(0,3),[]);assert.equal(d.magic!.packages!.length,2);// three are not enough
 magicStructureDefense(d,201_000,horde,[]);assert.equal(d.magic!.packages!.length,1);assert.equal(d.magic!.mythEffects!.length,1);
 for(let at=202_000;at<206_000;at+=1000)magicStructureDefense(d,at,horde,[]);assert.ok(horde.every(z=>z.hp===400));
 magicStructureDefense(d,206_000,horde,[]);assert.equal(horde.filter(z=>z.hp===220).length,6);assert.equal(d.magic!.packages!.length,1);// one per wave
 d.zombies!.index=8;magicStructureDefense(d,207_000,horde,[]);assert.equal(d.magic!.packages!.length,0);
});

test('Hộ giới: four guards below half HP open a 4-tile ward for 15 s',()=>{
 const c=era9();cluster(c);assert.equal(applyAction(c,{type:'magicPrepare',spell:'sanctuary'},2*MIN,RULES),null);activateZombies(c,0);
 const guards=[0,1,2,3].map(n=>({id:`club:${n}`,u:'club' as const,x:50.5+n,y:50.5,hp:UNITS.club.hp*.4,nextHit:0,anchor:0}));
 magicStructureDefense(c,300_000,[zombie(1,70,70)],guards.slice(0,3));assert.equal(c.magic!.packages!.length,1);
 magicStructureDefense(c,301_000,[zombie(1,70,70)],guards);assert.equal(c.magic!.packages!.length,0);
 assert.equal(guardDamageScale(c,guards,guards[0],310_000),.75);assert.equal(guardDamageScale(c,guards,guards[0],316_000),1);
});

test('teleport docks: paired, ≤60 goods in 30 s for 20 mana + 1 rune, 2 min cooldown; a lost destination sends goods home',()=>{
 const setup=()=>{const c=era9(),w1=place(c,'aetherwell',30,30),w2=place(c,'aetherwell',60,60);const a=place(c,'teleportdock',32,30),b=place(c,'teleportdock',62,60),academy=place(c,'mageacademy',64,60);
  stepMagic(c,MIN);c.magic!.mana[id(w1)]=500;c.magic!.mana[id(w2)]=500;c.res.rune=1000;
  assert.equal(applyAction(c,{type:'magicDockPair',x:32,y:30,to:idx(62,60)},MIN,RULES),null);return {c,w1,a,b,academy};};
 {const {c,w1,academy}=setup();
  assert.match(applyAction(c,{type:'magicTeleport',x:32,y:30,resource:'rune',amount:61},MIN,RULES)!,/không hợp lệ|1–60/);
  assert.equal(applyAction(c,{type:'magicTeleport',x:32,y:30,resource:'rune',amount:30},MIN,RULES),null);
  assert.equal(c.res.rune,969);assert.equal(c.magic!.mana[id(w1)],480);
  assert.match(applyAction(c,{type:'magicTeleport',x:32,y:30,resource:'rune',amount:10},MIN+10*SEC,RULES)!,/hồi/);
  settle(c,MIN+29*SEC);assert.equal(c.magic!.shipments!.length,1);
  settle(c,MIN+30*SEC);assert.equal(c.magic!.shipments!.length,0);
  assert.equal(c.magic!.factories[id(academy)].input.rune,12,JSON.stringify(c.magic!.factories[id(academy)]));assert.equal(c.res.rune,969+18);
  assert.equal(applyAction(c,{type:'magicTeleport',x:32,y:30,resource:'rune',amount:10},3*MIN+SEC,RULES),null);}
 {const {c,b}=setup();assert.equal(applyAction(c,{type:'magicTeleport',x:32,y:30,resource:'wood',amount:60},MIN,RULES),null);
  const wood=c.res.wood;delete c.b[tileOf(c,b)];// destination destroyed mid-transfer
  c.b[idx(62,60)]={k:'teleportdock',lvl:1,doneAt:null,uid:c.magic!.nextUid++,builtAt:0};// a rebuild on the same tile never receives it
  settle(c,MIN+30*SEC);assert.ok(Math.abs(c.res.wood-(wood+60))<1);assert.ok(c.log.some(l=>/quay về bến gốc/.test(l.msg)));}
 {const {c,a,b}=setup();assert.equal(applyAction(c,{type:'magicTeleport',x:32,y:30,resource:'wood',amount:60},MIN,RULES),null);
  const wood=c.res.wood;delete c.b[tileOf(c,a)];delete c.b[tileOf(c,b)];settle(c,MIN+30*SEC);
  assert.ok(Math.abs(c.res.wood-wood)<1);assert.equal(c.log.filter(l=>/mất kiện/.test(l.msg)).length,1);}
});

test('Thiên Cung needs hall 9, 950 people, a contract, an active gate and matrix; domains switch in 6 h without stacking',()=>{
 const c=era9();cluster(c);
 assert.match(canPlace(c,derive(c),'riverpalace',40,40,RULES)!,/950 dân/);eraStaff(c,c.camp,950);
 assert.match(canPlace(c,derive(c),'riverpalace',40,40,RULES)!,/khế ước/);c.magic!.contract={active:'tortoise'};
 for(const r of RES)c.res[r]=0;c.res.stone=100000;c.res.copper=35000;c.res.gold=25000;c.res.rune=1000;c.res.essence=800;c.res.celestialStone=1000;
 for(let n=0;n<12;n++)c.b[idx(50+n,10)]={k:'grandstore',lvl:3,doneAt:null};
 assert.equal(canPlace(c,derive(c),'riverpalace',40,40,RULES),null);
 c.b[idx(19,20)].lvl=8;assert.match(canPlace(c,derive(c),'riverpalace',40,40,RULES)!,/Đình làng cấp 9/);c.b[idx(19,20)].lvl=9;
 for(const r of RES)c.res[r]=9000;
 const palace=place(c,'riverpalace',30,32);stepMagic(c,3*MIN);
 assert.equal(careCapacity(c,4),4);assert.equal(applyAction(c,{type:'magicDomain',domain:'river'},3*MIN,RULES),null);
 stepMagic(c,4*MIN);assert.equal(c.magic!.factories[id(palace)].blocked,undefined);assert.equal(careCapacity(c,4),6);assert.equal(careCapacity(c,12),18);
 const res={...c.res};assert.equal(applyAction(c,{type:'magicDomain',domain:'citadel'},4*MIN,RULES),null);
 assert.deepEqual([res.rune-c.res.rune,res.celestialStone-c.res.celestialStone],[100,40]);
 assert.equal(careCapacity(c,4),4);assert.deepEqual(patrolReach(c),{radius:10,speed:1});
 assert.match(applyAction(c,{type:'magicDomain',domain:'crafts'},4*MIN,RULES)!,/Đang đổi/);
 for(let at=5*MIN;at<=4*MIN+6*HOUR+2*MIN;at+=MIN)stepMagic(c,at);
 assert.deepEqual(patrolReach(c),{radius:14,speed:1.2});assert.equal(careCapacity(c,4),4);
});

test('Bách Nghệ refunds 10% of last hour production mana into the same source, never its own refund',()=>{
 const c=era9(),well=place(c,'aetherwell',30,30),academy=place(c,'mageacademy',32,30,4);place(c,'riverpalace',30,32);
 stepMagic(c,MIN);const m=c.magic!;m.mana[id(well)]=1000;deliverMagicSupply(c,idx(32,30),'rune',12);
 assert.equal(applyAction(c,{type:'magicDomain',domain:'crafts'},MIN,RULES),null);
 for(let at=2*MIN;at<=HOUR;at+=MIN)stepMagic(c,at);
 for(let at=HOUR+MIN;at<2*HOUR;at+=MIN)stepMagic(c,at);
 const spent=m.craft!.spent[id(well)];assert.ok(Math.abs(spent-20*59/60)<1e-6,`spent ${spent}`);// academy only, not the 40/h upkeep
 const before=m.mana[id(well)];stepMagic(c,2*HOUR);
 assert.ok(Math.abs(before-(20+40)/60+(spent+20/60)*.1-m.mana[id(well)])<1e-6);// the closing minute belongs to that hour
 assert.equal(m.craft!.spent[id(well)]??0,0);// the refund is not counted for the next hour
 stepMagic(c,2*HOUR+MIN);assert.ok(Math.abs(m.craft!.spent[id(well)]-20/60)<1e-6);void academy;
});

test('split, reloaded and single settlement agree with celestial production, beasts, packages and zombie waves',()=>{
 const a=era9();a.res.copper=4000;a.res.essence=400;a.res.rune=400;cluster(a);
 place(a,'complex',26,22);place(a,'celestialforge',24,22,8);const well=place(a,'aetherwell',24,24);place(a,'observatory',26,26,4);
 eraStaff(a,a.camp,20);a.army={dragon:1,tortoise:1};a.magic!.contract={active:'dragon'};
 stepMagic(a,3*MIN);a.magic!.mana[id(well)]=1500;
 assert.equal(applyAction(a,{type:'magicPrepare',spell:'thunder'},3*MIN,RULES),null);
 activateZombies(a,3*MIN);a.zombies!.nextAt=30*MIN;
 let b=JSON.parse(JSON.stringify(a)) as City;
 const events:[number,(c:City)=>void][]=[[50*MIN,c=>{c.b[idx(24,24)].burned=true;}],[110*MIN,c=>{delete c.b[idx(24,24)].burned;}],[4*HOUR,()=>{}]];
 let from=3*MIN;
 for(const [to,event]of events){
  settle(a,to);event(a);
  for(let at=from+MIN+777;at<to;at+=7*MIN+313){settle(b,at);b=JSON.parse(JSON.stringify(b));}
  settle(b,to);event(b);from=to;
 }
 assert.ok(a.zombies!.report.waves>=2);
 assert.ok(a.res.celestialStone>9000-10||a.people.some(p=>p.haul?.resource==='celestialStone'));
 assert.deepEqual(b.magic,a.magic);assert.deepEqual(b.zombies,a.zombies);assert.deepEqual(b.res,a.res);assert.deepEqual(b.army,a.army);assert.deepEqual(b.people,a.people);
});

test('fourteen days offline at era 9 stays bounded; an old era 8 save migrates without the new fields',{timeout:120_000},()=>{
 const c=era9();c.res.copper=3000;cluster(c);place(c,'complex',26,22);place(c,'celestialforge',24,22,8);place(c,'observatory',26,26,4);const palace=place(c,'riverpalace',36,32);
 c.magic!.contract={active:'phoenix'};c.army={phoenix:1};
 assert.equal(applyAction(c,{type:'magicPrepare',spell:'thunder'},3*MIN,RULES),null);
 assert.equal(applyAction(c,{type:'magicDomain',domain:'crafts'},3*MIN,RULES),null);
 c.disaster!.at=1e15;c.wildernessAt=1e15;
 settle(c,15*24*HOUR);const m=c.magic!;
 for(const [k,v]of Object.entries(c.res))assert.ok(Number.isFinite(v)&&v>=0,k);
 for(const [k,v]of Object.entries(m.mana))assert.ok(Number.isFinite(v)&&v>=0&&v<=m.network.sources[k]?.capacity+1e-9||!m.network.sources[k],k);
 assert.equal(m.packages!.length,0);void palace;
 // Old save: era 8 magic state, no celestial stone, upgraded to era 9 by data only.
 const old=era9();delete (old.res as Partial<typeof old.res>).celestialStone;for(const k of ['contract','packages','domain','craft','shipments','dockPairs'] as const)delete old.magic![k];
 settle(old,HOUR);assert.equal(old.res.celestialStone,0);assert.ok(old.magic);
});
