import { applyAction, newCity, settle, HOUR } from '../lib/engine';
import { syncFixture, syncCommands } from '../tests/sync-workload';
import { createHash } from 'node:crypto';
import { applyCommandBatch } from '../lib/city-sync';

// CPU is process CPU, wall is elapsed time. DB operation counts are modeled,
// not measurements of Vercel or MongoDB. Run bundled with Node for comparison.
const workload = [
  ['fresh',()=>newCity(0,123),60_000],
  ['50 workers',()=>syncFixture(),60_000],
  ['200 workers',()=>syncFixture(200),60_000],
  ['full storage',()=>syncFixture(50,true),60_000],
  ['offline 1h',()=>syncFixture(),HOUR],
  ['offline 24h',()=>syncFixture(),24*HOUR],
] as const;
for (const [name,fixture,until] of workload) for(const mode of ['individual','batch'] as const) {
  const samples=[];
  for (let run=-1;run<3;run++) {
    // Model the current per-command load/settle/mutate/save/response pipeline.
    let c=fixture(),bytes=0; const before=process.cpuUsage(),start=performance.now();
    const commands=syncCommands();
    if(mode==='individual')for (const command of commands) {
        c=structuredClone(c); settle(c,command.at); applyAction(c,command.action,command.at);
        bytes+=Buffer.byteLength(JSON.stringify(c));
      }
    else {
      c=structuredClone(c);
      applyCommandBatch(c,commands.map((e,n)=>({...e,seq:n+1,id:`fixture-${n}`,anchor:'fixture'})),10000);
      bytes+=Buffer.byteLength(JSON.stringify(c));
    }
    settle(c,until);
    const usage=process.cpuUsage(before);
    if(run>=0)samples.push({cpuMs:(usage.user+usage.system)/1000,wallMs:performance.now()-start,responseBytes:bytes,hash:createHash('sha256').update(JSON.stringify(c)).digest('hex').slice(0,16)});
  }
  samples.sort((a,b)=>a.cpuMs-b.cpuMs);
  console.log(JSON.stringify({name,mode,commands:20,modeledLoads:mode==='batch'?1:20,modeledSaves:mode==='batch'?1:20,median:samples[1],cpuRange:samples.map(s=>s.cpuMs)}));
}
