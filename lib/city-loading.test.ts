import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCityResponse } from './city-loading';

test('loading waits for persisted slices sequentially before returning a playable state', async () => {
  let calls = 0, active = 0, peak = 0;
  const progress: number[] = [];
  const result = await loadCityResponse({ signal: new AbortController().signal,
    onProgress: p => progress.push(p!.percent), fetcher: async () => {
      active++; peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 2)); active--; calls++;
      return calls <= 2 ? Response.json({ recovering: true, progress: { percent: calls * 40 }, retryAfterMs: 100 }, { status: 202 })
        : Response.json({ state: { existing: true } });
    },
  });
  assert.equal(result.status, 200); assert.equal(calls, 3); assert.equal(peak, 1); assert.deepEqual(progress, [40, 80]);
});
test('network failure preserves the error; retry starts a new loader instead of creating a village', async () => {
  const failed = () => loadCityResponse({ signal: new AbortController().signal, onProgress: () => {}, fetcher: async () => { throw new TypeError('offline'); } });
  await assert.rejects(failed, /offline/);
  const res = await loadCityResponse({ signal: new AbortController().signal, onProgress: () => {}, fetcher: async () => Response.json({ error: 'unavailable' }, { status: 503 }) });
  assert.equal(res.status, 503);
});
test('abort stops recovery polling and an explicit no-village response is left for the UI', async () => {
  const controller = new AbortController(); let calls = 0;
  await assert.rejects(() => loadCityResponse({ signal: controller.signal, onProgress: () => controller.abort(), fetcher: async () => {
    calls++; return Response.json({ recovering: true }, { status: 202 });
  } }));
  assert.equal(calls, 1);
  const res = await loadCityResponse({ signal: new AbortController().signal, onProgress: () => {}, fetcher: async () => Response.json({ needsName: true }, { status: 404 }) });
  assert.equal(res.status, 404); assert.equal((await res.json()).needsName, true);
});
