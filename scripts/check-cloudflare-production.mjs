import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createHmac } from 'node:crypto';
import { MongoClient } from 'mongodb';

// Only the account previously authorized for production smoke testing.
// No arbitrary user impersonation, new session, purchase or battle is created.
const source = parseEnv(readFileSync(new URL('../.env.local', import.meta.url), 'utf8'));
const origin = 'https://dongchaythoigian.phungthienphu.workers.dev';
const client = new MongoClient(source.MONGODB_URI, { maxPoolSize: 1, serverSelectionTimeoutMS: 10_000 });
let requests = 0;
async function get(path, cookie) {
  requests++;
  return fetch(`${origin}${path}`, { headers: cookie ? { cookie } : {}, redirect: 'manual', signal: AbortSignal.timeout(60_000) });
}
try {
  const health = await (await get('/api/health')).json(); assert.equal(health.gameReady, true); assert.equal(health.syncSeconds, 30);
  const html = await (await get('/')).text(); assert.ok(!html.includes('Hello World!')); assert.ok(!html.includes('qa-notice'));
  const assets = [...new Set([...html.matchAll(/(?:src|href)="([^"?#]+)(?:\?[^" ]*)?"/g)].map(match => match[1]).filter(path => path.startsWith('/_next/') || /\.(ico|svg|png)$/.test(path)))];
  assert.ok(assets.length > 5);
  for (const path of assets) {
    const res = await get(path); assert.equal(res.status, 200);
    const mime = res.headers.get('content-type');
    if (path.endsWith('.js')) assert.match(mime ?? '', /javascript/);
    if (path.endsWith('.css')) assert.match(mime ?? '', /css/);
    await res.arrayBuffer();
  }
  const login = await get('/api/auth/login'); assert.equal(login.status, 303);
  const target = new URL(login.headers.get('location')); assert.equal(target.origin, 'https://accounts.google.com');
  assert.equal(target.searchParams.get('redirect_uri'), `${origin}/api/auth/callback/google`);
  assert.equal(target.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(login.headers.get('set-cookie').includes('HttpOnly'));
  assert.equal((await get('/api/city')).status, 401); assert.equal((await get('/dev/buildings')).status, 404);
  const db = client.db(source.MONGODB_DB || 'dong_song_thoi_dai');
  const city = await db.collection('cities').findOne({ name: 'Nam Quốc Sơn Hà' }); assert.ok(city?.owner);
  const user = await db.collection('users').findOne({ _id: city.owner, cityId: city._id }); assert.ok(user?.sessionVersion);
  const data = Buffer.from(JSON.stringify({ uid: user._id, sessionVersion: user.sessionVersion, exp: Date.now() + 60_000 })).toString('base64url');
  const cookie = `sid=${data}.${createHmac('sha256', source.AUTH_SECRET).update(data).digest('base64url')}`;
  const me = await (await get('/api/me', cookie)).json(); assert.equal(me.user?.id, user._id); assert.equal(me.user?.hasCity, true);
  const loaded = await get('/api/city', cookie); assert.equal(loaded.status, 200);
  const game = await loaded.json(); assert.equal(game.name, city.name); assert.equal(game.state.seed, city.state.seed); assert.equal(game.state.ver, city.state.ver);
  assert.equal(game.batchEnabled, true); assert.equal(game.sync.cityId, city._id);
  const battles = await (await get('/api/battles', cookie)).json(); assert.equal(battles.enabled, true); assert.ok(battles.socket.startsWith('wss://dong-song-battles.'));
  for (const path of ['/api/world', '/api/diplomacy', '/api/leaderboard']) assert.equal((await get(path, cookie)).status, 200);
  console.log(JSON.stringify({ ok: true, origin, requests, assets: assets.length,
    checks: ['production-html-assets', 'google-pkce-redirect', 'anonymous-denied', 'authorized-existing-village-preserved', 'batch-all-users', 'battle-session-fence', 'world-diplomacy-leaderboard'],
    villages: await db.collection('cities').countDocuments(), users: await db.collection('users').countDocuments() }));
} catch (error) {
  // Assertions contain no driver messages, cookies or OAuth URLs.
  console.error('Production smoke failed:', error instanceof assert.AssertionError ? error.message.slice(0, 180) : 'request/database unavailable');
  process.exitCode = 1;
} finally { await client.close(); }
