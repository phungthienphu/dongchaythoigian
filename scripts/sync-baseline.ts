import { applyAction, newCity, settle, HOUR } from '../lib/engine';
import { syncFixture, syncCommands } from '../tests/sync-workload';
import { createHash } from 'node:crypto';

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
for (const [name,fixture,until] of workload) {
  const samples=[];
  for (let run=-1;run<3;run++) {
    // Model the current per-command load/settle/mutate/save/response pipeline.
    let c=fixture(),bytes=0; const before=process.cpuUsage(),start=performance.now();
    const commands=syncCommands();
    for (const command of commands) {
      c=structuredClone(c); settle(c,command.at); applyAction(c,command.action,command.at);
      bytes+=Buffer.byteLength(JSON.stringify(c));
    }
    settle(c,until);
    const usage=process.cpuUsage(before);
    if(run>=0)samples.push({cpuMs:(usage.user+usage.system)/1000,wallMs:performance.now()-start,responseBytes:bytes,hash:createHash('sha256').update(JSON.stringify(c)).digest('hex').slice(0,16)});
  }
  samples.sort((a,b)=>a.cpuMs-b.cpuMs);
  console.log(JSON.stringify({name,commands:20,modeledLoads:20,modeledSaves:20,median:samples[1],cpuRange:samples.map(s=>s.cpuMs)}));
}
