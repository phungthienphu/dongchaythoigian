import test from 'node:test';
import assert from 'node:assert/strict';
import {applyAction,armyCap,buildMs,canPlace,derive,ENGINE_MAX_ERA,ERA_REQ,eraConditionsMet,HOUR,idx,levelCost,MIN,reqMet,RES,settle,stats,UNITS,type City,type Building} from './engine';
// Rules as they were before eras 7–9 shipped: everything magic stays locked.
const PRE_MAGIC={maxEra:6} as const;
import {eraFixture,eraStaff} from './era-fixtures.test-utils';
import {initializeMagic,stepMagic,magicSiteId,deliverMagicSupply,magicStructureDefense,magicGuardHp,mageAction} from './magic';
import {magicGrowth,GROWTH_LOAD} from './magic-elements';
import {activateZombies,stepZombies,zombiePath,type Zombie,type ZombieGuard} from './zombies';
import {advanceBattle,createBattle} from './battle';
const RULES={maxEra:9};
function era8(at=0):City{
 const c=eraFixture(6,at);c.era=8;c.b[idx(19,20)].lvl=8;initializeMagic(c,at);
 c.b[idx(17,20)]={k:'grandstore',lvl:1,doneAt:null};c.magic!.researched.push('conduction','warcraft','lifecraft','elements','pact');
 for(const r of RES)c.res[r]=50000;return c;
}
function place(c:City,k:Building['k'],x:number,y:number,staff=0){const tile=idx(x,y);c.b[tile]={k,lvl:1,doneAt:null,uid:c.magic!.nextUid++,builtAt:0};if(staff)eraStaff(c,tile,staff);return c.b[tile];}
const id=(b:Building)=>magicSiteId(b);
/** Well with mana plus a staffed station whose essence buffer is pre-filled (carriers are tested in era 7). */
function station(c:City,k:Building['k'],x:number,y:number){const b=place(c,k,x,y,3);return b;}
function prime(c:City,at:number,tiles:number[]){stepMagic(c,at);for(const t of tiles)deliverMagicSupply(c,t,'essence',4);}
function zombie(n:number,x:number,y:number):Zombie{return {id:n,kind:'normal',hp:90,maxHp:90,x:x+.5,y:y+.5,era:8,until:1e12,nextHit:1e12,repath:1e12};}

test('era 8 needs Tháp Khai Nguyên, hall 7, 650 people and the spec goods; hall 8 costs 40k stone… and 12 hours',()=>{
 const c=eraFixture(6);c.era=7;c.b[idx(19,20)].lvl=7;initializeMagic(c,0);eraStaff(c,c.camp,650);
 for(let n=0;n<12;n++)c.b[idx(30+n,30)]={k:'grandstore',lvl:3,doneAt:null};
 for(const r of RES)c.res[r]=ERA_REQ[8].cost[r]??0;
 assert.equal(reqMet(c,RULES),false);
 c.b[idx(40,40)]={k:'awakeningtower',lvl:1,doneAt:null,uid:99};
 assert.equal(reqMet(c,PRE_MAGIC),false);assert.equal(reqMet(c,{maxEra:7}),false);assert.equal(reqMet(c,RULES),true);
 c.b[idx(40,40)].burned=true;assert.equal(reqMet(c,RULES),false);delete c.b[idx(40,40)].burned;
 assert.equal(applyAction(c,{type:'advance'},c.last,RULES),null);assert.equal(c.era,8);
 assert.deepEqual([c.res.aetherCrystal,c.res.rune],[0,0]);assert.ok(stats(c,derive(c),c.last).storage.essence>=10000);
 assert.deepEqual(levelCost('hall',8),{stone:40000,copper:15000,gold:6000,rune:200});assert.equal(buildMs('hall',8),12*HOUR);assert.equal(buildMs('hall',7),8*HOUR);
 // Era 9 entry needs Đại Trận Tứ Linh; the engine now runs era 9 behind maxEra 9.
 assert.equal(ENGINE_MAX_ERA,9);assert.deepEqual(ERA_REQ[9].wonders,['fourspirits']);
 const late=era8();eraStaff(late,late.camp,850);for(let n=0;n<14;n++)late.b[idx(30+n,32)]={k:'grandstore',lvl:3,doneAt:null};for(const r of RES)late.res[r]=ERA_REQ[9].cost[r]??0;
 assert.equal(eraConditionsMet(late,9),false);late.b[idx(40,40)]={k:'fourspirits',lvl:1,doneAt:null,uid:98};
 assert.equal(eraConditionsMet(late,9),true);assert.equal(reqMet(late,{maxEra:8}),false);assert.match(applyAction(late,{type:'advance'},0,{maxEra:8})!,/sắp ra mắt/);
 const young=era8();young.era=7;assert.equal(stats(young,derive(young),0).storage.essence,0);
});

test('essence forge: machine support, 24 crystal + 60 coal + 30 mana per 12 essence, carried to the store',()=>{
 const c=era8(),well=place(c,'aetherwell',24,24);c.res.essence=0;c.res.aetherCrystal=1000;c.res.coal=1000;
 assert.match(canPlace(c,derive(c),'essenceforge',24,26,{maxEra:7})!,/sắp ra mắt/);
 place(c,'essenceforge',24,22,5);stepMagic(c,MIN);const m=c.magic!;m.mana[id(well)]=1200;
 settle(c,5*HOUR);assert.equal(c.res.essence,0);assert.equal(c.res.aetherCrystal,1000);// no machine: recipe stops, no mana bypass
 place(c,'machine',26,22);
 settle(c,10*HOUR);
 const made=c.res.essence+c.people.reduce((n,p)=>n+(p.haul?.resource==='essence'?p.haul.carried:0),0);
 assert.ok(made>=20);
 assert.ok(Math.abs((1000-c.res.aetherCrystal)-made*2)<1e-6);assert.ok(Math.abs((1000-c.res.coal)-made*5)<1e-6);
 assert.ok(Math.abs(1200-m.mana[id(well)]-made*2.5)<1e-6);// an unstaffed well does not refill
 m.mana[id(well)]=0;const stalled=c.res.essence;settle(c,15*HOUR);
 assert.ok(c.res.essence-stalled<=10+1e-9);// at most loads already in hand; no new mana-free batches
});

test('stations hand out local seals to at most three recipients in six tiles; an outage switches them off',()=>{
 const c=era8(),well=place(c,'aetherwell',30,30,2),water=station(c,'watertemple',32,30);
 const recipients=[[33,32],[31,32],[34,30],[35,31]].map(([x,y])=>place(c,'harmonizer',x,y,4)),far=place(c,'harmonizer',40,30,4);
 for(const h of [...recipients,far]){const t=+Object.keys(c.b).find(k=>c.b[k]===h)!;assert.equal(applyAction(c,{type:'magicHarmonize',x:t%96,y:Math.floor(t/96),elements:['water','earth']},0,RULES),null);}
 prime(c,MIN,[idx(32,30)]);c.magic!.mana[id(well)]=1200;stepMagic(c,2*MIN);
 const m=c.magic!,served=recipients.filter(h=>m.seals![id(h)]?.includes('water'));
 assert.equal(served.length,3);assert.equal(m.seals![id(far)],undefined);
 assert.ok(!served.includes(recipients[3]));// the farthest misses out
 // Harmonizers need both chosen seals: water alone keeps them blocked.
 stepMagic(c,3*MIN);assert.match(m.factories[id(recipients[0])].blocked!,/ấn/);
 // Mana outage: the station stops, the seal disappears on the next minute.
 c.b[idx(30,30)].burned=true;stepMagic(c,4*MIN);stepMagic(c,5*MIN);assert.ok(m.factories[id(water)].blocked);
 assert.equal(Object.values(m.seals!).flat().length,0);
});

test('golems need Khế ước, the Thổ seal and 120 mana; works add 24 space; Thổ hardens golems recruited after',()=>{
 const c=era8(),well=place(c,'aetherwell',30,30,2),earth=station(c,'earthtemple',32,30),works=place(c,'golemworks',34,30);
 stepMagic(c,MIN);c.magic!.mana[id(well)]=1000;assert.equal(armyCap(c),24);
 assert.match(applyAction(c,{type:'train',u:'golem',n:1},MIN,RULES)!,/ấn Thổ/);
 deliverMagicSupply(c,idx(32,30),'essence',4);stepMagic(c,2*MIN);stepMagic(c,3*MIN);
 assert.deepEqual(c.magic!.seals![id(works)],['earth']);
 c.magic!.researched=c.magic!.researched.filter(r=>r!=='pact');assert.match(applyAction(c,{type:'train',u:'golem',n:1},3*MIN,RULES)!,/Khế ước/);c.magic!.researched.push('pact');
 const mana=c.magic!.mana[id(well)];assert.equal(applyAction(c,{type:'train',u:'golem',n:1},3*MIN,RULES),null);assert.equal(mana-c.magic!.mana[id(well)],120);
 assert.equal(applyAction(c,{type:'magicSpecialize',element:'earth'},3*MIN,RULES),null);
 assert.equal(applyAction(c,{type:'train',u:'golem',n:1},3*MIN,RULES),null);
 settle(c,3*MIN+2*HOUR);assert.equal(c.army.golem,2);assert.equal(c.magic!.hardened,1);
 assert.equal(magicGuardHp(c,{id:'golem:0',u:'golem'}),1980);assert.equal(magicGuardHp(c,{id:'golem:1',u:'golem'}),1800);
 void earth;
});

test('chuyên tu: first pick is free; a switch costs 100 runes + 40 essence and 6 h with no effect meanwhile',()=>{
 const c=era8();c.magic!.researched=c.magic!.researched.filter(r=>r!=='pact');
 assert.match(applyAction(c,{type:'magicSpecialize',element:'fire'},0,RULES)!,/Khế ước/);c.magic!.researched.push('pact');
 assert.match(applyAction(c,{type:'magicSpecialize',element:'fire'},0,{maxEra:7})!,/sắp ra mắt/);
 const res={...c.res};assert.equal(applyAction(c,{type:'magicSpecialize',element:'fire'},0,RULES),null);assert.deepEqual(c.res,res);
 assert.equal(c.magic!.specialization!.element,'fire');
 activateZombies(c,0);c.zombies!.actors=[zombie(1,60,60)];assert.match(applyAction(c,{type:'magicSpecialize',element:'water'},0,RULES)!,/trận chiến/);c.zombies!.actors=[];c.zombies!.nextAt=1e12;
 assert.equal(applyAction(c,{type:'magicSpecialize',element:'water'},0,RULES),null);
 assert.deepEqual([res.rune-c.res.rune,res.essence-c.res.essence],[100,40]);assert.equal(c.magic!.specialization!.element,undefined);
 assert.match(applyAction(c,{type:'magicSpecialize',element:'wood'},0,RULES)!,/Đang đổi/);
 for(let at=MIN;at<6*HOUR;at+=MIN)stepMagic(c,at);assert.equal(c.magic!.specialization!.element,undefined);
 stepMagic(c,6*HOUR);assert.equal(c.magic!.specialization!.element,'water');
});

test('specialization effects: Hỏa +10% fireball, Thủy one more heal target',()=>{
 const c=era8(),well=place(c,'aetherwell',30,30);stepMagic(c,MIN);c.magic!.mana[id(well)]=500;
 const mage:ZombieGuard={id:'firemage:0',u:'firemage',x:31.5,y:30.5,hp:110,nextHit:0,anchor:idx(31,30)},target=zombie(1,35,30);target.hp=200;
 c.magic!.specialization={element:'fire'};assert.equal(mageAction(c,mage,target,MIN,[target],[mage]),true);assert.ok(Math.abs(200-target.hp-99)<1e-9);
 c.magic!.specialization={element:'water'};
 const healer:ZombieGuard={id:'watermage:0',u:'watermage',x:31.5,y:31.5,hp:UNITS.watermage.hp,nextHit:0,anchor:idx(31,31)};
 const hurt=[0,1,2,3].map(n=>({...mage,id:`firemage:${n+1}`,hp:40}));
 assert.equal(mageAction(c,healer,undefined,MIN,[],[healer,...hurt]),true);assert.equal(hurt.filter(g=>g.hp===120).length,4);
});

test('Bão lửa needs a running Hỏa altar and 4 clustered zombies: 120 mana + 2 essence, 10/s for 8 s on ≤8, 3 min cooldown',()=>{
 const c=era8(),well=place(c,'aetherwell',30,30,2);station(c,'firealtar',32,30);prime(c,MIN,[idx(32,30)]);c.magic!.mana[id(well)]=1000;stepMagic(c,2*MIN);
 const actors=Array.from({length:10},(_,n)=>zombie(n+1,34+n%2,30+Math.floor(n/2)%3));const essence=c.res.essence,mana=c.magic!.mana[id(well)];
 magicStructureDefense(c,121_000,actors.slice(0,3),[]);assert.equal(c.magic!.effects?.length??0,0);// three are not enough
 magicStructureDefense(c,122_000,actors,[]);assert.equal(c.magic!.effects!.length,1);assert.equal(essence-c.res.essence,2);assert.ok(mana-c.magic!.mana[id(well)]>=120);
 for(let at=123_000;at<=131_000;at+=1000)magicStructureDefense(c,at,actors,[]);
 const dealt=actors.reduce((n,z)=>n+90-z.hp,0);assert.ok(dealt<=8*8*10+8*2*40+1e-6);// at most 8 per tick
 assert.ok(actors.filter(z=>z.hp<90).length>=4);
 magicStructureDefense(c,140_000,actors,[]);assert.equal(c.magic!.effects!.length,0);assert.equal(c.magic!.cooldowns.firestorm,122_000+180_000);
});

test('Tịnh hóa cures up to 8 within 10 tiles and cuts 4 pollution; Thủy seal extends Thanh tẩy to 10 tiles',()=>{
 const c=era8(),well=place(c,'aetherwell',30,30,2);station(c,'watertemple',32,30);c.t[idx(29,31)]=3;const shrine=place(c,'rivershrine',30,31,3);
 prime(c,MIN,[idx(32,30)]);c.magic!.mana[id(well)]=1000;c.industry!.pollution=30;stepMagic(c,2*MIN);
 assert.deepEqual(c.magic!.seals![id(shrine)],['water']);
 c.magic!.cooldowns.purify=1e12;// isolate Tịnh hóa
 for(let n=0;n<10;n++)c.people.push({id:900+n,name:'B',task:{t:'idle'},pos:idx(36+n%3,30+Math.floor(n/3)),vital:{hp:100,last:0,infectedAt:1}});
 stepMagic(c,3*MIN);assert.equal(c.people.filter(p=>p.vital?.infectedAt!==undefined).length,2);assert.ok(c.industry!.pollution<=26+1e-9);
 assert.equal(c.magic!.cooldowns.cleanse,3*MIN+30*MIN);
 // Thanh tẩy now reaches the two left at 9–10 tiles from the shrine.
 for(const p of c.people.slice(-2)){p.pos=idx(39,31);}delete c.magic!.cooldowns.purify;stepMagic(c,4*MIN);
 assert.equal(c.people.filter(p=>p.vital?.infectedAt!==undefined).length,0);
});

test('Mưa sinh trưởng: up to 4 staffed fields in six tiles carry 50% larger food loads for an hour, keeping a defence reserve',()=>{
 const c=era8(),well=place(c,'aetherwell',30,30,2);station(c,'woodgrove',32,30);
 const fields=[[33,32],[34,32],[35,32],[33,33],[34,33]].map(([x,y])=>{place(c,'farm',x,y,1);return idx(x,y);});
 prime(c,MIN,[idx(32,30)]);c.magic!.mana[id(well)]=150;stepMagic(c,2*MIN);stepMagic(c,3*MIN);
 assert.equal(magicGrowth(c,fields[0],3*MIN+1),1);// 80 + 120 reserve not available
 c.magic!.mana[id(well)]=600;stepMagic(c,4*MIN);
 assert.equal(fields.filter(f=>magicGrowth(c,f,4*MIN+1)===GROWTH_LOAD).length,4);assert.equal(magicGrowth(c,fields[0],4*MIN+HOUR),1);
 assert.equal(c.magic!.cooldowns.growthrain,4*MIN+2*HOUR);
});

test('Thạch bích walls only empty tiles on the zombie path, never the only route, and expire after 30 s',()=>{
 const c=era8(),well=place(c,'aetherwell',30,30,2);station(c,'earthtemple',32,30);prime(c,MIN,[idx(32,30)]);c.magic!.mana[id(well)]=1000;stepMagic(c,2*MIN);
 activateZombies(c,0);c.zombies!.nextAt=1e12;
 const actors=[zombie(1,35,32),zombie(2,36,32),zombie(3,35,33)];
 for(const z of actors){z.path=zombiePath(c,idx(35,32),idx(19,20))??undefined;}
 magicStructureDefense(c,121_000,actors,[]);const walls=c.magic!.walls!;
 assert.ok(walls.length>=1&&walls.length<=3);assert.ok(walls.every(w=>!c.b[w.tile]&&w.hp===200&&w.until===151_000));
 assert.ok(zombiePath(c,idx(35,32),idx(19,20))!==null);// a detour always remains
 stepMagic(c,151_000);assert.equal(c.magic!.walls!.length,0);
 // A corridor whose only exit the wall would close: the spell refuses and costs nothing.
 const d=era8();for(let y=0;y<96;y++)for(let x=0;x<96;x++)if(!(y===31&&x>=18&&x<=40))d.t[idx(x,y)]=2;
 d.b={[idx(19,32)]:{k:'hall',lvl:8,doneAt:null},[idx(18,32)]:{k:'grandstore',lvl:1,doneAt:null}};d.camp=idx(20,31);d.people=[];
 const w2=place(d,'aetherwell',30,30,2);station(d,'earthtemple',32,30);prime(d,MIN,[idx(32,30)]);d.magic!.mana[id(w2)]=1000;stepMagic(d,2*MIN);
 assert.ok(!d.magic!.factories[id(d.b[idx(32,30)])].blocked);
 const line=[zombie(1,34,31),zombie(2,35,31),zombie(3,36,31)];for(const z of line)z.path=zombiePath(d,idx(34,31),idx(19,32))??undefined;
 assert.ok(line[0].path);const mana=d.magic!.mana[id(w2)],essence=d.res.essence;magicStructureDefense(d,121_000,line,[]);
 assert.equal(d.magic!.walls?.length??0,0);assert.equal(d.magic!.mana[id(w2)],mana);assert.equal(d.res.essence,essence);
});

test('linh mộc: 100 wood + 20 runes + 10 essence and 1 h; carries 30 into buffers, pays 5 mana/h walking, not a villager',()=>{
 const c=era8(),well=place(c,'aetherwell',24,24,2);const grove=station(c,'woodgrove',22,22);const academy=place(c,'mageacademy',26,20);
 prime(c,MIN,[idx(22,22)]);c.magic!.mana[id(well)]=1000;stepMagic(c,2*MIN);
 assert.match(applyAction(c,{type:'magicTreant',x:23,y:22},2*MIN,RULES)!,/Mộc linh viên/);
 const res={...c.res},people=c.people.length;assert.equal(applyAction(c,{type:'magicTreant',x:22,y:22},2*MIN,RULES),null);
 assert.deepEqual([res.wood-c.res.wood,res.rune-c.res.rune,res.essence-c.res.essence],[100,20,10]);
 for(let n=0;n<7;n++)assert.equal(applyAction(c,{type:'magicTreant',x:22,y:22},2*MIN,RULES),null);
 assert.match(applyAction(c,{type:'magicTreant',x:22,y:22},2*MIN,RULES)!,/Tối đa 8/);
 c.magic!.treantQueue!.splice(1);
 let delivered=0;const rune=c.res.rune;
 for(let at=2*MIN+1000;at<=2*MIN+HOUR+5*MIN;at+=1000){stepMagic(c,at);delivered=Math.max(delivered,c.magic!.factories[id(academy)]?.input.rune??0);}
 assert.equal(c.magic!.treants!.length,1);assert.equal(c.people.length,people);
 assert.ok(delivered>0&&delivered<=12);assert.ok(rune-c.res.rune>0);void grove;
});

test('golems and deer guard the village against zombies; zombies hit them and deer shield nearby allies by 10%',()=>{
 const c=era8();c.people=[];c.pop=0;c.camp=idx(10,10);c.b={[idx(10,10)]:{k:'barracks',lvl:1,doneAt:null}};c.army={golem:1,spiritdeer:1,club:1};
 activateZombies(c,0);c.zombies!.nextAt=1e12;c.zombies!.actors=[{...zombie(9,80,80),nextHit:0}];stepZombies(c,1000);const guards=c.zombies!.guards;
 assert.deepEqual(guards.map(g=>g.u).sort(),['club','golem','spiritdeer']);
 const golem=guards.find(g=>g.u==='golem')!,deer=guards.find(g=>g.u==='spiritdeer')!;assert.equal(golem.hp,1800);
 const club=guards.find(g=>g.u==='club')!;club.x=golem.x;club.y=golem.y-3;deer.x=golem.x-1;deer.y=golem.y;
 c.zombies!.actors=[{...zombie(1,0,0),x:golem.x+.6,y:golem.y,nextHit:0,hp:5000,maxHp:5000}];
 for(let at=2000;at<=8000;at+=1000)stepZombies(c,at);
 const now=c.zombies!.guards.find(g=>g.id===golem.id)!;assert.equal(now,golem);
 assert.ok(golem.hp<1800);assert.ok(c.zombies!.actors[0].hp<5000);
 const hits=Math.round((1800-golem.hp)/(8*.9));assert.ok(Math.abs(1800-golem.hp-hits*8*.9)<1e-6);// each bite reduced by the escort
});

test('PvP: golems hit buildings ×1.5, hardened golems keep +10% HP, deer escort reduces damage',()=>{
 const town=()=>{const c=era8();c.b={'4658':{k:'hut',lvl:1,doneAt:null}};c.camp=4658;c.army={};c.pop=20;return c;};
 const attacker=town();attacker.magic!.hardened=1;
 const s=createBattle({id:'g',attackerId:'a',defenderId:'d',attacker,defender:town(),troops:{golem:2,spiritdeer:1},now:0});
 const golems=s.groups.find(g=>g.u==='golem')!;assert.equal(golems.unitHp,1890);assert.equal(golems.hp,3780);
 assert.equal(UNITS.golem.buildingAtk,1.5);assert.equal(UNITS.golem.atk*UNITS.golem.attackMs!/1000,100);
 const hut=s.buildings[0],hp=hut.hp;golems.x=hut.tile%96+.5+1;golems.y=Math.floor(hut.tile/96)+.5;golems.order={type:'attack',targetId:hut.id};
 advanceBattle(s,100);assert.equal(hp-hut.hp,Math.min(hp,2*100*1.5));
});

test('split, reloaded and single settlement agree with essence, seals, a mana outage and zombies',()=>{
 const a=era8();a.res.essence=200;a.res.aetherCrystal=2000;a.res.coal=2000;
 place(a,'machine',26,22);place(a,'essenceforge',24,22,5);const well=place(a,'aetherwell',24,24,2);
 station(a,'earthtemple',26,26);place(a,'golemworks',28,26);place(a,'wardcircle',22,26);
 // Keep the scripted mana-outage fixture defended against modern wave pressure.
 eraStaff(a,a.camp,20);a.army={golem:1,armor:8};a.guardPosts=[{x:23,y:23},{x:27,y:25}];
 stepMagic(a,MIN);a.magic!.mana[id(well)]=600;
 activateZombies(a,0);a.zombies!.nextAt=25*MIN;a.zombies!.warning=idx(24,28);
 let b=JSON.parse(JSON.stringify(a)) as City;
 // Mana outage: the well burns at 40 min and is repaired at 100 min, at the same instants in both runs.
 const events:[number,(c:City)=>void][]=[[40*MIN,c=>{c.b[idx(24,24)].burned=true;}],[100*MIN,c=>{delete c.b[idx(24,24)].burned;}],[3*HOUR,()=>{}]];
 let from=0;
 for(const [to,event]of events){
  settle(a,to);event(a);
  for(let at=from+MIN+777;at<to;at+=7*MIN+313){settle(b,at);b=JSON.parse(JSON.stringify(b));}
  settle(b,to);event(b);from=to;
 }
 assert.ok(a.magic!.network.bindings[magicSiteId(a.b[idx(26,26)])].primary);
 assert.ok(a.res.essence>200||a.people.some(p=>p.haul?.resource==='essence'));assert.ok(a.zombies!.report.waves>=1);
 assert.deepEqual(b.magic,a.magic);assert.deepEqual(b.zombies,a.zombies);assert.deepEqual(b.res,a.res);assert.deepEqual(b.people,a.people);
});

test('fourteen days offline: magic settles with bounded mana, buffers and essence, no NaN',{timeout:120_000},()=>{
 const c=era8();c.res.aetherCrystal=3000;c.res.coal=3000;place(c,'machine',26,22);place(c,'essenceforge',24,22,5);
 const well=place(c,'aetherwell',24,24,2);station(c,'firealtar',26,26);station(c,'earthtemple',28,26);const harmonizer=place(c,'harmonizer',27,24,4);c.res.essence=100;
 assert.equal(applyAction(c,{type:'magicHarmonize',x:27,y:24,elements:['fire','earth']},0,RULES),null);
 c.disaster!.at=1e15;c.wildernessAt=1e15;
 c.res.food=stats(c,derive(c),0).storage.food;// villagers starve later in the run: the economy must still stay bounded
 settle(c,HOUR);const m=c.magic!;
 assert.equal(m.factories[id(harmonizer)].blocked,undefined);assert.deepEqual(m.seals![id(harmonizer)],['earth','fire']);
 assert.equal(m.network.sources[id(well)].slots,5);// harmonizer +1 slot
 settle(c,15*24*HOUR);
 for(const [k,v]of Object.entries(c.res))assert.ok(Number.isFinite(v)&&v>=0,k);
 assert.ok(m===c.magic&&m.mana[id(well)]>=0&&m.mana[id(well)]<=1200+1e-9);
 for(const f of Object.values(m.factories))for(const v of Object.values(f.input))assert.ok(Number.isFinite(v!)&&v!>=0&&v!<=2*2+1e-9);
 assert.ok(c.res.essence>0);assert.ok(Number.isFinite(c.industry!.pollution));
});

test('Tứ nguyên and Khế ước research: prerequisites, 360/300 knowledge, essence and runes from the store',()=>{
 const c=era8();c.magic!.researched=['conduction','warcraft'];place(c,'mageacademy',30,30,4);c.magic!.knowledge=1000;
 assert.match(applyAction(c,{type:'magicResearch',key:'elements'},0,RULES)!,/tiền đề/);c.magic!.researched.push('lifecraft');
 assert.match(applyAction(c,{type:'magicResearch',key:'elements'},0,{maxEra:7})!,/sắp ra mắt/);
 assert.match(applyAction(c,{type:'magicResearch',key:'pact'},0,RULES)!,/tiền đề/);
 const res={...c.res};assert.equal(applyAction(c,{type:'magicResearch',key:'elements'},0,RULES),null);
 assert.deepEqual([res.essence-c.res.essence,res.rune-c.res.rune,c.magic!.knowledge],[100,100,640]);
 assert.match(canPlace(c,derive(c),'firealtar',34,34,RULES)!,/Tứ nguyên/);
 settle(c,4*HOUR);assert.ok(c.magic!.researched.includes('elements'));assert.equal(canPlace(c,derive(c),'firealtar',34,34,RULES),null);
 assert.match(canPlace(c,derive(c),'golemworks',34,34,RULES)!,/Khế ước/);
 assert.equal(applyAction(c,{type:'magicResearch',key:'pact'},4*HOUR,RULES),null);assert.equal(c.magic!.knowledge,340);
 assert.match(applyAction(c,{type:'magicResearch',key:'gatecraft'},4*HOUR,{maxEra:8})!,/sắp ra mắt/);
});

test('harmonizer: explicit pair of seals, −8 pollution/h, +1 slot for each source in six tiles, never stacked',()=>{
 const c=era8(),near=place(c,'aetherwell',30,30,2),far=place(c,'aetherwell',30,40,2);station(c,'firealtar',32,30);station(c,'earthtemple',32,32);
 const h1=place(c,'harmonizer',33,31,4),h2=place(c,'harmonizer',31,33,4);c.industry!.pollution=50;
 assert.match(applyAction(c,{type:'magicHarmonize',x:33,y:31,elements:['fire','fire']},0,RULES)!,/không hợp lệ/);
 for(const [x,y]of [[33,31],[31,33]])assert.equal(applyAction(c,{type:'magicHarmonize',x,y,elements:['earth','fire']},0,RULES),null);
 prime(c,MIN,[idx(32,30),idx(32,32),idx(33,31),idx(31,33)]);c.magic!.mana[id(near)]=1200;c.magic!.mana[id(far)]=1200;
 stepMagic(c,2*MIN);const m=c.magic!;assert.deepEqual(m.seals![id(h1)],['earth','fire']);
 const before=c.industry!.pollution;stepMagic(c,3*MIN);assert.equal(m.factories[id(h1)].blocked,undefined);
 assert.ok(Math.abs(before-c.industry!.pollution-2*8/60)<1e-9);// two running harmonizers, 8/h each
 stepMagic(c,4*MIN);assert.equal(m.network.sources[id(near)].slots,5);assert.equal(m.network.sources[id(far)].slots,4);void h2;
});

test('Đại Trận Tứ Linh needs hall 8 and all four seals in six tiles; afterwards sources hold 20% more',()=>{
 const c=era8(),well=place(c,'aetherwell',30,30,2);for(const [k,x,y]of [['firealtar',32,30],['watertemple',32,32],['woodgrove',30,32],['earthtemple',28,32]] as const)station(c,k,x,y);
 prime(c,MIN,[idx(32,30),idx(32,32),idx(30,32),idx(28,32)]);c.magic!.mana[id(well)]=1000;stepMagic(c,2*MIN);
 c.b[idx(19,20)].lvl=7;assert.match(canPlace(c,derive(c),'fourspirits',31,35,RULES)!,/Đình làng cấp 8/);c.b[idx(19,20)].lvl=8;
 assert.match(canPlace(c,derive(c),'fourspirits',40,40,RULES)!,/bốn ấn/);
 c.res.stone=60000;assert.equal(canPlace(c,derive(c),'fourspirits',30,34,RULES),null);
 assert.equal(c.magic!.network.sources[id(well)].capacity,1200);
 c.b[idx(30,34)]={k:'fourspirits',lvl:1,doneAt:null,uid:c.magic!.nextUid++};stepMagic(c,3*MIN);
 assert.equal(c.magic!.network.sources[id(well)].capacity,1440);
 // Spirit deer need both Mộc and Thủy seals at the stable.
 const well2=place(c,'aetherwell',28,30,2),stable=place(c,'spiritstable',31,33);stepMagic(c,4*MIN);c.magic!.mana[id(well2)]=500;stepMagic(c,5*MIN);stepMagic(c,6*MIN);
 assert.deepEqual(c.magic!.seals![id(stable)],['water','wood']);assert.equal(armyCap(c),12);
 assert.equal(applyAction(c,{type:'train',u:'spiritdeer',n:1},6*MIN,RULES),null);
 // Mộc specialization allows a ninth spirit-wood carrier.
 c.magic!.specialization={element:'wood'};c.magic!.treantQueue=Array.from({length:8},()=>({doneAt:1e12,grove:'x'}));
 assert.equal(applyAction(c,{type:'magicTreant',x:30,y:32},5*MIN,RULES),null);assert.match(applyAction(c,{type:'magicTreant',x:30,y:32},5*MIN,RULES)!,/Tối đa 9/);
});

test('PvP Linh lộc escort: an ally within three tiles takes 10% less damage',()=>{
 const town=()=>{const c=era8();c.b={'4658':{k:'hut',lvl:1,doneAt:null}};c.camp=4658;c.army={};c.pop=20;return c;};
 const hit=(withDeer:boolean)=>{const defender=town();defender.army=withDeer?{spear:5,spiritdeer:1}:{spear:5};
  const s=createBattle({id:'e',attackerId:'a',defenderId:'d',attacker:town(),defender,troops:{sword:10},now:0});
  const sword=s.groups.find(g=>g.u==='sword')!,spear=s.groups.find(g=>g.u==='spear')!,deer=s.groups.find(g=>g.u==='spiritdeer');
  s.groups=[sword,spear,...(deer?[deer]:[])];spear.count=5;spear.hp=200;sword.x=spear.x+1;sword.y=spear.y;if(deer){deer.x=spear.x-1;deer.y=spear.y;}
  advanceBattle(s,100);return 200-spear.hp;};
 const plain=hit(false),escorted=hit(true);assert.ok(plain>0);assert.ok(Math.abs(escorted-plain*.9)<1e-9);
});
