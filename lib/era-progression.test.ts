import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyAction,B,ERA_REQ,idx,levelCap,reqMet,RES,settle,stats,derive,type BKey} from './engine';
import {LOCAL_RULES,RELEASE_RULES} from './eras';
import {eraFixture,eraStaff} from './era-fixtures.test-utils';

test('released iron-to-modern progression has no hall/wonder/coal circular lock or diamond requirement',()=>{
 assert.equal(RELEASE_RULES.maxEra,6);
 const c=eraFixture(3),hall=idx(19,20);c.b[hall].lvl=3;
 for(const next of [4,5,6]){
  const req=ERA_REQ[next];c.people=[];eraStaff(c,c.camp,req.pop);
  c.b[idx(35,20)]={k:req.wonder!,lvl:1,doneAt:null};
  for(const r of RES)c.res[r]=req.cost[r]??0;
  assert.equal(c.res.diamond,0);assert.equal(levelCap(c,'hall'),next-1);assert.equal(reqMet(c,LOCAL_RULES),true);
  c.b[idx(35,20)].burned=true;assert.equal(reqMet(c,LOCAL_RULES),false);c.b[idx(35,20)].burned=false;
  assert.equal(reqMet(c),true);assert.equal(applyAction(c,{type:'advance'},c.last),null);assert.equal(c.era,next);assert.equal(levelCap(c,'hall'),next);assert.equal(levelCap(c,'farm'),3);
  for(const r of RES)c.res[r]=r==='diamond'?0:100000;
  assert.equal(applyAction(c,{type:'upgrade',x:19,y:20},c.last,LOCAL_RULES),null);const done=c.b[hall].doneAt!;
  settle(c,done);assert.equal(c.b[hall].lvl,next);
 }
 assert.ok(c.industry&&c.modern&&c.medieval);
 assert.equal(reqMet(c,LOCAL_RULES),false);
 // Eight level-1 grand stores suffice for the largest 80k food era charge;
 // two level-3 ones also suffice. Neither path needs diamonds.
 c.b={};c.b[hall]={k:'hall',lvl:5,doneAt:null};for(let n=0;n<2;n++)c.b[idx(20+n,20)]={k:'grandstore',lvl:3,doneAt:null};
 const capacity=stats(c,derive(c),c.last).storage;
 for(const r of RES)assert.ok(capacity[r]>=(ERA_REQ[6].cost[r]??0));
});
