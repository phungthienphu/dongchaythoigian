import { MongoClient, BSON } from 'mongodb';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

const source = parseEnv(readFileSync(new URL('../.env.local', import.meta.url), 'utf8'));
const database = source.MONGODB_DB || 'dong_song_thoi_dai';
const client = new MongoClient(source.MONGODB_URI, { appName: 'dong-song-cutover-backup-readonly', maxPoolSize: 1, serverSelectionTimeoutMS: 15_000 });
const directory = resolve(process.argv[2] ?? `/tmp/dong-song-cutover-${Date.now()}`);
mkdirSync(directory, { recursive: true, mode: 0o700 });
try {
  const db = client.db(database), session = client.startSession();
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  const manifest = { createdAt: new Date().toISOString(), database, consistentSnapshot: true, collections: [] };
  try {
    session.startTransaction({ readConcern: { level: 'snapshot' } });
    for (const { name } of collections) {
      if (!/^[\w-]+$/.test(name)) throw new Error('Unexpected collection name');
      const docs = await db.collection(name).find({}, { session }).toArray();
      const buffer = Buffer.concat(docs.map(doc => BSON.serialize(doc)));
      // Decode every BSON record and compare exact boundaries before accepting.
      let position = 0, restored = 0;
      while (position < buffer.length) {
        const size = buffer.readInt32LE(position);
        BSON.deserialize(buffer.subarray(position, position + size));
        position += size; restored++;
      }
      if (position !== buffer.length || restored !== docs.length) throw new Error('Backup verification failed');
      writeFileSync(join(directory, `${name}.bson`), buffer, { mode: 0o600 });
      manifest.collections.push({ name, count: docs.length, bytes: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex') });
    }
    await session.commitTransaction();
    writeFileSync(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 });
    console.log(JSON.stringify({ ok: true, directory, database, collections: manifest.collections.map(({ name, count, bytes }) => ({ name, count, bytes })) }));
  } finally { if (session.inTransaction()) await session.abortTransaction(); await session.endSession(); }
} catch { console.error('Backup failed; cutover must stop. No credentials printed.'); process.exitCode = 1; }
finally { await client.close(); }
