import { users } from '../../lib/db';
import { endSession, newFriendCode, readSessionClaims, startSession } from '../../lib/auth';
import type { AuthRepository } from '../api/auth';
import { GET as profile } from '../../app/api/me/route';

/** Production accounts keep their original IDs, friendships and city pointers. */
export const repository: AuthRepository = {
  async findUser(uid, version) { return (await users()).findOne({ _id: uid, sessionVersion: version }); },
  async upsertGoogle(g) {
    const collection = await users(), now = new Date();
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const user = await collection.findOneAndUpdate({ _id: g.sub }, {
          $set: { email: g.email, name: g.name || g.email.split('@')[0], picture: g.picture, lastSeen: now },
          $setOnInsert: { cityId: null, friendCode: newFriendCode(), friends: [], createdAt: now },
        }, { upsert: true, returnDocument: 'after' });
        if (user) return user;
      } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
      }
    }
    throw new Error('Account unavailable');
  },
  async startSession(uid) {
    // Existing session function also publishes the BattleRoom version fence.
    const claims = readSessionClaims(await startSession(uid));
    const user = claims && await (await users()).findOne({ _id: uid, sessionVersion: claims.sessionVersion });
    if (!user) throw new Error('Session superseded');
    return user;
  },
  async endSession() { await endSession(); },
  async profile() { return (await profile()).json(); },
};
