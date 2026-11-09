import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
const source = parseEnv(readFileSync(new URL('../.env.local', import.meta.url), 'utf8'));
const result = await fetch('https://dongchaythoigian.phungthienphu.workers.dev/api/battles/reconcile', {
  method: 'POST', headers: { authorization: `Bearer ${source.BATTLE_SERVER_SECRET}`, 'content-type': 'application/json' },
  body: '{}', signal: AbortSignal.timeout(60_000),
});
const body = await result.json();
console.log(JSON.stringify({ ok: result.ok, checked: body.checked, failed: body.failed, market: body.market }));
if (!result.ok) process.exitCode = 1;
