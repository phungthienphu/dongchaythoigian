# Offline settlement optimization and cron assessment

## Scope and correctness

Optimized routing work performed inside offline settlement. No cron, migration,
economy balance, simulation timestep or recovery tick-budget changes. The existing
one-second schedule and persisted continuation semantics remain intact.

- A failed BFS that completely explores a connected walkable region now records
  that region. Another worker in it can reject unreachable destinations without
  repeating a full-map search. Land and ford proofs are separate. Fog-restricted
  searches opt out, as do starts inside blocked tiles.
- An empty set of valid arrival tiles returns immediately instead of scanning a map.
- Proofs are request/context-local, discarded with the routing context and invalidated
  when exhausted ore changes passability. Small regions (fewer than 256 visited tiles)
  are not recorded, to avoid spending more on cache allocation than on the search. Successful path search and tie ordering
  remain the original algorithm. Added memory is at most two 96×96 Uint16 arrays
  (36 KiB per active hauling context), allocated only after failed searches.

Exploratory geometry memoization and cross-context route reuse were removed because
ordinary/long workloads did not show a consistent gain. This patch targets repeated
unreachable searches; it does not claim a general multi-fold settlement speedup.

Other uncommitted zombie/UI work was present before this task and is preserved. The
baseline is a copy of that same working library tree, including the other task's
zombie changes, before this optimization. Baseline engine SHA-256:
`b14ac0dc1bdcf4ed09e687ebb312db1983f51de2f63ab7ab25769103fd8b00cc`.

## Reproduce

Before editing, copy the original `lib` directory to a temporary baseline location.
Then run sequentially to avoid CPU contention:

```
bun tests/catchup-performance.ts /absolute/path/to/baseline/lib
bun tests/catchup-routing.mjs
bun run type-check
bun test lib/ --timeout 30000
```

The benchmark uses one warmup and three measured alternating pairs per workload;
compares full final City objects; and compares every persisted recovery slice for
three eras. It uses synthetic villages only. The six-hour economy fixture explicitly
defers zombie spawning; ordinary one-hour fixtures retain their rules. These CPU
measurements exclude DB, network, asset loading and production request limits.

## Cron assessment

This reduces pathological route work but still processes one persisted tick per
simulated second. It is not enough to promise fast login after days away.

The current recovery hard cap is `floor(1,000,000 / (people + 4*buildings))`, clamped
between 1 and 3,600 ticks. Example: 600 people and 300 buildings permit 555 ticks
(~9.25 simulated minutes) per slice. One day can therefore require about 156 requests,
before considering CPU/time limits, changes in population and other events. Reducing
CPU alone does not remove DB round trips and recovery response delays.

Recommendation after staging/runtime measurement: a bounded background checkpoint
queue is still useful. Schedule it each minute, process recently active villages at
5–10 minute intervals first, and defer dormant villages more aggressively. Reuse the
existing city owner/version CAS and control coordination; do not introduce an
independent writer or calculate the same interval twice. Bound per-run work, retry
from durable continuation, and prioritize a returning village. Do not sweep every
village to the present on each cron invocation.

Before enabling it, measure real login p50/p95, recovery slice count, DB latency,
CPU per simulated hour, backlog age and zombie-combat costs. Population alone is an
incomplete predictor of simulation cost. No cron was added or deployed in this task.

## Final measurements and validation

Node v24.14.1 (V8), identical synthetic inputs, all full-state comparisons passed.
Negative reduction means the measured run was slower. Small differences in these
three-pair medians should not be treated as production guarantees.

| Workload | Before ms | After ms | Reduction |
| --- | ---: | ---: | ---: |
| era 3 / 1h | 217.1 | 223.8 | -3.1% |
| era 4 / 1h | 381.5 | 372.4 | 2.4% |
| era 5 / 1h | 617.9 | 588.2 | 4.8% |
| era 6 / 1h | 1035.3 | 978.2 | 5.5% |
| 100 workers / open store / 10min | 624.2 | 584.9 | 6.3% |
| 100 workers / full store / 10min | 439.9 | 436.6 | 0.8% |
| 600 workers / open store / 10min | 1964.5 | 1898.2 | 3.4% |
| 600 workers / full store / 10min | 1135.8 | 1130.4 | 0.5% |
| 100 workers / unreachable jobs / 1min | 27.5 | 10.6 | 61.4% |
| era 4 / 6h / zombie spawn deferred | 2666.7 | 2681.9 | -0.6% |

The three budgeted recovery workloads each matched all 27 intermediate states,
including continuation metadata. The routing probe matched 180 cached/fresh paths
after walls, gates, ore exhaustion, visibility and water changes. Typecheck,
565 tests across 94 library test files, and `git diff --check` passed. The library
tests were run with a 30-second per-test timeout for heavy offline-cap fixtures.
An earlier run under concurrent benchmarks hit a timeout; it did not report a
state mismatch. The final library run was sequential with benchmarks stopped.

To reproduce the V8 benchmark, bundle the baseline engine and benchmark first:

```
bun build /absolute/path/to/baseline/lib/engine.ts --target=node --outfile=/absolute/path/to/baseline/lib/engine.mjs
bun build tests/catchup-performance.ts --target=node --outfile=/tmp/dong-catchup-node.mjs
node /tmp/dong-catchup-node.mjs /absolute/path/to/baseline/lib
```

No browser login, private production village, database operation, cron scheduling,
commit, push or deployment was performed for this optimization. Local correctness
and CPU measurements do not establish production login latency.
