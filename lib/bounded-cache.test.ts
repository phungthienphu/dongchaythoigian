import test from 'node:test';
import assert from 'node:assert/strict';
import { BoundedCache } from './bounded-cache';
test('thousands of variable-length routes stay within both count and retained-point budgets',()=>{
 const cache=new BoundedCache<string,number[]|null>(128,16384,path=>path?.length??1);
 for(let n=0;n<10000;n++){cache.set(`route:${n}`,new Array(1+(n*37)%3000).fill(n));assert.ok(cache.size<=128);assert.ok(cache.weight<=16384);}
 cache.set('failed',null);assert.equal(cache.get('failed'),null);cache.clear();assert.equal(cache.size,0);assert.equal(cache.weight,0);
});
test('recently reused entries survive eviction and replacement releases the old weight',()=>{
 const cache=new BoundedCache<string,string>(3,6,s=>s.length);
 cache.set('a','aa');cache.set('b','bb');cache.set('c','cc');assert.equal(cache.get('a'),'aa');cache.set('d','dd');
 assert.equal(cache.get('b'),undefined);assert.equal(cache.get('a'),'aa');assert.equal(cache.weight,6);
 cache.set('a','a');assert.equal(cache.weight,5);cache.set('large','too large');assert.equal(cache.has('large'),false);assert.equal(cache.weight,5);
 cache.set('a','too large');assert.equal(cache.has('a'),false);assert.equal(cache.weight,4);
});
