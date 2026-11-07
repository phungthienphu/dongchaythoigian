/** Explicit, bounded access to the one authorized synthetic-only cloud Worker. */
import assert from 'node:assert/strict';

export function prototypeTarget(env:Record<string,string|undefined>) {
  const base=new URL(env.PROTOTYPE_URL??'http://127.0.0.1:8789');
  assert.ok(!base.username&&!base.password&&base.pathname==='/'&&!base.search&&!base.hash,'Use a plain prototype origin');
  const remote=env.PROTOTYPE_REMOTE_CONFIRM==='synthetic-only';
  if(remote) {
    assert.equal(base.origin,'https://dong-song-village-prototype.phungthienphu.workers.dev','Only the authorized synthetic Worker is allowed');
    assert.ok(env.PROTOTYPE_SECRET_FILE,'Cloud secret must come from a private file');
  } else {
    assert.ok(base.protocol==='http:'&&['127.0.0.1','localhost'].includes(base.hostname),'Cloud runs require explicit synthetic-only confirmation');
  }
  return {base,remote,requestLimit:remote?500:2000};
}

export function prototypeSecret(secret:string,remote:boolean) {
  assert.ok(secret.length>=32,'Prototype secret is required');
  assert.ok(remote?!secret.startsWith('local-prototype-'):secret.startsWith('local-prototype-'),'Local and cloud secrets must be separate');
  return secret;
}
