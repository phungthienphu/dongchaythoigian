import test from 'node:test';
import assert from 'node:assert/strict';
import {MAGIC_EXPANSION} from './building-expansion';
import {MAGIC_BUILDINGS,magicDef,type MagicBuilding} from './magic-data';
import {B,RES,idx,applyAction,settle,MIN,HOUR,buildingJobs,storageCapacity,type BKey} from './engine';
import {eraFixture,eraStaff} from './era-fixtures.test-utils';
import {initializeMagic,stepMagic,magicSiteId,magicStructureDefense,magicSupportError} from './magic';
import {magicDiagnosis} from './magic-view';
import {isActionInput} from './action-input';
import type {Zombie} from './zombies';

test('era catalogs double exactly and every new building is accepted by the action boundary',()=>{
 for(const [era,count]of [[7,20],[8,18],[9,14]])assert.equal(Object.values(MAGIC_BUILDINGS).filter(d=>d.era===era).length,count);
 for(const kind of ['hydroponics','recyclingworks',...Object.keys(MAGIC_EXPANSION)] as BKey[]){
  assert.ok(isActionInput({type:'build',k:kind,x:20,y:20}));assert.ok(B[kind].d.length>100);assert.ok(B[kind].sec>=3600);
 }
});
for(const kind of Object.keys(MAGIC_EXPANSION) as (keyof typeof MAGIC_EXPANSION)[]){
 const def=magicDef(kind);if(!def.output)continue;
 test(`${kind}: delivered production, paid inputs and deterministic settlement`,()=>{
  const c=eraFixture(def.era),tile=idx(23,20);c.b[idx(19,20)].lvl=1;initializeMagic(c,0);
  c.b[tile]={k:kind,lvl:1,doneAt:null,uid:c.magic!.nextUid++,builtAt:0};eraStaff(c,tile,def.jobs);
  for(const [n,k]of (def.support??[]).entries())c.b[idx(25,21+n)]={k:k as BKey,lvl:1,doneAt:null};
  const source=idx(22,22);c.b[source]={k:'aetherwell',lvl:3,doneAt:null,uid:c.magic!.nextUid++,builtAt:0};eraStaff(c,source,5);
  for(const r of RES)c.res[r]=8000;
  c.b[idx(18,20)].lvl=3;
  stepMagic(c,MIN);c.magic!.mana[magicSiteId(c.b[source])]=2880;
  const r=Object.keys(def.output!)[0] as typeof RES[number];c.res[r]=0;
  assert.equal(magicSupportError(c,tile,c.b[tile]),null,kind);
  const online=structuredClone(c),input={...c.res};settle(c,6*HOUR);for(const at of [MIN,5*MIN,11*MIN,6*HOUR])settle(online,at);
  assert.deepEqual(c,online,kind);assert.ok(c.res[r]>0,`${kind}: no output delivered`);
  for(const key of Object.keys(def.input??{}) as typeof RES[number][])assert.ok(c.res[key]<input[key],`${kind}: no ${key} consumed`);
 });
}
test('new sources create mana and research libraries consume delivered inputs',()=>{
 for(const kind of ['manacistern','elementreservoir','runelibrary','astralarchive'] as const){
  const d=magicDef(kind),c=eraFixture(d.era);initializeMagic(c,0);const tile=idx(23,20);
  c.b[tile]={k:kind,lvl:1,doneAt:null,uid:c.magic!.nextUid++,builtAt:0};eraStaff(c,tile,d.jobs);
  if(d.knowledge){const source=idx(22,22);c.b[source]={k:'aetherwell',lvl:3,doneAt:null,uid:c.magic!.nextUid++,builtAt:0};eraStaff(c,source,5);}
  c.b[idx(18,20)].lvl=3;settle(c,HOUR);
  if(d.source)assert.ok(c.magic!.mana[magicSiteId(c.b[tile])]>0,kind);else assert.ok(c.magic!.knowledge>0,kind);
 }
});
test('new bastions hit zombies only with paid bound mana',()=>{
 for(const kind of ['wardbastion','elementbastion','celestialbastion'] as const){
  const c=eraFixture(B[kind].era);initializeMagic(c,0);const tile=idx(23,20),source=idx(22,22);
  c.b[tile]={k:kind,lvl:1,doneAt:null,uid:c.magic!.nextUid++};c.b[source]={k:'aetherwell',lvl:3,doneAt:null,uid:c.magic!.nextUid++};eraStaff(c,source,5);stepMagic(c,MIN);
  const z:Zombie={id:1,kind:'normal',hp:1000,maxHp:1000,x:24.5,y:20.5,era:7,until:1e9,nextHit:1e9,repath:1e9};
  const id=magicSiteId(c.b[source]);c.magic!.mana[id]=0;magicStructureDefense(c,120000,[z],[]);assert.equal(z.hp,1000);
  c.magic!.mana[id]=100;magicStructureDefense(c,180000,[z],[]);assert.ok(z.hp<1000);assert.ok(c.magic!.mana[id]<100);
 }
});
test('housing and magic storage are actual capacity; workshop diagnosis uses arrived workers',()=>{
 const c=eraFixture(7);initializeMagic(c,0);const tile=idx(23,20);
 c.b[tile]={k:'crystalgranary',lvl:3,doneAt:null};assert.equal(storageCapacity(c.b[tile],'rune'),24000);
 c.b[tile]={k:'runeworks',lvl:3,doneAt:null,uid:c.magic!.nextUid++};eraStaff(c,tile,10);
 const diag=magicDiagnosis(c,tile,0)!;assert.equal(diag.needs.find(n=>n.label==='Thợ')!.detail,'10/10 thợ đã tới nơi');
 assert.ok(diag.needs.some(n=>n.label==='Xưởng hỗ trợ'&&!n.ok));
});
test('modern additions require power and pay their recipe instead of creating free stock',()=>{
 for(const kind of ['hydroponics','recyclingworks'] as const){
  const c=eraFixture(6),tile=idx(23,20);c.b[idx(19,20)].lvl=1;c.b[tile]={k:kind,lvl:1,doneAt:null};eraStaff(c,tile,6);
  const r=kind==='hydroponics'?'food':'copper';c.res[r]=0;
  const none=structuredClone(c);settle(none,10*MIN);assert.equal(none.res[r],0);
  c.b[idx(22,22)]={k:'solar',lvl:1,doneAt:null};c.b[idx(24,22)]={k:'solar',lvl:1,doneAt:null};settle(c,20*MIN);assert.ok(c.res[r]>0,kind);
 }
});
test('food basket multiplier does not multiply the advertised mana price per hour',async()=>{
 const {magicCargoLimit,chargeMagicCargo}=await import('./magic-elements');
 const c=eraFixture(7);initializeMagic(c,0);const tile=idx(23,20),source=idx(22,22);
 c.b[tile]={k:'herbalconservatory',lvl:1,doneAt:null,uid:c.magic!.nextUid++};
 c.b[source]={k:'aetherwell',lvl:3,doneAt:null,uid:c.magic!.nextUid++};eraStaff(c,source,5);stepMagic(c,MIN);
 const id=magicSiteId(c.b[source]);c.magic!.mana[id]=100;
 const before=magicCargoLimit(c,c.b[tile],MIN);chargeMagicCargo(c,c.b[tile],24000,MIN);
 assert.equal(c.magic!.mana[id],70);assert.equal(before,80000);
});
test('expensive long-range bastion prioritizes building breakers outside the old defensive circle',()=>{
 const c=eraFixture(7);initializeMagic(c,0);const tile=idx(23,20),source=idx(22,22);
 c.b[tile]={k:'wardbastion',lvl:1,doneAt:null,uid:c.magic!.nextUid++};c.b[source]={k:'aetherwell',lvl:3,doneAt:null,uid:c.magic!.nextUid++};eraStaff(c,source,5);stepMagic(c,MIN);
 const base={hp:1000,maxHp:1000,y:20.5,era:7,until:1e9,nextHit:1e9,repath:1e9};
 const normal:Zombie={...base,id:1,kind:'normal',x:32},breaker:Zombie={...base,id:2,kind:'breaker',x:33};
 const id=magicSiteId(c.b[source]);c.magic!.mana[id]=100;magicStructureDefense(c,180000,[normal,breaker],[]);
 assert.equal(normal.hp,1000);assert.equal(breaker.hp,820);assert.equal(c.magic!.mana[id],88);
});
