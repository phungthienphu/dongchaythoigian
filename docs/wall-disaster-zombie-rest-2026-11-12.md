# Wall persistence and quieter zombie cadence — release preparation

Read-only production evidence from Bến Vân Đồng on 2026-11-12:
- Tiles 2566 and 2568 remain walls damaged by an earthquake; tile 2567 is empty.
- The recorded earthquake impact lists exactly [2566, 2567, 2568], with two
  damaged structures and one permanently destroyed/replaced structure.
- A prior earthquake impact lists [2563, 2564, 2565], three permanent losses.
- Existing wilderness renewal protects all standing structures, including walls.
  Permanent disaster replacement previously admitted wall/gate buildings.
  These records identify a disaster loss; they do not recover the original
  building kind/level for every missing tile.

Fix: earthquake/flood resource replacement excludes walls and gates. Their
normal damage/flood/repair rules still apply, retaining the segment and level.
Zombie attacks can still destroy defensive structures. No production save has
been edited and previously lost segments are not guessed or recreated.

Zombie rest: the minimum is now max(30, 90 - 5*floor(pop/100) - 5*weeks) minutes.
After each wave, a separate deterministic seeded draw chooses a whole-minute
rest in [minimum, 2*minimum]. For a large village at the floor this is 30–60 min,
instead of the prior fixed 15 min. The draw depends on village seed and wave
index, persists via nextAt, and survives reload/offline settlement identically.
The existing scheduled wave, warning and first five-minute grace are preserved.
No change to the ongoing medical/HP/wave-size work in the shared checkout.

Regression coverage includes damaged wall/gate preservation through both
resource replacement and renewal; a real earthquake against a complete wall
line that must remain impassable to zombies; variable bounded deterministic
rests; spawn scheduling and save/reload replay. Focused tests: 46 passed.

Permanent-loss rates are additionally reduced from 20% to 5% for earthquakes
and from 10% to 2% for floods. These apply only after the disaster selects a
structure; walls and gates remain exempt. Exact threshold regression tests
verify rolls just below and at the new rates.

Recovery audit found no history/backup collection or local cutover snapshot.
Four affected tiles are currently unbuilt: 2563/2564/2565 contain forest/stone/
copper and 2567 is grass. Surviving neighbors are level-one walls. The old
kind/level cannot be proven for each missing tile (one may have been a gate);
the user was asked to choose level-one walls or provide gate/level details.
No production restoration has been applied pending that clarification.

Final local verification after rate changes: 601 tests across 96 files passed;
TypeScript, render checks and diff whitespace checks passed. Cloudflare build
passed before the final constant reduction and optional-field normalization.
Longer quiet windows exposed explicit `orderAt: undefined` in guard snapshots;
guards now omit absent timestamps so in-memory and JSON-reloaded state match.
A dedicated guard serialization regression and both magic replay suites pass.
