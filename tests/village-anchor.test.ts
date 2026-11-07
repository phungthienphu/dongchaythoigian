import { test } from 'node:test';
import assert from 'node:assert/strict';
import { citySync,readAnchor as readNodeAnchor } from '../lib/sync-anchor';
import { signAnchor,readAnchor } from '../worker/prototype/anchor';
import { ANCHOR_WINDOW_MS } from '../lib/city-sync';
import { ENGINE_VER } from '../lib/engine';
const secret='local-prototype-anchor-contract-at-least-32-characters';
const anchor={cityId:'qa-contract',session:2,engine:ENGINE_VER,revision:4,at:1000,until:1000+ANCHOR_WINDOW_MS};

test('Worker WebCrypto verifies the server anchor wire format and vice versa',async()=>{
  const previous=process.env.AUTH_SECRET;process.env.AUTH_SECRET=secret;
  try {
    const server=citySync({_id:anchor.cityId,ver:anchor.revision},anchor.session,anchor.at);
    assert.deepEqual(await readAnchor(server.anchor,secret),anchor);
    assert.deepEqual(readNodeAnchor(await signAnchor(anchor,secret)),anchor);
  } finally { if(previous===undefined)delete process.env.AUTH_SECRET;else process.env.AUTH_SECRET=previous; }
});
test('Worker anchor rejects corruption, another key and unsupported engine',async()=>{
  const token=await signAnchor(anchor,secret);
  assert.equal(await readAnchor(token,secret+'other'),null);
  assert.equal(await readAnchor(token+'.extra',secret),null);
  assert.equal(await readAnchor('bad.token',secret),null);
  assert.equal(await readAnchor(await signAnchor({...anchor,engine:999},secret),secret),null);
});
test('even signed malformed timing and revisions fail validation',async()=>{
  for(const change of [{revision:-1},{session:0},{at:-1},{until:anchor.until+1}])
    assert.equal(await readAnchor(await signAnchor({...anchor,...change},secret),secret),null);
});
