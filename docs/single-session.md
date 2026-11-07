# One active browser session per account

Each successful Google sign-in atomically increments `users.sessionVersion` and
issues an HMAC-signed cookie containing that version. Authenticated routes check
both account ID and session version in the existing user lookup; there is no
additional per-second session poll. A newer login replaces the previous browser.
Tabs sharing the same browser cookie are the same session.

Cloudflare stores a monotonic session version in the player's personal SQLite
Durable Object. Signed WebSocket tickets include that version. A new login closes
the old personal hub socket, and battle sockets check the fence on every command
using a DO-to-DO call. These checks do not invoke Vercel or MongoDB. Expired,
legacy, closed and superseded tickets cannot command armies. Automatic battles
continue when a player is signed out.

The old client stops prediction and drops its pending in-memory commands after a
session-ended event or an unauthorized city action. Delayed responses cannot
restore its controller. If its personal socket is disconnected, its next HTTP
command or refresh detects revocation. Requests authorized before takeover may
finish; takeover does not undo committed actions. Queued local commands are not
transferred between devices.

Logout only revokes the cookie version being logged out. A stale browser cannot
log out its replacement. A failed Worker logout can retry its own stored
revocation without incrementing the version again or revoking a later sign-in.
When the configured Worker cannot acknowledge a new session fence, sign-in fails
instead of issuing a second working controller.

## Release

Deploy the Worker and web app together (Worker first). No new environment
variables or Cloudflare bindings are required. Existing cookies do not contain a
session version, so players must sign in once again; village saves are unchanged.
Existing pre-release battle tickets lose access when the Worker changes.

Focused verification uses in-memory Mongo collections and the Worker harness:

- `bun test tests/single-session.test.ts`
- `bun test tests/city-auth.test.ts`
- `bun test lib/optimistic-city.test.ts`
- `node worker/tests.mjs`
- `bun run type-check` and `bun run build`

These cover concurrent sign-ins, superseded/logout cookies, logout retry,
reordered Worker fences, persisted fences across restarts, revoked combat
commands and late client replies. Live Google OAuth takeover across two real
browsers still needs release/runtime QA.
