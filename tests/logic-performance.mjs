// Paired, synthetic-only CPU benchmark. No DB, credentials, server or browser.
// node tests/logic-performance.mjs [baseline-ref=HEAD] [repeats=5]
// Bun is used only to bundle; both sides are measured in this Node process.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const ref=execFileSync('git',['rev-parse','--verify',process.argv[2]??'HEAD'],{encoding:'utf8'}).trim();
const repeats=Number(process.argv[3]??5);
if(!Number.isInteger(repeats)||repeats<3||repeats>15)throw Error('Use 3 to 15 repeats.');
const dir=mkdtempSync(join(tmpdir(),'dong-logic-performance-'));
const libs=['formation','fortifications','bridges','hunger','economy-balance','resource-history','engine','era-preview','action-input','bounded-cache','eras','medieval','industry','modern','era-military','tower-balance','build-placement','villager-mood'];
const components=['villagers','draw','villager-art','actor-art','trade-actors'];
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];

try {
 const sides={};
 for(const side of ['before','after']){
  const folder=join(dir,side);mkdirSync(join(folder,'lib'),{recursive:true});mkdirSync(join(folder,'components'));
  for(const file of [...libs.map(n=>`lib/${n}.ts`),...components.map(n=>`components/${n}.ts`)]){
   const source=side==='before'?execFileSync('git',['show',`${ref}:${file}`],{encoding:'utf8'}):readFileSync(resolve(file),'utf8');
   writeFileSync(join(folder,file),source);
  }
  writeFileSync(join(folder,'tsconfig.json'),JSON.stringify({compilerOptions:{baseUrl:'.',paths:{'@/*':['./*']}}}));
  writeFileSync(join(folder,'entry.ts'),"export * from './lib/engine';\nexport {eraPreview} from './lib/era-preview';\nexport {Crowd} from './components/villagers';\n");
  const bundle=join(folder,'entry.mjs');
  execFileSync('bun',['build',join(folder,'entry.ts'),'--target=node',`--outfile=${bundle}`],{stdio:'pipe'});
  sides[side]=await import(pathToFileURL(bundle).href);
 }
 const e=sides.after;
 function allocation(size){
  const c=e.newCity(0,123);c.t.fill(e.G);c.seen.fill(1);c.camp=e.idx(20,20);c.era=3;
  c.b={[e.idx(19,20)]:{k:'hall',lvl:3,doneAt:null},[e.idx(21,20)]:{k:'gather',lvl:1,doneAt:null}};
  c.herds=[];c.camps=[];
  c.people=Array.from({length:size},(_,n)=>({id:n+1,name:`Worker ${n}`,task:{t:'idle'},pos:c.camp}));c.pop=size;c.nextId=size+1;
  c.t[e.idx(22,20)]=e.F;c.t[e.idx(20,22)]=e.HL;
  return c;
 }
 const action={type:'auto',on:true,mix:{food:40,wood:30,stone:30,copper:0,gold:0,diamond:0,coal:0}};
 function paired(label,prepare,run,check){
  const times={before:[],after:[]},cpu={before:[],after:[]};
  for(const side of ['before','after'])run(sides[side],prepare(sides[side]));
  for(let n=0;n<repeats;n++){
   const results={};
   for(const side of n%2?['after','before']:['before','after']){
    const input=prepare(sides[side]),startCPU=process.cpuUsage(),start=performance.now();
    results[side]=run(sides[side],input);
    times[side].push(performance.now()-start);
    const usage=process.cpuUsage(startCPU);cpu[side].push((usage.user+usage.system)/1000);
   }
   check(results.before,results.after);
  }
  const before=median(times.before),after=median(times.after);
  console.log(JSON.stringify({label,repeats,beforeMedianMs:+before.toFixed(2),afterMedianMs:+after.toFixed(2),wallReductionPercent:+(100*(1-after/before)).toFixed(1),beforeMedianCpuMs:+median(cpu.before).toFixed(2),afterMedianCpuMs:+median(cpu.after).toFixed(2),equivalent:true}));
 }
 console.log(JSON.stringify({runtime:process.version,baseline:ref,note:'Synthetic local measurements; alternating order, one warm-up per side; no production or GPU claims.'}));
 for(const era of [4,5,6]){
  const base=e.eraPreview(era,0);
  paired(`era ${era} / 1h`,()=>structuredClone(base),(engine,c)=>{engine.settle(c,engine.HOUR);return c;},assert.deepStrictEqual);
 }
 for(const size of [100,600])paired(`auto allocation / ${size} idle`,()=>allocation(size),(engine,c)=>{assert.equal(engine.applyAction(c,action,0),null);return c;},assert.deepStrictEqual);
 const manual={type:'setWorkforce',counts:{food:2,wood:299,stone:299,copper:0,gold:0,diamond:0,coal:0},scouts:0};
 paired('manual allocation / 600 idle',()=>allocation(600),(engine,c)=>{assert.equal(engine.applyAction(c,manual,0),null);return c;},assert.deepStrictEqual);
 const base=allocation(600);
 for(const p of base.people){p.task={t:'chop',at:e.idx(22,20)};p.haul={phase:'travel',at:0,nextAt:5000,tile:e.idx(20,20),route:[e.idx(20,20),e.idx(21,20),e.idx(22,20)],routeStart:0,resource:'wood',carried:0,capacity:10,source:{kind:'tile',key:e.idx(22,20)},taskKey:'chop',workRate:30};}
 paired('crowd / 600 hauling / 600 frames',engine=>{const c=structuredClone(base),crowd=new engine.Crowd();crowd.sync(c);return {c,crowd};},(_engine,{c,crowd})=>{for(let frame=0;frame<600;frame++)crowd.update(c,1/60,frame*1000/60);return crowd.list.map(v=>({id:v.id,x:v.fx,y:v.fy,cargo:v.cargo,visible:v.visible}));},assert.deepStrictEqual);
} finally {rmSync(dir,{recursive:true,force:true});}
