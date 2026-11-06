import test from 'node:test';
import assert from 'node:assert/strict';
import {newCity,G,R,HL,W,H,idx,settle,raidActors,raidPhase,raidEntryRoute,civiliansInDanger,type City} from './engine';
function fixture():City {
 const c=newCity(0,123);c.t.fill(G);c.seen.fill(1);c.camp=idx(20,20);
 c.b={[idx(20,20)]:{k:'hall',lvl:3,doneAt:null}};c.camps=[];c.herds=[];c.army={club:30};
 c.people=c.people.slice(0,2);for(const p of c.people){p.pos=c.camp;p.task={t:'idle'};delete p.haul;}
 c.res.food=5000;c.raid={warn:0,at:60_000,power:40,from:idx(35,35)};return c;
}
test('no actors appear during warning; arrival, clash, outcome and withdrawal happen in order',()=>{
 const c=fixture();assert.equal(raidPhase(c,30_000),'warning');assert.deepEqual(raidActors(c,59_999),[]);
 settle(c,60_000);const e=structuredClone(c.raidEncounter!);assert.ok(e.route.length>1);
 assert.equal(raidPhase(c,60_000),'enter');assert.equal(raidActors(c,60_000).length,7);assert.equal(c.raidEncounter!.won,undefined);
 settle(c,e.engage);assert.equal(raidPhase(c,e.engage),'fight');assert.ok(raidActors(c,e.engage).every(a=>a.fighting&&!a.moving));
 assert.ok(c.raid);assert.equal(c.raidEncounter!.won,undefined);assert.equal(civiliansInDanger(c,e.engage),true);
 settle(c,e.resolveAt);assert.equal(c.raid,null);assert.equal(c.raidEncounter!.won,true);assert.equal(raidPhase(c,e.resolveAt),'retreat');assert.equal(civiliansInDanger(c,e.resolveAt),true);
 const outcomes=()=>c.log.filter(l=>l.msg.includes('nhưng bị đánh lui')).length;assert.equal(outcomes(),1);
 settle(c,e.end+15_000);assert.equal(c.raidEncounter,undefined);assert.deepEqual(raidActors(c,e.end),[]);assert.ok(c.people.every(p=>!p.refuge));assert.equal(outcomes(),1);
});
test('route and actors stay on seen dry land and stop outside a closed wall',()=>{
 const c=fixture();for(let y=18;y<=22;y++)for(let x=18;x<=22;x++)if(x===18||x===22||y===18||y===22)c.b[idx(x,y)]={k:'wall',lvl:1,doneAt:null};
 for(let y=25;y<H;y++)c.t[idx(26,y)]=R;c.t[idx(25,24)]=HL;c.seen[idx(25,25)]=0;
 settle(c,60_000);const e=c.raidEncounter!;
 assert.ok(e.route.length>0);assert.ok(e.route.every(tile=>c.seen[tile]&&c.t[tile]!==R&&c.t[tile]!==HL&&!c.b[tile]));
 assert.ok(e.route.every(tile=>tile%W<18||tile%W>22||Math.floor(tile/W)<18||Math.floor(tile/W)>22));
 for(let at=e.start;at<e.end;at+=37)for(const a of raidActors(c,at)){
  const tile=idx(Math.floor(a.x),Math.floor(a.y));assert.ok(c.seen[tile]);assert.notEqual(c.t[tile],R);assert.notEqual(c.t[tile],HL);assert.ok(!c.b[tile]);
 }
});
test('diagonal routes do not cut through water or blocked corners',()=>{
 const c=fixture();for(let y=0;y<H;y++)c.t[idx(24,y)]=R;
 const route=raidEntryRoute(c,idx(35,35));
 for(let i=1;i<route.length;i++){
  const a=route[i-1],b=route[i],dx=b%W-a%W,dy=Math.floor(b/W)-Math.floor(a/W);
  assert.ok(Math.abs(dx)<=1&&Math.abs(dy)<=1);assert.notEqual(c.t[b],R);
  if(dx&&dy){assert.notEqual(c.t[idx(a%W+dx,Math.floor(a/W))],R);assert.notEqual(c.t[idx(a%W,Math.floor(a/W)+dy)],R);}
 }
});
test('a losing raid steals once after fighting, and offline replay matches irregular online settlement',()=>{
 const a=fixture();a.army={};a.raid!.power=500;const b=structuredClone(a);
 settle(a,150_000);for(let at=337;at<150_000;at+=1733)settle(b,at);settle(b,150_000);assert.deepEqual(a,b);
 assert.equal(a.log.filter(l=>l.msg.startsWith('Man rợ cướp làng!')).length,1);
 const count=a.log.length;settle(a,160_000);assert.equal(a.log.length,count);
});
