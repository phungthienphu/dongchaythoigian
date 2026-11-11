import test from 'node:test';
import assert from 'node:assert/strict';
import {B,MIN,RES,idx,storageCapacity,stats,derive,type Building} from './engine';
import {eraFixture,eraStaff} from './era-fixtures.test-utils';
import {initializeMagic,stepMagic,magicSiteId,magicStructureDefense,deliverMagicSupply} from './magic';
import {magicCargoLimit,chargeMagicCargo} from './magic-elements';
import {isActionInput} from './action-input';
import {MAGIC_EXPANSION} from './building-expansion';
import type {Zombie} from './zombies';
function village(){const c=eraFixture(7);initializeMagic(c,0);return c;}
function place(c:ReturnType<typeof village>,k:Building['k'],x:number,y:number,n=0){const tile=idx(x,y),b:Building={k,lvl:1,doneAt:null,uid:c.magic!.nextUid++,builtAt:0};c.b[tile]=b;if(n)eraStaff(c,tile,n);return b;}

test('expanded buildings cross the action boundary and add real storage and housing',()=>{
 for(const k of Object.keys(MAGIC_EXPANSION))assert.equal(isActionInput({type:'build',k,x:30,y:30}),true,k);
 const c=village(),before=stats(c,derive(c),0).housing;
 place(c,'arcaneresidence',30,30);assert.equal(stats(c,derive(c),0).housing-before,90);
 const store=place(c,'crystalgranary',31,30);store.lvl=3;
 for(const r of RES)assert.equal(storageCapacity(store,r),24000,r);
 assert.equal(B.herbalconservatory.prod?.food,900);
});

test('a carried era-7 recipe cannot generate cargo without its bound mana',()=>{
 const c=village(),source=place(c,'aetherwell',30,30),factory=place(c,'herbalconservatory',32,30);
 assert.equal(magicCargoLimit(c,factory),0);stepMagic(c,MIN);
 const id=magicSiteId(source);c.magic!.mana[id]=1;
 assert.equal(magicCargoLimit(c,factory),30);
 chargeMagicCargo(c,factory,30);assert.equal(c.magic!.mana[id],0);
 assert.equal(magicCargoLimit(c,factory),0);
});

test('new mana source consumes delivered buffers, never global stocks directly',()=>{
 const c=village(),source=place(c,'manacistern',30,30,3);c.res.aetherCrystal=100;
 stepMagic(c,MIN);const id=magicSiteId(source);
 assert.equal(c.magic!.mana[id]??0,0);assert.equal(c.res.aetherCrystal,100);
 assert.equal(deliverMagicSupply(c,idx(30,30),'aetherCrystal',6),6);
 stepMagic(c,2*MIN);assert.equal(c.magic!.mana[id],3);assert.equal(c.res.aetherCrystal,100);
 assert.ok(c.magic!.factories[id].input.aetherCrystal!<6);
});

test('bastion respects mana cost, target cap and firing cadence',()=>{
 const c=village(),source=place(c,'aetherwell',30,30);place(c,'wardbastion',36,30);stepMagic(c,MIN);
 const id=magicSiteId(source);c.magic!.mana[id]=10;
 const zs:Zombie[]=[1,2].map(id=>({id,kind:'normal',hp:200,maxHp:200,x:40.5,y:30.5,era:7,until:1e9,nextHit:1e9,repath:1e9}));
 magicStructureDefense(c,64000,zs,[]);assert.deepEqual(zs.map(z=>z.hp),[130,200]);assert.equal(c.magic!.mana[id],5);
 magicStructureDefense(c,65000,zs,[]);assert.equal(zs[0].hp,130);
 magicStructureDefense(c,68000,zs,[]);assert.equal(zs[0].hp,60);assert.equal(c.magic!.mana[id],0);
 magicStructureDefense(c,72000,zs,[]);assert.equal(zs[0].hp,60);
});
