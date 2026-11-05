import test from "node:test";
import assert from "node:assert/strict";
import { newCity } from "./engine";
import { attackRestriction, validateTroops, workerAuthorized } from "./war";

test("march reservations reject fractional, unknown, negative and excessive troops", () => {
  for (const value of [null, [], { club: -1 }, { club: 1.5 }, { club: NaN }, { club: Infinity }, { wizard: 1 }, { club: 11 }, {}]) {
    assert.throws(() => validateTroops(value, { club: 10 }));
  }
  assert.deepEqual(validateTroops({ club: 4, bow: 0 }, { club: 10 }), { club: 4 });
});
test("attack eligibility enforces scout expiry, shield, era and existing battle", () => {
  const a = newCity(0, 1), d = newCity(0, 2);
  assert.match(attackRestriction(a, d, "target", 1000)!, /sứ giả/);
  a.visits = { target: 2000 }; assert.equal(attackRestriction(a, d, "target", 1000), null);
  d.shieldUntil = 1500; assert.match(attackRestriction(a, d, "target", 1000)!, /khiên/);
  assert.equal(attackRestriction(a, d, "target", 1500), null);
  a.era = 3; assert.match(attackRestriction(a, d, "target", 1500)!, /thời đại/);
  a.era = 1; a.battleId = "active"; assert.match(attackRestriction(a, d, "target", 1500)!, /trận đánh/);
});
test("battle callbacks require the exact server secret", () => {
  const prior = process.env.BATTLE_SERVER_SECRET;
  try {
    process.env.BATTLE_SERVER_SECRET = "test-only-shared-key-with-over-32-characters";
    assert.equal(workerAuthorized(new Request("https://app.example")), false);
    assert.equal(workerAuthorized(new Request("https://app.example", { headers: { authorization: "Bearer wrong" } })), false);
    assert.equal(workerAuthorized(new Request("https://app.example", { headers: { authorization: `Bearer ${process.env.BATTLE_SERVER_SECRET}` } })), true);
  } finally { if (prior === undefined) delete process.env.BATTLE_SERVER_SECRET; else process.env.BATTLE_SERVER_SECRET = prior; }
});
