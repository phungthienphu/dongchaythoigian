import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomBytes } from 'node:crypto';

const secretFile = new URL('../.wrangler/cloudflare-mongo-probe.json', import.meta.url);
if (process.argv[2] === 'prepare') {
  // The existing dotenv is production. Only reuse connection credentials; the
  // probe hardcodes a separate QA database and imports none of our DB helpers.
  const source = parseEnv(readFileSync(new URL('../.env.local', import.meta.url), 'utf8'));
  if (!source.MONGODB_URI) throw new Error('MONGODB_URI is missing');
  mkdirSync(new URL('../.wrangler/', import.meta.url), { recursive: true, mode: 0o700 });
  writeFileSync(secretFile, JSON.stringify({ MONGODB_QA_URI: source.MONGODB_URI, PROBE_SECRET: randomBytes(32).toString('base64url') }), { mode: 0o600 });
  console.log('Prepared private compatibility-probe secrets; no values printed.');
} else if (process.argv[2] === 'run') {
  const { PROBE_SECRET } = JSON.parse(readFileSync(secretFile, 'utf8'));
  const response = await fetch('https://dong-song-mongo-probe.phungthienphu.workers.dev/probe', {
    method: 'POST', headers: { authorization: `Bearer ${PROBE_SECRET}` }, signal: AbortSignal.timeout(60_000), redirect: 'error',
  });
  const result = await response.json();
  // The probe returns only allowlisted stage/timings, never exception messages.
  console.log(JSON.stringify({ status: response.status, ...result }));
  if (!response.ok || !result.ok) process.exitCode = 1;
} else {
  throw new Error('Usage: node scripts/cloudflare-mongo-probe.mjs prepare|run');
}
