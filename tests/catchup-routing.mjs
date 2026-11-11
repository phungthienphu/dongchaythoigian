// Directly exercise private routing caches in a temporary copy; no production IO.
// bun tests/catchup-routing.mjs
import assert from 'node:assert/strict';
import {mkdtempSync,cpSync,appendFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=mkdtempSync(join(tmpdir(),'dong-catchup-routing-'));
try {
 cpSync(resolve('lib'),join(dir,'lib'),{recursive:true});
 appendFileSync(join(dir,'lib/engine.ts'),`
export function auditRecoveryRouting(c:City){
 let ctx=haulingContext(c,derive(c));
 return (origins:number[],targets:number[])=>{
  ctx=haulingContext(c,derive(c));
  return origins.flatMap(from=>targets.flatMap(to=>[false,true].map(seen=>({
   retained:haulPath(c,from,to,ctx,seen),fresh:haulPath(c,from,to,haulingContext(c,derive(c)),seen)
  }))));
 };
}
`);
 const e=await import(pathToFileURL(join(dir,'lib/engine.ts')).href);
 const c=e.newCity(0,17);c.t.fill(e.G);c.seen.fill(1);c.b={};
 for(let y=0;y<96;y++)c.b[e.idx(48,y)]={k:'wall',lvl:1,doneAt:null};
 const run=e.auditRecoveryRouting(c),origins=[e.idx(10,10),e.idx(20,20),e.idx(60,60)],targets=[e.idx(30,30),e.idx(48,30),e.idx(70,70)];
 let checks=0;
 function verify(){for(const result of run(origins,targets)){assert.deepEqual(result.retained,result.fresh);checks++;}}
 verify();verify(); // Complete unreachable-region proofs, then read them again.
 c.b[e.idx(48,30)]={k:'gate',lvl:1,doneAt:null};verify(); // Open a connection.
 c.b[e.idx(48,30)]={k:'wall',lvl:1,doneAt:null};verify(); // Close it again.
 c.b[e.idx(48,30)].off=true;verify(); // Endpoint policy changes despite blocked passability.
 c.t[e.idx(30,30)]=e.HL;verify(); // Mining endpoints use adjacent goals.
 c.t[e.idx(30,30)]=e.G;verify(); // Exhausted rock becomes passable.
 c.seen[e.idx(30,30)]=0;verify();c.seen[e.idx(30,30)]=1;verify();
 for(let y=0;y<96;y++)c.t[e.idx(40,y)]=e.R;verify(); // Ford/land modes.
 console.log(`PASS: ${checks} retained/fresh route comparisons after walls, gates, endpoint changes, mining, fog and water.`);
} finally {rmSync(dir,{recursive:true,force:true});}
