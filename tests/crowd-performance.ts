// CPU-only update comparison; run with baseline Crowd bundled as a Node module.
import {Crowd} from '../components/villagers';
import {planCrowd} from '../components/crowd-scene';
import {newCity,idx,G,type City} from '../lib/engine';
import {pathToFileURL} from 'node:url';
const Baseline=process.argv[2]?(await import(pathToFileURL(process.argv[2]).href)).Crowd:null;
function fixture(n:number):City{
 const c=newCity(0,123);c.t.fill(G);c.seen.fill(1);c.b={};c.people=[];c.zombies!.actors=[];
 for(let i=0;i<n;i++){
  const tile=idx(5+Math.floor(i/4)%80,5+Math.floor(Math.floor(i/4)/80));c.b[tile]={k:'farm',lvl:1,doneAt:null};
  c.people.push({id:i+1,name:`Dân ${i+1}`,pos:tile,task:{t:'work',at:tile},haul:{phase:'work',at:0,nextAt:10000,tile,route:[tile],routeStart:0,carried:0,capacity:10,workRate:5400,resource:'food',source:{kind:'building',key:tile},taskKey:'farm'}});
 }
 c.pop=n;return c;
}
function measure(Type:typeof Crowd,c:City){
 const crowd=new Type();crowd.sync(c);for(let i=0;i<5;i++)crowd.update(c,.016,1000);
 const samples=[];for(let k=0;k<9;k++){const start=performance.now();for(let i=0;i<10;i++)crowd.update(c,.016,1000);samples.push((performance.now()-start)/10);}
 samples.sort((a,b)=>a-b);return samples[4];
}
for(const n of [300,1200,3000]){
 const c=fixture(n),before=Baseline?measure(Baseline,structuredClone(c)):null,after=measure(Crowd,c);
 const list=new Crowd();list.sync(c);list.update(c,.016,1000);
 const points=list.list.map(actor=>({actor:{...actor,fx:1,fy:1},x:420,y:220}));
 const scene=planCrowd(points,{TW:60,TH:30,ox:400,oy:200,width:900,height:700},new Set(c.people.map(p=>p.id)),null,list.list);
 console.log(JSON.stringify({people:n,baselineUpdateMs:before,newUpdateMs:after,denseDrawActors:scene.actors.length,denseMembers:scene.groups.reduce((sum,g)=>sum+g.members.length,0)}));
}
