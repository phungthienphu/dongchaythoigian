import test from 'node:test';
import assert from 'node:assert/strict';
import {newCity,G,F,R,HL,GOLD,DIAMOND,W,H,MIN,HOUR,idx,settle,derive,applyAction,renewWilderness,wildernessKeep,expansionRisk,WILDERNESS_MS,FRONTIER_WARNING_MS,type City} from './engine';
function fixture():City{
 const c=newCity(0,123);c.t.fill(G);c.seen.fill(1);c.people=[];c.herds=[];c.camps=[];c.b={};c.camp=idx(15,15);c.era=2;c.army={};c.res={wood:500,stone:500,food:500,copper:400,gold:200,diamond:20,coal:0,aetherCrystal:0,rune:0,essence:0,celestialStone:0};return c;
}
test('30-minute renewal hides and regenerates wilderness while structures, starter land, rivers and deposits at home survive',()=>{
 const c=fixture(),building=idx(40,40),safe=idx(42,42),wild=idx(80,80),water=idx(85,85);
 c.b[building]={k:'hut',lvl:0,doneAt:99999999};c.t[safe]=GOLD;c.dep[safe]=73;c.t[wild]=HL;c.dep[wild]=1500;c.t[water]=R;
 const stock={...c.res},old=[...c.t],result=renewWilderness(c,WILDERNESS_MS);
 assert.ok(result.changed>1000);assert.ok(result.hidden>8000);assert.equal(c.seen[wild],0);assert.equal(c.dep[wild],undefined);
 assert.equal(c.seen[building],1);assert.equal(c.seen[safe],1);assert.equal(c.t[safe],GOLD);assert.equal(c.dep[safe],73);assert.equal(c.t[water],R);
 assert.equal(c.seen[c.camp],1);assert.deepEqual(c.res,stock);assert.equal(c.b[building].lvl,0);
 assert.ok(c.t.some((t,i)=>t!==old[i]));assert.ok(c.t.includes(GOLD));assert.ok(c.t.includes(DIAMOND));
 const next=structuredClone(c);renewWilderness(c,2*WILDERNESS_MS);assert.notDeepEqual(c.t,next.t);
});
test('fully explored maps generate the same wilderness terrain as unexplored maps',()=>{
 const explored=fixture(),unexplored=structuredClone(explored);unexplored.seen.fill(0);
 const full=renewWilderness(explored,WILDERNESS_MS),dark=renewWilderness(unexplored,WILDERNESS_MS);
 assert.ok(full.hidden>0);assert.equal(dark.hidden,0);assert.ok(full.changed>0);
 assert.deepEqual(explored.t,unexplored.t);assert.deepEqual(explored.dep,unexplored.dep);
});
test('actors pin active sources, loaded cargo and journeys; finished orders stop pinning an entire road',()=>{
 const c=fixture(),source=idx(70,70),road=[idx(60,60),idx(61,60),idx(62,60)],trade=idx(75,75);
 c.t[source]=F;c.dep[source]=80;
 c.people=[{id:1,name:'Thợ',pos:source,task:{t:'chop',at:source},haul:{phase:'return',at:0,nextAt:9999999,tile:source,route:road,routeStart:0,resource:'wood',carried:10,capacity:10,taskKey:'x',source:{kind:'tile',key:source}}}];
 c.merchantJourneys=[{id:'trade',depart:0,arrive:1000,back:2*HOUR,villageRoute:[trade]}];
 c.army={club:1};c.homeOrders={'club:0':{at:0,x:60.5,y:60.5,route:road}};
 const cargo=structuredClone(c.people[0].haul);renewWilderness(c,WILDERNESS_MS);
 assert.equal(c.t[source],F);assert.equal(c.dep[source],80);assert.equal(c.seen[trade],1);assert.deepEqual(c.people[0].haul,cargo);
 c.people=[];c.merchantJourneys=[];
 const keep=wildernessKeep(c,3*HOUR);assert.equal(keep[road[0]],0);assert.equal(keep[road[2]],1);
});
test('renewal warnings fire once, migration starts a fresh cycle and offline settlement matches irregular polling across renewal',()=>{
 const c=fixture();c.seen.fill(0);c.seen[c.camp]=1;c.wildernessAt=2000;c.disaster={kind:'earthquake',at:10*HOUR,level:0,center:c.camp};
 c.seen[idx(80,80)]=1;c.merchantJourneys=[{id:'one',depart:0,arrive:1000,back:4000,villageRoute:[idx(80,80)]}];
 const online=structuredClone(c);settle(c,6000);for(const at of [347,1349,2199,3512,4890,6000])settle(online,at);assert.deepEqual(c,online);
 assert.equal(c.log.filter(l=>l.msg.startsWith('Còn 5 phút')).length,1);
 assert.equal(c.log.filter(l=>l.msg.startsWith('Sương phủ')).length,1);
 assert.equal(c.seen[idx(80,80)],1); // the journey was active at renewal; kept until the next cycle
 const old=fixture();old.last=90*MIN;old.haulAt=old.last;settle(old,old.last+1000);assert.equal(old.wildernessAt,2*HOUR);
 assert.ok(!old.log.some(l=>l.msg.startsWith('Sương phủ')));
});
test('expansion increases disaster frequency without regenerating during a live battle',()=>{
 const c=fixture();for(const [area,level,interval]of [[300,0,6*HOUR],[700,1,3*HOUR],[1600,2,90*MIN],[3200,3,HOUR]]){
  c.seen.fill(0);c.seen.fill(1,0,area);assert.deepEqual(expansionRisk(c),{area,level,interval});
 }
 c.battleId='active';c.wildernessAt=1000;const terrain=[...c.t],seen=[...c.seen];settle(c,2000);assert.deepEqual(c.t,terrain);assert.deepEqual(c.seen,seen);
});
test('new exploration accelerates the planned disaster at renewal, and fog does not postpone it again',()=>{
 const c=fixture();c.seen.fill(0);c.seen[c.camp]=1;settle(c,1000);assert.equal(c.disaster!.at,6*HOUR);
 c.seen.fill(1);settle(c,WILDERNESS_MS);assert.equal(c.disaster!.at,WILDERNESS_MS+HOUR);assert.equal(c.disaster!.level,3);
 const planned=c.disaster!.at;settle(c,2*WILDERNESS_MS);assert.equal(c.disaster!.at,planned);
});
test('earthquake warnings, bounded damage and resource-paid repairs; levees still stop extra floods',()=>{
 const c=fixture(),center=idx(40,40);c.b[center]={k:'house',lvl:1,doneAt:null};c.b[idx(41,40)]={k:'hut',lvl:1,doneAt:null};
 c.disaster={kind:'earthquake',at:1000,level:0,center};settle(c,1000);
 assert.equal(c.b[center].burned,true);assert.equal(c.b[center].damageCause,'earthquake');assert.equal(c.b[idx(41,40)].burned,undefined);
 assert.equal(c.log.filter(l=>l.msg.includes('Cảnh báo: động đất')).length,1);assert.ok(c.log.some(l=>l.msg.startsWith('Động đất làm hư 1')));
 const before=c.res.wood;assert.equal(applyAction(c,{type:'repair',x:40,y:40},1000),null);assert.equal(c.b[center].burned,false);assert.equal(c.b[center].damageCause,undefined);assert.ok(c.res.wood<before);
 for(let y=30;y<50;y++)c.t[idx(39,y)]=R;c.b[idx(40,41)]={k:'levee',lvl:1,doneAt:null};assert.equal(derive(c).prot[center],true);
 c.disaster={kind:'flood',at:2000,level:3,center};settle(c,2000);assert.equal(!!c.b[center].flooded,false);assert.ok(c.log.some(l=>l.msg.includes('Lũ tràn bờ')));
 assert.equal(WILDERNESS_MS,30*MIN);assert.equal(FRONTIER_WARNING_MS,5*MIN);assert.equal(c.t.length,W*H);
});
