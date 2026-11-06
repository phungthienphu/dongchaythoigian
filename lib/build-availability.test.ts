import assert from 'node:assert/strict';
import test from 'node:test';
import {newCity,idx} from './engine';
import {buildAvailability} from './build-availability';
test('building cards count unfinished and damaged structures and unlock after demolition',()=>{const c=newCity(0,123);c.era=2;c.b={};assert.deepEqual([buildAvailability(c,'hall').count,buildAvailability(c,'hall').limit],[0,1]);c.b[idx(20,20)]={k:'hall',lvl:0,doneAt:1000};assert.equal(buildAvailability(c,'hall').locked,true);assert.match(buildAvailability(c,'hall').reason!,/1\/1/);c.b[idx(20,20)]={k:'hall',lvl:1,doneAt:null,burned:true};assert.equal(buildAvailability(c,'hall').capped,true);delete c.b[idx(20,20)];assert.equal(buildAvailability(c,'hall').locked,false);assert.equal(buildAvailability(c,'hut').limit,undefined);});
