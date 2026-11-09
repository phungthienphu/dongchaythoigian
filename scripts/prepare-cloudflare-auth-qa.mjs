import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomBytes } from 'node:crypto';
import { MongoClient } from 'mongodb';

// Explicit one-time staging setup, not an API/cold-start side effect.
const source = parseEnv(readFileSync(new URL('../.env.local', import.meta.url), 'utf8'));
for (const key of ['MONGODB_URI', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']) {
  if (!source[key]) throw new Error(`Missing ${key}`);
}
const client = new MongoClient(source.MONGODB_URI, { maxPoolSize: 1, serverSelectionTimeoutMS: 10_000 });
try {
  await client.connect();
  await client.db('dong_song_cloudflare_qa').collection('users').createIndex({ friendCode: 1 }, { unique: true });
} catch {
  console.error('Could not prepare QA indexes; no secrets file created.');
  process.exitCode = 1;
} finally { await client.close(); }
if (!process.exitCode) {
  mkdirSync(new URL('../.wrangler/', import.meta.url), { recursive: true, mode: 0o700 });
  writeFileSync(new URL('../.wrangler/cloudflare-game-staging.json', import.meta.url), JSON.stringify({
    MONGODB_QA_URI: source.MONGODB_URI,
    GOOGLE_CLIENT_ID: source.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: source.GOOGLE_CLIENT_SECRET,
    AUTH_SECRET: randomBytes(48).toString('base64url'),
  }), { mode: 0o600 });
  console.log('QA unique index ready; private staging secrets prepared without printing values.');
}
