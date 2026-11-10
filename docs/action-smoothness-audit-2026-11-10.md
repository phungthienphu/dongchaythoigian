# Action latency and large-village rendering

## Findings

The browser runs local settlement, optimistic command application, snapshot cloning,
Crowd sync, React presentation and Canvas rendering on the main thread. These costs
compete with pointer input and animation. A large stock number is not by itself a
large collection: population, buildings, routes and pending commands are more relevant.
This audit uses synthetic villages only, not private production data. It does not
attribute the user's specific lag to a proven production bottleneck or rule out network latency.

## Implemented

- `cloneCity` copies the two flat numeric map arrays using `slice`, keeping the rest
  under `structuredClone`. Every snapshot retains independent mutable ownership.
  Both client queues use it for action, publish, replay and authoritative snapshots.
- Renderer color-cache reads no longer delete/reinsert Map entries per primitive.
  The cache remains bounded at 2,048 entries; its render-only eviction becomes FIFO.
  Other caches retain their existing LRU behavior.
- Added deep-copy/action equivalence tests and a reproducible synthetic benchmark:
  `bun tests/action-performance.mjs <baseline-ref>`.

Node v24 synthetic command-to-publish measurements against pre-change HEAD: six
measured alternating pairs after warmup, each with 20 commands and full derive/Crowd
sync callbacks. All final snapshots match exactly.

| Population | Before ms/command | After ms/command | Reduction |
| --- | ---: | ---: | ---: |
| 100 | 2.46 | 1.80 | 27.1% |
| 600 | 5.38 | 4.66 | 13.4% |
| 1,500 | 12.21 | 10.80 | 11.5% |

These are CPU timings, not browser input latency or FPS. The benchmark excludes React,
real Canvas/GPU work, IndexedDB latency, network and authoritative ACK/replay timing.
No quantified rendering gain is claimed: exploratory no-op-Canvas timings were noisy.

Validation: typecheck, 434 tests across 78 files, render regression and diff whitespace
checks pass. Browser gameplay validation, production profiling and deployment of these
changes have not been performed. UI resource-bar edits belong to the separate UI task.

## Larger changes needed for sustained smoothness

1. Capture browser long tasks and action/ACK/frame timings using a reproducible large
   synthetic village. Separate command CPU, React commit, Canvas and network costs.
2. Move client settlement and command replay into a Web Worker. Preserve a single
   ordered command owner, original command timestamps, durable storage before send,
   ACK fences, rollback and lease/session revocation. Return display snapshots/deltas
   at a controlled cadence; avoid full-map serialization on every tick.
3. Cache static terrain/building layers with explicit invalidation for camera, rotation,
   DPR, terrain, visibility, construction, damage and seasonal changes. Render animated
   actors, water, selections and previews separately. Preserve picking and depth ordering.
4. Split React HUD/panels from hover/camera state; prevent whole-game recomputation on
   pointer movement. Keep action acceptance feedback immediate and save state separate.

The current patch reduces avoidable copying but does not establish that large villages
are now smooth. Worker/layer changes remain unimplemented and need runtime validation.
