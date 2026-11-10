import {test} from 'node:test';
import assert from 'node:assert/strict';
import {B,HOUR,idx,type BKey,type City} from './engine';
import {eraFixture,eraStaff} from './era-fixtures.test-utils';
import {stepIndustry} from './industry';
import {stepPower,operationJobs} from './modern';
import {pollutionReport} from './pollution-report';

function source(c:City,k:BKey,x:number,lvl=1){
 const tile=idx(x,22);c.b[tile]={k,lvl,doneAt:null};eraStaff(c,tile,operationJobs(c.b[tile],B[k]));
 if(k!=='thermal')for(const p of c.people.filter(p=>p.task.t==='work'&&p.task.at===tile))p.haul={phase:'work',at:0,nextAt:HOUR,tile,route:[tile],routeStart:0,carried:0,capacity:10,resource:'gold',source:{kind:'building',key:tile},taskKey:JSON.stringify(p.task)};
 return tile;
}
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
test('pollution sources sort by actual emissions including thermal power and match hourly simulation',()=>{
 const c=eraFixture(6);source(c,'charcoal',22);source(c,'machine',23);source(c,'factory',24);source(c,'thermal',25);c.industry!.pollution=40;
 stepPower(c,0,HOUR,B);const report=pollutionReport(c,0);
 assert.deepEqual(report.sources.map(b=>b.k),['thermal','factory','machine','charcoal']);near(report.emissions,10);near(report.cleanup,1);near(report.net,9);
 stepIndustry(c,0,HOUR,B);near(c.industry!.pollution,49);
});
test('partial treatment staffing and parks match actual cleanup, without requiring electricity',()=>{
 const c=eraFixture(5),t=idx(22,22),p=idx(23,22);c.b[t]={k:'treatment',lvl:1,doneAt:null};c.b[p]={k:'park',lvl:1,doneAt:null};eraStaff(c,t,1);c.industry!.pollution=50;
 const r=pollutionReport(c,0);near(r.cleanup,1+4/3+2);near(r.cleaners.find(b=>b.tile===t)!.rate,4/3);assert.match(r.cleaners.find(b=>b.tile===t)!.reason,/1\/3/);
 stepIndustry(c,0,HOUR,B);near(c.industry!.pollution,50-r.cleanup);
});
test('assigned cleaners do not clean until arrival and refugees do not count',()=>{
 const c=eraFixture(),t=idx(22,22);c.b[t]={k:'treatment',lvl:1,doneAt:null};eraStaff(c,t,3);
 for(const p of c.people)p.pos=c.camp;
 near(pollutionReport(c,0).cleanup,1);
 c.people[0].pos=t;c.people[0].refuge={x:22.5,y:22.5,pausedAt:0,at:0,arrive:1000,route:[t,c.camp]};
 near(pollutionReport(c,0).cleanup,1);
});
test('inactive sources and cleaners stay visible with zero rates and actionable reasons',()=>{
 const c=eraFixture(6),f=source(c,'factory',22),t=idx(23,22),p=idx(24,22);c.b[f].off=true;c.b[t]={k:'treatment',lvl:1,doneAt:null,flooded:true};c.b[p]={k:'park',lvl:0,doneAt:HOUR};eraStaff(c,t,3);
 const r=pollutionReport(c,0);near(r.emissions,0);near(r.cleanup,1);assert.equal(r.sources[0].reason,'Đang tắt');assert.equal(r.cleaners.find(b=>b.tile===t)!.reason,'Đang ngập');assert.equal(r.cleaners.find(b=>b.tile===p)!.reason,'Đang xây');
});
test('missing inputs and delivery legs do not show full-time production emissions',()=>{
 const c=eraFixture(),f=source(c,'factory',22);c.res.coal=0;
 let r=pollutionReport(c,0);near(r.emissions,0);assert.equal(r.sources[0].reason,'Thiếu nguyên liệu đóng kiện');
 c.res.coal=1000;for(const p of c.people)p.haul!.phase='return';
 r=pollutionReport(c,0);near(r.emissions,0);assert.match(r.sources[0].reason,/mang hàng/);
 c.people[0].haul!.phase='work';near(pollutionReport(c,0).sources.find(b=>b.tile===f)!.rate,3/4);
});
test('green wonder and power fraction reduce production but never halve thermal emissions',()=>{
 const c=eraFixture(6),f=source(c,'complex',22,3),thermal=source(c,'thermal',23),g=idx(24,22);
 c.b[g]={k:'green',lvl:1,doneAt:null};c.modern!.choice='green';c.modern!.completedAt=1;c.modern!.allocation[f]=.5;c.modern!.generation[thermal]=80;
 const r=pollutionReport(c,0);near(r.sources.find(b=>b.tile===f)!.rate,1.2);near(r.sources.find(b=>b.tile===thermal)!.rate,4);near(r.sources.find(b=>b.tile===f)!.potential,2.4);
});
test('upgraded thermal reports required staff and generation-based emissions, not nominal maximum',()=>{
 const c=eraFixture(6),t=source(c,'thermal',22,2);c.people=c.people.slice(0,2);c.pop=2;stepPower(c,0,1000,B);
 const r=pollutionReport(c,0),row=r.sources.find(b=>b.tile===t)!;assert.equal(row.jobs,7);assert.equal(row.workers,2);near(row.rate,6.4*2/7);assert.ok(row.rate<row.potential);
});
test('forecast is conditional, absent when emissions prevent recovery, and report does not mutate the city',()=>{
 const c=eraFixture();c.industry!.pollution=31;const before=structuredClone(c);const r=pollutionReport(c,0);near(r.hoursBelow30!,1.1);assert.deepEqual(c,before);
 source(c,'factory',22);assert.equal(pollutionReport(c,0).hoursBelow30,null);c.industry!.pollution=20;assert.equal(pollutionReport(c,0).hoursBelow30,null);
});
