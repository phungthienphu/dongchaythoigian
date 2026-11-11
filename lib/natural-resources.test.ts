import test from 'node:test';
import assert from 'node:assert/strict';
import {newCity,G,R,F,RES,idx,seedOpenLand,disasterResource,repairCost,levelCost,CRYSTAL_ORE,RUNE_ORE,ESSENCE_ORE,CELESTIAL_ORE,isMagicDeposit,mineralResource,depositCapacity,applyAction,settle,HOUR,type City} from './engine';
function city():City{const c=newCity(0,123);c.t.fill(G);c.seen.fill(1);c.b={};c.people=[];c.herds=[];c.camps=[];c.army={};c.camp=idx(10,10);c.wildernessAt=10*HOUR;c.disaster={kind:'earthquake',at:10*HOUR,level:0,center:c.camp};return c;}
test('four-cell clearings inside building buffers spawn; three cells and pinned routes do not',()=>{
 const c=city();c.t.fill(R);const four=[idx(40,40),idx(41,40),idx(40,41),idx(41,41)],three=[idx(60,60),idx(61,60),idx(60,61)];
 for(const i of [...four,...three])c.t[i]=G;c.b[idx(39,40)]={k:'house',lvl:1,doneAt:null};
 const out=seedOpenLand(c,1000,()=>.4);assert.equal(out.spawned,1);assert.equal(four.filter(i=>c.t[i]!==G).length,1);assert.ok(three.every(i=>c.t[i]===G));
 const pinned=city();pinned.t.fill(R);for(const i of four)pinned.t[i]=G;pinned.people=[{id:1,name:'Thợ',pos:four[0],task:{t:'idle'}}];assert.equal(seedOpenLand(pinned,1000,()=>.4).spawned,0);
});
test('rare deposits require era, chance, available ground, and respect the global cap',()=>{
 const old=city();old.era=6;seedOpenLand(old,1000,()=>0);assert.ok(!old.t.some(isMagicDeposit));
 const c=city();c.era=9;assert.equal(seedOpenLand(c,1000,()=>0).rare,1);
 assert.equal(c.t.filter(isMagicDeposit).length,1);
 for(const tile of [idx(80,80),idx(81,80),idx(82,80)])c.t[tile]=CRYSTAL_ORE;
 assert.equal(seedOpenLand(c,2000,()=>0).rare,0);assert.equal(c.t.filter(isMagicDeposit).length,4);
});
test('disaster loss thresholds are exactly 20% and 10%; cargo survives and queues disappear',()=>{
 for(const [kind,threshold]of [['earthquake',.2],['flood',.1]] as const){
  for(const [roll,lost]of [[threshold,false],[threshold-.000001,true]] as const){
   const c=city(),tile=idx(40,40);c.b[tile]={k:'house',lvl:3,doneAt:null};c.queue=[{u:'club',doneAt:100000,source:tile}];
   c.people=[{id:1,name:'Thợ',pos:tile,task:{t:'work',at:tile},haul:{phase:'return',at:0,nextAt:2000,tile,route:[tile],routeStart:0,resource:'wood',carried:7,capacity:10,taskKey:'work',source:{kind:'building',key:tile}}}];
   assert.equal(disasterResource(c,tile,kind,1000,()=>roll),lost);
   if(lost){assert.equal(c.b[tile],undefined);assert.equal(c.queue.length,0);assert.equal(c.people[0].task.t,'idle');assert.equal(c.people[0].haul?.carried,7);assert.notEqual(c.t[tile],G);}else assert.ok(c.b[tile]);
  }
 }
});
test('repair premiums rise with building level',()=>{
 for(const [burned,rates]of [[true,[.5,.7,.9]],[false,[.25,.4,.6]]] as const)for(const lvl of [1,2,3])assert.equal(repairCost('house',lvl,burned).wood,Math.ceil(levelCost('house',lvl).wood!*rates[lvl-1]));
});
test('all four natural magic resources unlock correctly and are carried into storage',()=>{
 for(const [terrain,era]of [[CRYSTAL_ORE,7],[RUNE_ORE,7],[ESSENCE_ORE,8],[CELESTIAL_ORE,9]] as const){
  const c=city(),tile=idx(13,10),r=mineralResource(terrain);c.era=era;c.t[tile]=terrain;c.b[idx(10,11)]={k:'storehouse',lvl:3,doneAt:null};
  for(const key of RES)c.res[key]=key==='food'?100000:0;
  c.people=[{id:1,name:'Thợ mỏ',pos:c.camp,task:{t:'idle'}}];c.pop=1;
  c.era=era-1;assert.ok(applyAction(c,{type:'assign',ids:[1],task:{t:'mine',at:tile}},0));c.era=era;
  assert.equal(applyAction(c,{type:'assign',ids:[1],task:{t:'mine',at:tile}},0),null);
  const online=structuredClone(c);settle(c,HOUR);for(const at of [1000,347000,1000000,HOUR])settle(online,at);
  assert.deepEqual(c,online);assert.ok(c.res[r]>0);assert.ok(c.dep[tile]!<=depositCapacity(terrain));
 }
});
test('old saves do not apply permanent disaster losses retroactively',()=>{
 const c=city(),tile=idx(40,40);delete c.frontierResourcesStartsAt;c.b[tile]={k:'house',lvl:2,doneAt:null};
 // Loading an old snapshot at a later time sets the new rule's activation time.
 delete c.disaster;settle(c,HOUR);assert.equal(c.frontierResourcesStartsAt,HOUR);
 assert.equal(disasterResource(c,tile,'earthquake',HOUR-1,()=>0),false);assert.ok(c.b[tile]);
 assert.equal(disasterResource(c,tile,'earthquake',HOUR,()=>0),true);
});
