import test from 'node:test';
import assert from 'node:assert/strict';
import {applyAction,G,idx,newCity,settle,type City} from './engine';
import {defenseAxis,wallConnections,wallMask,wallFootprints,wallOutline,WALL_N,WALL_E,WALL_S,WALL_W} from './fortifications';
import {isActionInput} from './action-input';
import {applyCommandBatch} from './city-sync';
const center=idx(30,30),dirs=[[0,-1,WALL_N],[1,0,WALL_E],[0,1,WALL_S],[-1,0,WALL_W]];
function fixture(){const c=newCity(0,123);c.t.fill(G);c.seen.fill(1);c.b={};c.camps=[];c.herds=[];c.army={};c.queue=[];c.wildernessAt=1e12;c.disaster={kind:'flood',at:1e12,level:1,center:0};return c;}
const wall=(c:City,tile:number)=>c.b[tile]={k:'wall',lvl:1,doneAt:null};
test('all 16 neighborhood patterns generate matching L/T/X/end/straight footprints without mutation',()=>{
 for(let mask=0;mask<16;mask++){
  const c=fixture();wall(c,center);for(const [dx,dy,bit]of dirs)if(mask&bit)wall(c,idx(30+dx,30+dy));
  const before=structuredClone(c),result=wallConnections(c,center);assert.equal(result,mask);assert.equal(wallMask(c,center),mask||10);
  const rects=wallFootprints(wallMask(c,center)),outline=wallOutline(wallMask(c,center));
  const area=rects.reduce((n,[u0,v0,u1,v1])=>n+(u1-u0)*(v1-v0),0);
  const polygonArea=outline.reduce((n,[x,y],i)=>{const [nextX,nextY]=outline[(i+1)%outline.length];return n+x*nextY-y*nextX;},0)/2;
  assert.ok(Math.abs(area-polygonArea)<1e-12);assert.deepEqual(c,before);
 }
});
test('rotation persists in saves; auto reconnects and uses no stock or workers',()=>{
 const c=fixture();wall(c,center);wall(c,center+1);wall(c,center+96);const before=structuredClone(c);
 assert.equal(wallMask(c,center),WALL_E|WALL_S);
 assert.equal(applyAction(c,{type:'orientDefense',x:30,y:30,orientation:'y'},0),null);assert.equal(wallMask(c,center),WALL_N|WALL_S);
 assert.equal(wallConnections(c,center+1),0);assert.equal(wallConnections(c,center+96),WALL_N);
 const reload=JSON.parse(JSON.stringify(c));assert.equal(wallMask(reload,center),WALL_N|WALL_S);assert.deepEqual(c.res,before.res);assert.deepEqual(c.people,before.people);
 assert.equal(applyAction(c,{type:'orientDefense',x:30,y:30,orientation:'auto'},0),null);assert.equal(c.b[center].orientation,undefined);assert.equal(wallMask(c,center),WALL_E|WALL_S);
});
test('gates infer the wall axis for old saves and only connect to their side piers',()=>{
 const c=fixture();c.b[center]={k:'gate',lvl:1,doneAt:null};wall(c,center-96);wall(c,center+96);
 assert.equal(defenseAxis(c,center),'y');assert.equal(wallConnections(c,center),WALL_N|WALL_S);
 c.b[center].orientation='x';assert.equal(defenseAxis(c,center),'x');assert.equal(wallConnections(c,center),0);assert.equal(wallConnections(c,center+96),0);
 delete c.b[center].orientation;wall(c,center+1);assert.equal(wallConnections(c,center+1),0,'gate opening never connects as a wall arm');
});
test('no diagonal links, edge wrapping or links through ruins; demolition reconnects on demand',()=>{
 const c=fixture();wall(c,95);wall(c,96);assert.equal(wallConnections(c,95),0);assert.equal(wallConnections(c,96),0);
 wall(c,center);wall(c,center+97);assert.equal(wallConnections(c,center),0);
 wall(c,center+1);assert.equal(wallConnections(c,center),WALL_E);c.b[center+1].burned=true;assert.equal(wallConnections(c,center),0);
 c.b[center+1].burned=false;delete c.b[center+1];assert.equal(wallConnections(c,center),0);
});
test('placement preview connects both the new piece and neighbors without changing the village',()=>{
 const c=fixture();wall(c,center);const before=structuredClone(c),tile=center+96;
 const preview={tile,building:{k:'wall' as const,lvl:1,doneAt:null}};
 assert.equal(wallConnections(c,center,preview),WALL_S);assert.equal(wallConnections(c,tile,preview),WALL_N);assert.deepEqual(c,before);
});
test('build commands save orientation; unsupported targets and malformed orientation are rejected',()=>{
 const c=fixture();c.res.wood=1000;c.res.stone=1000;
 assert.equal(applyAction(c,{type:'build',k:'wall',x:30,y:30,orientation:'y'},0),null);assert.equal(c.b[center].orientation,'y');settle(c,31000);assert.equal(c.b[center].orientation,'y');
 c.b[center+1]={k:'farm',lvl:1,doneAt:null};const before=structuredClone(c);
 assert.match(applyAction(c,{type:'orientDefense',x:31,y:30,orientation:'x'},31000)!,/Chỉ xoay/);assert.deepEqual(c,before);
 for(const orientation of ['z',1,null,{},undefined])assert.equal(isActionInput({type:'orientDefense',x:30,y:30,orientation}),false);
 assert.equal(isActionInput({type:'build',k:'farm',x:1,y:1,orientation:'y'}),false);
 assert.equal(isActionInput({type:'build',k:'wall',x:1,y:1}),true);
});
test('replayed 30s command batches preserve the same final orientation and connectivity',()=>{
 const c=fixture();wall(c,center);wall(c,center+1);wall(c,center+96);const direct=structuredClone(c);
 const commands=([{orientation:'y',at:1000},{orientation:'x',at:2000},{orientation:'auto',at:3000}] as const).map((v,n)=>({seq:n+1,id:`rotate-${n}`,anchor:'test',at:v.at,action:{type:'orientDefense' as const,x:30,y:30,orientation:v.orientation}}));
 for(const command of commands)assert.equal(applyAction(direct,command.action,command.at),null);settle(direct,30000);
 assert.ok(applyCommandBatch(c,commands,30000).every(r=>!r.error));assert.deepEqual(c,direct);assert.equal(wallMask(c,center),WALL_E|WALL_S);
});
