// Differential check against the committed engine, using synthetic cities only.
// Run: bun tests/engine-equivalence.mjs [baseline-ref] [--routes-only]
// Use routes-only when intentional economy changes invalidate city equality.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const ref=process.argv.slice(2).find(arg=>!arg.startsWith('--'))??'a269224',routesOnly=process.argv.includes('--routes-only'),dir=mkdtempSync(join(tmpdir(),'dong-song-equivalence-'));
const probe='\nexport function auditPaths(c:City,from:number,targets:number[],seen=false){const ctx=haulingContext(c,derive(c));return targets.map(to=>haulPath(c,from,to,ctx,seen));}\n';
try{
 for(const side of ['old','next']){
  mkdirSync(join(dir,side));
  for(const file of ['hunger.ts','economy-balance.ts','resource-history.ts','engine.ts','action-input.ts','bounded-cache.ts','eras.ts','medieval.ts','industry.ts','modern.ts','era-military.ts','tower-balance.ts']){
   let source;try{source=side==='old'?execFileSync('git',['show',`${ref}:lib/${file}`],{encoding:'utf8',stdio:['ignore','pipe','ignore']}):readFileSync(resolve('lib',file),'utf8');}catch{if(side==='old')continue;throw Error('Missing '+file);}
   writeFileSync(join(dir,side,file),source+(file==='engine.ts'?probe:''));
  }
 }
 const old=await import(pathToFileURL(join(dir,'old/engine.ts')).href),next=await import(pathToFileURL(join(dir,'next/engine.ts')).href);
 let routes=0,cities=0;
 for(let seed=1;seed<=40;seed++){
  const c=next.newCity(0,seed);c.seen.fill(1);
  let rng=seed;const random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
  for(let i=0;i<c.t.length;i++){if(random()<.08)c.b[i]={k:random()<.3?'wall':'storehouse',lvl:1,doneAt:null};if(random()<.1)c.seen[i]=0;}
  for(let n=0;n<10;n++){
   const from=Math.floor(random()*c.t.length),targets=Array.from({length:8},(_,j)=>j<3?Math.max(0,Math.min(c.t.length-1,from+[-1,96,97][j])):Math.floor(random()*c.t.length));
   for(const seen of [false,true]){assert.deepEqual(next.auditPaths(c,from,targets,seen),old.auditPaths(c,from,targets,seen),`seed ${seed}, origin ${from}, explored ${seen}`);routes+=targets.length;}
  }
  if(!routesOnly&&seed<=12){
   const base=next.newCity(0,seed);base.seen.fill(1);base.manualWorkforce=true;
   for(let n=0;n<base.people.length;n++){
    const source=base.t.findIndex((t,i)=>!base.b[i]&&t===(n%2?next.HL:next.F)&&next.cheb(i,base.camp)<10);
    if(source>=0)next.applyAction(base,{type:'assign',ids:[base.people[n].id],task:{t:n%2?'mine':'chop',at:source}},0);
   }
   for(const end of [60000,180000]){const a=structuredClone(base),b=structuredClone(base);old.settle(a,end);next.settle(b,end);assert.deepEqual(b,a,`complete city seed ${seed}, ${end}`);cities++;}
  }
 }
 console.log(`PASS ${routes} exact routes (shared searches included) and ${cities} complete city comparisons against ${ref}.${routesOnly?' City equality deliberately skipped for gameplay changes.':''}`);
}finally{rmSync(dir,{recursive:true,force:true});}
