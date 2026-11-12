# Village loading investigation and first improvements — 2026-11-12

Production evidence: authorized Nam Quốc Sơn Hà smoke needed 62 HTTP 202
responses before HTTP 200. This was real offline recovery, not a missing asset
or a failed login. The smoke's initial 60-second signature expired while waiting;
a longer test-only signature completed the city/world/battle checks successfully.

A read-only Mongo snapshot contained 1,162 people and 251 buildings. A local
copy advanced approximately 304–415 simulated seconds in each 1.2-second CPU
slice. These are local measurements, not Cloudflare latency estimates. No
snapshot simulation was written back to the production database.

Owner reads previously projected from a persisted checkpoint for as long as
30 minutes. Reopening could repeat that simulation. Owner reads now begin
bounded, persisted recovery after one minute; mutation thresholds, CAS ownership,
receipts, ACK and deterministic simulation remain unchanged. The final saved
slice reloads its current revision within the same request instead of returning
100% and requiring another browser/API/Mongo connection. The total CPU cost of
a long absence remains; this change does not claim to eliminate long recovery.

The waiting screen now has an indeterminate connection indicator, explicit
connection/recovery stages, processed/total offline minutes, actual elapsed wait,
and guidance for long waits. It does not invent a completion time or pretend
progress before the server confirms a saved slice.

Validation: 7 recovery/loading unit tests, 5 isolated recovery API tests, and
3 isolated city-auth API tests passed. Tests compare recovered state to full
settlement and preserve receipts/ACK, including the short-absence checkpoint
and same-request final response. TypeScript and whitespace checks passed.
Browser fixture covers reconnect then successful completion, and the screen
was checked at 390px. A stale existing dev server had mismatched old SSR text;
validation was repeated on an isolated SYNC_QA dev server at port 3457.

Deployment: released as `city-loading-20261112`, source `9065a70`, Web/API
version `4e9f1e1d-61b9-4728-a7e1-8e5a618eeae4`. The final Cloudflare build
passed. Production health returned the exact release ID and `gameReady: true`;
eight homepage JS/CSS assets matched the local SHA-256 hashes and MIME types.
Dev zombie/magic routes returned 404. Existing Combat Worker deployment is
retained. Further work should measure large-village
CPU hotspots and consider a read-only map preview during lengthy recovery,
without enabling commands or treating an unprocessed snapshot as current state.

Post-release authorized Nam Quốc Sơn Hà smoke passed: 30 requests, 19 assets;
city HTTP 200, account, battle session, world, diplomacy and leaderboard checks
passed. This run required no HTTP 202 responses; it is not a controlled speed
comparison against the earlier long-absence recovery.
