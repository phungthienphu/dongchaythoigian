import test from 'node:test';
import assert from 'node:assert/strict';
import {newCity,idx,RES,levelCost,maintenanceCost,applyAction,type Building} from './engine';
import {zombieBuildingHp,buildingIntegrity} from './zombies';
import {isActionInput} from './action-input';
const at=100000,tile=idx(10,10),action={type:'maintain' as const,x:10,y:10};
function fixture(){const c=newCity(at,123);c.b[tile]={k:'house',lvl:2,doneAt:null};for(const r of RES)c.res[r]=100000;c.b[tile].zombieDamage=zombieBuildingHp(c.b[tile])*.5;return c;}
test('maintenance quotes missing HP fraction with correct era costs and per-resource ceiling',()=>{
 for(const era of [1,4,6])for(const k of ['house','wall','hospital'] as const)for(const fraction of [.001,.25,.5,.99]){const b:Building={k,lvl:2,doneAt:null};b.zombieDamage=zombieBuildingHp(b)*fraction;const base=levelCost(k,2,era),quote=maintenanceCost(b,era);for(const r of RES)assert.equal(quote[r]??0,Math.ceil((base[r]??0)*fraction));}
});
test('maintenance restores full HP once and preserves instance, level, age and investment',()=>{
 const c=fixture(),b=c.b[tile];b.uid=97;b.builtAt=1;b.investment={wood:200};const metadata={...b};const cost=maintenanceCost(b,c.era),before={...c.res};assert.equal(applyAction(c,action,at),null);assert.equal(buildingIntegrity(b),zombieBuildingHp(b));for(const r of RES)assert.equal(c.res[r],before[r]-(cost[r]??0));delete metadata.zombieDamage;assert.deepEqual(b,metadata);
 const paid={...c.res};assert.match(applyAction(c,action,at)??'',/đầy HP/);assert.deepEqual(c.res,paid);
});
test('missing materials reject atomically without healing or charging anything',()=>{
 const c=fixture();c.res.wood=0;const before=structuredClone(c.b[tile]),resources={...c.res};assert.match(applyAction(c,action,at)??'',/Thiếu/);assert.deepEqual(c.b[tile],before);assert.deepEqual(c.res,resources);
});
test('maintenance retains fire and flood; disaster repair retains outstanding zombie damage',()=>{
 const c=fixture(),b=c.b[tile];b.burned=true;b.flooded=true;b.damageCause='earthquake';assert.equal(applyAction(c,action,at),null);assert.equal(b.burned,true);assert.equal(b.flooded,true);assert.equal(b.damageCause,'earthquake');b.zombieDamage=10;assert.equal(applyAction(c,{type:'repair',x:10,y:10},at),null);assert.equal(b.zombieDamage,10);assert.equal(b.burned,false);assert.equal(b.flooded,false);
});
test('no resurrection, maintenance during construction, or PvP snapshot healing',()=>{
 for(const mode of ['gone','destroyed','construction','battle'] as const){const c=fixture();if(mode==='gone')delete c.b[tile];if(mode==='destroyed')c.b[tile].zombieDamage=zombieBuildingHp(c.b[tile]);if(mode==='construction')c.b[tile].doneAt=at+60000;if(mode==='battle')c.battleId='test';const res={...c.res},building=structuredClone(c.b[tile]);assert.ok(applyAction(c,action,at),mode);assert.deepEqual(c.res,res);assert.deepEqual(c.b[tile],building);}
});
test('backend recalculates the actual damaged fraction; valid saves retain repaired HP',()=>{
 const c=fixture();const displayed=maintenanceCost(c.b[tile],c.era);c.b[tile].zombieDamage!*=1.5;const actual=maintenanceCost(c.b[tile],c.era),before={...c.res};assert.ok(actual.wood!>displayed.wood!);assert.equal(applyAction(c,action,at),null);assert.equal(c.res.wood,before.wood-actual.wood!);const loaded=JSON.parse(JSON.stringify(c));assert.equal(buildingIntegrity(loaded.b[tile]),zombieBuildingHp(loaded.b[tile]));
});
test('maintenance action rejects malformed coordinates and accepts the map corners',()=>{
 assert.equal(isActionInput({type:'maintain',x:95,y:0}),true);for(const x of [-1,96,NaN,Infinity,1.1,'10'])assert.equal(isActionInput({...action,x}),false);
});
