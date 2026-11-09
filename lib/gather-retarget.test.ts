import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeIndustry} from './industry';
import {applyAction,CAP,F,G,HL,O,GOLD,DIAMOND,COAL,MIN,idx,newCity,settle,taskResource,workforceCounts,stats,derive,depositCapacity,type City,type ResKey} from './engine';

function fixture():City {
  const c=newCity(0,123);
  c.t.fill(G);c.seen.fill(1);c.b={};c.herds=[];c.camps=[];c.exps=[];
  c.camp=idx(20,20);c.people=c.people.slice(0,1);c.pop=1;c.popAcc=0;c.wildernessAt=1e15;
  c.res={food:500,wood:0,stone:0,copper:0,gold:0,diamond:0,coal:0};
  for(const p of c.people){p.pos=c.camp;p.task={t:'idle'};delete p.haul;}
  return c;
}
function chop(c:City,at=idx(22,20)) {
  c.t[at]=F;
  assert.equal(applyAction(c,{type:'assign',ids:c.people.map(p=>p.id),task:{t:'chop',at}},0),null);
  return at;
}

test('exhausted forest retargets beyond four tiles and preserves all manually assigned workers',()=>{
  const c=fixture();c.people=Array.from({length:60},(_,i)=>({id:i+1,name:`Dân ${i}`,pos:c.camp,task:{t:'idle'}}));c.pop=60;
  const source=chop(c),next=idx(35,20);c.t[next]=F;c.dep[source]=CAP.forest-3;
  settle(c,25_000);
  assert.equal(c.t[source],G);assert.equal(workforceCounts(c).counts.wood,60);
  assert.ok(c.people.every(p=>p.task.t==='chop'&&p.task.at===next&&p.assignment==='manual'));
  assert.ok(c.res.wood>0&&c.res.wood<=3); // partial last load was delivered only once
});

test('no source keeps the group waiting and retries after exploration reveals another forest',()=>{
  const c=fixture(),source=chop(c),next=idx(35,20);c.t[next]=F;c.seen[next]=0;c.dep[source]=CAP.forest-3;
  settle(c,25_000);
  const p=c.people[0];assert.equal(taskResource(c,p),'wood');assert.equal(p.haul,undefined);assert.ok(p.gatherRetryAt!>c.last);
  assert.equal(stats(c,derive(c),c.last).rate.wood,-stats(c,derive(c),c.last).upkeep.wood);
  assert.ok(c.res.wood>2.99&&c.res.wood<=3);c.seen[next]=1;
  settle(c,45_000);
  assert.equal(p.task.t==='chop'&&p.task.at,next);assert.ok(p.haul);assert.equal(p.gatherRetryAt,undefined);
});

test('retarget ignores an enclosed nearer source and follows a real route to a farther one',()=>{
  const c=fixture(),source=chop(c),blocked=idx(24,20),reachable=idx(36,20);c.t[blocked]=F;c.t[reachable]=F;c.dep[source]=CAP.forest-1;
  for(let y=19;y<=21;y++)for(let x=23;x<=25;x++)if(idx(x,y)!==blocked)c.b[idx(x,y)]={k:'wall',lvl:1,doneAt:null};
  settle(c,25_000);
  assert.equal(c.people[0].task.t==='chop'&&c.people[0].task.at,reachable);
  assert.ok(c.people[0].haul?.route.every(i=>c.b[i]?.k!=='wall'));
});

test('a newly blocked current source retargets instead of stalling forever',()=>{
  const c=fixture(),blocked=chop(c,idx(24,20)),reachable=idx(20,25);c.t[reachable]=F;
  delete c.people[0].haul;
  for(let y=19;y<=21;y++)for(let x=23;x<=25;x++)if(idx(x,y)!==blocked)c.b[idx(x,y)]={k:'wall',lvl:1,doneAt:null};
  settle(c,1000);assert.equal(c.people[0].task.t==='chop'&&c.people[0].task.at,reachable);assert.ok(c.people[0].haul);
});

test('each mineral keeps its original resource after depletion, including legacy tasks',()=>{
  for(const [terrain,resource] of [[HL,'stone'],[O,'copper'],[GOLD,'gold'],[DIAMOND,'diamond'],[COAL,'coal']] as const){
    const c=fixture(),source=idx(22,20),next=idx(35,20);c.era=6;initializeIndustry(c,0);c.t.fill(G);c.t[source]=terrain;c.t[next]=terrain;if(resource!=='stone')c.t[idx(23,22)]=HL;
    c.people[0].task={t:'mine',at:source};c.dep[source]=depositCapacity(terrain)-1;
    settle(c,(resource==='coal'?11:5)*MIN);
    assert.equal(c.t[source],G,resource);assert.equal(taskResource(c,c.people[0]),resource);
    assert.equal(c.people[0].task.t==='mine'&&c.people[0].task.at,next,resource);
    assert.equal(workforceCounts(c).counts[resource],1);assert.ok(c.res[resource]>=1);
  }
});

test('legacy loaded miners remember ore from cargo and never switch to nearby stone',()=>{
  const c=fixture(),source=idx(22,20),p=c.people[0];c.t[idx(23,22)]=HL;
  p.task={t:'mine',at:source};p.pos=c.camp;
  p.haul={phase:'unload',tile:c.camp,route:[c.camp],at:0,nextAt:1000,routeStart:0,carried:1,resource:'gold',capacity:5,source:{kind:'tile',key:source},taskKey:JSON.stringify(p.task),drop:c.camp};
  assert.equal(taskResource(c,p),'gold');settle(c,MIN);
  assert.equal(c.res.gold,1);assert.equal(taskResource(c,p),'gold');assert.ok(p.gatherRetryAt);assert.equal(c.res.stone,0);
});

test('legacy miners already working retain their completion time when the resource is recorded',()=>{
  const c=fixture(),source=idx(22,20),p=c.people[0];c.t[source]=O;
  assert.equal(applyAction(c,{type:'assign',ids:[p.id],task:{t:'mine',at:source}},0),null);
  settle(c,2000);assert.equal(p.haul?.phase,'work');const nextAt=p.haul!.nextAt;
  p.task={t:'mine',at:source};p.haul!.taskKey=JSON.stringify(p.task);
  settle(c,3000);assert.equal(p.haul!.nextAt,nextAt);assert.equal(taskResource(c,p),'copper');
});

test('rest, move and scout orders release a waiting group immediately and are not stolen',()=>{
  for(const task of [{t:'idle'},{t:'move',to:idx(25,20)},{t:'explore',to:idx(25,20)}] as const){
    const c=fixture(),source=chop(c);c.dep[source]=CAP.forest-1;settle(c,25_000);assert.ok(c.people[0].gatherRetryAt);
    assert.equal(applyAction(c,{type:'assign',ids:[c.people[0].id],task},25_000),null);
    assert.equal(c.people[0].gatherRetryAt,undefined);c.t[idx(26,20)]=F;settle(c,MIN);
    assert.equal(workforceCounts(c).counts.wood,0);assert.equal(c.people[0].task.t,'idle');
  }
});

test('retarget and waiting retries are identical across offline, fragmented and serialized recovery',()=>{
  const initial=fixture(),source=chop(initial);initial.dep[source]=CAP.forest-1;
  initial.t[idx(35,20)]=F;initial.dep[idx(35,20)]=CAP.forest-1;
  initial.t[idx(22,23)]=GOLD;initial.era=3;
  initial.people.push({id:99,name:'Thợ mỏ',pos:initial.camp,task:{t:'mine',at:idx(22,23)}});initial.pop=2;
  initial.dep[idx(22,23)]=CAP.gold-1;
  const full=structuredClone(initial),fragmented=structuredClone(initial);let recovery=structuredClone(initial);const end=5*MIN+351;
  settle(full,end);for(let at=137;at<end;at+=1731)settle(fragmented,at);settle(fragmented,end);
  do {settle(recovery,end,{maxTicks:17,maxMs:Infinity});recovery=JSON.parse(JSON.stringify(recovery));}while(recovery.catchUp);
  assert.deepEqual(fragmented,full);assert.deepEqual(recovery,JSON.parse(JSON.stringify(full)));
  for(const resource of ['wood','gold'] as ResKey[])assert.equal(workforceCounts(full).counts[resource],1);
});
