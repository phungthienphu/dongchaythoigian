import test from 'node:test';
import assert from 'node:assert/strict';
import {newCity,idx} from './engine';
import {zombieStats,zombieWave,zombieStructureDamage,stepZombies} from './zombies';
test('all eras reduce the prior total by thirty percent and halve prior breakers with bounded integer counts',()=>{
 for(const pop of [0,1,40,100,300,680,1717,4000])for(let era=1;era<=9;era++)for(const index of [1,3]){
  const old=Math.max(era>=6?8:1,Math.ceil(pop/40*(era>=6?1.75+.2*Math.min(3,era-6):1))),w=zombieWave(pop,era,index);
  assert.equal(w.total,Math.max(1,Math.round(old*.7)));assert.equal(w.breaker,era>=5?Math.floor(Math.floor(old/5)/2):0);assert.equal(w.normal+w.super+w.breaker,w.total);assert.ok(w.normal>=0&&w.super>=0&&w.breaker>=0);
 }
});
test('only walls and gates halve each zombie kind building damage across eras',()=>{
 for(const kind of ['normal','super','breaker'] as const)for(let era=1;era<=9;era++)for(const k of ['wall','gate','house','hospital','watchtower'] as const){const spec=zombieStats(kind,era);assert.equal(zombieStructureDamage(spec,{k}),spec.damage*spec.building*(k==='wall'||k==='gate'?.5:1));}
});
test('actual direct and fallback combat bites use the fortification multiplier, including saved zombies',()=>{
 for(const k of ['wall','gate','house'] as const)for(const kind of ['normal','breaker'] as const)for(const start of [9.5,8.5]){
  const c=newCity(0,123);c.t.fill(0);c.seen.fill(1);c.people=[];c.army={};c.b={};c.era=6;c.zombies!.nextAt=1e9;
  const tile=idx(10,10);c.b[tile]={k,lvl:3,doneAt:null};const spec=zombieStats(kind,6);
  c.zombies!.actors=[{id:1,kind,era:6,hp:spec.hp,maxHp:spec.hp,x:start,y:10.5,until:100000,nextHit:0,repath:0,target:`b:${tile}`,targetUntil:100000}];
  const loaded=JSON.parse(JSON.stringify(c));for(let at=1000;at<=10000&&!c.b[tile].zombieDamage;at+=1000){stepZombies(c,at);stepZombies(loaded,at);}
  assert.equal(c.b[tile].zombieDamage,zombieStructureDamage(spec,c.b[tile]),k+kind);assert.deepEqual(loaded,c);
 }
});
