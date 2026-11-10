import test from 'node:test';
import assert from 'node:assert/strict';
import {cloneCity} from './clone-city';
import {newCity,applyAction,settle} from './engine';
import {eraPreview} from './era-preview';

test('fast city copies match structuredClone and isolate mutable gameplay data across eras',()=>{
  for(const city of [newCity(0,123),...([4,5,6] as const).map(era=>eraPreview(era,0))]){
    const original=structuredClone(city),copy=cloneCity(city);
    assert.deepEqual(copy,original);
    copy.t[0]=-1;copy.seen[0]=-1;copy.people[0].name='changed';
    copy.res.wood=0;const building=Object.values(copy.b)[0];if(building)building.lvl=0;
    assert.deepEqual(city,original);
    const fast=cloneCity(city),native=structuredClone(city);
    const action={type:'assign' as const,ids:[city.people[0].id],task:{t:'idle' as const}};
    assert.equal(applyAction(fast,action,1000),applyAction(native,action,1000));
    settle(fast,10000);settle(native,10000);assert.deepEqual(fast,native);
  }
});
