import test from 'node:test';
import assert from 'node:assert/strict';
import { batchDelayEnabled } from './city-sync-config';

test('batch delay defaults off; a canary list scopes the delay without rejecting queued batches',()=>{
  const enabled=process.env.CITY_BATCH_ENABLED,ids=process.env.CITY_BATCH_CANARY_IDS;
  try {
    delete process.env.CITY_BATCH_ENABLED;delete process.env.CITY_BATCH_CANARY_IDS;
    assert.equal(batchDelayEnabled('a'),false);
    process.env.CITY_BATCH_ENABLED='true';assert.equal(batchDelayEnabled('a'),true);
    process.env.CITY_BATCH_CANARY_IDS=' a, b ,';
    assert.equal(batchDelayEnabled('a'),true);assert.equal(batchDelayEnabled('b'),true);assert.equal(batchDelayEnabled('c'),false);
    process.env.CITY_BATCH_ENABLED='false';assert.equal(batchDelayEnabled('a'),false);
  } finally {
    if(enabled===undefined)delete process.env.CITY_BATCH_ENABLED;else process.env.CITY_BATCH_ENABLED=enabled;
    if(ids===undefined)delete process.env.CITY_BATCH_CANARY_IDS;else process.env.CITY_BATCH_CANARY_IDS=ids;
  }
});
