/** Focused staging regression. Creates/deletes synthetic QA records only. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MongoClient } from 'mongodb';
import { createSession } from '../cloudflare/api/auth';
import { newCity, settle, score, G, idx, HOUR, type City } from '../lib/engine';
import { loadCityResponse } from '../lib/city-loading';
import type { CityDoc, UserDoc } from '../lib/db';
const origin = 'https://dong-song-game-staging.phungthienphu.workers.dev';
const secrets = JSON.parse(readFileSync('.wrangler/bridge-qa-secrets.json', 'utf8'));
const client = new MongoClient(secrets.MONGODB_URI, { maxPoolSize: 1, serverSelectionTimeoutMS: 10_000 });
const db = client.db('dong_song_cloudflare_qa');
const uid = `offline-qa-${crypto.randomUUID()}`, pid = `offline-qa-${crypto.randomUUID()}`;
const users = db.collection<UserDoc>('users'), cities = db.collection<CityDoc>('cities');
let requests = 0;
try {
  const from = Date.now() - 72 * HOUR, source = newCity(from, 181);
  source.era = 6; source.t.fill(G); source.seen.fill(1); source.camps = []; source.herds = [];
  source.wildernessAt = Date.now() + 7 * 24 * HOUR;
  const person = source.people[0];
  source.people = Array.from({ length: 600 }, (_, i) => ({ ...structuredClone(person), id: i + 1, name: `QA ${i}`, task: { t: 'idle' as const }, pos: source.camp }));
  source.pop = 600;
  for (let y = 20; y < 38; y++) for (let x = 20; x < 38; x++) source.b[idx(x, y)] = { k: 'house', lvl: 1, doneAt: null };
  source.b[idx(49, 49)] = { k: 'gather', lvl: 1, doneAt: null };
  for (let i = 0; i < 2; i++) source.people[i].task = { t: 'work', at: idx(49, 49) } as City['people'][number]['task'];
  const now = new Date();
  await users.insertOne({ _id: uid, cityId: pid, name: 'Offline QA', email: `${uid}@example.invalid`, friendCode: crypto.randomUUID(), friends: [], createdAt: now, lastSeen: now, sessionVersion: 1 });
  await cities.insertOne({ _id: pid, owner: uid, name: 'Offline QA', state: source, era: source.era, pop: source.pop, score: score(source), templeAt: null, ver: 0, createdAt: now, updatedAt: now });
  const cookie = `sid=${createSession({ _id: uid, sessionVersion: 1 }, secrets.AUTH_SECRET)}`;
  const get = () => { requests++; return fetch(`${origin}/api/city`, { headers: { cookie }, signal: AbortSignal.timeout(45_000) }); };
  const started = performance.now();
  // Overlapping loads must not calculate and lose several competing slices.
  const concurrent = await Promise.all(Array.from({ length: 4 }, get));
  const data = await Promise.all(concurrent.map(async res => { assert.equal(res.status, 202); return res.json() as Promise<any>; }));
  assert.equal(data.filter(d => d.progress).length, 1);
  assert.equal((await cities.findOne({ _id: pid }))?.ver, 1);
  const first = data.find(d => d.progress).progress;
  // A new load resumes persisted work after the original browser has left.
  let injected = false, lastProcessed = first.processed, checkpoints = 1;
  const response = await loadCityResponse({ signal: AbortSignal.timeout(240_000),
    onProgress: p => { if (!p) return; assert.ok(p.processed >= lastProcessed); lastProcessed = p.processed; checkpoints++; },
    fetcher: async () => {
      if (!injected) { injected = true; throw new TypeError('simulated network disconnect'); }
      return get();
    },
  });
  assert.equal(response.status, 200);
  const loaded = await response.json() as { state: City; batchEnabled: boolean };
  assert.equal(loaded.batchEnabled, true); assert.equal(loaded.state.catchUp, undefined);
  const persisted = await cities.findOne({ _id: pid }); assert.ok(persisted);
  const expected = structuredClone(source);
  settle(expected, first.target);
  assert.deepEqual(JSON.parse(JSON.stringify(persisted.state)), JSON.parse(JSON.stringify(expected)));
  console.log(JSON.stringify({ ok: true, offlineHours: 72, villagers: 600, buildings: Object.keys(source.b).length,
    checkpoints, requests, wallSeconds: Math.round((performance.now() - started) / 1000),
    checks: ['single-recovery-writer', 'resume-persisted-checkpoint', 'automatic-network-retry', 'full-state-equals-uninterrupted-replay', 'batch-remains-30s'] }));
} catch (error) {
  console.error('Offline QA failed:', error instanceof assert.AssertionError ? error.message.slice(0, 150) : error instanceof Error ? error.name : 'unknown');
  process.exitCode = 1;
} finally {
  await cities.deleteOne({ _id: pid, owner: uid });
  await users.deleteOne({ _id: uid });
  await client.close();
}
