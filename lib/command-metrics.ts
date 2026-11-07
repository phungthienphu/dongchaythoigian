/** Server-side counters for authenticated, interactive commands only. */
export const COMMAND_BUCKET_MS = 15 * 60_000;
export const COMMAND_RETENTION_MS = 7 * 24 * 60 * 60_000;
export type CommandRoute = 'city' | 'market' | 'envoy' | 'battle' | 'diplomacy';
export type CommandMetrics = {
  command: string;
  rejected: boolean;
  replayed: boolean;
  settleMs: number;
  commandMs: number;
  attempts: number;
};
export function newCommandMetrics(route: CommandRoute): CommandMetrics {
  return { command: `${route}.invalid`, rejected: false, replayed: false, settleMs: 0, commandMs: 0, attempts: 0 };
}
export type CommandSample = CommandMetrics & {
  cityId: string;
  route: CommandRoute;
  at: number;
  handlerMs: number;
  outcome: 'ok' | 'rejected' | 'error';
};
export type OnlineCommandBucket = {
  _id: string;
  cityId: string;
  route: CommandRoute;
  command: string;
  bucket: Date;
  expiresAt: Date;
  firstSeen: Date;
  lastSeen: Date;
  requests: number;
  ok: number;
  rejected: number;
  errors: number;
  replayed: number;
  handlerMs: number;
  settleMs: number;
  commandMs: number;
  attempts: number;
};
export function commandBucketUpdate(sample: CommandSample) {
  const bucket = Math.floor(sample.at / COMMAND_BUCKET_MS) * COMMAND_BUCKET_MS;
  return {
    id: `${sample.cityId}:${sample.command}:${bucket}`,
    update: {
      $setOnInsert: { cityId: sample.cityId, route: sample.route, command: sample.command, bucket: new Date(bucket), expiresAt: new Date(bucket + COMMAND_BUCKET_MS + COMMAND_RETENTION_MS) },
      $min: { firstSeen: new Date(sample.at) },
      $max: { lastSeen: new Date(sample.at) },
      $inc: { requests: 1, ok: Number(sample.outcome === 'ok'), rejected: Number(sample.outcome === 'rejected'), errors: Number(sample.outcome === 'error'), replayed: Number(sample.replayed), handlerMs: sample.handlerMs, settleMs: sample.settleMs, commandMs: sample.commandMs, attempts: sample.attempts },
    },
  };
}
