import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import worker, { type WebEnv } from '../cloudflare/api';

describe('Cloudflare migration bootstrap routing', () => {
  let assetCalls = 0;
  const env: WebEnv = { RELEASE_ID: 'test', ASSETS: { async fetch() { assetCalls++; return new Response('asset'); } } };

  it('does not ACK mutations, expose dev routes, or turn API errors into HTML', async () => {
    for (const path of ['/api', '/api/city', '/api/city/batch', '/api/auth/callback/google', '/api/unknown']) {
      for (const method of ['GET', 'POST']) {
        const response = await worker.fetch(new Request(`https://test.example${path}`, { method }), env);
        assert.equal(response.status, 503);
        assert.ok(response.headers.get('content-type')?.includes('application/json'));
        assert.equal(response.headers.get('cache-control'), 'no-store');
        const result = await response.json();
        assert.equal(result.code, 'MIGRATION_NOT_READY');
        assert.equal(result.ack, undefined);
        assert.equal(result.state, undefined);
      }
    }
    for (const path of ['/dev', '/dev/eras', '/dev/sync']) {
      assert.equal((await worker.fetch(new Request(`https://test.example${path}`), env)).status, 404);
    }
    assert.equal(assetCalls, 0);
  });

  it('keeps readiness false until real data migration has passed', async () => {
    const response = await worker.fetch(new Request('https://test.example/api/health'), env);
    assert.deepEqual(await response.json(), { status: 'preparing', release: 'test', gameReady: false });
    assert.equal(response.headers.get('cache-control'), 'no-store');
  });

  it('delegates only static content to the assets binding', async () => {
    assert.equal(await (await worker.fetch(new Request('https://test.example/'), env)).text(), 'asset');
    assert.equal(await (await worker.fetch(new Request('https://test.example/_next/static/a.js'), env)).text(), 'asset');
  });
});
