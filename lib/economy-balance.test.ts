import {test} from 'node:test';
import assert from 'node:assert/strict';
import {B,newCity,G,idx,settle,MIN,HOUR,stats,derive,farmCapacity,type City} from './engine';
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
