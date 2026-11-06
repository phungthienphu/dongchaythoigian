import {newCity,settle,idx,G,HOUR,type City} from '../lib/engine';
import {performance} from 'node:perf_hooks';
const future=1000*HOUR;
function mature(workers:boolean):City {
 const c=newCity(0,123);c.t.fill(G);c.seen.fill(1);c.camp=idx(20,20);c.b={};c.era=3;c.manualWorkforce=true;c.herds=[];c.camps=[];c.exps=[];c.shift=null;c.raid=null;c.wildernessAt=future;c.disaster={kind:'flood',at:future,level:1,center:0};
 c.upkeepStartsAt=0;c.wheelFuelStartsAt=0;c.gatherFoodStartsAt=0;
 const template=c.people[0];c.people=Array.from({length:50},(_,n)=>({...structuredClone(template),id:n+1,name:'Test',task:workers?{t:'work',at:idx(25+Math.floor(n/2)%5,25+Math.floor(Math.floor(n/2)/5))}:{t:'idle'},pos:c.camp}));c.pop=50;c.nextId=51;
 for(let n=0;n<25;n++)c.b[idx(25+n%5,25+Math.floor(n/5))]={k:workers?'gather':'house',lvl:3,doneAt:null};
 for(let n=0;n<25;n++)c.b[idx(40+n%5,25+Math.floor(n/5))]={k:'storehouse',lvl:3,doneAt:null};
 c.res={food:50000,wood:50000,stone:1000,copper:1000,gold:0,diamond:0};
 return c;
}
// Synthetic stress fixture only; no database or HTTP requests. Run with Node
// after bundling for comparable CPU measurements (see docs/runtime-stability.md).
for(let n=0;n<5;n++)settle(mature(true),60000);
function measure(label:string,base:City,ms:number,repeats=1){let cpu=0,wall=0,bytes=0,pop=0;for(let n=0;n<repeats;n++){const c=structuredClone(base),start=performance.now(),u=process.cpuUsage();settle(c,ms);const d=process.cpuUsage(u);cpu+=(d.user+d.system)/1000;wall+=performance.now()-start;pop=c.people.length;bytes=Buffer.byteLength(JSON.stringify(c));}console.log(JSON.stringify({label,offlineSeconds:ms/1000,repeats,cpuMs:Math.round(cpu/repeats*10)/10,wallMs:Math.round(wall/repeats*10)/10,finalPop:pop,jsonBytes:bytes}));}
measure('fresh village / 1 minute',newCity(0,123),60000,3);
measure('50 idle / 1 minute',mature(false),60000,3);
measure('50 working / 1 minute',mature(true),60000,3);
measure('50 working / 1 hour',mature(true),HOUR,2);
measure('50 working / 6 hours',mature(true),6*HOUR);
measure('50 working / 24 hours',mature(true),24*HOUR);
measure('fresh village / 24 hours',newCity(0,123),24*HOUR);
