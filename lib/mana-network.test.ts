import test from 'node:test';
import assert from 'node:assert/strict';
import {manaNetwork,spendMana,type ManaSite} from './mana-network';
const site=(id:string,x:number,y:number,kind:ManaSite['kind']='manarelay'):ManaSite=>({id,tile:y*96+x,kind,level:1,enabled:true});
test('mana reaches across at most three relays and never crosses disconnected terrain',()=>{
 const sites=[site('s',1,1,'aetherwell'),site('r1',7,1),site('r2',13,1),site('r3',19,1),site('r4',25,1),site('yes',24,1,'mageacademy'),site('no',30,1,'mageacademy')];
 const graph=manaNetwork(sites,()=>true);assert.equal(graph.bindings.yes.primary,'s');assert.equal(graph.bindings.no.primary,undefined);
 const blocked=manaNetwork(sites,(a,b)=>!(a.tile%96<10&&b.tile%96>=10));assert.equal(blocked.bindings.yes.primary,undefined);
});
test('health receives a finite source slot before industry; overlapping sources do not add mana',()=>{
 const sites=[site('s',10,10,'aetherwell'),...Array.from({length:4},(_,n)=>site(`a${n}`,11,10,'mageacademy')),site('health',10,11,'rivershrine')];
 const graph=manaNetwork(sites,()=>true);assert.equal(graph.sources.s.used,4);assert.equal(graph.bindings.health.primary,'s');assert.equal(Object.values(graph.bindings).filter(b=>b.primary).length,4);
 const balances={s:50};assert.deepEqual(spendMana(graph,balances,'health',60),{error:'Nguồn chính thiếu mana; nguồn dự phòng thiếu mana hoặc hết chỗ.'});assert.equal(balances.s,50);
});
test('fallback debits one source and transfers one slot without double-spending',()=>{
 const sites=[site('s1',10,10,'aetherwell'),site('s2',12,10,'manaspire'),site('r',11,10,'rivershrine')];
 const graph=manaNetwork(sites,()=>true),balances={s1:10,s2:80};assert.deepEqual(spendMana(graph,balances,'r',60),{source:'s2'});assert.deepEqual(balances,{s1:10,s2:20});assert.equal(graph.sources.s1.used,0);assert.equal(graph.sources.s2.used,1);assert.equal(graph.bindings.r.primary,'s2');
 const before=structuredClone({graph,balances});assert.ok('error' in spendMana(graph,balances,'r',60));assert.deepEqual({graph,balances},before);
});
test('a stopped relay disconnects consumers; bonuses change capacity without inventing sources',()=>{
 const sites=[site('s',1,1,'aetherwell'),{...site('relay',7,1),enabled:false},site('r',12,1,'mageacademy')];
 const graph=manaNetwork(sites,()=>true,{awakening:true,fourSpirits:true,regulated:new Set(['s'])});assert.equal(graph.bindings.r.primary,undefined);assert.deepEqual(graph.sources.s,{slots:6,used:0,capacity:360});
});
