# Runtime stability and Vercel CPU audit — 2026-11-07

## Production evidence (before this release)

Read from the signed-in Vercel dashboard, project `dongchaythoigian`:

- Usage, selected Last 7 Days: about 10h51m Fluid Active CPU, 19,240 function invocations, 39.5 GB-hours provisioned memory. Dashboard data can lag; the displayed period is not proof of the account billing-cycle boundaries.
- Functions, Production / Last 12 hours: `/api/battles/reconcile` 718 invocations, about **9h CPU**, 17.4% error rate; `/api/city` about52m; `/api/city/action`19m; `/api/market`13m. Overall timeout16.3%, CPU P75 52s. These are historical totals, not post-release measurements.
- Read-only MongoDB investigation: no active PvP battles; two travelling convoys overdue by about129–132minutes. Their two cities had165/192villagers,111/113buildings, and75/170minutes of unsaved simulation.
- No credentials, player identifiers, email addresses or village snapshots are committed here. Production was not reset.

## Cause and changes

The recovery endpoint also advances trade convoys. It could repeatedly simulate several large offline villages, then discard that work when no cargo/payment/unit transfer could complete. Timeouts before transaction commit also caused the next cron to replay the same interval. Pathfinding amplified the cost: each cargo source tested many warehouses with separate full-map BFS searches.

1. **Exact route optimization:** skip impossible-to-win ford/drop searches using conservative geometric bounds. Share lazily extended BFS prefixes per origin/mode, evaluate closer drop candidates first, preserve original equal-length tie order and dedicated-stockpile priority. Cache winning drop decisions. Cache passability within the simulation context. Depleted rock invalidates all navigation caches so new paths do not depend on which stale entry happened to survive eviction.
2. **Bounded retention:** per context at most32 BFS trees (2,949,120 bytes of typed-array buffers),512 drop decisions/65,536 route indices,256 individual routes/32,768 indices, and one9,216-byte passability array. Maps/objects/route arrays add overhead. Contexts are released after settlement; these are not unbounded global caches.
3. **Convoy recovery:** consider the earliest unfinished milestone; do not resimulate villages between completed delivery and future escort return. Persist settled village checkpoints even when full storage blocks transfer. Store an indexed `nextCheckAt`; future events are processed when due, blocked transfers retry on the existing minute cron, and interactive requests can retry immediately. Legacy convoys acquire scheduling lazily. Conditional scheduling updates cannot overwrite a concurrently added interception.
4. **Read-only visits:** bounded process-local checkpoints keyed by village/revision/source clock. Authorization and database revision are checked on every request. Cap8villages/2MB serialized UTF-16 weight/5minutes absolute TTL. Legacy activation and >14day capped snapshots replay directly. Only sanitized cloned views leave the cache; it never writes another player's village.
5. **Browser requests:** coalesce overlapping reads, preserve mutation ordering and uncertain-action recovery. Pause periodic city/visitor/background profile refreshes while hidden and catch up on foreground/online. Load leaderboard when opened and while visible. Keep battle/market socket notifications and simulation clocks. Post-mutation social/market refresh invalidates prior reads.
6. **Database/API:** battle indexes initialize with the shared Mongo connection, not on every collection access. Invalid city actions are rejected before settlement. Old/new incompatible engine versions fail without replacing saved villages. Market checkpoint writes keep denormalized score/pop/era fields current.

No change to resource prices, production rates, upkeep, seasons, disasters, discovery rules, combat balance, one-second simulation ticks,14day offline cap, transport times or engine version. Cargo still enters storage only on actual unload. Changed navigation after mined-out rock is an invalidation correctness fix, not a production-rate adjustment.

## Local measurements

Node `process.cpuUsage()` around synchronous settlement, cloning outside the measured section. Synthetic stress map:96×96,50workers,25gathering buildings,25warehouses; intentionally awkward structure layout. Baseline source `a269224`.

| Fixture | Before CPU | After CPU |
|---|---:|---:|
|50workers,1minute|871.7ms|75.1ms|
|50workers,1hour|13,461.2ms|300.3ms|
|Fresh village,1minute|2.7ms|3.1ms|
|Fresh village,24hours|725.6ms|752.6ms|

About97.8% less CPU in the synthetic1hour case. Hardware, JIT, GC and fixture differ from Vercel; this is not a promise of97.8% reduction across the account. Long empty/idle simulations still iterate fixed ticks intentionally.

Private local replay of the192villager snapshot also exposed a stale-rock path-cache issue during optimization; the complete private fixture is excluded from Git. Do not compare its timings directly with the synthetic benchmark.

Reproduce without production access:

```sh
bun test lib/*.test.ts
bun tests/engine-equivalence.mjs a269224
bun build tests/settle-benchmark.ts --target=node --outfile=/tmp/dong-song-settle-bench.mjs
node /tmp/dong-song-settle-bench.mjs
```

API mock suites must run in separate Bun processes because their module mocks are process-global. Browser QA: `bun run dev -- --port 3102`, then `/dev/runtime-stability`. This development-only harness uses the real Game with in-memory API responses, accelerated refresh timers, counters, hidden/visible toggle and reconnect burst. It blocks unrecognized APIs and is404 in production.

## Hosting decision

**Apply these fixes on the existing architecture first.** Production bottleneck is avoidable game computation, not CDN bandwidth. Existing Cloudflare battle Workers already provide realtime transport; moving everything immediately would add migration risk without removing the simulation problem.

- Vercel Hobby includes4 Active CPU hours/month; network/DB waiting is excluded from CPU but still consumes provisioned-memory duration. Optimization does not erase usage already consumed or guarantee a quota reset/unpause.
- Vercel Pro is the fastest continuity option if Hobby is paused or remaining allowance is insufficient: advertised$20/month with$20 usage credit, plus applicable seats/taxes/overage. No plan was changed during this work.
- Cloudflare Workers Free has100,000requests/day and10ms CPU per invocation: unsuitable for the current heavy settlement as a drop-in replacement. Paid starts$5/month with10millionrequests and30millionCPU-ms included; Durable Objects have separate request/duration/storage limits. Hibernating sockets help idle cost; active ticks still cost duration.
- A Node/Bun server/VPS is a possible next step for predictable compute if measured optimized production usage remains high. It requires process operations, backups, deploy/rollback and ownership handling. Do not migrate game authority to the browser or cache action results across players to save CPU.

Official references: [Vercel Functions pricing](https://vercel.com/docs/functions/usage-and-pricing), [Usage management](https://vercel.com/docs/pricing/manage-and-optimize-usage), [Vercel plans](https://vercel.com/pricing), [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).

## Release verification boundary

Before push: engine/API/worker/render checks, TypeScript, production build and isolated browser checks. After deploy: verify deployed commit, cron timing/errors and overdue convoy progress. Historic Usage totals will not decrease; compare CPU increments and errors for the new deployment. Concurrent multi-account PvP load/long-session heap profiling remain separate validation; bounded caches do not establish a production heap plateau. Future-era work remains isolated until this stability release is verified.
