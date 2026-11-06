# Performance and memory review — 2026-11-06

This review covers the village engine, Canvas render loops, route caches, MongoDB access and battle Worker. It identifies retention and allocation risks from source and focused tests; it does not establish that production currently has a memory leak or an out-of-memory incident.

## Changes made

| Area | Finding | Change / evidence |
| --- | --- | --- |
| Color cache | Module-level Map had no eviction. New palette combinations could accumulate throughout a session. | LRU limit: 2,048 entries. |
| Engine routes | A long offline settlement could retain many routes until settlement finished. | Maximum 256 cached routes / 32,768 tile indices per settlement context. Oversized routes remain usable without caching. |
| Animated routes | Count-only limit of 1,024 ignored differences in route length. | Maximum 128 routes / 16,384 waypoint pairs per Crowd. Topology changes still clear cached routes. |
| Main Canvas | The village kept rendering under the world map, battle dialog and guide. | Skip drawing and crowd animation when covered or the document is hidden; retain simulation timers for continuity. Reuse the visiting-view selection Set. |
| Battle snapshots | Each update included server navigation arrays and internal retry/resume fields. | Network snapshots retain positions, orders, combat state and strikes. Navigation remains in durable server state. Terrain is sent on initial HTTP load, not repeated on socket frames. |
| Empty rooms | Battle snapshots were serialized even when no valid socket was subscribed. | Return before snapshot creation/JSON serialization when there are no recipients. |
| Result callbacks | A stalled upstream fetch could leave the tick busy until platform timeout. | Abort after 15 seconds, release the busy flag, retain durable result and schedule retry. |

Cache limits bound retained values, not total JavaScript heap bytes. Route and point limits are counts; Map keys, object headers and allocator overhead consume additional memory.

## Validation

- 10,000 variable-length route insertions stay within both cache budgets; tests cover LRU reuse, replacements, null failures, clear and oversized values.
- Engine tests preserve identical offline/online settlement and resource conservation.
- Render tests retain route invalidation, viewport clipping, farmer separation, loaded-worker motion and building picking.
- A synthetic Worker fixture with a 9,000-tile navigation buffer produces a 476-byte update instead of 44,481 bytes. This is a stress fixture, not an average production saving.
- Worker tests retain authorization, ticket expiry, reentrant alarms, presence across tabs and callback retries. Added a hanging-fetch case and checks that private navigation survives on the server while being omitted from frames.
- Production build and TypeScript checks are required before deployment.

## Existing safeguards observed

- The MongoDB client is shared within a server process rather than recreated for every request.
- City logs retain at most 60 entries. Placement and staging caches use WeakMap keys.
- Render loops, ResizeObserver instances and ordinary listeners are removed on component cleanup.
- Battle strike effects expire after 1.2 simulated seconds; finished battles stop their interval.
- Mutable city resources are authoritative server state. No shared response cache was added for city/action endpoints.

## Remaining work and measurement boundaries

1. Run a production heap/allocation profile over a long session, repeated world/visit/battle transitions and foreground/background cycles. Record heap after garbage collection, frame time, request counts and socket counts. Current tests do not prove heap plateau in a real browser.
2. Load-test multiple concurrent battle rooms and slow/reconnecting clients; monitor Worker CPU, memory, callback latency and retry rate. Two-account production PvP has not been exercised in this review.
3. World placement and discovery currently query all matching nations. At larger scale, use indexed bounded spatial queries; do not add an unbounded process-wide nation cache.
4. The optimistic queue clones city snapshots, and the world contains fixed 96 × 96 arrays. Profile cloning and settlement before introducing diffs or structural sharing, since replay and deterministic resource accounting depend on these boundaries.
5. The engine, game UI and renderer are large modules. Extract coherent modules incrementally with existing regression tests; avoid a broad rewrite during gameplay fixes.
6. If request telemetry shows overlap during reconnects, coalesce in-flight read requests and cancel stale loads. Keep mutations serialized and receipt-based; never replay an uncertain mutation to reduce latency.
