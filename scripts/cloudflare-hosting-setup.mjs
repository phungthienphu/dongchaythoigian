import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

// Private local output only; pass to `wrangler secret bulk`, then remove it.
// Never print the resulting object or include it in deployment logs.
const mode = process.argv[2];
if (!['qa', 'production'].includes(mode)) throw new Error('Expected qa or production');
const source = parseEnv(readFileSync(new URL('../.env.local', import.meta.url), 'utf8'));
const target = resolve('.wrangler'); mkdirSync(target, { recursive: true, mode: 0o700 });
let auth = source.AUTH_SECRET, battle = source.BATTLE_SERVER_SECRET;
if (mode === 'qa') {
  const previousAuth = resolve(target, 'bridge-qa-secrets.json');
  auth = existsSync(previousAuth) ? JSON.parse(readFileSync(previousAuth, 'utf8')).AUTH_SECRET : randomBytes(48).toString('base64url');
  const previous = resolve(target, 'bridge-qa-battle.json');
  battle = existsSync(previous) ? JSON.parse(readFileSync(previous, 'utf8')).BATTLE_SERVER_SECRET : randomBytes(48).toString('base64url');
  writeFileSync(previous, JSON.stringify({ BATTLE_SERVER_SECRET: battle }), { mode: 0o600 });
}
const secrets = { MONGODB_URI: source.MONGODB_URI, GOOGLE_CLIENT_ID: source.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: source.GOOGLE_CLIENT_SECRET, AUTH_SECRET: auth, BATTLE_SERVER_SECRET: battle };
for (const [key, value] of Object.entries(secrets)) if (!value) throw new Error(`Missing ${key}`);
writeFileSync(resolve(target, `bridge-${mode}-secrets.json`), JSON.stringify(secrets), { mode: 0o600 });
console.log(`Prepared private ${mode} secrets file; values omitted.`);
