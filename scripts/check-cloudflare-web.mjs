import assert from 'node:assert/strict';

const origin = process.argv[2] ?? 'https://dong-song-game-staging.phungthienphu.workers.dev';
assert.equal(new URL(origin).protocol, 'https:');
let requests = 0;
async function get(path, method = 'GET', redirect = 'error') {
  requests++;
  return fetch(new URL(path, origin), { method, redirect, signal: AbortSignal.timeout(15_000) });
}
const home = await get('/');
assert.equal(home.status, 200);
assert.match(home.headers.get('content-type'), /text\/html/);
const html = await home.text();
assert.match(html, /Dòng Chảy Thời Gian/);
const socialImage = html.match(/<meta property="og:image" content="([^"]+)"/);
assert.ok(socialImage, 'Missing social image metadata');
assert.equal(new URL(socialImage[1]).origin, new URL(origin).origin, 'Metadata points to a different environment');
assert.match(home.headers.get('cache-control'), /no-cache/);
const assets = [...new Set([...html.matchAll(/(?:src|href)="([^"?#]+(?:\?[^"#]*)?)"/g)]
  .map(match => match[1]).filter(path => path.startsWith('/_next/static/')))];
assert.ok(assets.some(path => path.includes('.js')));
assert.ok(assets.some(path => path.includes('.css')));
assert.ok(assets.some(path => path.includes('.woff2')));
for (const path of assets) {
  const response = await get(path);
  assert.equal(response.status, 200, path);
  assert.match(response.headers.get('cache-control'), /immutable/, path);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.ok(bytes.length > 0, path);
  const type = response.headers.get('content-type');
  if (path.includes('.js')) {
    assert.match(type, /javascript/, path);
    assert.notEqual(new TextDecoder().decode(bytes.slice(0, 15)).trim().slice(0, 1), '<', path);
  }
  if (path.includes('.css')) assert.match(type, /text\/css/, path);
  if (path.includes('.woff2')) assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), 'wOF2', path);
}
for (const [path, type] of [['/favicon.ico', 'image/'], ['/icon.svg', 'image/svg+xml'], ['/opengraph-image.png', 'image/png']]) {
  const response = await get(path);
  assert.equal(response.status, 200, path);
  assert.ok(response.headers.get('content-type').startsWith(type), path);
}
for (const path of ['/dev', '/dev/sync', '/dev/eras', '/_next/static/missing-chunk.js']) {
  assert.equal((await get(path)).status, 404, path);
}
const health = await get('/api/health');
assert.equal(health.status, 200);
assert.equal((await health.json()).gameReady, false);
const villageQA = process.argv.includes('--village');
for (const [path, method] of [...(villageQA ? [] : [['/api/city', 'GET'], ['/api/city/batch', 'POST']]), ['/api/city/action', 'POST'], ['/api/unknown', 'GET']]) {
  const response = await get(path, method);
  assert.equal(response.status, 503, path);
  assert.equal(response.headers.get('cache-control'), 'no-store', path);
  assert.equal((await response.json()).code, 'MIGRATION_NOT_READY');
}
const checks = ['html', 'chunks', 'css', 'fonts', 'icons', 'cache', '404', 'api-fence'];
if (villageQA) {
  const city = await get('/api/city');
  assert.equal(city.status, 401); assert.equal((await city.json()).needsLogin, true);
  assert.equal((await get('/api/city/batch', 'POST')).status, 403);
  checks.push('village-auth', 'village-csrf', 'legacy-action-disabled');
}
if (process.argv.includes('--auth')) {
  const me = await get('/api/me');
  assert.equal(me.status, 200);
  assert.deepEqual(await me.json(), { user: null, friends: [] });
  const login = await get('/api/auth/login', 'GET', 'manual');
  assert.equal(login.status, 303);
  const target = new URL(login.headers.get('location'));
  assert.equal(target.origin, 'https://accounts.google.com');
  assert.equal(target.searchParams.get('redirect_uri'), `${new URL(origin).origin}/api/auth/callback/google`);
  assert.equal(target.searchParams.get('code_challenge_method'), 'S256');
  assert.match(login.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Lax/);
  const callback = await get('/api/auth/callback/google?code=invalid&state=invalid', 'GET', 'manual');
  assert.equal(callback.status, 303);
  assert.equal(callback.headers.get('location'), `${new URL(origin).origin}/?auth=state`);
  assert.equal((await get('/api/auth/logout', 'POST')).status, 403);
  checks.push('anonymous-profile', 'oauth-redirect', 'oauth-state', 'logout-csrf');
}
console.log(JSON.stringify({ ok: true, origin, assets: assets.length, requests, checks }));
