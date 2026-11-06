import test from 'node:test';
import assert from 'node:assert/strict';
import { newCity, derive, G, F, HL, idx, canPlace } from './engine';
import { placementTiles } from './build-placement';
test('placement hints follow actual legality and refresh after resource and building changes',()=>{
 const c=newCity(0,123);c.t.fill(G);c.seen.fill(1);c.b={};c.res.wood=500;c.res.stone=500;const d=derive(c),tile=idx(20,20);
 const allowed=placementTiles(c,d,'hut');assert.equal(allowed(tile),true);
 c.res.wood=0;assert.equal(placementTiles(c,d,'hut')(tile),false);
 c.res.wood=500;c.b[tile]={k:'hut',lvl:1,doneAt:null};assert.equal(placementTiles(c,d,'hut')(tile),false);
 c.t[idx(21,20)]=F;c.t[idx(22,20)]=HL;c.seen[idx(23,20)]=0;
 const fresh=derive(c),check=placementTiles(c,fresh,'quarry');
 for(let y=19;y<=21;y++)for(let x=19;x<=24;x++)assert.equal(check(idx(x,y)),canPlace(c,fresh,'quarry',x,y)===null);
});
