import { MongoClient } from 'mongodb';
import { randomBytes } from 'node:crypto';
import type { UserDoc } from '../../lib/db';
import type { AuthRepository } from './auth';
import { QA_EPOCH, villageRequest, type VillageEnv, type VillageRegistration } from './runtime';

type Account = UserDoc & { villageRegistration?: VillageRegistration };
export interface VillageRepository extends AuthRepository {
  registration(user: UserDoc): VillageRegistration | null;
  reserveVillage(uid: string, version: number, name: string): Promise<VillageRegistration | null>;
}

export interface AuthDatabaseEnv {
  MONGODB_QA_URI: string;
  AUTH_DATABASE: string;
}
const QA_DATABASE = 'dong_song_cloudflare_qa';

/** Staging only until ownership migration is implemented. No implicit indexes. */
export async function withAuthRepository<T>(env: AuthDatabaseEnv & Partial<VillageEnv>, run: (repo: VillageRepository) => Promise<T>): Promise<T> {
  if (!env.MONGODB_QA_URI || env.AUTH_DATABASE !== QA_DATABASE) throw new Error('QA database configuration required');
  const client = new MongoClient(env.MONGODB_QA_URI, { appName: 'dong-song-cloudflare-auth-qa',
    maxPoolSize: 1, minPoolSize: 0, serverSelectionTimeoutMS: 10_000, connectTimeoutMS: 8_000, socketTimeoutMS: 10_000 });
  try {
    // Mongo connects lazily on the first operation. Login redirects, rejected
    // callbacks and anonymous /me must not open a database connection.
    const db = client.db(QA_DATABASE), users = db.collection<Account>('users');
    const registration = (user: UserDoc) => {
      const r = (user as Account).villageRegistration;
      return r && r.owner === user._id && r.id === user.cityId && r.epoch === QA_EPOCH ? r : null;
    };
    const fence = async (user: Account) => {
      if (env.VILLAGE_ENABLED !== 'true' || !user.cityId) return;
      const r = registration(user);
      if (!r || !env.VILLAGES) throw new Error('Village ownership not provisioned');
      const response = await villageRequest(env as VillageEnv, r, user.sessionVersion!, 'fence');
      if (!response.ok) throw new Error('Village session fence unavailable');
    };
    return await run({
      registration,
      async reserveVillage(uid, version, name) {
        if (env.VILLAGE_ENABLED !== 'true' || env.VILLAGE_EPOCH !== QA_EPOCH) throw new Error('Village disabled');
        const r: VillageRegistration = { id: `qa-${crypto.randomUUID()}`, owner: uid, epoch: QA_EPOCH, name, createdAt: Date.now() };
        // The pointer and retry metadata commit atomically in one account row.
        // If provisioning the DO fails, GET/POST can repeat the same creation.
        const reserved = await users.findOneAndUpdate({ _id: uid, sessionVersion: version, cityId: null },
          { $set: { cityId: r.id, villageRegistration: r } }, { returnDocument: 'after' });
        const user = reserved ?? await users.findOne({ _id: uid, sessionVersion: version });
        return user ? registration(user) : null;
      },
      findUser: (uid, version) => users.findOne({ _id: uid, sessionVersion: version }),
      async upsertGoogle(profile) {
        const now = new Date();
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        for (let attempt = 0; attempt < 5; attempt++) {
          const friendCode = Array.from(randomBytes(6), b => alphabet[b % alphabet.length]).join('');
          try {
            const user = await users.findOneAndUpdate({ _id: profile.sub }, {
              $set: { email: profile.email, name: profile.name || profile.email.split('@')[0], picture: profile.picture, lastSeen: now },
              $setOnInsert: { cityId: null, friendCode, friends: [], createdAt: now },
            }, { upsert: true, returnDocument: 'after' });
            if (user) return user;
          } catch (error) {
            if (!(error && typeof error === 'object' && 'code' in error && error.code === 11000)) throw error;
          }
        }
        throw new Error('Could not create account');
      },
      async startSession(uid) {
        const user = await users.findOneAndUpdate({ _id: uid }, { $inc: { sessionVersion: 1 }, $unset: { sessionRevokedFrom: '' } }, { returnDocument: 'after' });
        if (!user?.sessionVersion) throw new Error('No session');
        // Do not publish the login cookie until the village rejects old writers.
        await fence(user);
        return user;
      },
      async endSession(uid, version) {
        // A stale browser may not revoke a newer login.
        const user = await users.findOneAndUpdate({ _id: uid, sessionVersion: version },
          { $inc: { sessionVersion: 1 }, $set: { sessionRevokedFrom: version } }, { returnDocument: 'after' });
        // Retry a failed fence without incrementing again or revoking a newer login.
        const revoked = user ?? await users.findOne({ _id: uid, sessionRevokedFrom: version });
        if (revoked) await fence(revoked);
      },
      async profile(user) {
        const now = Date.now();
        if (now - new Date(user.lastSeen).getTime() >= 60_000) {
          await users.updateOne({ _id: user._id }, { $set: { lastSeen: new Date(now) } });
        }
        const friends = await users.find({ _id: { $in: user.friends } }, { projection: { name: 1, picture: 1, cityId: 1, lastSeen: 1 } }).toArray();
        const cities = await db.collection<{ _id: string; name: string; era: number; pop: number; score: number }>('cities')
          .find({ _id: { $in: friends.map(friend => friend.cityId).filter((id): id is string => !!id) } }, { projection: { name: 1, era: 1, pop: 1, score: 1 } }).toArray();
        const byId = new Map(cities.map(city => [city._id, city]));
        return {
          user: { id: user._id, name: user.name, picture: user.picture, email: user.email, friendCode: user.friendCode, hasCity: !!user.cityId },
          friends: friends.map(friend => {
            const city = friend.cityId ? byId.get(friend.cityId) : undefined;
            return { id: friend._id, name: friend.name, picture: friend.picture, online: now - new Date(friend.lastSeen).getTime() < 180_000,
              city: city ? { id: city._id, name: city.name, era: city.era, pop: city.pop, score: city.score } : null };
          }),
        };
      },
    });
  } finally { await client.close().catch(() => {}); }
}
