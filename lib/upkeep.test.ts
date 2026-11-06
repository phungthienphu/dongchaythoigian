import test from 'node:test';
import assert from 'node:assert/strict';
import {newCity,G,idx,MIN,HOUR,settle,derive,stats,upkeepRates,marchSupplies,reserveMarchFood,type City} from './engine';

function fixture(era=1):City{
 const c=newCity(0,123);c.era=era;c.t.fill(G);c.seen.fill(1);c.people=c.people.slice(0,1);c.people[0].task={t:'idle'};c.b={[idx(10,10)]:{k:'storehouse',lvl:5,doneAt:null}};c.herds=[];c.camps=[];c.army={club:1};c.res.food=5000;c.res.wood=100;return c;
}
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);

test('one civilian eats 50 and one soldier 100 every ten minutes, doubling each era, with matching net rates',()=>{
 for(const era of [1,2,3]){
  const c=fixture(era),scale=2**(era-1),st=stats(c,derive(c),0);
  assert.equal(st.rate.food,-900*scale);assert.equal(st.rate.wood,-3*scale);
  settle(c,MIN);close(c.res.food,5000-15*scale);close(c.res.wood,100-3*scale/60);
  settle(c,10*MIN);close(c.res.food,5000-150*scale);close(c.res.wood,100-3*scale/6);
 }
});
test('era changes affect the next tick without retroactive charges and offline settlement matches irregular polling',()=>{
 const a=fixture();settle(a,MIN);a.era=3;const b=structuredClone(a);
 settle(a,10*MIN);for(let t=MIN+137;t<10*MIN;t+=1771)settle(b,t);settle(b,10*MIN);
 assert.deepEqual(a,b);close(a.res.food,5000-15-9*60);close(a.res.wood,100-3/60-12*9/60);
});
test('prepaid world and camp armies skip only food, keep wood upkeep, and march quotes use the current era',()=>{
 const c=fixture(2);c.army={};c.deployedArmy={club:3};c.provisionedSoldiers=3;
 c.exps=[{id:1,units:{club:2},camp:1,depart:0,arrive:HOUR,back:2*HOUR,resolved:false,suppliesFood:10000}];
 const st=stats(c,derive(c),0);assert.equal(st.upkeep.foodSoldiers,0);assert.equal(st.upkeep.food,600);assert.equal(st.upkeep.wood,22);
 c.provisionedSoldiers=1;assert.equal(stats(c,derive(c),0).upkeep.food,3000);
 assert.deepEqual(marchSupplies({club:1},MIN,1),{food:70,minutes:7});
 for(const era of [1,2,3]){c.era=era;c.res.food=5000;const quote=marchSupplies({club:1},MIN,era);assert.equal(quote.food,70*2**(era-1));assert.equal(reserveMarchFood(c,{club:1},MIN),quote.food);assert.equal(c.res.food,5000-quote.food);}
});
test('wood runs out safely without freezing workers or making stock negative; starvation retains its existing population floor',()=>{
 const c=fixture(3);c.res.wood=.001;c.res.food=0;settle(c,10*MIN);
 assert.equal(c.res.wood,0);assert.equal(c.res.food,0);assert.equal(c.people.length,1);assert.equal(c.people[0].task.t,'idle');
 assert.deepEqual(upkeepRates(3),{civilian:{food:1200,wood:4},soldier:{food:2400,wood:8}});
});

test('old saves catch up at previous prices before the new upkeep activates',()=>{
 const c=fixture();delete c.upkeepStartsAt;settle(c,10*MIN+137);
 close(c.res.food,4999);assert.equal(c.res.wood,100);assert.equal(c.upkeepStartsAt,10*MIN+137);
 settle(c,11*MIN+137);close(c.res.food,4999-15);close(c.res.wood,99.95);
});
