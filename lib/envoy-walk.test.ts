import test from 'node:test';
import assert from 'node:assert/strict';
import { newCity, G, HL, W, MIN, idx, envoyVillageRoute, envoyVillagePosition } from './engine';
import { beginDiscovery } from './world-discovery';
function city(){const c=newCity(0,123);c.t.fill(G);c.b={[idx(20,20)]:{k:'envoy' as const,lvl:1,doneAt:null}};return c;}
test('envoy walks a passable route out of the village and reverses it on return',()=>{
 const c=city();for(let y=15;y<26;y++)c.t[idx(19,y)]=HL;
 assert.equal(beginDiscovery(c,0),null);const tr=c.trips![0],route=tr.villageRoute!;
 assert.ok(route.length>2);assert.ok(route.every(i=>c.t[i]!==HL));assert.equal(route[0],idx(20,20));
 const out=envoyVillagePosition(tr,5000),back=envoyVillagePosition(tr,tr.back-5000);assert.ok(out);assert.ok(back);assert.equal(out.x,back.x);assert.equal(out.y,back.y);assert.notEqual(out.face,back.face);
 assert.equal(envoyVillagePosition(tr,MIN),null);assert.equal(envoyVillagePosition(tr,tr.back),null);
 const end=route.at(-1)!;assert.ok(end%W===0||end%W===W-1||Math.floor(end/W)===0||Math.floor(end/W)===W-1);
});
test('a sealed embassy rejects departure instead of disappearing or walking through stone',()=>{
 const c=city();for(let y=19;y<=21;y++)for(let x=19;x<=21;x++)if(x!==20||y!==20)c.t[idx(x,y)]=HL;
 assert.deepEqual(envoyVillageRoute(c),[]);assert.match(beginDiscovery(c,0)!,/đường/);assert.equal(c.trips?.length??0,0);
});
