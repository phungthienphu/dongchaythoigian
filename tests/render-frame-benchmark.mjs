// Synthetic render/tick benchmark; never reads production data.
// bun tests/render-frame-benchmark.mjs
// Prints drawCity JS time and canvas call count per frame (no-op canvas: excludes
// real rasterization), with and without layer caches, plus the per-second tick cost.
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve('.'),dir=mkdtempSync(join(tmpdir(),'dong-render-'));
try {
 writeFileSync(join(dir,'entry.ts'),`export {eraPreview} from '${root}/lib/era-preview';
export {syncFixture} from '${root}/tests/sync-workload';
export {settle,derive} from '${root}/lib/engine';
export {cloneCity} from '${root}/lib/clone-city';
export {Crowd} from '${root}/components/villagers';
export {drawCity,fitView,camView,focusOn,createLayerCache,createTreeCache} from '${root}/components/draw';`);
 execFileSync('bun',['build',join(dir,'entry.ts'),'--target=node',`--outfile=${join(dir,'entry.mjs')}`],{stdio:'pipe'});
 const e=await import(pathToFileURL(join(dir,'entry.mjs')));
 let ops=0;
 const fake=()=>new Proxy({},{set(){return true},get(_,k){if(k==='measureText')return t=>({width:String(t).length*7});if(String(k).startsWith('create')||k==='getImageData')return()=>({addColorStop(){},data:new Uint8ClampedArray(4)});return()=>{ops++}}});
 globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>fake()})};
 const ctx=fake(),med=xs=>xs.sort((a,b)=>a-b)[Math.floor(xs.length/2)];
 const fixtures=[['era6 (300 dân)',()=>e.eraPreview(6,1_000_000)],['1500 dân, 776 công trình',()=>{const c=e.syncFixture(1500,true);e.settle(c,1000);return c}]];
 for(const [name,make] of fixtures){
  const c=make();c.seen.fill(1);const D=e.derive(c),crowd=new e.Crowd();crowd.sync(c);
  for(const zoom of [1,3,8])for(const mode of ['direct','layers','trees']){
   const cached=mode!=='direct';
   const f=e.fitView(1440,900),cam={zoom:1,px:0,py:0,rotation:0};e.focusOn(f,cam,48,48,zoom);
   const ground=cached?e.createLayerCache():undefined,items=cached?e.createLayerCache():undefined,trees=mode==='trees'?e.createTreeCache():undefined,times=[];let count=0;
   const rebuilds=[];
   if(cached)ground.onBuild=items.onBuild=ms=>rebuilds.push(ms);
   for(let i=0;i<60;i++){ops=0;const s=performance.now();
    e.drawCity(ctx,c,D,{v:e.camView(f,cam),now:c.last,anim:1000+i*16,hover:null,selected:null,tool:null,villagers:crowd.list,picked:new Set(),fx:crowd.fx,chopping:crowd.chopping,ground,items,trees:zoom===3?trees:undefined,dpr:2});
    times.push(performance.now()-s);count=ops;}
   const cold=times[0],sorted=[...times].sort((a,b)=>a-b);
   console.log(`${name} zoom ${zoom} ${mode}: ${med(times).toFixed(2)} ms, ${count} lệnh canvas/frame; cold ${cold.toFixed(2)}, p95 ${sorted[Math.ceil(sorted.length*.95)-1].toFixed(2)}, max ${sorted.at(-1).toFixed(2)} ms; ${rebuilds.length} layer builds, peak ${Math.max(0,...rebuilds).toFixed(2)} ms`);
  }
 }
 for(const pop of [100,600,1500]){
  const c=e.syncFixture(pop,true);e.settle(c,1000);const crowd=new e.Crowd();crowd.sync(c);
  const T={settle:[],clone:[],derive:[],sync:[]};let at=1000;
  for(let i=0;i<40;i++){at+=1000;let s=performance.now();e.settle(c,at);T.settle.push(performance.now()-s);
   s=performance.now();const k=e.cloneCity(c);T.clone.push(performance.now()-s);
   s=performance.now();e.derive(k);T.derive.push(performance.now()-s);
   s=performance.now();crowd.sync(k);T.sync.push(performance.now()-s);}
  console.log(`tick ${pop} dân: settle ${med(T.settle).toFixed(2)} · cloneCity ${med(T.clone).toFixed(2)} · derive ${med(T.derive).toFixed(2)} · crowd.sync ${med(T.sync).toFixed(2)} ms`);
 }
} finally { rmSync(dir,{recursive:true,force:true}); }
