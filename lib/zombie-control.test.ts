import { test } from "node:test";
import assert from "node:assert/strict";
import { newCity, settle, MIN, HOUR, type City } from "./engine";
import { syncFixture } from "../tests/sync-workload";
import { initialZombieState, stepZombies, syncZombiePolicy } from "./zombies";
import { cityPolicy, policyCities } from "./game-policy";
import { VillageSnapshots } from "./village-snapshot";
import type { CityDoc } from "./db";
import type { Collection } from "mongodb";
function village() {
  const c = syncFixture(4);
  c.zombies = initialZombieState(0, c.people.length);
  c.zombies.actors = [
    {
      id: 99,
      kind: "normal",
      hp: 100,
      maxHp: 100,
      x: 48,
      y: 48,
      era: 1,
      until: HOUR,
      nextHit: 0,
      repath: 0,
    },
  ];
  return c;
}
test("disabled rule clears active threats before settlement, preserves damage and freezes infection", () => {
  const c = village();
  c.people[0].vital = { hp: 70, infectedAt: 1, last: 0 };
  c.zombiePolicy = { enabled: false, revision: 1, changedAt: 10 * MIN };
  const b = (c.b[c.camp] = {
    k: "hall" as const,
    lvl: 1,
    doneAt: null,
    zombieDamage: 15,
  });
  const people = c.people.length;
  settle(c, 20 * MIN);
  assert.equal(c.zombies!.actors.length, 0);
  assert.equal(c.zombies!.report.waves, 0);
  assert.equal(b.zombieDamage, 15);
  assert.equal(c.people.length >= people, true);
  assert.equal(c.people[0].vital!.hp, 70);
});
test("reenable cancels old threats, freezes medical clocks and never replays disabled waves", () => {
  const c = village();
  c.people[0].vital = { hp: 70, infectedAt: 1, last: 0 };
  c.zombiePolicy = { enabled: false, revision: 1, changedAt: 0 };
  stepZombies(c, 10 * HOUR);
  assert.equal(c.zombies!.report.waves, 0);
  assert.equal(c.people[0].vital!.hp, 70);
  c.zombiePolicy = { enabled: true, revision: 2, changedAt: 10 * HOUR };
  stepZombies(c, 10 * HOUR + 4 * MIN);
  assert.equal(c.zombies!.report.waves, 0);
  stepZombies(c, 10 * HOUR + 5 * MIN);
  assert.equal(c.people[0].vital!.hp, 70);
  assert.ok(c.people[0].vital!.infectedAt! >= 10 * HOUR);
  assert.ok(c.zombies!.nextAt >= 10 * HOUR + 6 * MIN);
});
test("a city that never loaded during off mode still gets grace on the latest rule revision", () => {
  const c = village();
  c.zombiePolicy = { enabled: true, revision: 2, changedAt: 2 * HOUR };
  assert.equal(syncZombiePolicy(c), true);
  assert.equal(c.zombies!.actors.length, 0);
  stepZombies(c, 2 * HOUR + MIN);
  assert.equal(c.zombies!.report.waves, 0);
});
test("policy collection wrapper covers reads and new villages, preserving unrelated collection methods", async () => {
  const policy = { enabled: false, revision: 4, changedAt: 1000 },
    doc = { state: village() } as CityDoc;
  let inserted: CityDoc | undefined;
  const raw = {
    findOne: async () => structuredClone(doc),
    insertOne: async (d: CityDoc) => {
      inserted = d;
      return {};
    },
    countDocuments: async () => 3,
  } as unknown as Collection<CityDoc>;
  const col = policyCities(raw, policy);
  assert.deepEqual((await col.findOne({}))!.state.zombiePolicy, policy);
  const fresh = structuredClone(doc);
  await col.insertOne(fresh);
  assert.deepEqual(inserted!.state.zombiePolicy, policy);
  assert.deepEqual(fresh.state.zombiePolicy, policy);
  assert.equal(await col.countDocuments(), 3);
  assert.equal(cityPolicy(null, policy), null);
});
test("snapshot cache invalidates when global rule changes even with identical city revision", () => {
  const cache = new VillageSnapshots(2, 1000000, 60000, (c: City) => {
    c.res.food = c.zombiePolicy?.enabled === false ? 5 : 9;
  });
  const state = village();
  state.upkeepStartsAt = state.wheelFuelStartsAt = state.gatherFoodStartsAt = 0;
  const doc = { _id: "c", ver: 1, state };
  assert.equal(cache.checkpoint(doc, MIN).res.food, 9);
  state.zombiePolicy = { enabled: false, revision: 1, changedAt: MIN };
  assert.equal(cache.checkpoint(doc, 2 * MIN).res.food, 5);
});

test("disabled and reenabled rules stay exact across serialized recovery slices", () => {
  for (const enabled of [false, true]) {
    const source = village();
    source.people[0].vital = { hp: 70, infectedAt: 1, last: 0 };
    source.zombiePolicy = { enabled, revision: 2, changedAt: 10 * MIN };
    const direct = structuredClone(source);
    let sliced = structuredClone(source);
    settle(direct, 20 * MIN);
    do {
      settle(sliced, 20 * MIN, { maxTicks: 80, maxMs: Infinity });
      sliced = JSON.parse(JSON.stringify(sliced));
    } while (sliced.catchUp);
    assert.deepEqual(sliced, JSON.parse(JSON.stringify(direct)));
  }
});
