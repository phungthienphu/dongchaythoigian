import type { RecoveryProgress } from './city-recovery';

/** Sequential recovery requests only: each 202 acknowledges a persisted slice.
 * A lost response can safely retry the same URL; no client-side economy is used. */
export async function loadCityResponse(options: {
  onProgress: (progress?: RecoveryProgress) => void;
  signal: AbortSignal;
  fetcher?: typeof fetch;
}): Promise<Response> {
  const fetcher = options.fetcher ?? fetch;
  while (true) {
    options.signal.throwIfAborted();
    const res = await fetcher('/api/city', {
      cache: 'no-store', signal: AbortSignal.any([options.signal, AbortSignal.timeout(15_000)]),
    });
    if (res.status !== 202) return res;
    const data = await res.json();
    if (data.recovering !== true) throw new Error('Phản hồi tải làng không hợp lệ.');
    options.onProgress(data.progress);
    await new Promise<void>((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(options.signal.reason); };
      const timer = setTimeout(() => { options.signal.removeEventListener('abort', abort); resolve(); },
        Math.max(100, Math.min(2000, Number(data.retryAfterMs) || 250)));
      options.signal.addEventListener('abort', abort, { once: true });
      if (options.signal.aborted) abort();
    });
  }
}
