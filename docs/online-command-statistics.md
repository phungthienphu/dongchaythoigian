# Online command statistics

Coverage starts at deployment. Only authenticated interactive POSTs are counted:
`/api/city/action`, `/api/market`, `/api/world/envoy`, `/api/battles`, and
`/api/diplomacy`. GET refreshes, offline ticks, cron, Worker callbacks, socket
combat orders, authentication and friendship management are excluded.

`online_command_stats` has one document per village, validated command type and
15-minute UTC bucket. Atomic increments record requests, outcomes, known replays,
handler wall time, and city settlement/command time. The city ID comes from the
existing ownership check; labels come from validated command types. No payload,
email, cookie, IP or request ID is stored. Invalid inputs use a fixed label.
TTL expires buckets seven days after their end; MongoDB TTL deletion is asynchronous.

The write uses Next `after()`, never blocks a game response and fails independently.
It adds one small MongoDB update per authenticated command, not per simulation tick.
This is diagnostic telemetry, not a billing or durable gameplay ledger: hard timeouts
or terminated instances can lose a sample. Logging failures produce a fixed warning.

`replayed` means the game actually returned an existing city receipt or an already
completed market operation. It does not guess duplicates from similar payloads.
City receipts retain their existing 64-item bound. Commands without idempotency keys
cannot be deduplicated retrospectively. Counts include rejected/invalid commands
because those still represent requests; subtract `replayed` for non-replay requests.

Timings are not billed CPU. `handlerMs` includes database/network waits (starts after
owner authentication); `settleMs`/`commandMs` measure only synchronous city simulation
and engine mutation, accumulating work across optimistic-lock retries. They are zero
for handlers that do not use the instrumented city store, not proof of zero cost.
One interactive command can trigger catch-up settlement; its offline ticks are never
counted as extra commands. Read-only reports never advance villages.

Run from the checkout with an explicitly selected production environment:

```sh
bun --env-file=/path/to/.env.local scripts/online-command-report.ts --hours 6
```

The report returns the top 20 villages by request count and all command totals, with
player/village names joined only when reporting. It prints no emails or Google IDs.
The requested start is rounded down to a 15-minute bucket and is shown explicitly.
No public analytics endpoint or additional administrative access is introduced.
