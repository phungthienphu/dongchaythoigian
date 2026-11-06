import test from 'node:test';
import assert from 'node:assert/strict';
import {newCity,G,R,W,H,idx,derive,canPlace,applyAction,settle,buildMs} from './engine';
function fixture(){
 const c=newCity(0,123);c.t.fill(G);c.seen.fill(1);c.b={};c.people=[];c.herds=[];c.camps=[];c.era=2;
 c.res.wood=400;c.res.stone=400;
 for(let y=0;y<H;y++)c.t[idx(18,y)]=R;
 for(let x=20;x<=30;x++)for(const y of [20,30])c.b[idx(x,y)]={k:'levee',lvl:1,doneAt:null};
 for(let y=21;y<30;y++)for(const x of [20,30])c.b[idx(x,y)]={k:'levee',lvl:1,doneAt:null};
 return c;
}
test('a closed levee ring protects the whole dry interior, including beyond the two-tile radius',()=>{
 const c=fixture(),d=derive(c);
 assert.equal(d.prot[idx(25,25)],true);assert.equal(d.prot[idx(15,25)],false);
 assert.equal(d.prot[idx(19,25)],true);assert.equal(d.prot[idx(35,25)],false);
});
test('a gap, diagonal corner gap, burned or flooded segment opens the ring and invalidates cache',()=>{
 const c=fixture(),center=idx(25,25),gap=idx(25,20);
 assert.equal(derive(c).prot[center],true);
 for(const damage of ['burned','flooded'] as const){c.b[gap][damage]=true;assert.equal(derive(c).prot[center],false);delete c.b[gap][damage];assert.equal(derive(c).prot[center],true);}
 delete c.b[gap];assert.equal(derive(c).prot[center],false);assert.equal(derive(c).prot[idx(20,25)],true);
 c.b[gap]={k:'levee',lvl:1,doneAt:null};delete c.b[idx(20,20)];assert.equal(derive(c).prot[center],false);
});
test('an unfinished closing segment protects only after completion, identically offline',()=>{
 const c=fixture(),gap=idx(25,20);c.b[gap]={k:'levee',lvl:0,doneAt:buildMs('levee',1)};
 assert.equal(derive(c).prot[idx(25,25)],false);
 const online=structuredClone(c);settle(c,buildMs('levee',1));for(let t=1000;t<=buildMs('levee',1);t+=1000)settle(online,t);
 assert.deepEqual(c,online);assert.equal(derive(c).prot[idx(25,25)],true);
});
test('river water inside an enclosure remains a flood source; houses cannot seal levee gaps',()=>{
 const c=fixture(),center=idx(25,25);assert.equal(derive(c).prot[center],true);
 c.t[center]=R;assert.equal(derive(c).prot[idx(25,26)],false);
 c.t[center]=G;c.b[idx(25,20)]={k:'house',lvl:1,doneAt:null};assert.equal(derive(c).prot[center],false);
});
test('levees can extend along cardinal edges away from the river, but cannot start on isolated land',()=>{
 const c=fixture();assert.equal(canPlace(c,derive(c),'levee',21,25),null);
 assert.equal(applyAction(c,{type:'build',k:'levee',x:21,y:25},0),null);
 assert.equal(canPlace(c,derive(c),'levee',22,25),null);
 assert.match(canPlace(c,derive(c),'levee',32,32)!,/nối thẳng/);
 assert.equal(canPlace(c,derive(c),'levee',17,40),null);
 assert.match(canPlace(c,derive(c),'hut',20,25)!,/đã có công trình/);
 assert.equal(c.t.length,W*H);
});
