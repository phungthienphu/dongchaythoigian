import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newCity, settle, MAX_SETTLE_MS, MIN, HOUR, G, idx, CityRecoveringError, type City } from './engine';
function replay(source: City, target: number, maxTicks = 173) {
  let c = structuredClone(source), calls = 0;
  do {
    settle(c, target + calls * 77, { maxTicks, maxMs: Infinity });
    calls++;
    c = JSON.parse(JSON.stringify(c));
    assert.ok(calls < 5000);
  } while (c.catchUp);
  return c;
}
function fixture(era: number) {
  const c = newCity(0, 181);
  c.t.fill(G); c.seen.fill(1); c.era = era;
  c.camps = []; c.herds = []; c.wildernessAt = 1e15;
  c.b[idx(48, 49)] = { k: 'gather', lvl: 1, doneAt: null };
  c.b[idx(49, 49)] = { k: 'farm', lvl: 1, doneAt: null, fertility: 1 };
  c.b[idx(50, 49)] = { k: 'house', lvl: 0, doneAt: 3 * MIN };
  c.people[0].task = { t: 'work', at: idx(48, 49) };
  c.people[1].task = { t: 'work', at: idx(49, 49) };
  return c;
}
test('budgeted settlement survives serialization and uses the original target and fixed ticks', () => {
  for (const era of [1, 2, 3, 4, 5, 6]) {
    const c = fixture(era), full = structuredClone(c), target = 47 * MIN + 351;
    settle(full, target);
    assert.deepEqual(replay(c, target), JSON.parse(JSON.stringify(full)), `era ${era}`);
  }
});
test('legacy activation times are fixed at the original target, not the first partial tick', () => {
  const c = fixture(2);
  for (const key of ['upkeepStartsAt', 'wheelFuelStartsAt', 'gatherFoodStartsAt', 'hungerStartsAt', 'farmAutoStartsAt', 'economyBalanceStartsAt'] as const) delete c[key];
  const full = structuredClone(c); settle(full, 3 * HOUR);
  assert.deepEqual(replay(c, 3 * HOUR, 311), JSON.parse(JSON.stringify(full)));
});
test('partial recovery cannot be settled or acted upon by ordinary callers', () => {
  const c = fixture(3); settle(c, HOUR, { maxTicks: 1, maxMs: Infinity });
  const before = structuredClone(c);
  assert.throws(() => settle(c, HOUR), CityRecoveringError);
  assert.deepEqual(c, before);
});
test('the offline cap and irregular final milliseconds are independent of recovery chunk size', { timeout: 20000 }, () => {
  const c = fixture(1); c.people = []; c.pop = 0; c.b = {}; c.wildernessAt = 1e15;
  const full = structuredClone(c), target = MAX_SETTLE_MS + 2 * HOUR + 351;
  settle(full, target);
  assert.deepEqual(replay(c, target, 21_600), JSON.parse(JSON.stringify(full)));
});

test('CPU budget yields within sixteen fixed ticks, preserving the remaining offline interval', () => {
  const c = fixture(6), original = c.last;
  settle(c, 3 * HOUR, { maxTicks: 21_600, maxMs: 0 });
  assert.equal(c.last, original + 16_000);
  assert.deepEqual(c.catchUp, { from: original, target: 3 * HOUR });
});
test('a large industrial village keeps exact results across short persisted slices', { timeout: 20000 }, () => {
  const c = fixture(6), person = c.people[0];
  c.people = Array.from({ length: 600 }, (_, i) => ({ ...structuredClone(person), id: i + 1,
    task: { t: 'idle' as const }, pos: c.camp }));
  c.pop = c.people.length;
  c.res.food = 2000;
  const full = structuredClone(c), target = 37 * MIN + 351;
  settle(full, target);
  assert.deepEqual(replay(c, target, 107), JSON.parse(JSON.stringify(full)));
});
