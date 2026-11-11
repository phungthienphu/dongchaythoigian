// Synthetic-only differential benchmark. Snapshot lib/ before editing, then run:
// bun tests/catchup-performance.ts /absolute/path/to/baseline/lib
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import * as current from '../lib/engine';
import {eraPreview} from '../lib/era-preview';
import {syncFixture} from './sync-workload';
const baseline=process.argv[2];
if(!baseline)throw Error('Provide a baseline lib directory containing the unmodified engine.');
const before=await import(pathToFileURL(resolve(baseline,process.versions.bun?'engine.ts':'engine.mjs')).href) as typeof current;
const median=(xs:number[])=>xs.sort((a,b)=>a-b)[Math.floor(xs.length/2)];
const cases:{name:string;city:current.City;duration:number}[]=[];
for(const era of [3,4,5,6])cases.push({name:`era ${era} / 1h`,city:eraPreview(era,0),duration:current.HOUR});
for(const pop of [100,600])for(const blocked of [false,true]){
 const city=syncFixture(pop,blocked);cases.push({name:`${pop} workers / ${blocked?'full':'open'} store / 10min`,city,duration:10*60000});
}
// Many distinct origins separated from their jobs by a complete wall.
{
 const city=syncFixture(100,false);city.camp=current.idx(10,20);
 for(let y=0;y<96;y++)city.b[current.idx(20,y)]={k:'wall',lvl:1,doneAt:null};
 for(let n=0;n<city.people.length;n++)city.people[n].pos=current.idx(5+n%10,5+Math.floor(n/10));
 cases.push({name:'100 workers / unreachable jobs / 1min',city,duration:60000});
}
// Isolate six-hour economy/frontier work from zombie combat in this fixture.
const peaceful=eraPreview(4,0);if(peaceful.zombies)peaceful.zombies.nextAt=1e15;
cases.push({name:'era 4 / 6h / zombie spawn deferred',city:peaceful,duration:6*current.HOUR});
const selection=process.argv[3]?new RegExp(process.argv[3]):null;
for(const input of cases.filter(c=>!selection||selection.test(c.name))){
 const times={before:[] as number[],after:[] as number[]};
 for(let n=0;n<4;n++){
  const states:{}[]=[];
  for(const side of n%2?['after','before'] as const:['before','after'] as const){
   const city=structuredClone(input.city),engine=side==='before'?before:current;
   const t=performance.now();engine.settle(city,input.duration);const elapsed=performance.now()-t;
   if(n)times[side].push(elapsed);states.push(city);
  }
  assert.deepEqual(states[0],states[1],input.name);
 }
 const old=median(times.before),next=median(times.after);
 console.log(JSON.stringify({name:input.name,beforeMs:+old.toFixed(1),afterMs:+next.toFixed(1),reductionPercent:+(100*(1-next/old)).toFixed(1),equivalent:true}));
}
// Budgeted recovery must preserve all continuation metadata and final state.
for(const era of selection?[]:[3,4,6]){
 let old=eraPreview(era,0),next=structuredClone(old),slices=0;
 do {
  const budget={maxTicks:137,maxMs:Infinity};
  before.settle(old,current.HOUR,budget);current.settle(next,current.HOUR,budget);
  assert.deepEqual(next,old,`era ${era}, recovery slice ${++slices}`);
 }while(old.catchUp);
 console.log(JSON.stringify({name:`era ${era} / sliced recovery`,slices,equivalent:true}));
}
