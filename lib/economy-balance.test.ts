import {test} from 'node:test';
import assert from 'node:assert/strict';
import {B,newCity,G,idx,settle,MIN,HOUR,stats,derive,farmCapacity,RES,type City} from './engine';
import {buildingOutput} from './economy-balance';
import {applyCommandBatch} from './city-sync';
function fixture():City{
 const c=newCity(0,123);c.t.fill(G);c.seen.fill(1);c.b={[idx(19,20)]:{k:'storehouse',lvl:3,doneAt:null},[idx(21,20)]:{k:'gather',lvl:1,doneAt:null}};c.camp=idx(20,20);c.camps=[];c.herds=[];c.people=c.people.slice(0,2);c.res.food=500;c.res.wood=500;
 for(const p of c.people){p.task={t:'work',at:idx(21,20)};p.pos=idx(21,20);}return c;
}
test('gathering and mills are reduced, while field fertility and food upkeep stay unchanged',()=>{
 const c=fixture();assert.equal(B.gather.prod!.food,38);assert.equal(B.wheel.prod!.food,50);assert.equal(farmCapacity({k:'farm',lvl:1,doneAt:null}),600);
 assert.equal(stats(c,derive(c),0).upkeep.food,240);assert.equal(buildingOutput(c,'gather',B.gather.prod!,0).food,38);
});
test('old villages keep historical offline output and activate the balance durably at first read',()=>{
 const old=fixture();delete old.economyBalanceStartsAt;const reference=structuredClone(old);reference.economyBalanceStartsAt=MIN;
 settle(old,MIN);settle(reference,MIN);assert.deepEqual(old,reference);assert.equal(old.economyBalanceStartsAt,MIN);
 const legacy=structuredClone(old);legacy.economyBalanceStartsAt=HOUR;settle(old,2*MIN);settle(legacy,2*MIN);assert.ok(old.res.food<legacy.res.food);
});
test('queued old timestamps cannot retroactively activate changed output; online and offline match',()=>{
 const c=fixture();delete c.economyBalanceStartsAt;
 applyCommandBatch(c,[{seq:1,id:'old-command',at:500,anchor:'test',action:{type:'assign',ids:[1],task:{t:'idle'}}}],MIN);
 assert.equal(c.economyBalanceStartsAt,MIN);
 const a=fixture(),b=structuredClone(a);settle(a,2*MIN);for(let t=137;t<2*MIN;t+=1731)settle(b,t);settle(b,2*MIN);assert.deepEqual(a,b);
});
test('expansion recipes and tower changes activate at first read, preserving queued and offline history',async()=>{
 const {buildingInput,buildingDefense}=await import('./economy-balance');
 const c=fixture();delete c.expansionBalanceStartsAt;
 applyCommandBatch(c,[{seq:1,id:'expansion-history',at:500,anchor:'test',action:{type:'assign',ids:[1],task:{t:'idle'}}}],MIN);
 assert.equal(c.expansionBalanceStartsAt,MIN);
 for(const [kind,oldOutput,newOutput,oldInput,newInput]of [
  ['recyclingworks',{copper:240},{copper:1800},{stone:480,coal:120},{stone:900,coal:30}],
  ['emberkiln',{coal:180},{coal:720},{wood:360,essence:1},{wood:600,essence:2}],
 ] as const){
  assert.deepEqual(buildingOutput(c,kind,B[kind].prod!,MIN-1),oldOutput);assert.deepEqual(buildingOutput(c,kind,B[kind].prod!,MIN),newOutput);
  assert.deepEqual(buildingInput(c,kind,B[kind].input,MIN-1),oldInput);assert.deepEqual(buildingInput(c,kind,B[kind].input,MIN),newInput);
 }
 const {magicDef}=await import('./magic-data');
 for(const [kind,oldRange,newRange]of [['wardbastion',7,10],['elementbastion',8,9],['celestialbastion',10,12]] as const){
  const d=magicDef(kind).defense!;assert.equal(buildingDefense(c,kind,d,MIN-1)!.range,oldRange);assert.equal(buildingDefense(c,kind,d,MIN)!.range,newRange);
 }
});
test('an existing recycling workshop catches up with old recipes, then switches deterministically without free input',async()=>{
 const {eraFixture,eraStaff}=await import('./era-fixtures.test-utils');
 const c=eraFixture(6),tile=idx(23,20);c.b[idx(19,20)].lvl=1;c.b[idx(18,20)].lvl=3;
 c.b[tile]={k:'recyclingworks',lvl:1,doneAt:null};eraStaff(c,tile,6);
 for(const i of [idx(22,22),idx(24,22)])c.b[i]={k:'solar',lvl:1,doneAt:null};
 for(const r of RES)c.res[r]=30000;c.res.copper=0;delete c.expansionBalanceStartsAt;
 const expected=structuredClone(c);expected.expansionBalanceStartsAt=HOUR;
 settle(c,HOUR);settle(expected,HOUR);assert.deepEqual(c,expected);assert.equal(c.expansionBalanceStartsAt,HOUR);
 const oldIncome=c.res.copper,coal=c.res.coal,stone=c.res.stone,online=structuredClone(c);
 settle(c,2*HOUR);for(const at of [HOUR+MIN,HOUR+7*MIN,HOUR+31*MIN,2*HOUR])settle(online,at);
 assert.deepEqual(c,online);assert.ok(c.res.copper-oldIncome>oldIncome*2);assert.ok(c.res.coal<coal);assert.ok(c.res.stone<stone);
});
