import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyAction,B,buildMs,canPlace,derive,HOUR,idx,levelCost,MIN,RES,settle} from './engine';
import {eraFixture,eraStaff} from './era-fixtures.test-utils';
import {pollutionCleanup,pollutionRemovalCapacity,stepIndustry} from './industry';
import {pollutionReport} from './pollution-report';
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('green parks are available inland in Industrial and can expand past four, with normal construction costs',()=>{
 const c=eraFixture(5);for(const r of RES)c.res[r]=100_000;
 for(let n=0;n<4;n++)c.b[idx(22+n,22)]={k:'park',lvl:1,doneAt:null};
 const before=c.res.gold;
 assert.equal(canPlace(c,derive(c),'park',26,22),null);
 assert.equal(applyAction(c,{type:'build',k:'park',x:26,y:22},0),null);
 assert.equal(c.b[idx(26,22)].lvl,0);assert.equal(c.b[idx(26,22)].doneAt,buildMs('park',1));assert.equal(c.res.gold,before-B.park.cost.gold!);
 near(pollutionCleanup(c),9); // Four existing parks; unfinished park gives nothing.
 const old=eraFixture(4);assert.match(canPlace(old,derive(old),'park',22,22)!,/Chưa tới/);
});
test('both green infrastructure upgrades charge resources and give no higher capacity before completion',()=>{
 for(const k of ['park','treatment'] as const){
  const c=eraFixture(5),tile=idx(22,22);for(const r of RES)c.res[r]=100_000;c.b[tile]={k,lvl:1,doneAt:null};
  if(k==='treatment')eraStaff(c,tile,3);
  const old=structuredClone(c.res),capacity=pollutionRemovalCapacity(c.b[tile]);
  assert.equal(applyAction(c,{type:'upgrade',x:22,y:22},0),null);
  for(const [r,n]of Object.entries(levelCost(k,2)))assert.equal(c.res[r as keyof typeof old],old[r as keyof typeof old]-n!);
  assert.equal(pollutionRemovalCapacity(c.b[tile]),capacity);
  settle(c,buildMs(k,2));assert.equal(c.b[tile].lvl,2);assert.equal(pollutionRemovalCapacity(c.b[tile]),capacity*2);
 }
});
test('treatment levels scale 4/8/12 with the same three workers; parks scale 2/4/6 without power',()=>{
 for(const level of [1,2,3]){
  const c=eraFixture(5),t=idx(22,22),p=idx(23,22);c.b[t]={k:'treatment',lvl:level,doneAt:null};c.b[p]={k:'park',lvl:level,doneAt:null};eraStaff(c,t,2);
  near(pollutionCleanup(c),1+4*level*2/3+2*level);
  c.b[t].flooded=true;c.b[p].burned=true;near(pollutionCleanup(c),1);
 }
});
test('industrial-scale cleanup reaches wonder thresholds under continuous emissions and fragmented settlement agrees',()=>{
 const c=eraFixture(6);c.industry!.pollution=67.78363866666739;
 for(let n=0;n<3;n++){const t=idx(22+n,22);c.b[t]={k:'treatment',lvl:3,doneAt:null};eraStaff(c,t,3);}
 for(let n=0;n<4;n++)c.b[idx(22+n,23)]={k:'park',lvl:3,doneAt:null};
 near(pollutionCleanup(c),61); // Beats the reported 30.2/h enabled-industry ceiling.
 const copy=structuredClone(c);
 for(let minute=0;minute<120;minute++){
  c.industry!.emission+=30.2/60;stepIndustry(c,minute*MIN,(minute+1)*MIN,B);
 }
 // Same accumulated industrial emissions, with subdivided calls inside each minute.
 for(let minute=0;minute<120;minute++){
  copy.industry!.emission+=30.2/120;stepIndustry(copy,minute*MIN,minute*MIN+MIN/2,B);
  copy.industry!.emission+=30.2/120;stepIndustry(copy,minute*MIN+MIN/2,(minute+1)*MIN,B);
 }
 near(c.industry!.pollution,copy.industry!.pollution);assert.ok(c.industry!.pollution<=20);
});
test('pollution goals warn about active factories during delivery and never forecast recovery while net is positive',()=>{
 const c=eraFixture(6),tile=idx(22,22);c.industry!.pollution=68;c.b[tile]={k:'factory',lvl:3,doneAt:null};
 let r=pollutionReport(c,0);near(r.enabledPotential,7.2);near(r.emissions,0);assert.ok(r.hoursBelow60!>0);assert.ok(r.hoursAt20!>r.hoursBelow60!);
 eraStaff(c,tile,4);for(const p of c.people)p.haul={phase:'work',at:0,nextAt:HOUR,tile,route:[tile],routeStart:0,carried:0,capacity:10,resource:'gold',source:{kind:'building',key:tile},taskKey:JSON.stringify(p.task)};
 r=pollutionReport(c,0);assert.ok(r.net>0);assert.equal(r.hoursBelow60,null);assert.equal(r.hoursAt20,null);
 c.b[tile].off=true;r=pollutionReport(c,0);near(r.enabledPotential,0);
 c.industry!.pollution=20;r=pollutionReport(c,0);assert.equal(r.hoursAt20,null);
});
