/** Synthetic, database-free benchmark. Rich fixtures are not balance evidence.
 * bun build tests/era-benchmark.ts --target=node --outfile=/tmp/era-benchmark.mjs
 * node /tmp/era-benchmark.mjs [hours=24] [era=6]
 */
import {eraPreview} from '../lib/era-preview';
import {HOUR,RES,settle} from '../lib/engine';
const hours=Number(process.argv[2]??24),era=Number(process.argv[3]??6);
if(!Number.isFinite(hours)||hours<=0||hours>336||![4,5,6].includes(era))throw new Error('Use 0 < hours <= 336; era 4, 5 or 6.');
const c=eraPreview(era,0),before={...c.res},initialPop=c.pop;
settle(eraPreview(era,0),60_000);
const started=performance.now(),cpu=process.cpuUsage();settle(c,hours*HOUR);const elapsed=process.cpuUsage(cpu);
if(RES.some(r=>!Number.isFinite(c.res[r])||c.res[r]<0))throw new Error('Invalid stock');
console.log(JSON.stringify({era,hours,initialPop,finalPop:c.pop,cpuMs:Math.round((elapsed.user+elapsed.system)/1000),wallMs:Math.round(performance.now()-started),jsonBytes:Buffer.byteLength(JSON.stringify(c)),stocks:c.res,stockDelta:Object.fromEntries(RES.map(r=>[r,Math.round(c.res[r]-before[r])]))}));
