import test from 'node:test';
import assert from 'node:assert/strict';
import {newCity} from './engine';
import {hungerSpeech,rulerTitle,villagersHungry} from './villager-mood';
test('hunger follows actual stock, including fractional food, and recovers without changing jobs or cargo',()=>{
 const c=newCity(0,123),person=structuredClone(c.people[0]);c.res.food=0;assert.equal(villagersHungry(c),true);c.res.food=.01;assert.equal(villagersHungry(c),false);assert.deepEqual(c.people[0],person);
});
test('complaints address the ruler for each era and remain stable for a villager',()=>{
 for(const [era,title]of [[1,'Tù trưởng'],[2,'Thủ lĩnh'],[3,'Đức vua']] as const){assert.equal(rulerTitle(era),title);for(const id of [1,2,3]){const mood=hungerSpeech(era,id);assert.ok(mood.complaint.includes(title));assert.equal(mood.status,'Đói');assert.deepEqual(mood,hungerSpeech(era,id));}assert.match(hungerSpeech(era,3).complaint,/tham ô/);}
});
