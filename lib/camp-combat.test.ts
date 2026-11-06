import test from 'node:test';
import assert from 'node:assert/strict';
import { newCity, G, idx, applyAction, settle, troopCount, expeditionPosition, campDefenders, UNITS, type City } from './engine';
function fixture(fighters=10,power=90):City {
  const c=newCity(0,123);c.t.fill(G);c.seen.fill(1);c.b={};c.camp=idx(10,10);
  c.b[c.camp]={k:'barracks',lvl:3,doneAt:null};c.b[idx(8,8)]={k:'hall',lvl:3,doneAt:null};
  c.army={club:fighters,medic:2};c.res.food=5000;c.camps=[{id:1,at:idx(18,10),power,loot:{wood:20},cleared:false,respawnAt:null}];
  assert.equal(applyAction(c,{type:'attack',camp:1,units:{club:fighters}},0),null);return c;
}
test('garrison composition scales with camp power and can include ranged defenders',()=>{
  assert.deepEqual(campDefenders(0),{});assert.equal(troopCount(campDefenders(90)),10);assert.equal(campDefenders(90).sling,2);
});
test('arrival starts actual combat; simultaneous exchanges cause casualties on both sides',()=>{
  const c=fixture(),e=c.exps[0];settle(c,Math.ceil(e.arrive/1000)*1000);
  assert.equal(e.resolved,false);assert.ok(e.combat);assert.equal(troopCount(e.units),10);assert.equal(troopCount(e.combat.defenders),10);
  const endpoint=expeditionPosition(e,e.arrive)!,hold=expeditionPosition(e,e.arrive+500)!;
  assert.equal(endpoint.x,hold.x);assert.equal(endpoint.y,hold.y);
  settle(c,e.arrive+3000);assert.ok(troopCount(e.units)<10);assert.ok(troopCount(e.combat.defenders)<10);
  for(const u of ['club','sling'] as const)assert.ok((e.combat.defenderHp[u]??0)<=(e.combat.defenders[u]??0)*UNITS[u].hp);
});
test('combat, casualties, loot and return agree for offline versus irregular online settlement',()=>{
  const a=fixture(18),b=structuredClone(a),until=120000;
  settle(a,until);for(let at=137;at<until;at+=1703)settle(b,at);settle(b,until);
  assert.deepEqual(a,b);assert.equal(a.exps.length,0);assert.equal(a.camps[0].cleared,true);assert.equal(a.wins,1);assert.ok((a.army.club??0)<18);
  const wood=a.res.wood;settle(a,until+1000);assert.equal(a.res.wood,wood);assert.equal(a.wins,1);
});
test('weak army loses, enemy survivors persist, no loot is awarded',()=>{
  const c=fixture(1,180),wood=c.res.wood;settle(c,120000);
  assert.equal(c.camps[0].cleared,false);assert.ok(troopCount(c.camps[0].garrison!)>0);assert.equal(c.wins,0);assert.equal(c.res.wood,wood);assert.equal(c.army.club,0);
});
test('one active army per camp; recall during combat preserves surviving defenders and follows route home',()=>{
  const c=fixture(10,180),e=c.exps[0];c.army.club=2;
  assert.match(applyAction(c,{type:'attack',camp:1,units:{club:1}},0)!,/Đã có đoàn/);
  settle(c,e.arrive+2000);const before=expeditionPosition(e,c.last)!;
  assert.equal(applyAction(c,{type:'recall',exp:e.id},c.last),null);
  const after=expeditionPosition(e,c.last)!;assert.equal(before.x,after.x);assert.equal(before.y,after.y);
  assert.deepEqual(c.camps[0].garrison,e.combat!.defenders);settle(c,e.back+1000);assert.equal(c.exps.length,0);assert.equal(c.wins,0);
});
test('medic heals only living members, cannot resurrect losses',()=>{
  const c=fixture();const e=c.exps[0];e.units.medic=2;settle(c,e.arrive+3000);
  const fight=e.combat!;assert.ok((e.units.club??0)<10);
  assert.ok((fight.hp.club??0)<=(e.units.club??0)*UNITS.club.hp);assert.equal(e.units.medic,2);
});
