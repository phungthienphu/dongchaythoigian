/** Real HTTP + Mongo replica-set QA. Only accepts loopback and a sync_qa_ DB.
 * Modes: seed, run, combat, close, profile, soak, login. Synthetic accounts only.
 * See docs/sync-integration.md. Never imports app/db or uses a production account.
 */
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {MongoClient} from 'mongodb';
import {G,HOUR,idx,newCity,score,type Action,type City} from '../lib/engine';
import type {CityDoc,UserDoc} from '../lib/db';
import type {BatchRequest,BatchResponse,CitySync} from '../lib/city-sync';
import type {BattleState} from '../lib/battle';

const uri=process.env.MONGODB_URI??'',name=process.env.MONGODB_DB??'',secret=process.env.AUTH_SECRET??'';
const base=new URL(process.env.APP_URL??'http://127.0.0.1:3110');
const worker=new URL(process.env.BATTLE_WORKER_URL??'http://127.0.0.1:8788');
const workerSecret=process.env.BATTLE_SERVER_SECRET??'';
const loopback=(url:URL)=>url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname);
assert.ok(/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\//.test(uri),'Only explicit loopback MongoDB is allowed');
assert.ok(/^sync_qa_[a-zA-Z0-9_]+$/.test(name),'Use a dedicated sync_qa_ database');
assert.ok(secret.startsWith('local-sync-qa-')&&secret.length>=32,'Use a test-only AUTH_SECRET');
assert.ok(loopback(base)&&loopback(worker),'HTTP/Worker targets must be local');
const client=new MongoClient(uri,{serverSelectionTimeoutMS:10_000});
await client.connect();
const db=client.db(name),cities=db.collection<CityDoc>('cities'),users=db.collection<UserDoc>('users');
const mode=process.argv[2]??'run';
type Actor='a'|'b'|'ui'|`probe-${string}`;
const cityId=(actor:Actor)=>`sync-qa-${actor}`,uid=(actor:Actor)=>`${cityId(actor)}-user`;
function cookie(actor:Actor,version=1) {
  const payload=Buffer.from(JSON.stringify({uid:uid(actor),sessionVersion:version,exp:Date.now()+86400000})).toString('base64url');
  return `sid=${payload}.${createHmac('sha256',secret).update(payload).digest('base64url')}`;
}
function fixture(now:number,actor:Actor):City {
  const c=newCity(now,123);c.t.fill(G);c.seen.fill(1);c.camp=idx(20,20);c.era=3;c.manualWorkforce=true;
  c.herds=[];c.camps=[];c.exps=[];c.shift=null;c.raid=null;c.wildernessAt=now+1000*HOUR;
  c.disaster={kind:'flood',at:now+1000*HOUR,level:1,center:0};
  c.b={
    [idx(20,20)]:{k:'hall',lvl:3,doneAt:null},[idx(18,20)]:{k:'house',lvl:3,doneAt:null},
    [idx(22,20)]:{k:'market',lvl:3,doneAt:null},[idx(24,20)]:{k:'barracks',lvl:3,doneAt:null},
    [idx(26,20)]:{k:'envoy',lvl:3,doneAt:null},[idx(20,23)]:{k:'gather',lvl:3,doneAt:null},
    [idx(22,23)]:{k:'farm',lvl:3,doneAt:null,fertility:100},
  };
  for(let i=0;i<5;i++)c.b[idx(18+i,26)]={k:'storehouse',lvl:3,doneAt:null};
  c.people.forEach(p=>{p.task={t:'idle'};p.pos=c.camp;});
  c.res={food:5000,wood:5000,stone:3000,copper:1000,gold:500,diamond:50,coal:0};c.army={club:12,sword:6};
  c.discoveries=['sync-qa-a','sync-qa-b'].filter(id=>id!==cityId(actor));
  c.visits=Object.fromEntries(c.discoveries.map(id=>[id,now+86400000]));return c;
}
async function request(actor:Actor|undefined,path:string,body?:unknown,version=1) {
  const started=performance.now();
  const res=await fetch(new URL(path,base),{method:body===undefined?'GET':'POST',headers:{...(actor?{cookie:cookie(actor,version)}:{}),'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});
  const data=await res.json();return {status:res.status,data,ms:performance.now()-started};
}
async function get(actor:Actor):Promise<BatchResponse> {
  const r=await request(actor,'/api/city');assert.equal(r.status,200);assert.ok(r.data.sync);return r.data;
}
function batch(sync:CitySync,actions:Action[]):BatchRequest {
  return {engine:sync.engine,session:sync.session,commands:actions.map((action,n)=>({seq:sync.ack+n+1,id:randomUUID(),at:Math.max(Date.now(),sync.at),anchor:sync.anchor,action}))};
}
const idle:Action={type:'assign',ids:[1],task:{t:'idle'}};
const work:Action={type:'assign',ids:[1],task:{t:'work',at:idx(20,23)}};
const rows:{scenario:string;ms:number}[]=[];
async function check(scenario:string,fn:()=>Promise<void>){const t=performance.now();await fn();rows.push({scenario,ms:Math.round(performance.now()-t)});console.log(`PASS ${scenario}`);}
async function waitFor(check:()=>boolean|Promise<boolean>,ms=10000) {
  const until=Date.now()+ms;
  while(!await check()){assert.ok(Date.now()<until,'Timed out waiting for local runtime');await new Promise(r=>setTimeout(r,100));}
}
async function workerPost(path:string,body:unknown) {
  assert.ok(workerSecret.startsWith('local-worker-'),'Use a test-only Worker secret');
  const r=await fetch(new URL(path,worker),{method:'POST',headers:{authorization:`Bearer ${workerSecret}`,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  assert.ok(r.ok,`Local Worker returned ${r.status}`);return r.json();
}
async function openSocket(url:string) {
  const target=new URL(url);assert.ok(['127.0.0.1','localhost'].includes(target.hostname));
  const socket=new WebSocket(url),frames:any[]=[];
  socket.addEventListener('message',e=>{try{frames.push(JSON.parse(String(e.data)));}catch{}});
  await waitFor(()=>socket.readyState===WebSocket.OPEN);
  return {socket,frames};
}
async function createProbe():Promise<Actor> {
  const actor:Actor=`probe-${randomUUID()}`,now=Date.now(),state=fixture(now,actor);
  await users.insertOne({_id:uid(actor),email:`${actor}@sync-qa.invalid`,name:'QA probe',cityId:cityId(actor),friendCode:`QA${randomUUID()}`,friends:[],sessionVersion:1,createdAt:new Date(now),lastSeen:new Date(now)});
  await cities.insertOne({_id:cityId(actor),owner:uid(actor),name:'QA probe',state,world:{x:70,y:40},ver:0,score:score(state),era:3,pop:state.pop,templeAt:null,createdAt:new Date(now),updatedAt:new Date(now)});
  return actor;
}
try {
  if(mode==='seed') {
    assert.equal(await cities.countDocuments(),0,'Seed requires an empty dedicated QA database');
    const now=Date.now();
    for(const [i,actor]of (['a','b','ui'] as Actor[]).entries()) {
      const state=fixture(now,actor);
      await users.insertOne({_id:uid(actor),email:`${actor}@sync-qa.invalid`,name:`QA ${actor}`,cityId:cityId(actor),friendCode:`QATEST${i}`,friends:[],sessionVersion:1,createdAt:new Date(now),lastSeen:new Date(now)});
      await cities.insertOne({_id:cityId(actor),owner:uid(actor),name:`Làng QA ${actor}`,state,world:{x:40+i*6,y:40},ver:0,score:score(state),era:3,pop:state.pop,templeAt:null,createdAt:new Date(now),updatedAt:new Date(now)});
    }
    console.log('Seeded three synthetic villages in local QA database.');
  } else if(mode==='login') {
    const server=createServer(async(req,res)=>{
      if(req.url==='/login') {
        res.writeHead(303,{'set-cookie':`${cookie('ui')}; HttpOnly; SameSite=Lax; Path=/`,'location':base.origin,'cache-control':'no-store'});res.end();return;
      }
      res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
      res.end('<p>Local synthetic QA only</p><a href="/login">Open QA village</a>');
    });
    server.listen(3111,'127.0.0.1',()=>console.log('Synthetic browser login: http://127.0.0.1:3111'));
    await new Promise<void>(resolve=>{process.once('SIGINT',()=>server.close(()=>resolve()));process.once('SIGTERM',()=>server.close(()=>resolve()));});
  } else if(mode==='run') {
    await check('unauthenticated HTTP commands are refused',async()=>{
      assert.equal((await request(undefined,'/api/city')).status,401);
      assert.equal((await request(undefined,'/api/city/batch',{})).status,401);
    });
    await check('ordinary GET keeps persisted city and revision unchanged',async()=>{
      await get('a');const before=await cities.findOne({_id:cityId('a')});
      for(let n=0;n<3;n++)await get('a');const after=await cities.findOne({_id:cityId('a')});
      assert.equal(after!.ver,before!.ver);assert.deepEqual(after!.state,before!.state);
    });
    await check('20 commands commit once; exact retry preserves resources and revision',async()=>{
      const initial=await get('a'),before=await cities.findOne({_id:cityId('a')});
      const req=batch(initial.sync,Array.from({length:20},(_,n)=>n%2?work:idle));
      const r=await request('a','/api/city/batch',req);assert.equal(r.status,200);assert.equal(r.data.sync.ack,20);
      const saved=await cities.findOne({_id:cityId('a')});assert.equal(saved!.ver,before!.ver+1);assert.equal(saved!.citySync!.ack,20);
      const replay=await request('a','/api/city/batch',req);assert.equal(replay.status,200);
      assert.deepEqual(await cities.findOne({_id:cityId('a')}),saved);
    });
    await check('partial domain failure consumes sequence and preserves next valid command',async()=>{
      const sync=(await get('a')).sync;
      const r=await request('a','/api/city/batch',batch(sync,[{type:'advance'},idle]));assert.equal(r.status,200);
      assert.ok(r.data.sync.results[0].error);assert.equal(r.data.sync.results[1].error,null);assert.equal(r.data.sync.ack,sync.ack+2);
    });
    await check('two concurrent copies commit once under real Mongo CAS',async()=>{
      const sync=(await get('a')).sync,before=await cities.findOne({_id:cityId('a')}),req=batch(sync,[idle]);
      const responses=await Promise.all([request('a','/api/city/batch',req),request('a','/api/city/batch',req)]);
      assert.ok(responses.every(r=>r.status===200));assert.equal((await cities.findOne({_id:cityId('a')}))!.ver,before!.ver+1);
    });
    await check('market transaction preserves sync ledger and repeated create does not escrow twice',async()=>{
      const sync=(await get('a')).sync,req=batch(sync,[idle]);
      const order={type:'create',resource:'stone',amount:100,currency:'gold',price:20,escorts:{},requestId:randomUUID()};
      const sale=await request('a','/api/market',order);assert.equal(sale.status,200,JSON.stringify(sale.data));
      const stored=await cities.findOne({_id:cityId('a')});assert.equal(stored!.citySync!.ack,sync.ack);
      const retry=await request('a','/api/market',order);assert.equal(retry.status,200);
      assert.deepEqual((await cities.findOne({_id:cityId('a')}))!.state.res,stored!.state.res);
      const r=await request('a','/api/city/batch',req);assert.equal(r.status,200);assert.ok(r.data.sync.results[0].rescheduled);
      const purchase={type:'buy',id:`${cityId('a')}:${order.requestId}`,requestId:randomUUID()};
      const bought=await request('b','/api/market',purchase);assert.equal(bought.status,200,JSON.stringify(bought.data));
      const buyer=await cities.findOne({_id:cityId('b')});await request('b','/api/market',purchase);
      assert.deepEqual((await cities.findOne({_id:cityId('b')}))!.state.res,buyer!.state.res);
      assert.equal(await db.collection('caravans').countDocuments({orderId:purchase.id}),1);
      assert.equal((await cities.findOne({_id:cityId('a')}))!.citySync!.ack,sync.ack+1);
    });
    await check('envoy mutation preserves ACK and its trip is persisted',async()=>{
      const before=await get('a');const r=await request('a','/api/world/envoy',{target:cityId('b')});assert.equal(r.status,200);assert.equal(r.data.error,null);
      const saved=await cities.findOne({_id:cityId('a')});assert.equal(saved!.citySync!.ack,before.sync.ack);assert.ok(saved!.state.trips?.some(t=>t.target===cityId('b')));
    });
    await check('superseded HTTP session cannot apply pending commands',async()=>{
      const before=await get('b'),req=batch(before.sync,[idle]);
      await users.updateOne({_id:uid('b')},{$set:{sessionVersion:2}});
      const r=await request('b','/api/city/batch',req);assert.equal(r.status,401);
      assert.equal((await request('b','/api/city',undefined,2)).status,200);
    });
    console.log(JSON.stringify({database:name,source:'local Next HTTP + MongoDB replica set + local Worker; synthetic accounts, no Google OAuth',rows},null,2));
  } else if(mode==='profile') {
    // Dedicated fixture isolates measurements from the browser's UI village.
    const actor=await createProbe();
    const initial=await get(actor),req=batch(initial.sync,Array.from({length:20},(_,n)=>n%2?work:idle));
    const measured=[];
    for(const scenario of ['batch20','duplicate','read'] as const) {
      const since=new Date();let response;
      try {
        await db.command({profile:2,slowms:0});
        response=await request(actor,scenario==='read'?'/api/city':'/api/city/batch',scenario==='read'?undefined:req);
      } finally {await db.command({profile:0});}
      assert.equal(response!.status,200);
      const events=await db.collection('system.profile').find({ts:{$gte:since},ns:`${name}.cities`}).toArray();
      // MongoDB 8 truncates large update commands. Match only their leading query,
      // never print the stored snapshot or attribute another village's update.
      const own=events.filter(e=>[e.command?.filter?._id,e.command?.q?._id,e.query?._id].includes(cityId(actor))
        ||String(e.command?.$truncated??'').startsWith(`{ q: { _id: "${cityId(actor)}",`));
      const counts={find:own.filter(e=>e.op==='query').length,update:own.filter(e=>e.op==='update').length};
      assert.equal(counts.find,1,JSON.stringify({scenario,counts}));assert.equal(counts.update,scenario==='batch20'?1:0,JSON.stringify({scenario,counts}));
      measured.push({scenario,...counts,httpWallMs:Math.round(response!.ms),responseBytes:Buffer.byteLength(JSON.stringify(response!.data))});
    }
    console.log(JSON.stringify({source:'MongoDB local profiler, actual Next HTTP; timings are wall time, not Vercel CPU',measured},null,2));
  } else if(mode==='soak') {
    // Intentionally real wall time; do not shorten and label it a two-hour soak.
    const actor=await createProbe(),start=performance.now(),duration=2*HOUR,samples:number[]=[];
    console.log(JSON.stringify({event:'soak-start',at:new Date().toISOString(),durationMs:duration,reconnects:100}));
    for(let n=0;n<100;n++) {
      const deadline=start+n*duration/100;
      await new Promise(r=>setTimeout(r,Math.max(0,deadline-performance.now())));
      const sync=(await get(actor)).sync,req=batch(sync,[n%2?work:idle]);
      const r=await request(actor,'/api/city/batch',req);assert.equal(r.status,200);assert.equal(r.data.sync.ack,sync.ack+1);samples.push(r.ms);
      const saved=await cities.findOne({_id:cityId(actor)});
      const retry=await request(actor,'/api/city/batch',req);assert.equal(retry.status,200);
      assert.deepEqual(await cities.findOne({_id:cityId(actor)}),saved);
      const hub=await request(actor,'/api/battles');assert.equal(hub.status,200);
      const {socket}=await openSocket(hub.data.socket);
      socket.close(1000,'QA reconnect');await waitFor(()=>socket.readyState===WebSocket.CLOSED);
      console.log(JSON.stringify({event:'soak-progress',cycle:n+1,elapsedMs:Math.round(performance.now()-start),ack:r.data.sync.ack}));
    }
    await new Promise(r=>setTimeout(r,Math.max(0,start+duration-performance.now())));
    samples.sort((a,b)=>a-b);
    console.log(JSON.stringify({event:'soak-pass',elapsedMs:Math.round(performance.now()-start),reconnects:100,batchHttpP95Ms:Math.round(samples[Math.ceil(samples.length*.95)-1]),source:'local real wall time, HTTP + Mongo + Worker; not mobile lifecycle or Vercel CPU'}));
  } else if(mode==='close') {
    await check('a real WebSocket close without a status completes its handshake',async()=>{
      const hub=await request('a','/api/battles');assert.equal(hub.status,200);
      const {socket}=await openSocket(hub.data.socket);socket.close();
      await waitFor(()=>socket.readyState===WebSocket.CLOSED);
    });
  } else if(mode==='combat') {
    const defenderVersion=(await users.findOne({_id:uid('b')}))!.sessionVersion!;
    const b=await request('b','/api/city',undefined,defenderVersion);assert.equal(b.status,200);
    const pending=batch(b.data.sync,[idle]),aBefore=await get('a');
    const launched=await request('a','/api/battles',{target:cityId('b'),troops:{club:6}});
    assert.equal(launched.status,200,JSON.stringify(launched.data));const id=launched.data.battle._id;
    // Advance only this synthetic battle's march boundary; do not wait a minute.
    await db.collection('battles').updateOne({_id:id,attackerId:cityId('a'),defenderId:cityId('b')},{$set:{arrive:Date.now()-1}});
    const started=await fetch(new URL(`/api/battles/${id}/start`,base),{method:'POST',headers:{authorization:`Bearer ${workerSecret}`}});assert.equal(started.status,200);
    await check('incoming live combat rejects queued village command and persists its ACK',async()=>{
      const r=await request('b','/api/city/batch',pending,defenderVersion);assert.equal(r.status,200);
      assert.ok(r.data.sync.results[0].error.includes('trận'));assert.equal(r.data.sync.ack,pending.commands[0].seq);
    });
    const aBattle=await request('a',`/api/battles/${id}`),bBattle=await request('b',`/api/battles/${id}`,undefined,defenderVersion);
    assert.equal(aBattle.status,200);assert.equal(bBattle.status,200);
    const attacker=await openSocket(aBattle.data.socket),defender=await openSocket(bBattle.data.socket);
    try {
      await check('real Worker WebSocket movement changes army position',async()=>{
        const initial=aBattle.data.battle as BattleState,g=initial.groups.find(g=>g.side==='attacker')!;
        attacker.socket.send(JSON.stringify({type:'command',command:{type:'move',groupId:g.id,x:g.x+3,y:g.y}}));
        await waitFor(()=>attacker.frames.some(f=>f.type==='ack'&&f.accepted));
        await waitFor(()=>attacker.frames.some(f=>f.type==='state'&&f.battle.groups.some((v:any)=>v.id===g.id&&v.x>g.x+.1)));
      });
      await check('a replaced session loses both HTTP and an already-open combat socket',async()=>{
        await users.updateOne({_id:uid('b')},{$set:{sessionVersion:defenderVersion+1}});
        await workerPost(`/rooms/player-${cityId('b')}/session`,{version:defenderVersion+1});
        defender.socket.send(JSON.stringify({type:'command',command:{type:'presence',online:true}}));
        await waitFor(()=>defender.frames.some(f=>f.type==='session-ended'));
        assert.equal((await request('b','/api/city/batch',pending,defenderVersion)).status,401);
        assert.equal((await request('b','/api/city',undefined,defenderVersion+1)).status,200);
      });
      await check('retreat finishes real Worker battle, callback saves report once and preserves ledger',async()=>{
        attacker.socket.send(JSON.stringify({type:'command',command:{type:'retreat'}}));
        await waitFor(async()=>!!(await db.collection('battles').findOne({_id:id}))?.result,15000);
        const war=await db.collection('battles').findOne({_id:id}),a=await cities.findOne({_id:cityId('a')}),b=await cities.findOne({_id:cityId('b')});
        assert.equal(war!.result.winner,'defender');assert.equal(b!.state.battleId,undefined);
        assert.equal(a!.citySync!.ack,aBefore.sync.ack);assert.equal(b!.citySync!.ack,pending.commands[0].seq);
        const replay=await fetch(new URL('/api/battles/result',base),{method:'POST',headers:{authorization:`Bearer ${workerSecret}`,'content-type':'application/json'},body:JSON.stringify({battleId:id,result:war!.result})});
        assert.equal(replay.status,200);assert.deepEqual((await cities.findOne({_id:cityId('b')}))!.state,b!.state);
        assert.ok(b!.state.log.some(l=>l.msg.includes('QA a')));
      });
    } finally {attacker.socket.close(1000,'QA complete');defender.socket.close(1000,'QA complete');}
    console.log(JSON.stringify({source:'local Mongo + real Wrangler DO/WebSockets + Next callback',rows},null,2));
  } else throw new Error('Use seed, run, combat, close, profile, soak or login');
} finally {await client.close();}
