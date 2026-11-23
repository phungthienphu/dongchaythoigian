import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Collection } from 'mongodb';
import { newCity, G, idx, HOUR } from './engine';
import { recoverCity, recoveryTickLimit } from './city-recovery';
import type { CityDoc } from './db';

function village() {
  const c = newCity(0, 181); c.t.fill(G); c.camps = []; c.herds = []; c.trips = [];
  c.wildernessAt = 1e15;
  const person = c.people[0];
  c.people = Array.from({ length: 1389 }, (_, i) => ({ ...structuredClone(person), id: i + 1, task: { t: 'idle' as const } }));
  c.pop = c.people.length;
  for (let i = 0; i < 359; i++) c.b[idx(10 + i % 20, 10 + Math.floor(i / 20))] = { k: 'house', lvl: 1, doneAt: null };
  return c;
}

test('recovery commits a short slice even when the runtime clock is frozen throughout CPU work', { timeout: 30_000 }, async () => {
  const state = village(), limit = recoveryTickLimit(state);
  assert.ok(limit < 1600);
  let writes = 0;
  const col = { updateOne: async (filter: unknown, update: any) => {
    writes++;
    assert.deepEqual(filter, { _id: 'qa', owner: 'owner', ver: 3 });
    assert.equal(update.$set.state.last, limit * 1000);
    assert.equal(update.$inc.ver, 1);
    return { modifiedCount: 1 };
  } } as unknown as Collection<CityDoc>;
  const original = Object.getOwnPropertyDescriptor(performance, 'now');
  Object.defineProperty(performance, 'now', { configurable: true, value: () => 0 });
  try {
    const progress = await recoverCity(col, { _id: 'qa', owner: 'owner', ver: 3, state } as CityDoc, 6 * HOUR);
    assert.equal(writes, 1); assert.equal(progress?.processed, limit * 1000);
    assert.deepEqual(state.catchUp, { from: 0, target: 6 * HOUR });
  } finally {
    if (original) Object.defineProperty(performance, 'now', original);
    else Reflect.deleteProperty(performance, 'now');
  }
});

test('the hard cap shrinks with village size and never depends on elapsed wall time', () => {
  const small = newCity(0, 181), big = village();
  assert.equal(recoveryTickLimit(small), 14400);
  assert.ok(recoveryTickLimit(big) < recoveryTickLimit(small));
  big.people = [];
  assert.ok(recoveryTickLimit(big) > recoveryTickLimit(village()));
});
