import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, armyCap, armyUsed, B, buildingName, buildingValue, derive, G, hallLevel, idx, isBuildingActive, newCity, repairCost, soldiers, stats } from "./engine.js";

const now = 1_000_000;
function fixture() {
  const c = newCity(now, 123);
  c.t.fill(G);
  c.seen.fill(1);
  c.res = { food: 10_000, wood: 10_000, stone: 10_000, copper: 10_000 , gold: 0, diamond: 0};
  return c;
}

test("defenses are available from the first era and change names with the era", () => {
  const c = fixture();
  for (const k of ["wall", "gate", "watchtower"] as const) {
    assert.equal(B[k].era, 1);
    const early = buildingName(c, k);
    c.era = 3;
    assert.notEqual(buildingName(c, k), early);
    c.era = 1;
    c.b = {};
    assert.equal(applyAction(c, { type: "build", k, x: 2, y: 2 }, now), null);
  }
});

test("guard posts reject invalid, duplicate, hidden, river and wall points atomically", () => {
  const c = fixture();
  const posts = [{ x: 3, y: 4 }];
  assert.equal(applyAction(c, { type: "setGuardPosts", posts }, now), null);
  posts[0].x = 8;
  assert.deepEqual(c.guardPosts, [{ x: 3, y: 4 }]);
  for (const bad of [[{ x: NaN, y: 1 }], [{ x: 96, y: 0 }], [{ x: 1, y: 1 }, { x: 1, y: 1 }], Array(21).fill({ x: 1, y: 1 })]) {
    assert.ok(applyAction(c, { type: "setGuardPosts", posts: bad }, now));
    assert.deepEqual(c.guardPosts, [{ x: 3, y: 4 }]);
  }
  c.seen[idx(1, 1)] = 0;
  assert.ok(applyAction(c, { type: "setGuardPosts", posts: [{ x: 1, y: 1 }] }, now));
  c.seen[idx(1, 1)] = 1;
  c.t[idx(1, 1)] = 3;
  assert.ok(applyAction(c, { type: "setGuardPosts", posts: [{ x: 1, y: 1 }] }, now));
  c.t[idx(1, 1)] = G;
  c.b[idx(1, 1)] = { k: "wall", lvl: 1, doneAt: null };
  assert.ok(applyAction(c, { type: "setGuardPosts", posts: [{ x: 1, y: 1 }] }, now));
  assert.equal(applyAction(c, { type: "setGuardPosts", posts: [] }, now), null);
});

test("burned structures stop services and repair charges their level before restoring them", () => {
  const c = fixture();
  c.b[1] = { k: "hall", lvl: 3, doneAt: null, burned: true };
  c.b[2] = { k: "barracks", lvl: 2, doneAt: null, burned: true };
  c.b[3] = { k: "gather", lvl: 1, doneAt: null, burned: true };
  assert.equal(hallLevel(c), 0);
  assert.equal(armyCap(c), 0);
  assert.equal(stats(c, derive(c), now).jobs, 0);
  assert.equal(isBuildingActive(c.b[1]), false);
  assert.ok(applyAction(c, { type: "assign", ids: [c.people[0].id], task: { t: "work", at: 3 } }, now));
  assert.ok(applyAction(c, { type: "upgrade", x: 1, y: 0 }, now));
  const cost = repairCost("hall", 3, true);
  const before = { ...c.res };
  assert.equal(applyAction(c, { type: "repair", x: 1, y: 0 }, now), null);
  assert.equal(c.res.wood, before.wood - cost.wood!);
  assert.equal(hallLevel(c), 3);
  assert.equal(buildingValue(c.b[1]), 2080);
  assert.ok(applyAction(c, { type: "repair", x: 1, y: 0 }, now));
});

test("repair is atomic when resources are missing and still supports floods", () => {
  const c = fixture();
  c.b[1] = { k: "wall", lvl: 2, doneAt: null, burned: true, flooded: true };
  c.res.wood = 0;
  assert.ok(applyAction(c, { type: "repair", x: 1, y: 0 }, now));
  assert.equal(c.b[1].burned, true);
  assert.equal(c.b[1].flooded, true);
  c.res.wood = 1000;
  assert.equal(applyAction(c, { type: "repair", x: 1, y: 0 }, now), null);
  assert.equal(isBuildingActive(c.b[1]), true);
  c.b[1].flooded = true;
  assert.equal(applyAction(c, { type: "repair", x: 1, y: 0 }, now), null);
});

test("deployed world troops reserve barracks space and consume food", () => {
  const c = fixture();
  c.army = { club: 2 };
  c.deployedArmy = { elephant: 2, bow: 3 };
  assert.equal(soldiers(c), 7);
  assert.equal(armyUsed(c), 15);
  const deployedRate = stats(c, derive(c), now).rate.food;
  c.deployedArmy = {};
  assert.equal(stats(c, derive(c), now).rate.food - deployedRate, 1200);
});
