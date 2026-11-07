import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newCity,G,idx,W,applyAction,settle,farmGroupCareQuote,farmRemaining,farmCapacity,FARM_TEND_MS,type City} from './engine';
import {isActionInput} from './action-input';
function fixture(era=3):City{
 const c=newCity(0,123);c.era=era;c.t.fill(G);c.seen.fill(1);c.b={};c.people=[];c.pop=0;c.camps=[];c.herds=[];
 c.res.food=1000;c.res.wood=500;
 for(const [x,y]of [[20,20],[21,20],[21,21],[22,22],[24,20]])c.b[idx(x,y)]={k:'farm',lvl:1,doneAt:null,fertility:0};
 return c;
}
test('iron group care follows four-edge connectivity, not corners or gaps, and pays every field once',()=>{
 const c=fixture(),quote=farmGroupCareQuote(c,idx(20,20));
 assert.deepEqual(quote.tiles,[idx(20,20),idx(21,20),idx(21,21)]);assert.deepEqual(quote.cost,{food:120,wood:30});
 assert.equal(applyAction(c,{type:'tendFarmGroup',x:20,y:20},0),null);assert.equal(c.res.food,880);assert.equal(c.res.wood,470);
 for(const tile of quote.tiles)assert.equal(c.b[tile].tendUntil,FARM_TEND_MS);
 assert.equal(c.b[idx(22,22)].tendUntil,undefined);assert.equal(c.b[idx(24,20)].tendUntil,undefined);
 assert.match(applyAction(c,{type:'tendFarmGroup',x:20,y:20},0)!,/không có ruộng/);assert.equal(c.res.wood,470);
 c.res.food=0;c.res.wood=0;settle(c,FARM_TEND_MS);
 for(const tile of quote.tiles)assert.equal(farmRemaining(c.b[tile]),farmCapacity(c.b[tile]));
});
test('before iron only individual care works; a short group budget rejects all fields atomically',()=>{
 const early=fixture(2),before=structuredClone(early);assert.match(applyAction(early,{type:'tendFarmGroup',x:20,y:20},0)!,/đồ sắt/);assert.deepEqual(early,before);
 assert.equal(applyAction(early,{type:'tendFarm',x:20,y:20},0),null);
 const c=fixture();c.res.wood=29;const snapshot=structuredClone(c);assert.ok(applyAction(c,{type:'tendFarmGroup',x:20,y:20},0));assert.deepEqual(c,snapshot);
});
test('mixed field levels and estates pay exact costs; healthy and damaged fields are skipped',()=>{
 const c=fixture();c.b[idx(21,20)].fertility=600;c.b[idx(21,21)]={k:'estate',lvl:2,doneAt:null,fertility:0};
 c.b[idx(20,19)]={k:'farm',lvl:1,doneAt:null,fertility:0,burned:true};
 const quote=farmGroupCareQuote(c,idx(20,20));assert.equal(quote.connected,4);assert.deepEqual(quote.cost,{food:360,wood:90});assert.equal(quote.tiles.length,2);
 assert.equal(applyAction(c,{type:'tendFarmGroup',x:20,y:20},0),null);assert.equal(c.b[idx(20,19)].tendUntil,undefined);assert.equal(c.b[idx(21,20)].tendUntil,undefined);
});
test('map row boundaries cannot connect fields; offline and irregular polling agree',()=>{
 const c=fixture();c.b={};for(const tile of [idx(W-1,20),idx(0,21)])c.b[tile]={k:'farm',lvl:1,doneAt:null,fertility:0};
 assert.equal(farmGroupCareQuote(c,idx(W-1,20)).connected,1);
 const a=fixture();applyAction(a,{type:'tendFarmGroup',x:20,y:20},0);const b=structuredClone(a);settle(a,60000);for(let t=173;t<60000;t+=1371)settle(b,t);settle(b,60000);assert.deepEqual(a,b);
 assert.equal(isActionInput({type:'tendFarmGroup',x:W,y:20}),false);assert.equal(isActionInput({type:'tendFarmGroup',x:20,y:20}),true);
});
