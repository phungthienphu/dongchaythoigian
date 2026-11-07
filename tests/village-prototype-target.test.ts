import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prototypeTarget,prototypeSecret } from '../scripts/village-prototype-target';
const url='https://dong-song-village-prototype.phungthienphu.workers.dev';
const cloud={PROTOTYPE_URL:url,PROTOTYPE_REMOTE_CONFIRM:'synthetic-only',PROTOTYPE_SECRET_FILE:'/private/test-secret'};

test('cloud QA requires explicit intent, an exact origin and a private secret file',()=>{
  assert.equal(prototypeTarget({}).remote,false);
  assert.deepEqual(prototypeTarget(cloud),{base:new URL(url),remote:true,requestLimit:500});
  for(const change of [
    {PROTOTYPE_REMOTE_CONFIRM:undefined},{PROTOTYPE_SECRET_FILE:undefined},
    {PROTOTYPE_URL:'https://dong-song-battles.phungthienphu.workers.dev'},
    {PROTOTYPE_URL:'https://dongchaythoigian.vercel.app'},
    {PROTOTYPE_URL:'http://dong-song-village-prototype.phungthienphu.workers.dev'},
    {PROTOTYPE_URL:url+'.example.com'}, {PROTOTYPE_URL:url+'/villages/qa-test'},
    {PROTOTYPE_URL:url+'?token=x'}, {PROTOTYPE_URL:url+'#x'},
    {PROTOTYPE_URL:url.replace('https://','https://user:password@')},
  ])assert.throws(()=>prototypeTarget({...cloud,...change}));
});
test('local public test keys cannot be used on cloud and vice versa',()=>{
  const local='local-prototype-at-least-32-characters';
  const remote='test-only-private-cloud-at-least-32-characters';
  assert.equal(prototypeSecret(local,false),local);
  assert.equal(prototypeSecret(remote,true),remote);
  assert.throws(()=>prototypeSecret(local,true));
  assert.throws(()=>prototypeSecret(remote,false));
  assert.throws(()=>prototypeSecret('short',true));
});
