import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const root = resolve(import.meta.dirname, '..');
const out = mkdtempSync(join(tmpdir(), 'battle-worker-'));
const tsc = resolve(import.meta.dirname, 'node_modules/.bin/tsc');
const fallback = resolve(root, 'node_modules/.bin/tsc');
const compile = spawnSync(existsSync(tsc) ? tsc : fallback, ['-p', 'worker/tsconfig.json', '--noEmit', 'false', '--rootDir', '.', '--outDir', out], { cwd: root, encoding: 'utf8' });
if (compile.status) throw new Error(compile.stdout + compile.stderr);
function fix(dir) { for (const entry of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, entry.name); if (entry.isDirectory()) fix(p); else if (p.endsWith('.js')) writeFileSync(p, readFileSync(p, 'utf8').replace(/from (['"])(\.[^'"]+)\1/g, 'from $1$2.js$1')); } }
fix(out); writeFileSync(join(out, 'package.json'), '{"type":"module"}');
const { BattleRoom, default: worker } = await import(pathToFileURL(join(out, 'worker/src/index.js')));
const { createBattle } = await import(pathToFileURL(join(out, 'lib/battle.js')));
const { newCity } = await import(pathToFileURL(join(out, 'lib/engine.js')));
const realInterval = globalThis.setInterval;
globalThis.setInterval = () => ({ fake: true });
process.on('exit', () => { globalThis.setInterval = realInterval; rmSync(out, { recursive: true, force: true }); });
const secret = 'test-shared-secret';
function harness(initial = {}) {
  const data = new Map(Object.entries(initial)); const sockets = []; let alarm = null; let ready;
  const ctx = { storage: { get: async k => data.get(k), put: async (k, v) => { if (typeof k === 'object') for (const [a,b] of Object.entries(k)) data.set(a,b); else data.set(k,v); }, delete: async k => data.delete(k), setAlarm: async n => { alarm = n; }, deleteAlarm: async () => { alarm = null; } }, blockConcurrencyWhile: fn => ready = fn(), waitUntil: () => {}, getWebSockets: () => sockets, acceptWebSocket: s => sockets.push(s) };
  const room = new BattleRoom(ctx, { BATTLE_SERVER_SECRET: secret, APP_URL: 'https://app.example' });
  return { room, ready, data, sockets, get alarm() { return alarm; } };
}
const request = (path, body, auth = true) => new Request(`https://worker.example/rooms/${path}`, { method: body ? 'POST' : 'GET', headers: { ...(auth ? { Authorization: `Bearer ${secret}` } : {}), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
function battle() { return createBattle({ id: 'one', attackerId: 'a', defenderId: 'd', attacker: newCity(Date.now(), 1), defender: newCity(Date.now(), 2), troops: { club: 3 }, now: Date.now() }); }
function socket(user) { return { frames: [], closed: false, deserializeAttachment: () => user, serializeAttachment(value) { user = value; }, send(x) { this.frames.push(JSON.parse(x)); }, close() { this.closed = true; } }; }
test('server auth and personal hubs are read-only', async () => { const h = harness(); await h.ready; assert.equal((await h.room.fetch(request('one', null, false))).status, 401); assert.equal((await h.room.fetch(request('player-a', { battle: battle() }))).status, 403); assert.equal((await h.room.fetch(request('player-a/command', { side: 'defender', command: { type: 'retreat' } }))).status, 403); });
test('personal notifications reject expired sockets', async () => { const h = harness(); await h.ready; const s = socket({ playerId: 'a', side: 'defender', exp: 1 }); h.sockets.push(s); await h.room.fetch(request('player-a/notify', { type: 'update' })); assert.ok(s.closed); assert.equal(s.frames.length, 0); });
test('new battle alarm survives reentrant start callback even lost response', async () => { const h = harness({ roomId: 'one', scheduled: Date.now() - 1 }); await h.ready; const original = globalThis.fetch; globalThis.fetch = async (_url, init) => { assert.equal(init.headers.Authorization, `Bearer ${secret}`); await h.room.fetch(request('one', { battle: battle() })); return new Response('', { status: 503 }); }; try { await h.room.alarm(); assert.ok(h.data.get('battle')); assert.ok(h.alarm <= Date.now() + 1100); } finally { globalThis.fetch = original; } });
test('failed result delivery persists and retries authenticated callback', async () => { const b = battle(); b.status = 'finished'; b.winner = 'defender'; const h = harness({ battle: b, roomId: 'one' }); await h.ready; const original = globalThis.fetch; let count = 0; globalThis.fetch = async (url, init) => { assert.ok(url.endsWith('/api/battles/result')); assert.equal(init.headers.Authorization, `Bearer ${secret}`); return new Response('', { status: ++count === 1 ? 503 : 200 }); }; try { await h.room.alarm(); assert.equal(h.data.get('delivered'), false); assert.ok(h.alarm); await h.room.alarm(); assert.equal(h.data.get('delivered'), true); assert.equal(h.alarm, null); } finally { globalThis.fetch = original; } });
test('forged membership cannot command or receive snapshots', async () => { const h = harness({ battle: battle(), roomId: 'one' }); await h.ready; const s = socket({ roomId: 'one', playerId: 'intruder', side: 'attacker', exp: Date.now() / 1000 + 60 }); h.sockets.push(s); await h.room.webSocketMessage(s, JSON.stringify({ type: 'retreat' })); assert.ok(s.closed); assert.equal(h.data.get('battle').status, 'fighting'); });
test('tick snapshots omit terrain and expired tickets close', async () => { const h = harness({ battle: battle(), roomId: 'one' }); await h.ready; const good = socket({ roomId: 'one', playerId: 'a', side: 'attacker', exp: Date.now() / 1000 + 60 }); const expired = socket({ roomId: 'one', playerId: 'd', side: 'defender', exp: 1 }); h.sockets.push(good, expired); await h.room.tick(); assert.ok(expired.closed); assert.equal(good.frames[0].battle.terrain, undefined); assert.ok(h.data.get('battle').terrain.length); });

test('scheduled reconciliation authenticates callback and surfaces non-2xx failures', async () => {
  const original = globalThis.fetch; let count = 0;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://app.example/api/battles/reconcile');
    assert.equal(init.method, 'POST'); assert.equal(init.headers.Authorization, `Bearer ${secret}`);
    assert.equal(init.body, '{}');
    return new Response('', { status: ++count === 1 ? 200 : 503 });
  };
  try {
    await worker.scheduled({}, { APP_URL: 'https://app.example/', BATTLE_SERVER_SECRET: secret });
    await assert.rejects(worker.scheduled({}, { APP_URL: 'https://app.example/', BATTLE_SERVER_SECRET: secret }), /failed \(503\)/);
  } finally { globalThis.fetch = original; }
});

test('two defender tabs aggregate active presence across blur, close and expiry', async () => {
  const h = harness({ battle: battle(), roomId: 'one' }); await h.ready;
  const user = { roomId: 'one', playerId: 'd', side: 'defender', exp: Date.now() / 1000 + 60, active: true };
  const first = socket({ ...user }); const second = socket({ ...user }); h.sockets.push(first, second);
  await h.room.webSocketMessage(first, JSON.stringify({ type: 'presence', online: false }));
  assert.equal(h.data.get('battle').defenderOnline, true);
  await h.room.webSocketClose(first, 1000, 'Tab closed');
  assert.equal(h.data.get('battle').defenderOnline, true);
  second.serializeAttachment({ ...user, exp: 1 });
  await h.room.tick(); assert.equal(h.data.get('battle').defenderOnline, false); assert.ok(second.closed);
});

test('network snapshots omit navigation buffers but durable state keeps routes and resume orders',async()=>{
  const state=battle();
  for(const group of state.groups){group.path=Array.from({length:9000},(_,i)=>i);group.pathGoal=7000;group.pathVersion=10;group.resumeOrder={type:'move',x:30,y:30};group.retreatExit={x:0,y:20};}
  const h=harness({battle:state,roomId:'one'});await h.ready;
  const good=socket({roomId:'one',playerId:'a',side:'attacker',exp:Date.now()/1000+60});h.sockets.push(good);
  h.room.broadcast();const frame=good.frames[0].battle;
  for(const group of frame.groups){for(const key of ['path','pathGoal','pathVersion','resumeOrder','retreatExit'])assert.equal(group[key],undefined);}
  assert.equal(state.groups[0].path.length,9000);assert.equal(state.groups[0].resumeOrder.type,'move');
  const {terrain:_terrain,...old}=state;
  const before=JSON.stringify(old).length,after=JSON.stringify(frame).length;
  assert.ok(after<before*.1);console.log(`Navigation stress fixture: snapshot ${before} -> ${after} bytes`);
  const initial=await(await h.room.fetch(request('one',null))).json();assert.equal(initial.battle.terrain.length,96*96);assert.equal(initial.battle.groups[0].path,undefined);
});

test('a stalled result callback times out, releases the busy flag and schedules retry',async()=>{
  const originalFetch=globalThis.fetch,originalTimeout=AbortSignal.timeout;
  let aborted=false;const state=battle();state.status='finished';state.winner='defender';
  const h=harness({battle:state,roomId:'one'});await h.ready;
  AbortSignal.timeout=()=>originalTimeout(5);
  globalThis.fetch=async(_url,init)=>new Promise((_resolve,reject)=>{
    assert.ok(init.signal);init.signal.addEventListener('abort',()=>{aborted=true;reject(init.signal.reason);},{once:true});
    // Keep this test process alive while the unref'ed abort timer runs.
    setTimeout(()=>reject(new Error('Timeout guard failed')),100).unref?.();
  });
  const keepAlive=setTimeout(()=>{},200);
  try{await h.room.tick();assert.equal(aborted,true);assert.equal(h.room.busy,false);assert.equal(h.data.get('delivered'),false);assert.ok(h.alarm>Date.now());}
  finally{clearTimeout(keepAlive);globalThis.fetch=originalFetch;AbortSignal.timeout=originalTimeout;}
});

test('market feed sends only invalidations and rejects mutations or unauthenticated publishes',async()=>{
 const h=harness();await h.ready;
 const good=socket({roomId:'market-feed',playerId:'buyer',side:'defender',exp:Date.now()/1000+60});
 const expired=socket({roomId:'market-feed',playerId:'seller',side:'defender',exp:1});h.sockets.push(good,expired);
 assert.equal((await h.room.fetch(request('market-feed/notify',{},false))).status,401);
 assert.equal((await h.room.fetch(request('market-feed/command',{side:'defender',command:{type:'retreat'}}))).status,403);
 assert.equal((await h.room.fetch(request('market-feed',{battle:battle()}))).status,403);
 assert.equal((await h.room.fetch(request('market-feed/notify',{}))).status,200);
 assert.deepEqual(good.frames,[{type:'update'}]);assert.ok(expired.closed);
 await h.room.webSocketMessage(good,JSON.stringify({type:'retreat'}));assert.equal(h.data.get('battle'),undefined);
});
test('defender socket reports unreachable moves and applies valid moves during combat',async()=>{
 const b=battle();b.terrain.fill(0);b.buildings=[];
 b.groups=[{id:'attacker:club',u:'club',side:'attacker',count:1,initial:1,hp:20,x:8.5,y:5.5,order:{type:'guard',x:8.5,y:5.5}},{id:'defender:sword',u:'sword',side:'defender',count:20,initial:20,hp:1400,x:5.5,y:5.5,order:{type:'guard',x:5.5,y:5.5}}];
 for(let y=0;y<96;y++)b.terrain[y*96+7]=3;
 const h=harness({battle:b,roomId:'one'});await h.ready;
 const ws=socket({roomId:'one',playerId:'d',side:'defender',exp:Date.now()/1000+60,active:true});h.sockets.push(ws);
 await h.room.webSocketMessage(ws,JSON.stringify({type:'command',command:{type:'move',groupId:'defender:sword',x:10.5,y:5.5}}));
 const rejected=ws.frames.find(f=>f.type==='ack');assert.equal(rejected.accepted,false);assert.match(rejected.error,/Không có đường/);
 await h.room.webSocketMessage(ws,JSON.stringify({type:'command',command:{type:'move',groupId:'defender:sword',x:3.5,y:5.5}}));
 assert.equal(ws.frames.filter(f=>f.type==='ack').at(-1).accepted,true);
 const {advanceBattle}=await import(pathToFileURL(join(out,'lib/battle.js')));advanceBattle(b,b.lastTick+2000);
 assert.equal(b.groups[1].x,3.5);assert.equal(b.groups[1].order.type,'guard');
});
