import test from 'node:test';
import assert from 'node:assert/strict';
import {beginMagicResearch,finishMagicResearch,cancelMagicResearch,type MagicResearchState} from './magic-research';
const context={era:7,academy:true,university:true,fourSpirits:false};
test('research enforces existing university and atomic goods/knowledge fees',()=>{
 const state:MagicResearchState={knowledge:200,researched:[]},stock={rune:30};const before=structuredClone({state,stock});assert.ok(beginMagicResearch(state,stock,'conduction',0,{...context,university:false}));assert.deepEqual({state,stock},before);
 assert.equal(beginMagicResearch(state,stock,'conduction',0,context),undefined);assert.equal(state.knowledge,80);assert.equal(stock.rune,0);const paid=structuredClone({state,stock});assert.ok(beginMagicResearch(state,stock,'conduction',0,context));assert.deepEqual({state,stock},paid);
});
test('paid research completes while the academy is gone, exactly once after reload',()=>{
 let state:MagicResearchState={knowledge:120,researched:[]};const stock={rune:30};beginMagicResearch(state,stock,'conduction',0,context);state=JSON.parse(JSON.stringify(state));assert.equal(finishMagicResearch(state,7199999),false);assert.equal(finishMagicResearch(state,7200000),true);assert.deepEqual(state.researched,['conduction']);assert.equal(finishMagicResearch(state,14400000),false);
});
test('cancel returns half the paid fee and never refunds twice',()=>{
 const state:MagicResearchState={knowledge:120,researched:[]};beginMagicResearch(state,{rune:30},'conduction',0,context);assert.deepEqual(cancelMagicResearch(state),{rune:15});assert.equal(state.knowledge,60);assert.equal(cancelMagicResearch(state),undefined);assert.equal(state.knowledge,60);
});
