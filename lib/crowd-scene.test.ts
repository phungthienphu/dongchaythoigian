import test from 'node:test';
import assert from 'node:assert/strict';
import {planCrowd,pickCrowdGroup} from '../components/crowd-scene';
import type {Villager} from '../components/villagers';
const view={TW:60,TH:30,ox:400,oy:200,width:900,height:700,rotation:0};
function actor(id:number):Villager{return {key:`p${id}`,id,name:`Dân ${id}`,job:'idle',sig:'i',home:0,work:-1,state:'rest',path:[],pi:0,fx:1,fy:1,t:0,carry:null,carrying:false,shirt:'#fff',skin:'#aaa',band:'#222',seed:0,visible:true,moving:false,run:false,tx:1,ty:1,face:1,hits:0,cool:0,swing:0};}
const points=(list:Villager[],dx=0,dy=0)=>list.map(a=>({actor:a,x:420+dx,y:220+dy}));
test('dense crowd retains every ID and full selection counts while drawing three stable representatives',()=>{
 const list=Array.from({length:1200},(_,i)=>actor(i+1)),saved=structuredClone(list),picked=new Set(list.slice(0,117).map(a=>a.id!));
 const scene=planCrowd(points(list),view,picked,null,list);
 assert.deepEqual(scene.actors.map(a=>a.id),[1,2,3]);assert.equal(scene.groups[0].members.length,1200);assert.equal(scene.groups[0].selected,117);
 const reverse=[...list].reverse();assert.deepEqual(planCrowd(points(reverse),view,picked,null,reverse).actors.map(a=>a.id),[1,2,3]);assert.deepEqual(list,saved);
});
test('focused, injured, infected, fallen, fleeing people and builders remain individual',()=>{
 const list=Array.from({length:40},(_,i)=>actor(i+1));
 list[0].health={hp:90,infected:false,down:false};list[1].health={hp:100,infected:true,down:false};list[2].health={hp:0,infected:false,down:true};list[3].fleeing=true;list[4].id=null;
 const scene=planCrowd(points(list),view,new Set(),6,list);
 assert.equal(list.slice(0,6).every(a=>scene.actors.includes(a)),true);assert.equal(scene.groups[0].members.length,34);
});
test('pose, job and cargo classes are never collapsed into a mismatched actor',()=>{
 const list=Array.from({length:36},(_,i)=>actor(i+1));
 for(const a of list.slice(9,18)){a.carrying=true;a.carry='wood';}
 for(const a of list.slice(18,27)){a.moving=true;a.state='toHome';}
 for(const a of list.slice(27)){a.job='quarry';a.state='work';}
 const scene=planCrowd(points(list),view,new Set(),null,list);
 assert.equal(scene.groups.length,4);assert.deepEqual(scene.groups.map(g=>g.carrying).sort((a,b)=>a-b),[0,0,0,9]);assert.equal(scene.actors.length,12);
});
test('panning preserves buckets; density and zoom hysteresis avoid threshold flicker',()=>{
 const list=Array.from({length:9},(_,i)=>actor(i+1)),scene=planCrowd(points(list),view,new Set(),null,list);
 const moved=planCrowd(points(list,101,-47),{...view,ox:501,oy:153},new Set(),null,list,scene);
 assert.equal(moved.groups[0].key,scene.groups[0].key);
 const six=list.slice(0,6);assert.equal(planCrowd(points(six),view,new Set(),null,six,scene).groups.length,1);
 assert.equal(planCrowd(points(six),view,new Set(),null,six).groups.length,0);
 assert.equal(planCrowd(points(list.slice(0,4)),view,new Set(),null,list,scene).groups.length,0);
 const wide=planCrowd(points(list),{...view,TW:29},new Set(),null,list);assert.equal(wide.units,2);
 assert.equal(planCrowd(points(list),{...view,TW:34},new Set(),null,list,wide).units,2);
 assert.equal(planCrowd(points(list),{...view,TW:37},new Set(),null,list,wide).units,1);
});
test('only last-painted badge rectangles accept clicks, and stale cameras/snapshots reject hits',()=>{
 const list=Array.from({length:12},(_,i)=>actor(i+1)),scene=planCrowd(points(list),view,new Set(),null,list),group=scene.groups[0];
 assert.equal(pickCrowdGroup(scene,view,list,420,220),null);Object.assign(group,{left:400,top:170,width:80,height:26});
 assert.equal(pickCrowdGroup(scene,view,list,420,180),group);assert.equal(pickCrowdGroup(scene,view,list,420,220),null);
 assert.equal(pickCrowdGroup(scene,{...view,rotation:1},list,420,180),null);assert.equal(pickCrowdGroup(scene,view,[...list],420,180),null);
});
test('sparse crowds retain all actors across all camera rotations',()=>{
 const list=Array.from({length:100},(_,i)=>actor(i+1));
 for(let rotation=0;rotation<4;rotation++){
  const ps=list.map((a,i)=>({actor:a,x:400+i*65,y:220})),scene=planCrowd(ps,{...view,rotation},new Set(),null,list);
  assert.equal(scene.actors.length,list.length);assert.equal(scene.groups.length,0);
 }
});

test('group labels anchor to a painted representative rather than an empty centroid',()=>{
 const list=Array.from({length:12},(_,i)=>actor(i+1));
 const ps=list.map((a,i)=>({actor:a,x:405+i*3,y:210+i}));
 const scene=planCrowd(ps,view,new Set(),null,list);
 for(const group of scene.groups)assert.ok(ps.some(p=>scene.actors.includes(p.actor)&&p.x===group.x&&p.y===group.y));
});
