import test from 'node:test';
import assert from 'node:assert/strict';
import {MAGIC_BUILDINGS,MAGIC_RESEARCH,MAGIC_RESOURCES,magicDef,type MagicBuilding,type Research} from './magic-data';
/** Trace availability rather than quantities: prices and runtime throughput are
 * tested separately. This catches a producer/research requiring its own output. */
test('all three eras can bootstrap their new goods and research from the preceding era',()=>{
 const goods=new Set<string>(['food','wood','stone','copper','gold','coal']),built=new Set<MagicBuilding>(),research=new Set<Research>();let knowledge=false,mana=false;
 const hasGoods=(cost:Record<string,number>)=>Object.keys(cost).every(r=>goods.has(r));
 for(const era of [7,8,9]){
  for(let pass=0;pass<30;pass++){
   for(const kind of Object.keys(MAGIC_BUILDINGS)as MagicBuilding[]){const def=magicDef(kind);if(def.era>era||def.research&&!research.has(def.research)||!hasGoods(def.cost))continue;
    built.add(kind);if(def.source)mana=true;if(def.mana!==undefined&&!mana)continue;
    if(def.input&&!hasGoods(def.input))continue;for(const r of Object.keys(def.output??{}))goods.add(r);if(def.knowledge)knowledge=true;
   }
   if(knowledge&&built.has('mageacademy'))for(const key of Object.keys(MAGIC_RESEARCH)as Research[]){const def=MAGIC_RESEARCH[key];if(def.era<=era&&def.requires.every(r=>research.has(r))&&hasGoods(def.goods))research.add(key);}
  }
  for(const resource of MAGIC_RESOURCES.slice(0,era===7?2:era===8?3:4))assert.ok(goods.has(resource),`era ${era}: cannot bootstrap ${resource}`);
 }
 assert.equal(research.size,6);assert.ok(built.has('riverpalace'));assert.ok(built.has('spiritgate'));
});
test('bootstrap crystal and rune workshops consume no mana or new research; relays never generate',()=>{
 for(const kind of ['crystalworks','runeworks']as const){assert.equal(magicDef(kind).mana,undefined);assert.equal(magicDef(kind).research,undefined);}
 assert.equal(magicDef('manarelay').source,undefined);assert.equal(magicDef('essenceforge').research,undefined);assert.equal(magicDef('celestialforge').research,undefined);
});
