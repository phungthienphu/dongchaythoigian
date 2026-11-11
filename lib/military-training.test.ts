import test from 'node:test';
import assert from 'node:assert/strict';
import {G,HOUR,RES,UNITS,applyAction,armyCap,armyUsed,barracksCapacity,demolitionQuote,homeSoldiers,idx,newCity,settle,trainingCost,trainingLanes,trainingPlan,type City} from './engine';
import {applyCommandBatch,type SyncCommand} from './city-sync';

const sites=[idx(20,20),idx(30,20),idx(40,20)];
function fixture(era=6,levels=[3,3,3]):City{
 const c=newCity(0,123);c.era=era;c.t.fill(G);c.seen.fill(1);c.b={};c.people=[];c.pop=0;c.army={};c.queue=[];c.camps=[];c.herds=[];c.camp=idx(20,22);c.manualWorkforce=true;
 levels.forEach((lvl,n)=>{c.b[sites[n]]={k:'barracks',lvl,doneAt:null};});
 c.b[idx(18,18)]={k:'grandstore',lvl:3,doneAt:null};for(const r of RES)c.res[r]=100000;
 c.wildernessAt=100*HOUR;c.disaster={kind:'flood',at:100*HOUR,level:1,center:0};settle(c,0);return c;
}
test('capacity grows with era and level; inactive facilities add no slots and existing troops survive capacity loss',()=>{
 for(let era=1;era<=9;era++){
  const c=fixture(era);assert.equal(armyCap(c),[0,90,90,180,240,300,360,420,480,540][era]);
  for(let level=1;level<=3;level++){for(const tile of sites)c.b[tile].lvl=level;assert.equal(armyCap(c),3*barracksCapacity(era,level));}
 }
 const c=fixture();c.army={club:360};c.b[sites[0]].burned=true;assert.equal(armyCap(c),240);assert.equal(armyUsed(c),360);
 const before=structuredClone(c);assert.ok(applyAction(c,{type:'train',u:'club',n:1},0));assert.deepEqual(c,before);
});
test('a batch distributes across independent facilities, charges exactly once and spawns at each actual entrance',()=>{
 const c=fixture(3),before={...c.res},plan=trainingPlan(c,'sword',6,0);assert.equal(plan.error,null);assert.equal(plan.doneAt,180000);
 assert.equal(new Set(plan.orders.map(q=>q.source)).size,3);assert.equal(applyAction(c,{type:'train',u:'sword',n:6},0),null);assert.deepEqual(c.queue,plan.orders);
 for(const r of RES)assert.equal(c.res[r],before[r]-(trainingCost('sword',3)[r]??0)*6);
 assert.equal(armyUsed(c),6);settle(c,90000);assert.equal(c.army.sword,3);assert.equal(c.queue.length,3);
 const actors=homeSoldiers(c,90000);for(const tile of sites)assert.ok(actors.some(a=>Math.hypot(a.x-(tile%96+.5),a.y-(Math.floor(tile/96)+.5))<2));
 settle(c,180000);assert.equal(c.army.sword,6);assert.equal(c.queue.length,0);
});
test('same facility stays serial across commands; mixed levels use earliest completion and never overlap a lane',()=>{
 const c=fixture(3,[1,2,3]);applyAction(c,{type:'train',u:'sword',n:7},0);applyAction(c,{type:'train',u:'club',n:3},0);
 assert.equal(c.queue[0].source,sites[2]);assert.equal(c.queue[0].doneAt,90000);
 for(const lane of trainingLanes(c)){for(let n=1;n<lane.orders.length;n++)assert.ok(lane.orders[n].startedAt!>=lane.orders[n-1].doneAt);}
 assert.deepEqual(trainingLanes(c).flatMap(l=>l.orders).length,10);
});
test('support buildings train independently without holding up infantry and missing facilities reject atomically',()=>{
 const c=fixture(3,[1]);c.b[idx(22,20)]={k:'logistics',lvl:1,doneAt:null};c.b[idx(24,20)]={k:'infirmary',lvl:1,doneAt:null};
 for(const u of ['sword','wagon','medic']as const)assert.equal(applyAction(c,{type:'train',u,n:1},0),null);
 assert.equal(c.queue.find(q=>q.u==='sword')!.startedAt,0);assert.equal(c.queue.find(q=>q.u==='wagon')!.startedAt,0);assert.equal(c.queue.find(q=>q.u==='medic')!.startedAt,0);
 settle(c,25000);assert.equal(c.army.wagon,1);assert.equal(c.army.medic,1);assert.equal(c.army.sword,undefined);assert.equal(c.queue.length,1);
 c.b[idx(24,20)].burned=true;const before=structuredClone(c);assert.match(applyAction(c,{type:'train',u:'medic',n:1},25000)!,/Quân y viện/);assert.deepEqual(c,before);
});
test('legacy paid orders preserve dates, serialize normally and hold new orders until their own backlog finishes',()=>{
 const c=fixture(3,[3]);c.queue=[{u:'club',doneAt:30000},{u:'club',startedAt:30000,doneAt:60000}];
 const old=structuredClone(c.queue),before={...c.res};assert.equal(applyAction(c,{type:'train',u:'sword',n:1},0),null);
 assert.equal(c.queue.find(q=>q.u==='sword')!.startedAt,60000);assert.deepEqual(c.queue.slice(0,2),old);
 c.b[sites[0]].burned=true;settle(c,60000);assert.equal(c.army.club,2);assert.equal(c.queue.length,1);assert.equal(c.queue[0].paused,'inactive');
 assert.ok(c.res.food<before.food);c.b[sites[0]].burned=false;settle(c,150000);assert.equal(c.army.sword,1);
});
test('burned or flooded lanes pause and resume without duplicate fees or blocking other facilities',()=>{
 for(const kind of ['burned','flooded']as const){
  const c=fixture(3,[1,1]);applyAction(c,{type:'train',u:'club',n:4},0);const queued=armyUsed(c);c.b[sites[0]][kind]=true;
  settle(c,30000);assert.equal(c.army.club,1);assert.equal(c.queue.filter(q=>q.source===sites[0]).length,2);assert.equal(c.queue.find(q=>q.source===sites[0])!.paused,'inactive');assert.equal(armyUsed(c),queued);
  c.b[sites[0]][kind]=false;settle(c,31000);assert.equal(c.queue.find(q=>q.source===sites[0])!.paused,undefined);
  settle(c,90000);assert.equal(c.army.club,4);assert.equal(c.queue.length,0);
 }
});
test('sealed entrance waits at the assigned facility, other lanes finish, reopening releases the recruit',()=>{
 const c=fixture(3,[1,1]);applyAction(c,{type:'train',u:'club',n:2},0);
 for(let x=19;x<=21;x++)for(let y=19;y<=21;y++)if(x!==20||y!==20)c.b[idx(x,y)]={k:'wall',lvl:1,doneAt:null};
 settle(c,30000);assert.equal(c.army.club,1);assert.equal(c.queue.length,1);assert.equal(c.queue[0].source,sites[0]);assert.equal(c.queue[0].paused,'exit');
 delete c.b[idx(21,20)];settle(c,31000);assert.equal(c.army.club,2);assert.equal(c.queue.length,0);
});
test('quantity preview enforces shared capacity, affordability, batch bounds and era gates without mutation',()=>{
 const c=fixture(3,[3]);c.army={elephant:10};c.deployedArmy={club:3};c.queue=[{u:'club',doneAt:100000}];c.res.food=800;c.res.copper=250;
 const before=structuredClone(c),plan=trainingPlan(c,'sword',4,0);assert.equal(plan.max,5);assert.equal(plan.free,6);assert.deepEqual(c,before);
 for(const n of [0,51,1.5,NaN]){assert.ok(trainingPlan(c,'sword',n,0).error);assert.ok(applyAction(c,{type:'train',u:'sword',n},0));assert.deepEqual(c,before);}
 assert.match(trainingPlan(c,'sword',7,0).error!,/Còn 6 chỗ/);assert.match(trainingPlan(c,'sword',6,0).error!,/Thiếu 160 lương thực, 50 đồng/);
 assert.equal(trainingPlan(c,'cannon',1,0).max,0);assert.match(trainingPlan(c,'cannon',1,0).error!,/thời đại/);
});
test('facilities with recruits cannot be demolished and upgrades do not retroactively reschedule paid orders',()=>{
 const c=fixture(3,[1]);applyAction(c,{type:'train',u:'club',n:2},0);const old=structuredClone(c.queue);
 assert.match(demolitionQuote(c,sites[0],0).error!,/đang tuyển/);c.b[sites[0]].lvl=3;assert.deepEqual(c.queue,old);
 settle(c,60000);assert.equal(c.army.club,2);assert.equal(demolitionQuote(c,sites[0],60000).error,null);
});
test('parallel training with pauses is identical offline, irregular settlement, JSON reload and 30s command batches',()=>{
 const direct=fixture(3),batch=structuredClone(direct);
 const commands:SyncCommand[]=[{seq:1,id:'train-1',anchor:'signed',at:500,action:{type:'train',u:'sword',n:9}},{seq:2,id:'train-2',anchor:'signed',at:900,action:{type:'train',u:'club',n:12}}];
 for(const command of commands)assert.equal(applyAction(direct,command.action,command.at),null);
 assert.ok(applyCommandBatch(batch,commands,30000).every(r=>!r.error));settle(direct,30000);assert.deepEqual(batch,direct);
 direct.b[sites[0]].burned=true;const split=JSON.parse(JSON.stringify(direct));settle(direct,100000);for(let at=30137;at<100000;at+=3571)settle(split,at);settle(split,100000);assert.deepEqual(split,direct);
 direct.b[sites[0]].burned=false;split.b[sites[0]].burned=false;settle(direct,420000);for(let at=100123;at<420000;at+=17037)settle(split,at);settle(split,420000);assert.deepEqual(split,direct);assert.equal(direct.queue.length,0);assert.equal(direct.army.sword,9);assert.equal(direct.army.club,12);
});
