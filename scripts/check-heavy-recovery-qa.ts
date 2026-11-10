/** Cloudflare CPU regression: synthetic large, actively harvesting QA village. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MongoClient } from 'mongodb';
import { createSession } from '../cloudflare/api/auth';
import { newCity, settle, G, HL, F, idx, HOUR, type City } from '../lib/engine';
import { recoveryTickLimit } from '../lib/city-recovery';
import type { CityDoc, UserDoc } from '../lib/db';
const origin = 'https://dong-song-game-staging.phungthienphu.workers.dev';
const secrets = JSON.parse(readFileSync('.wrangler/bridge-qa-secrets.json', 'utf8'));
const client = new MongoClient(secrets.MONGODB_URI, { maxPoolSize: 1, serverSelectionTimeoutMS: 10_000 });
const db = client.db('dong_song_cloudflare_qa'), cities = db.collection<CityDoc>('cities'), users = db.collection<UserDoc>('users');
const id = `heavy-recovery-qa-${crypto.randomUUID()}`, from = Date.now() - 12 * HOUR;
try {
  const source = newCity(from, 181); source.era = 6; source.t.fill(G); source.seen.fill(1);
  source.b = {}; source.camps = []; source.herds = []; source.trips = []; source.wildernessAt = Date.now() + 24 * HOUR;
  for (let i = 0; i < 359; i++) source.b[idx(60 + i % 20, 20 + Math.floor(i / 20))] = { k: i % 5 === 0 ? 'gather' : 'house', lvl: 1, doneAt: null };
  for (let y = 10; y < 40; y += 2) for (let x = 10; x < 40; x += 2) source.t[idx(x, y)] = (x + y) % 4 === 0 ? F : HL;
  const person = source.people[0], buildings = Object.keys(source.b).map(Number);
  source.people = Array.from({ length: 1389 }, (_, i) => ({ ...structuredClone(person), id: i + 1, name: `QA ${i}`, pos: source.camp,
    task: i < 588 ? { t: 'mine' as const, at: idx(12, 10), resource: 'stone' as const }
      : i < 717 ? { t: 'chop' as const, at: idx(10, 10) }
        : i < 1106 ? { t: 'work' as const, at: buildings[(i - 717) % buildings.length] } : { t: 'idle' as const },
  }));
  source.pop = source.people.length;
  // Initialize new-era services at the original settlement time, before making
  // a partial recovery. All fixture data is generated, never copied from users.
  settle(source, from); source.catchUp = { from: from - 14 * HOUR, target: from + 6 * HOUR };
  const now = new Date();
  await users.insertOne({ _id: id, name: 'Heavy recovery QA', email: `${id}@example.invalid`, cityId: id, friendCode: crypto.randomUUID(), friends: [], sessionVersion: 1, createdAt: now, lastSeen: now });
  await cities.insertOne({ _id: id, owner: id, name: 'Heavy recovery QA', state: source, score: 0, era: 6, pop: source.pop, templeAt: null, ver: 0, createdAt: now, updatedAt: now });
  const cookie = `sid=${createSession({ _id: id, sessionVersion: 1 }, secrets.AUTH_SECRET)}`, times: number[] = [];
  let previous = from;
  for (let i = 0; i < 4; i++) {
    const before = await cities.findOne({ _id: id }); assert.ok(before);
    const limit = recoveryTickLimit(before.state), start = performance.now();
    const res = await fetch(`${origin}/api/city`, { headers: { cookie }, signal: AbortSignal.timeout(25_000) });
    times.push(Math.round(performance.now() - start)); assert.equal(res.status, 202);
    const data = await res.json() as any;
    assert.ok(data.progress.processed > previous);
    assert.ok(data.progress.processed - previous <= limit * 1000);
    previous = data.progress.processed;
  }
  const actual = await cities.findOne({ _id: id }); assert.ok(actual); assert.equal(actual.ver, 4);
  const expected = structuredClone(source); expected.catchUp!.target = actual.state.last;
  settle(expected, actual.state.last, { maxTicks: 100_000, maxMs: Infinity });
  const state = structuredClone(actual.state); delete state.catchUp;
  assert.deepEqual(JSON.parse(JSON.stringify(state)), JSON.parse(JSON.stringify(expected)));
  console.log(JSON.stringify({ ok: true, villagers: 1389, buildings: 359, activeWorkers: 1106, requestMs: times,
    savedSlices: actual.ver, advancedSeconds: (actual.state.last - from) / 1000,
    checks: ['real-cloudflare-hard-tick-cap', 'checkpoint-advances-four-times', 'full-state-equivalent', 'no-live-user-data'] }));
} catch (error) {
  console.error('Heavy recovery QA failed:', error instanceof assert.AssertionError ? error.message.slice(0, 150) : error instanceof Error ? error.name : 'unknown'); process.exitCode = 1;
} finally {
  await cities.deleteOne({ _id: id, owner: id }); await users.deleteOne({ _id: id }); await client.close();
}
