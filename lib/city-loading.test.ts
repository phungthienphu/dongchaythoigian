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
test('temporary network/HTTP failures back off, preserve checkpoints and stay sequential', async () => {
  let calls = 0;
  const delays: number[] = [], progress: number[] = [], retries: number[] = [];
  const result = await loadCityResponse({ signal: new AbortController().signal,
    onProgress: p => { if (p) progress.push(p.percent); }, onRetry: n => retries.push(n),
    wait: async ms => { delays.push(ms); }, fetcher: async () => {
      calls++;
      if (calls === 1 || calls === 4) throw new TypeError('network interrupted');
      if (calls === 2) return Response.json({}, { status: 503 });
      if (calls === 3) return Response.json({ recovering: true, progress: { percent: 25 }, retryAfterMs: 250 }, { status: 202 });
      return Response.json({ existing: true });
    },
  });
  assert.equal(result.status, 200); assert.equal(calls, 5);
  assert.deepEqual(progress, [25]); assert.deepEqual(retries, [1, 2, 0, 1]);
  assert.deepEqual(delays, [1000, 2000, 250, 1000]);
});
test('permanent failures stop after five retries; auth, missing village and version errors never retry', async () => {
  for (const status of [401, 404, 409, 503]) {
    let calls = 0; const delays: number[] = [];
    const res = await loadCityResponse({ signal: new AbortController().signal, onProgress: () => {},
      wait: async ms => { delays.push(ms); }, fetcher: async () => { calls++; return Response.json({}, { status }); },
    });
    assert.equal(res.status, status); assert.equal(calls, status === 503 ? 6 : 1);
    assert.deepEqual(delays, status === 503 ? [1000, 2000, 4000, 8000, 8000] : []);
  }
  let calls = 0;
  await assert.rejects(() => loadCityResponse({ signal: new AbortController().signal,
    onProgress: () => {}, wait: async () => {}, fetcher: async () => { calls++; throw new TypeError('offline'); },
  }), /offline/);
  assert.equal(calls, 6);
});
test('abort during reconnect cancels backoff and prevents another request', async () => {
  const controller = new AbortController(); let calls = 0;
  const pending = loadCityResponse({ signal: controller.signal, onProgress: () => {},
    onRetry: () => { setTimeout(() => controller.abort(), 5); },
    fetcher: async () => { calls++; throw new TypeError('offline'); },
  });
  await assert.rejects(pending); assert.equal(calls, 1);
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
