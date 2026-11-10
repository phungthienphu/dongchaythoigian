// Differential check against the committed engine, using synthetic cities only.
// Run: bun tests/engine-equivalence.mjs [baseline-ref] [--routes-only]
// Use routes-only when intentional economy changes invalidate city equality.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const ref=process.argv.slice(2).find(arg=>!arg.startsWith('--'))??'HEAD',routesOnly=process.argv.includes('--routes-only'),dir=mkdtempSync(join(tmpdir(),'dong-song-equivalence-'));
const probe='\nexport function auditPaths(c:City,from:number,targets:number[],seen=false){const ctx=haulingContext(c,derive(c));return targets.map(to=>haulPath(c,from,to,ctx,seen));}\n';
try{
 for(const side of ['old','next']){
  mkdirSync(join(dir,side));
  for(const file of ['formation.ts','fortifications.ts','bridges.ts','hunger.ts','economy-balance.ts','resource-history.ts','engine.ts','era-preview.ts','action-input.ts','bounded-cache.ts','eras.ts','medieval.ts','industry.ts','modern.ts','era-military.ts','tower-balance.ts']){
   let source;try{source=side==='old'?execFileSync('git',['show',`${ref}:lib/${file}`],{encoding:'utf8',stdio:['ignore','pipe','ignore']}):readFileSync(resolve('lib',file),'utf8');}catch{if(side==='old')continue;throw Error('Missing '+file);}
   writeFileSync(join(dir,side,file),source+(file==='engine.ts'?probe:''));
  }
 }
 const old=await import(pathToFileURL(join(dir,'old/engine.ts')).href),next=await import(pathToFileURL(join(dir,'next/engine.ts')).href);
 let routes=0,cities=0;
 if(!routesOnly){
  const {eraPreview}=await import(pathToFileURL(join(dir,'next/era-preview.ts')).href);
  for(const era of [4,5,6]){
   const base=eraPreview(era,0);
   for(const end of [60000,3600000]){
    const a=structuredClone(base),b=structuredClone(base);
   old.settle(a,end);next.settle(b,end);assert.deepEqual(b,a,`era ${era}, ${end}`);cities++;
   }
   const automatic=structuredClone(base);
   for(const p of automatic.people)if(next.taskResource(automatic,p)){p.task={t:'idle'};delete p.haul;}
   const a=structuredClone(automatic),b=structuredClone(automatic),action={type:'auto',on:true,mix:{food:30,wood:20,stone:15,copper:10,gold:10,diamond:5,coal:10}};
   assert.equal(next.applyAction(b,action,0),old.applyAction(a,action,0));assert.deepEqual(b,a,`era ${era} auto allocation`);
   old.settle(a,60000);next.settle(b,60000);assert.deepEqual(b,a,`era ${era} auto settlement`);cities+=2;
  }
  for(const seed of [17,31,123])for(const size of [4,50,300]){
   const base=next.newCity(0,seed);base.t.fill(next.G);base.seen.fill(1);base.camp=next.idx(20,20);
   base.b={[next.idx(19,20)]:{k:'hall',lvl:3,doneAt:null},[next.idx(21,20)]:{k:'gather',lvl:1,doneAt:null}};
   base.herds=[];base.camps=[];base.era=3;
   base.people=Array.from({length:size},(_,n)=>({id:n+1,name:`Worker ${n}`,task:{t:'idle'},pos:base.camp}));base.pop=size;base.nextId=size+1;
   base.t[next.idx(22,20)]=next.F;base.t[next.idx(20,22)]=next.HL;
   const a=structuredClone(base),b=structuredClone(base),action={type:'auto',on:true,mix:{food:40,wood:30,stone:30,copper:0,gold:0,diamond:0,coal:0}};
   assert.equal(next.applyAction(b,action,0),old.applyAction(a,action,0));
   assert.deepEqual(b,a,`auto allocation ${seed}/${size}`);
   old.settle(a,60000);next.settle(b,60000);assert.deepEqual(b,a,`auto settlement ${seed}/${size}`);cities+=2;
   const manualA=structuredClone(base),manualB=structuredClone(base),manual={type:'setWorkforce',counts:{food:2,wood:Math.floor((size-2)/2),stone:Math.ceil((size-2)/2),copper:0,gold:0,diamond:0,coal:0},scouts:0};
   assert.equal(next.applyAction(manualB,manual,0),old.applyAction(manualA,manual,0));assert.deepEqual(manualB,manualA,`manual allocation ${seed}/${size}`);cities++;
  }
 }
 for(let seed=1;seed<=40;seed++){
  const c=next.newCity(0,seed);c.seen.fill(1);
  let rng=seed;const random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
  for(let i=0;i<c.t.length;i++){if(random()<.08)c.b[i]={k:random()<.3?'wall':'storehouse',lvl:1,doneAt:null};if(random()<.1)c.seen[i]=0;}
  for(let n=0;n<14;n++){
   const from=n<4?[0,95,9120,9215][n]:Math.floor(random()*c.t.length),targets=Array.from({length:8},(_,j)=>j<3?Math.max(0,Math.min(c.t.length-1,from+[-1,96,97][j])):Math.floor(random()*c.t.length));
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
