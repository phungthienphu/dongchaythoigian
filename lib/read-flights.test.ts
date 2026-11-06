import test from 'node:test';
import assert from 'node:assert/strict';
import {ReadFlights} from './read-flights';
test('overlapping reads share one flight while independent resources and later refreshes stay fresh',async()=>{
 const f=new ReadFlights();let calls=0,release!:(n:number)=>void;
 const read=()=>{calls++;return new Promise<number>(r=>{release=r;});};
 const a=f.run('city',read),b=f.run('city',read);assert.equal(a,b);
 await Promise.resolve();assert.equal(calls,1);assert.equal(await f.run('me',async()=>2),2);
 release(1);assert.deepEqual(await Promise.all([a,b]),[1,1]);
 assert.equal(await f.run('city',async()=>3),3);
});
test('failed reads release the slot and do not block retries',async()=>{
 const f=new ReadFlights();await assert.rejects(f.run('city',async()=>{throw new Error('offline');}));
 assert.equal(await f.run('city',async()=>42),42);
});
