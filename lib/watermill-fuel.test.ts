import test from 'node:test';
import assert from 'node:assert/strict';
import {newCity,G,idx,MIN,HOUR,settle,stats,derive,type City} from './engine';
function fixture(workers=2,level=1):City{
 const c=newCity(0,123);c.era=3;c.t.fill(G);c.seen.fill(1);c.camp=idx(20,20);c.b={[idx(19,20)]:{k:'storehouse',lvl:5,doneAt:null},[idx(22,20)]:{k:'wheel',lvl:level,doneAt:null}};
 c.people=c.people.slice(0,workers);c.army={};c.camps=[];c.herds=[];c.res={food:2000,wood:100,stone:500,copper:0,gold:0,diamond:0};
 for(const p of c.people){p.pos=idx(22,20);p.task={t:'work',at:idx(22,20)};}return c;
}
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('each producing watermill costs two wood per minute, independent of workers and level',()=>{
 for(const workers of [1,2])for(const level of [1,2,3]){
  const c=fixture(workers,level),st=stats(c,derive(c),0);assert.equal(st.wheelWoodUse,120);assert.equal(st.woodUse,120);
  settle(c,1000);close(c.res.wood,100-(120+workers*4)/3600);
 }
 const two=fixture();two.b[idx(23,20)]={k:'wheel',lvl:1,doneAt:null};two.people[1].task={t:'work',at:idx(23,20)};two.people[1].pos=idx(23,20);
 settle(two,1000);close(two.res.wood,100-(240+8)/3600);
});
test('no wood pauses work without losing assignment; refuelling resumes and existing cargo still reaches storage',()=>{
 const c=fixture();c.res.wood=0;settle(c,MIN);
 assert.equal(c.res.wood,0);assert.ok(c.people.every(p=>p.task.t==='work'&&p.haul?.phase==='work'&&p.haul.carried===0));
 c.res.wood=1;settle(c,MIN+10_000);assert.ok(c.res.food>2000-2*480*70_000/HOUR);assert.ok(c.res.wood>=0&&c.res.wood<1);
 const carrying=fixture();settle(carrying,4000);assert.ok(carrying.people.some(p=>p.haul?.carried));carrying.res.wood=0;const stock=carrying.res.food;
 settle(carrying,10_000);assert.ok(carrying.res.food>stock);
});
test('empty, damaged, travelling, returning and full-store mills do not burn operating wood',()=>{
 for(const mode of ['empty','burned','flooded','travel','full'] as const){
  const c=fixture(),tile=idx(22,20);if(mode==='empty')for(const p of c.people)p.task={t:'idle'};
  else if(mode==='burned'||mode==='flooded')c.b[tile][mode]=true;
  else if(mode==='travel')for(const p of c.people)p.pos=c.camp;
  else c.res.food=5500;
  settle(c,1000);close(c.res.wood,100-8/3600);
 }
 const c=fixture();settle(c,4000);assert.ok(c.people.every(p=>p.haul?.phase==='return'));const wood=c.res.wood;
 settle(c,5000);close(c.res.wood,wood-8/3600);
});
test('partial fuel and offline progress match irregular polling; old villages catch up before the new cost',()=>{
 const a=fixture();a.res.wood=.02;const b=structuredClone(a);settle(a,2*MIN);
 for(let at=137;at<2*MIN;at+=1731)settle(b,at);settle(b,2*MIN);assert.deepEqual(a,b);assert.equal(a.res.wood,0);
 const old=fixture();delete old.wheelFuelStartsAt;settle(old,MIN);close(old.res.wood,100-8/60);assert.equal(old.wheelFuelStartsAt,MIN);
 const before=old.res.wood;settle(old,2*MIN);assert.ok(old.res.wood<before-8/60);
});
