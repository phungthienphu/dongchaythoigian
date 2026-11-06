import type { Caravan } from './market-types';
/** Earliest unfinished milestone. Warehouse/battle blockers are retried by the
 * recovery cron, while interactive reads can retry immediately after space frees. */
export function nextCaravanEvent(s: Caravan): number {
  if (s.status === 'completed') return Infinity;
  const raid=s.raid;
  if(raid && raid.won===undefined) return raid.fight && !raid.fight.finished ? raid.fight.last+1000 : raid.meetAt;
  const arrival=s.robbed ? raid!.fight!.last : s.arrive;
  return Math.min(
    s.goodsDelivered ? Infinity : s.robbed ? raid!.backAt! : arrival,
    s.paymentDelivered ? Infinity : arrival,
    s.escortsReturned ? Infinity : s.back,
    !raid || raid.returned ? Infinity : raid.backAt ?? Infinity,
  );
}
export function caravanRecoveryAt(s: Caravan, now: number) {
  // Keep the existing minute cron retry for full stores and frozen villages.
  const event=nextCaravanEvent(s);
  return event>now ? event : now+60_000;
}
