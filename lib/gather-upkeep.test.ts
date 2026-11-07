import test from 'node:test';
import assert from 'node:assert/strict';
import {newCity,G,R,idx,MIN,HOUR,settle,stats,derive,gatherFoodPerHour,type City} from './engine';
function fixture(workers=2,level=1,era=1):City{
 const c=newCity(0,123);c.era=era;c.t.fill(G);c.seen.fill(1);c.camp=idx(20,20);c.b={[idx(19,20)]:{k:'storehouse',lvl:5,doneAt:null},[idx(22,20)]:{k:'gather',lvl:level,doneAt:null}};
 c.people=c.people.slice(0,workers);c.army={};c.camps=[];c.herds=[];c.res={food:1000,wood:100,stone:0,copper:0,gold:0,diamond:0,coal:0};
 for(const p of c.people){p.pos=idx(22,20);p.task={t:'work',at:idx(22,20)};}return c;
}
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('only a live irrigating canal within one tile reduces the fee; river fertility alone does not',()=>{
 const c=fixture(),tile=idx(22,20),canal=idx(23,20);c.t[canal]=R;
 assert.equal(derive(c).fert[tile],true);assert.equal(gatherFoodPerHour(c,derive(c),tile),240);
 c.t[canal]=G;c.b[canal]={k:'canal',lvl:1,doneAt:null};c.t[idx(24,20)]=R;
 assert.equal(gatherFoodPerHour(c,derive(c),tile),120);assert.equal(stats(c,derive(c),0).gatherFoodUse,120);
 for(const inactive of ['burned','flooded'] as const){c.b[canal][inactive]=true;assert.equal(gatherFoodPerHour(c,derive(c),tile),240);delete c.b[canal][inactive];}
 c.b[canal].lvl=0;assert.equal(gatherFoodPerHour(c,derive(c),tile),240);c.b[canal].lvl=1;
 c.t[idx(24,20)]=G;assert.equal(gatherFoodPerHour(c,derive(c),tile),240);
 c.b[idx(24,20)]={k:'canal',lvl:1,doneAt:null};c.t[idx(25,20)]=R;
 assert.equal(gatherFoodPerHour(c,derive(c),tile),120);
 delete c.b[canal];assert.equal(gatherFoodPerHour(c,derive(c),tile),240); // wet canal two tiles away cannot reach
});
test('breaking a canal intake changes actual operating cost from two to four without double-charging workers',()=>{
 const c=fixture(),canal=idx(23,20);c.b[canal]={k:'canal',lvl:1,doneAt:null};c.t[idx(24,20)]=R;
 settle(c,1000);close(c.res.food,1000-(240+120)/3600);const food=c.res.food;
 c.t[idx(24,20)]=G;settle(c,2000);close(c.res.food,food-(240+240)/3600);
});
test('an unirrigated gathering camp uses four food per minute, separately from population upkeep, in every era and level',()=>{
 for(const workers of [1,2])for(const level of [1,2,3])for(const era of [1,2,3]){
  const c=fixture(workers,level,era),st=stats(c,derive(c),0),scale=2**(era-1);
  assert.equal(st.gatherFoodUse,240);assert.equal(st.rate.food,7200*scale*[0,1,1.6,2.4][level]*workers/2-st.upkeep.food-240);
  settle(c,1000);close(c.res.food,1000-(workers*120*scale+240)/3600);close(c.res.wood,100-workers*scale/3600);
 }
 const two=fixture();two.b[idx(23,20)]={k:'gather',lvl:1,doneAt:null};two.people[1].task={t:'work',at:idx(23,20)};two.people[1].pos=idx(23,20);
 assert.equal(stats(two,derive(two),0).gatherFoodUse,480);settle(two,1000);close(two.res.food,1000-(240+480)/3600);
});
test('empty, damaged, travelling, returning and full-store camps do not charge operating food',()=>{
 for(const mode of ['empty','burned','flooded','travel','full'] as const){
  const c=fixture(),tile=idx(22,20);if(mode==='empty')for(const p of c.people)p.task={t:'idle'};
  else if(mode==='burned'||mode==='flooded')c.b[tile][mode]=true;
  else if(mode==='travel')for(const p of c.people)p.pos=c.camp;
  else c.res.food=5500;
  const stock=c.res.food;settle(c,1000);close(c.res.food,stock-240/3600);
 }
 const c=fixture();settle(c,10_000);assert.ok(c.people.every(p=>p.haul?.phase==='return'));const stock=c.res.food;
 settle(c,11_000);close(c.res.food,stock-240/3600);
});
test('zero food never blocks gathering or loses assignments and the village recovers through deliveries',()=>{
 const c=fixture();c.res.food=0;settle(c,MIN);assert.ok(c.res.food>0);assert.ok(c.people.every(p=>p.task.t==='work'));assert.equal(c.people.length,2);
});
test('fees settle identically online and offline, and legacy saves are not charged retroactively',()=>{
 const a=fixture(),b=structuredClone(a);settle(a,10*MIN);for(let at=137;at<10*MIN;at+=1731)settle(b,at);settle(b,10*MIN);assert.deepEqual(a,b);
 const old=fixture();delete old.gatherFoodStartsAt;const reference=structuredClone(old);reference.gatherFoodStartsAt=MIN;
 settle(old,MIN);settle(reference,MIN);assert.deepEqual(old,reference);assert.equal(old.gatherFoodStartsAt,MIN);
 const exempt=structuredClone(old);exempt.gatherFoodStartsAt=HOUR;settle(old,2*MIN);settle(exempt,2*MIN);assert.ok(old.res.food<exempt.res.food);
});
