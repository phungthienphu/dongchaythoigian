import { after } from 'next/server';
import { onlineCommandStats } from './db';
import { commandBucketUpdate, newCommandMetrics, type CommandMetrics, type CommandRoute, type CommandSample } from './command-metrics';

/** One atomic increment after the response; no raw payload, session, IP or email. */
export async function recordOnlineCommand(sample: CommandSample) {
  const { id, update } = commandBucketUpdate(sample);
  const col = await onlineCommandStats();
  try {
    await col.updateOne({ _id: id }, update, { upsert: true, maxTimeMS: 2000 });
  } catch (error) {
    // Two first commands may create the same bucket concurrently.
    if ((error as { code?: number }).code !== 11000) throw error;
    await col.updateOne({ _id: id }, update, { maxTimeMS: 2000 });
  }
}

/** Call only after authenticating the city owner. GETs, cron and Worker callbacks
 * intentionally do not use this wrapper. Metrics failure never changes gameplay. */
export async function trackOnlineCommand<T extends Response>(cityId: string, route: CommandRoute, run: (metrics: CommandMetrics) => Promise<T>): Promise<T> {
  const at = Date.now(), started = performance.now(), metrics = newCommandMetrics(route);
  let outcome: CommandSample['outcome'] = 'error';
  try {
    const response = await run(metrics);
    outcome = response.status >= 500 ? 'error' : response.status >= 400 || metrics.rejected ? 'rejected' : 'ok';
    return response;
  } finally {
    const sample: CommandSample = { ...metrics, cityId, route, at, outcome, handlerMs: performance.now() - started };
    try {
      after(async () => {
        try { await recordOnlineCommand(sample); }
        catch { console.warn('online_command_metrics_write_failed'); }
      });
    } catch { console.warn('online_command_metrics_schedule_failed'); }
  }
}
