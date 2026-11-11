import {describe,test} from 'node:test';
import assert from 'node:assert/strict';
import {RenderQuality,mapDetailLow} from './render-quality';

describe('adaptive map quality',()=>{
  test('lowers quality under sustained interaction load, recovers slowly without oscillation',()=>{
    const q=new RenderQuality();
    let at=0;
    for(let i=0;i<90;i++)q.sample(at+=34,34,true,2);
    assert.equal(q.cap,1.5);
    for(let i=0;i<300;i++)q.sample(at+=16,16,true,2);
    assert.equal(q.cap,1.5);
    for(let i=0;i<1000;i++)q.sample(at+=16,16,true,2);
    assert.equal(q.cap,2);
    for(let i=0;i<20;i++)q.sample(at+=34,34,true,2);
    assert.equal(q.cap,2);
  });
  test('idle throttling, background gaps and low-DPR devices cannot lower rendered resolution',()=>{
    const q=new RenderQuality();
    for(let i=0;i<200;i++)q.sample(i*34,34,false,2);
    assert.equal(q.cap,2);
    for(let i=0;i<200;i++)q.sample(10000+i*1000,1000,true,2);
    assert.equal(q.cap,2);
    for(let i=0;i<200;i++)q.sample(300000+i*34,34,true,1);
    assert.equal(q.cap,2);
  });
  test('zoom retains current detail inside dead band and crosses both thresholds',()=>{
    assert.equal(mapDetailLow(25),true);
    assert.equal(mapDetailLow(27,true),true);
    assert.equal(mapDetailLow(25,false),false);
    assert.equal(mapDetailLow(28,true),false);
    assert.equal(mapDetailLow(23.9,false),true);
  });
});
