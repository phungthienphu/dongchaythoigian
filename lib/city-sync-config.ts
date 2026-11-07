/** Delay rollout only; false keeps the durable queue/API and sends immediately.
 * Existing in-flight batches are always accepted to allow a safe rollback. */
export function batchDelayEnabled(cityId:string) {
  if(process.env.CITY_BATCH_ENABLED!=='true')return false;
  const canary=process.env.CITY_BATCH_CANARY_IDS?.split(',').map(s=>s.trim()).filter(Boolean);
  return !canary?.length || canary.includes(cityId);
}
