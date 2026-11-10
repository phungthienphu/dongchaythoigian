// Synthetic action-to-publish benchmark; never reads production data.
// bun tests/action-performance.mjs [baseline=HEAD]
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=resolve('.'),dir=mkdtempSync(join(tmpdir(),'dong-actions-'));
try {
 const old=execFileSync('git',['show',`${process.argv[2]??'HEAD'}:lib/batched-city.ts`],{encoding:'utf8'})
 .replace(/from '\.\/([^']+)'/g,(_,name)=>`from '${root}/lib/${name}'`);
 writeFileSync(join(dir,'before.ts'),old);
 const entry=`export {BatchedCityQueue as Before} from './before';
 export {BatchedCityQueue as After} from '${root}/lib/batched-city';
 export {syncFixture} from '${root}/tests/sync-workload';
 export {settle,derive,ENGINE_VER} from '${root}/lib/engine';
 export {Crowd} from '${root}/components/villagers';`;
 writeFileSync(join(dir,'entry.ts'),entry);
 execFileSync('bun',['build',join(dir,'entry.ts'),'--target=node',`--outfile=${join(dir,'entry.mjs')}`],{stdio:'pipe'});
 const e=await import(pathToFileURL(join(dir,'entry.mjs')));
 const median=xs=>xs.sort((a,b)=>a-b)[Math.floor(xs.length/2)];
 for(const pop of [100,600,1500]) {
  const state=e.syncFixture(pop,true);e.settle(state,1000);
  const times={Before:[],After:[]};
  for(let n=0;n<7;n++){
   const snapshots={};
   for(const name of n%2?['After','Before']:['Before','After']){
    const crowd=new e.Crowd();let shown;
    const q=new e[name]({state,sync:{cityId:'synthetic',session:1,engine:e.ENGINE_VER,ack:0,revision:0,anchor:0,until:1000000,results:[]},now:()=>1100,
     storage:{load:async()=>null,save:async()=>{}},timers:{set:()=>1,clear:()=>{}},
     onState:c=>{shown=c;e.derive(c);crowd.sync(c);},send:async()=>{throw Error('No network allowed');},reload:async()=>{throw Error('No network allowed');}});
    await q.initialize();const start=performance.now();
    for(let i=0;i<20;i++)assert.equal(await q.enqueue({type:'assign',ids:[1],task:{t:'idle'}}),true);
    const elapsed=performance.now()-start;if(n>0)times[name].push(elapsed/20);
    snapshots[name]=shown;q.stop();
   }
   assert.deepEqual(snapshots.Before,snapshots.After);
  }
  const before=median(times.Before),after=median(times.After);
  console.log(JSON.stringify({pop,beforeMs:+before.toFixed(2),afterMs:+after.toFixed(2),reductionPercent:+(100*(1-after/before)).toFixed(1),equivalent:true}));
 }
} finally {rmSync(dir,{recursive:true,force:true});}
