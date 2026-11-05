# Realtime battle service

The Next.js application stores marches and settled results in MongoDB. Each live battle runs in one Cloudflare Durable Object, using the shared pure engine in `lib/battle.ts`. A Durable Object alarm starts scheduled marches even when no browser is open. Live simulations advance at 100 ms; snapshots persisted at most once per second (plus commands/end) and one-second alarms recover after an isolate restart. A restart may roll back up to one second of unsaved simulation; deterministic ticks advance the persisted state to the current time. Finished results retry every five seconds until Next.js acknowledges the callback. Result application in Next.js must be idempotent by battle ID.

## Deployment

1. In `worker/`, install dependencies with `npm install` and log into Cloudflare with `npx wrangler login`.
2. Set `APP_URL` in `worker/wrangler.jsonc` to the production Next.js origin.
3. Generate a long random shared secret. Run `npx wrangler secret put BATTLE_SERVER_SECRET` and paste it. Set the same value in Vercel as `BATTLE_SERVER_SECRET`.
4. Run `npm run type-check` then `npm run deploy` inside `worker/`.
5. Set Vercel `BATTLE_WORKER_URL` to the HTTPS Worker origin, without a trailing slash. Redeploy Next.js.

The worker is a separate deployment from Vercel. Keep `worker/**` excluded from the root Next.js TypeScript project. Do not expose the shared secret through any `NEXT_PUBLIC_*` variable.

## Durable recovery and usage

A Cloudflare Cron Trigger invokes `POST APP_URL/api/battles/reconcile` once per minute with the shared Bearer secret. This recovers Mongo reservations committed immediately before a Vercel process interruption, as well as missing march/return alarms and missing fighting rooms. The Next.js handler must process active records idempotently and must not advance combat itself. Recovery can take approximately one minute after the interruption, plus callback execution time. A failed callback rejects the scheduled handler so Cloudflare records the failure; the next minute retries reconciliation.

This trigger adds approximately 1,440 Vercel callback invocations per day even without active battles. Each active battle additionally uses its start/result/return callbacks and socket traffic. Monitor Cloudflare Workers/Durable Objects and Vercel function/database usage against the project's plan; snapshots omit terrain after connection and active state persistence is limited to once per second plus commands/end. The design requires no browser polling for unattended recovery.

## HTTP and socket contract

Server requests require `Authorization: Bearer <BATTLE_SERVER_SECRET>`:

- `POST /rooms/:id` with `{battle}` creates once; retries return the existing room.
- `GET /rooms/:id` returns `{battle}` or `{scheduled}` before creation.
- `POST /rooms/:id/schedule` with `{arrive}` stores a Unix millisecond arrival, then calls `POST APP_URL/api/battles/:id/start` on arrival. Failed starts retry.
- `POST /rooms/:id/command` with `{side,command}` submits an authenticated server command.
- `POST /rooms/player-:playerId/notify` broadcasts `{type:"update"}` to that player's sockets. Personal hubs reject creation, scheduling and commands.

The result callback is `POST APP_URL/api/battles/result` with `{battleId,result}` and the same Bearer authorization. Both callback endpoints must validate authorization before processing.

Browser sockets connect to `/rooms/:id/socket?ticket=...`. Ticket format is `base64url(JSON payload).base64url(HMAC-SHA256(secret, encodedPayload))`; payload is `{roomId,playerId,side,exp}`, where `exp` is Unix seconds. The server checks room membership against the battle and derives command side from the ticket. Personal hubs use roomId `player-<playerId>` and side `defender`. Keep ticket lifetimes short; refresh tickets through authenticated Next.js APIs on reconnect. Expired sockets reject further commands.

The initial socket snapshot and creation event contain full terrain. Subsequent `{type:"state",battle}` snapshots omit the static terrain array; clients merge them into their last full state. Clients receive these snapshots and send either a command object or `{type:"command",command}`. Commands are move, attack, retreat and presence. Acknowledgments are `{type:"ack",accepted}`; malformed messages receive a safe error. Personal sockets receive `{type:"update"}` and should refetch the player's battle list. Reconnect with backoff and refetch authoritative state after reconnect or tab foregrounding.

## Verification boundary

Run `npm test` in `worker/` for mocked storage/socket tests of server authorization, personal hub restrictions, expired tickets, reentrant schedule callbacks, result retries, membership, snapshot payloads and authenticated scheduled reconciliation failures. Local TypeScript validation covers shared-engine integration. Cloudflare deployment, scheduled callbacks, two-account socket commands, browser reconnects and durable restart recovery require runtime verification against the deployed Worker and application.
