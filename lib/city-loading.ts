import type { RecoveryProgress } from './city-recovery';

function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}
const transientStatus = new Set([408, 429, 500, 502, 503, 504]);

/** Sequential recovery requests only: each 202 acknowledges a persisted slice.
 * A lost response can safely retry the same URL; no client-side economy is used.
 * Retry only temporary failures, with a cap and backoff; auth/version errors
 * must reach the UI immediately. Successful checkpoints reset the retry budget. */
export async function loadCityResponse(options: {
  onProgress: (progress?: RecoveryProgress) => void;
  onRetry?: (attempt: number) => void;
  signal: AbortSignal;
  fetcher?: typeof fetch;
  wait?: typeof pause;
}): Promise<Response> {
  const fetcher = options.fetcher ?? fetch, wait = options.wait ?? pause;
  let failures = 0;
  while (true) {
    options.signal.throwIfAborted();
    let res: Response;
    try {
      res = await fetcher('/api/city', {
        cache: 'no-store', signal: AbortSignal.any([options.signal, AbortSignal.timeout(30_000)]),
      });
    } catch (error) {
      options.signal.throwIfAborted();
      if (!(error instanceof TypeError || error instanceof Error && error.name === 'TimeoutError') || failures >= 5) throw error;
      await retry(); continue;
    }
    if (transientStatus.has(res.status) && failures < 5) {
      await res.body?.cancel();
      await retry(); continue;
    }
    if (res.status !== 202) return res;
    const data = await res.json();
    if (data.recovering !== true) throw new Error('Phản hồi tải làng không hợp lệ.');
    failures = 0; options.onRetry?.(0);
    options.onProgress(data.progress);
    await wait(Math.max(100, Math.min(2000, Number(data.retryAfterMs) || 250)), options.signal);
  }
  async function retry() {
    failures++; options.onRetry?.(failures);
    await wait(Math.min(8000, 1000 * 2 ** (failures - 1)), options.signal);
  }
}
