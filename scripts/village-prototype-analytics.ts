/** Read-only Cloudflare aggregates. Auth stays in memory; no credentials in artifacts. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync,mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const script='dong-song-village-prototype';
const account=process.env.PROTOTYPE_CLOUDFLARE_ACCOUNT_ID??'';
assert.match(account,/^[a-f0-9]{32}$/,'Set the explicitly authorized Cloudflare account ID');
const end=new Date(process.argv[3]??Date.now());
const start=new Date(process.argv[2]??end.getTime()-60*60*1000);
assert.ok(Number.isFinite(start.getTime())&&Number.isFinite(end.getTime())&&end>start&&end.getTime()-start.getTime()<=24*60*60*1000,'Use a time window of at most 24 hours');
const dir=fileURLToPath(new URL('../.wrangler/village-prototype-cloud/',import.meta.url));
mkdirSync(dir,{recursive:true,mode:0o700});
const cooldown=`${dir}/analytics-cooldown.json`;
if(existsSync(cooldown)) {
  const saved=JSON.parse(readFileSync(cooldown,'utf8')) as {nextAllowedAt:number};
  assert.ok(Date.now()>=saved.nextAllowedAt,'Cloudflare requested a cooldown; wait before querying analytics again');
}
let token:string;
try {
  const auth=JSON.parse(execFileSync('node',[fileURLToPath(new URL('../worker/node_modules/wrangler/bin/wrangler.js',import.meta.url)),'auth','token','--json'],{
    cwd:fileURLToPath(new URL('../worker/',import.meta.url)),
    env:{...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:'/dev/null'},
    encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30_000,
  })) as {token?:string};
  assert.ok(auth.token&&auth.token.length>20);token=auth.token;
} catch {throw new Error('Wrangler bearer authentication unavailable; no credentials were logged');}
const headers={authorization:`Bearer ${token}`,'content-type':'application/json'};
const nsResponse=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/durable_objects/namespaces?per_page=100`,{headers,redirect:'error',signal:AbortSignal.timeout(30_000)});
assert.ok(nsResponse.ok,`Namespace lookup denied: HTTP ${nsResponse.status}`);
const namespaces=await nsResponse.json() as {result:{id:string;script:string;class:string}[];result_info?:{total_pages?:number}};
assert.ok((namespaces.result_info?.total_pages??1)<=1,'Namespace list requires pagination; stop instead of querying the wrong namespace');
const namespace=namespaces.result.find(n=>n.script===script&&n.class==='VillagePrototype');
assert.ok(namespace,'Authorized prototype namespace not found');
assert.match(namespace.id,/^[a-f0-9]{32}$/);
const window=`datetime_geq:${JSON.stringify(start.toISOString())},datetime_leq:${JSON.stringify(end.toISOString())}`;
const query=`{viewer{accounts(filter:{accountTag:${JSON.stringify(account)}}){
  router:workersInvocationsAdaptive(filter:{${window},scriptName:${JSON.stringify(script)}},limit:10){dimensions{status usageModel}sum{requests errors cpuTimeUs startupCpuTimeUs duration}quantiles{cpuTimeP50 cpuTimeP95 cpuTimeP99}}
  village:durableObjectsInvocationsAdaptiveGroups(filter:{${window},namespaceId:${JSON.stringify(namespace.id)}},limit:10){dimensions{status}sum{requests errors}quantiles{cpuTimeP50 cpuTimeP95 cpuTimeP99}}
  periodic:durableObjectsPeriodicGroups(filter:{${window},namespaceId:${JSON.stringify(namespace.id)}},limit:1){sum{cpuTime duration rowsRead rowsWritten exceededCpuErrors exceededMemoryErrors fatalInternalErrors}max{memoryUsageBytes}quantiles{memoryUsageBytesP50 memoryUsageBytesP99}}
  storage:durableObjectsStorageGroups(filter:{${window},namespaceIds_has:${JSON.stringify(namespace.id)}},limit:1){max{storedBytes}}
  accountWorkers:workersInvocationsAdaptive(filter:{${window}},limit:20){dimensions{scriptName}sum{requests errors cpuTimeUs startupCpuTimeUs}}
  accountObjects:durableObjectsPeriodicGroups(filter:{${window}},limit:20){dimensions{namespaceId}sum{cpuTime duration rowsRead rowsWritten exceededCpuErrors exceededMemoryErrors}}
}}}`;
const response=await fetch('https://api.cloudflare.com/client/v4/graphql',{method:'POST',headers,body:JSON.stringify({query}),redirect:'error',signal:AbortSignal.timeout(30_000)});
assert.ok(response.ok,`Analytics denied: HTTP ${response.status}`);
const result=await response.json() as {data:unknown;errors?:{message:string;extensions?:{code?:string}}[]|null};
if(result.errors?.length) {
  if(result.errors.some(e=>e.extensions?.code==='budget'))writeFileSync(cooldown,JSON.stringify({nextAllowedAt:Date.now()+5*60*1000}));
  throw new Error(result.errors.map(e=>e.message).join('; '));
}
const report={start:start.toISOString(),end:end.toISOString(),namespaceId:namespace.id,
  units:{cpu:'microseconds (both router and DO)',duration:'GB*s',memory:'bytes',storage:'bytes'},
  note:'Cloudflare aggregates may be sampled/delayed. Empty results are unavailable, not zero usage. Compare the same load before declaring a Free-budget pass.',
  data:result.data};
const output=`${dir}/analytics-${Date.now()}.json`;
writeFileSync(output,JSON.stringify(report,null,2),{mode:0o600});
console.log(JSON.stringify({...report,artifact:output},null,2));
