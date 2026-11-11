/** Real Cloudflare + Mongo transactions + BattleRoom. Synthetic QA records only. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MongoClient } from 'mongodb';
import { createSession } from '../cloudflare/api/auth';
import { newCity, score, idx, G, ENGINE_VER } from '../lib/engine';
import type { CityDoc, UserDoc } from '../lib/db';

const origin = 'https://dong-song-game-staging.phungthienphu.workers.dev';
const battleOrigin = 'https://dong-song-battles-qa.phungthienphu.workers.dev';
const secrets = JSON.parse(readFileSync('.wrangler/bridge-qa-secrets.json', 'utf8'));
const database = 'dong_song_cloudflare_qa';
const client = new MongoClient(secrets.MONGODB_URI, { maxPoolSize: 2, serverSelectionTimeoutMS: 10_000 });
const db = client.db(database), users = db.collection<UserDoc>('users'), cities = db.collection<CityDoc>('cities');
const suffix = crypto.randomUUID(), ids = [`hosting-qa-a-${suffix}`, `hosting-qa-b-${suffix}`];
const cityIds: string[] = [];
let requests = 0;
const checks: string[] = [];
async function api(path: string, who = 0, method = 'GET', body?: unknown, expected = 200, extra: Record<string, string> = {}) {
  requests++;
  const res = await fetch(`${origin}${path}`, { method, headers: { origin, cookie: `sid=${createSession({ _id: ids[who], sessionVersion: 1 }, secrets.AUTH_SECRET)}`,
    'content-type': 'application/json', ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'manual', signal: AbortSignal.timeout(45_000) });
  const text = await res.text(); let result: any;
  try { result = JSON.parse(text); } catch { throw new Error(`Non-JSON ${path}: HTTP ${res.status}`); }
  assert.equal(res.status, expected, `${path}: ${JSON.stringify(result).slice(0, 300)}`);
  return result;
}
async function worker(path: string, body?: unknown) {
  requests++;
  const res = await fetch(`${battleOrigin}/rooms/${path}`, { method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${secrets.BATTLE_SERVER_SECRET}`, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15_000) });
  assert.ok(res.ok, `QA BattleRoom HTTP ${res.status}`); return res.json() as Promise<any>;
}
try {
  // Only one-time setup, never executed by an API cold start.
  for (const [key, value] of Object.entries(secrets)) process.env[key] = value as string;
  process.env.MONGODB_DB = database;
  const legacy = await import('../lib/db');
  await (await legacy.mongoClient()).close();
  const now = new Date();
  await users.insertMany(ids.map((id, n) => ({ _id: id, name: `Hosting QA ${n}`, email: `${id}@example.invalid`,
    cityId: null, friendCode: crypto.randomUUID().slice(0, 6).toUpperCase(), friends: [], createdAt: now, lastSeen: now, sessionVersion: 1 })));
  const health = await (await fetch(`${origin}/api/health`)).json() as { gameReady: boolean };
  assert.equal(health.gameReady, true);
  assert.equal((await api('/api/me')).user.id, ids[0]); checks.push('authenticated-profile');
  for (let n = 0; n < 2; n++) {
    const created = await api('/api/city', n, 'POST', { name: `Hosting QA ${n}` });
    assert.equal(created.state.ver, ENGINE_VER);
    const user = await users.findOne({ _id: ids[n] }); assert.ok(user?.cityId); cityIds.push(user.cityId);
  }
  checks.push('create-city-and-cookie');
  const base = await api('/api/city'); assert.equal(base.batchEnabled, true);
  const command = { seq: 1, id: crypto.randomUUID(), at: base.sync.at, anchor: base.sync.anchor, action: { type: 'assign', ids: [1], task: { t: 'idle' } } };
  const batch = { engine: base.sync.engine, session: 1, commands: [command] };
  const concurrent = await Promise.all([api('/api/city/batch', 0, 'POST', batch), api('/api/city/batch', 0, 'POST', batch)]);
  assert.equal(concurrent[0].sync.ack, 1); assert.equal(concurrent[1].sync.ack, 1);
  assert.equal(concurrent[0].sync.revision, concurrent[1].sync.revision);
  assert.equal((await api('/api/city/checkpoint', 0, 'POST')).sync.ack, 1);
  checks.push('concurrent-batch-exactly-once', 'checkpoint-reload');
  // Mature fixture on our two newly created QA villages only.
  for (let n = 0; n < 2; n++) {
    const c = newCity(Date.now(), 5 + n); c.t.fill(G); c.seen.fill(1); c.era = 2;
    c.b = { [idx(20, 20)]: { k: 'market', lvl: 1, doneAt: null }, [idx(22, 20)]: { k: 'barracks', lvl: 3, doneAt: null }, [idx(24, 20)]: { k: 'envoy', lvl: 1, doneAt: null } };
    c.camp = idx(19, 20); c.res = { food: 1500, wood: 200, stone: 200, copper: 100, gold: 100, diamond: 20, coal: 0,aetherCrystal:0,rune:0,essence:0,celestialStone:0 };
    c.army = { club: 20, sword: 20 }; c.discoveries = [...cityIds]; c.visits = { [cityIds[1 - n]]: Date.now() + 86400000 }; delete c.shieldUntil;
    await cities.updateOne({ _id: cityIds[n], owner: ids[n] }, { $set: { state: c, score: score(c), era: 2, pop: c.pop, world: { x: 40 + n, y: 40 } }, $inc: { ver: 1 } });
  }
  const found = await api('/api/friends?q=Hosting'); assert.ok(found.players.some((p: any) => p.id === ids[1]));
  await api('/api/friends', 0, 'POST', { id: ids[1] });
  assert.ok((await api('/api/me')).friends.some((p: any) => p.id === ids[1]));
  assert.equal((await api(`/api/visit/${cityIds[1]}`)).id, cityIds[1]);
  await api('/api/friends', 0, 'DELETE', { id: ids[1] }); checks.push('search-mutual-friendship-visit-remove');
  assert.ok((await api('/api/world')).nations.some((p: any) => p.id === cityIds[1]));
  assert.ok(Array.isArray((await api('/api/leaderboard')).rows));
  await api('/api/world/envoy', 0, 'POST', { target: cityIds[1] });
  assert.ok(Array.isArray((await api('/api/diplomacy', 1)).messages)); checks.push('world-envoy-diplomacy');
  const saleId = `sale-${suffix}`, buyId = `buy-${suffix}`;
  const sale = { type: 'create', resource: 'stone', amount: 10, currency: 'gold', price: 2, escorts: {}, requestId: saleId };
  await api('/api/market', 0, 'POST', sale); await api('/api/market', 0, 'POST', sale);
  const market = await api('/api/market', 1); assert.ok(market.orders.some((o: any) => o._id === `${cityIds[0]}:${saleId}`));
  await api('/api/market', 1, 'POST', { type: 'buy', id: `${cityIds[0]}:${saleId}`, requestId: buyId });
  await api('/api/market', 1, 'POST', { type: 'buy', id: `${cityIds[0]}:${saleId}`, requestId: buyId });
  assert.equal(await db.collection('caravans').countDocuments({ buyer: cityIds[1] }), 1);
  checks.push('market-transaction-retry-no-double-purchase');
  const wars = await api('/api/battles'); assert.equal(wars.enabled, true); assert.ok(wars.socket.startsWith('wss://dong-song-battles-qa.'));
  const launched = await api('/api/battles', 0, 'POST', { target: cityIds[1], troops: { club: 3 } });
  const id = launched.battle._id;
  await db.collection('battles').updateOne({ _id: id } as any, { $set: { arrive: Date.now() - 1 } });
  await api(`/api/battles/${id}/start`, 0, 'POST', {}, 200, { authorization: `Bearer ${secrets.BATTLE_SERVER_SECRET}` });
  const fight = await api(`/api/battles/${id}`); assert.ok(fight.battle);
  const room = await worker(id); assert.ok(room.battle);
  // Exercise the real BattleRoom command channel and its own result callback.
  await worker(`${id}/command`, { side: 'attacker', command: { type: 'retreat' } });
  checks.push('pvp-launch-start-live-room-command');
  await api('/api/battles/reconcile', 0, 'POST', {}, 200, { authorization: `Bearer ${secrets.BATTLE_SERVER_SECRET}` });
  // Actual callback runs on the next BattleRoom alarm (1s). Bounded poll below.
  let ended = false;
  for (let i = 0; i < 12; i++) {
    const row = await db.collection('battles').findOne({ _id: id } as any);
    if (row?.result) { ended = true; break; }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.equal(ended, true, 'BattleRoom result did not reach Cloudflare callback');
  checks.push('battle-worker-result-callback');
  await users.updateOne({ _id: ids[0] }, { $set: { sessionVersion: 2 } });
  await api('/api/city', 0, 'GET', undefined, 401); checks.push('superseded-session-rejected');
  console.log(JSON.stringify({ ok: true, requests, environment: 'Cloudflare staging + Mongo QA + BattleRoom QA', checks }));
} finally {
  // Delete only fixture IDs owned by this invocation, never the real QA user.
  await db.collection('caravans').deleteMany({ $or: [{ seller: { $in: cityIds } }, { buyer: { $in: cityIds } }] });
  await db.collection('market_orders').deleteMany({ seller: { $in: cityIds } });
  await db.collection('battles').deleteMany({ attackerId: { $in: cityIds } });
  await db.collection('envoy_visits').deleteMany({ from: { $in: cityIds } });
  await db.collection('online_command_stats').deleteMany({ cityId: { $in: cityIds } });
  await cities.deleteMany({ _id: { $in: cityIds }, owner: { $in: ids } });
  await users.deleteMany({ _id: { $in: ids } });
  await client.close();
}
