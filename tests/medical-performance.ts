// Run: bun tests/medical-performance.ts
// Synthetic CPU probe only; excludes rendering, requests and other settlement systems.
import {medicalFixture} from '../app/dev/medical-ui/fixture';
import {stepMedical} from '../lib/medical';
import {idx} from '../lib/engine';
const c=medicalFixture(1000);for(const [n,x] of [[1,26],[2,30]]){const i=idx(x,20);c.b[i]={k:'hospital',lvl:3,uid:7+n,doneAt:null};c.modern!.allocation[i]=1;for(let j=0;j<3;j++)c.people.push({id:c.nextId++,name:'Y tế',pos:i,task:{t:'work',at:i}});}
while(c.people.length<1500){const id=c.nextId++,x=40+id%20,y=30+id%10;c.people.push({id,name:'QA',pos:idx(x,y),task:{t:'idle'},...(id<110?{vital:{hp:0,downAt:1000,last:1000,paused:true,x:x+.5,y:y+.5}}:{})});}
const ctx={position:(_c:any,p:any)=>({x:p.vital?.x??p.pos%96+.5,y:p.vital?.y??Math.floor(p.pos/96)+.5}),resume:()=>{},clinicRoute:()=>null};
const samples=[];let maxCars=0;for(let n=0;n<120;n++){const start=performance.now();stepMedical(c,2000+n*1000,ctx);samples.push(performance.now()-start);maxCars=Math.max(maxCars,c.medical!.missions.filter(m=>m.phase!=='treating').length);}samples.sort((a,b)=>a-b);console.log(JSON.stringify({people:c.people.length,hospitals:3,maxCars,ticks:120,medianMs:samples[60],p95Ms:samples[114],maxMs:samples[119],totalMs:samples.reduce((a,b)=>a+b,0)}));
