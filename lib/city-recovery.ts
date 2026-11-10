import type { Collection } from 'mongodb';
import type { CityDoc } from './db';
import { settle, CityRecoveringError } from './engine';
import { resolveDiscoveries } from './world';

export type RecoveryProgress = { from: number; target: number; processed: number; percent: number };
export class CityRecoveryPending extends CityRecoveringError {
  constructor(public progress?: RecoveryProgress) { super(); }
}
export const recoveryProgress = (from: number, target: number, processed: number): RecoveryProgress => ({
  from, target, processed,
  percent: Math.max(0, Math.min(100, Math.floor(100 * (processed - from) / Math.max(1, target - from)))),
});

/** The caller has authenticated and checked ownership/version. CAS includes the
 * owner; failed CAS returns no uncommitted progress and never replays CPU work.
 * Ledger, receipts and public metadata stay unchanged until a complete load. */
export async function recoverCity(col: Collection<CityDoc>, doc: CityDoc, now: number) {
  const c = doc.state, target = c.catchUp?.target ?? now;
  const from = c.catchUp?.from ?? Math.max(c.haulAt ?? c.last, target - 14 * 24 * 60 * 60_000);
  await resolveDiscoveries(doc._id, c, target);
  const arrivals = structuredClone(c.trips ?? []);
  settle(c, target, { maxTicks: 6 * 60 * 60, maxMs: 1200 });
  const envoyOutbox = [...new Map([
    ...(doc.envoyOutbox ?? []),
    ...[...arrivals, ...(c.trips ?? [])].filter(t => t.target).map(({ id, depart, target, targetName, arrive }) => ({
      key: `${doc._id}:${depart}:${id}`, trip: { id, depart, target, targetName, arrive },
    })),
  ].map(e => [e.key, e])).values()];
  const saved = await col.updateOne({ _id: doc._id, owner: doc.owner, ver: doc.ver }, {
    $set: { state: c, envoyOutbox, updatedAt: new Date(now) }, $inc: { ver: 1 },
  });
  return saved.modifiedCount === 1 ? recoveryProgress(from, target, c.catchUp ? c.last : target) : undefined;
}
