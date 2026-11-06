// Run from the repository root: node tests/render-performance.mjs
// Native TypeScript stripping keeps this independent of build output and dependencies.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dong-render-check-'));
try {
  for (const [input, name] of [['lib/bounded-cache.ts', 'bounded-cache'], ['lib/action-input.ts', 'action-input'], ['lib/engine.ts', 'engine'], ['lib/build-placement.ts', 'build-placement'], ['components/draw.ts', 'draw'], ['components/villagers.ts', 'villagers']]) {
    const output = stripTypeScriptTypes(fs.readFileSync(path.join(root, input), 'utf8'))
      .replaceAll('"./bounded-cache"', '"./bounded-cache.js"').replaceAll('"@/lib/bounded-cache"', '"./bounded-cache.js"').replaceAll('"./action-input"', '"./action-input.js"').replaceAll('"@/lib/engine"', '"./engine.js"').replaceAll('"@/lib/build-placement"', '"./build-placement.js"').replaceAll("'./engine'", "'./engine.js'").replaceAll('"./draw"', '"./draw.js"').replaceAll('"./villagers"', '"./villagers.js"');
    fs.writeFileSync(path.join(temp, `${name}.js`), output);
  }
  fs.writeFileSync(path.join(temp, 'package.json'), '{"type":"module"}');
  const { visibleTileBounds, fitView, camView, focusOn, pickBuilding, pickVillageTarget } = await import(pathToFileURL(path.join(temp, 'draw.js')).href);
  const { Crowd } = await import(pathToFileURL(path.join(temp, 'villagers.js')).href);
  const { newCity, G, idx, haulPosition, updateRefuges, refugePosition } = await import(pathToFileURL(path.join(temp, 'engine.js')).href);
let checked=0,minReduction=Infinity;
for(const [w,h] of [[390,844],[1440,900]]) for(const zoom of [1,3,8,18]) for(const [cx,cy] of [[1,1],[48,48],[95,95]]) {
 const f=fitView(w,h),cam={zoom:1,px:0,py:0};focusOn(f,cam,cx,cy,zoom);
 const v=camView(f,cam),b=visibleTileBounds(v);
 const candidates=Math.max(0,b.x1-b.x0+1)*Math.max(0,b.y1-b.y0+1);
 if(zoom===18) minReduction=Math.min(minReduction,9216/candidates);
 for(let y=0;y<96;y++)for(let x=0;x<96;x++) {
  const sx=v.ox+(x-y)*v.TW/2,sy=v.oy+(x+y+1)*v.TH/2;
  const old=sx>-v.TW&&sx<v.width+v.TW&&sy>-v.TW*.5&&sy<v.height+v.TW*2;
  if(old)assert.ok(x>=b.x0&&x<=b.x1&&y>=b.y0&&y<=b.y1);
 }
 checked++;
}
const city=newCity(1000000,123);city.t.fill(G);city.seen.fill(1);
city.people=city.people.slice(0,1);
const crowd=new Crowd();crowd.sync(city);
city.people[0].task={t:'idle',at:idx(55,50)};crowd.sync(city);
assert.ok(crowd.paths.size>0);
const first=[...crowd.paths.values()][0];
crowd.sync(structuredClone(city));assert.equal([...crowd.paths.values()][0],first);
city.b[1]={k:'farm',lvl:1,doneAt:null};crowd.sync(city);assert.equal([...crowd.paths.values()][0],first);
city.b[2]={k:'wall',lvl:1,doneAt:null};crowd.sync(city);assert.notEqual([...crowd.paths.values()][0],first);
const second=[...crowd.paths.values()][0];city.t[3]=3;crowd.sync(city);assert.notEqual([...crowd.paths.values()][0],second);
console.log(`PASS: ${checked} exhaustive viewport comparisons, at least ${minReduction.toFixed(1)}x fewer visibility candidates at zoom18; cache retained across unchanged sync/nonblocking buildings and invalidated for walls/water.`);


// Hauling visuals follow server timestamps and never mint/deposit resources.
const hauling = newCity(1000, 42); hauling.t.fill(G); hauling.seen.fill(1);
hauling.people = hauling.people.slice(0, 1);
const person = hauling.people[0];
person.task = { t: 'chop', at: idx(12, 10) };
person.haul = { phase: 'travel', at: 1000, nextAt: 3000, tile: idx(10, 10), route: [idx(10, 10), idx(11, 10), idx(12, 10)], routeStart: 1000, resource: 'wood', carried: 0, capacity: 10, taskKey: 'chop:12', source: { kind: 'tile', key: idx(12, 10) }, workRate: 30 };
const haulingCrowd = new Crowd(); haulingCrowd.sync(hauling);
const visual = haulingCrowd.list[0];
haulingCrowd.update(hauling, .016, 1500);
let expected = haulPosition(person, 1500);
assert.equal(visual.fx, expected.x); assert.equal(visual.fy, expected.y);
assert.equal(visual.moving, true); assert.equal(visual.cargo, 0); assert.equal(visual.carrying, false);
const beforeSync = [visual.fx, visual.fy];
haulingCrowd.sync(structuredClone(hauling));
assert.deepEqual([visual.fx, visual.fy], beforeSync, 'sync must not rewind a walking worker to the response timestamp');
person.haul.phase = 'return'; person.haul.carried = 10;
person.haul.route.reverse(); person.haul.tile = idx(12, 10);
haulingCrowd.update(hauling, .016, 2000); expected = haulPosition(person, 2000);
assert.equal(visual.fx, expected.x); assert.equal(visual.cargo, 10); assert.equal(visual.carrying, true);
assert.equal(visual.state, 'toHome');
person.task = { t: 'idle', at: idx(20, 20) };
haulingCrowd.sync(hauling); haulingCrowd.update(hauling, .016, 2200);
assert.equal(visual.cargo, 10, 'reassignment must continue showing cargo until authoritative deposit');
person.haul.phase = 'unload'; person.haul.tile = idx(10, 10);
const resourcesBefore = { ...hauling.res };
haulingCrowd.update(hauling, 10, 9000);
assert.equal(visual.cargo, 10); assert.equal(visual.moving, false);
assert.deepEqual(hauling.res, resourcesBefore, 'renderer must never deposit cargo');
const farmers=newCity(0,123);farmers.t.fill(G);farmers.seen.fill(1);farmers.b={};const farm=idx(20,20);
farmers.b[farm]={k:'farm',lvl:1,doneAt:null};farmers.people=farmers.people.slice(0,2);
for(const p of farmers.people){p.task={t:'work',at:farm};p.haul={phase:'work',at:0,nextAt:10000,tile:farm,route:[farm],routeStart:0,carried:0,capacity:10,workRate:5400,resource:'food',source:{kind:'building',key:farm},taskKey:'farm'};}
const farmCrowd=new Crowd();farmCrowd.sync(farmers);farmCrowd.update(farmers,.1,1000);
const farmActors=farmCrowd.list.filter(v=>v.id!==null);
assert.equal(farmActors.length,2);assert.ok(farmActors.every(v=>v.visible&&v.job==='farm'&&v.state==='work'));
assert.notDeepEqual([farmActors[0].fx,farmActors[0].fy],[farmActors[1].fx,farmActors[1].fy],'farmers must not overlap in one spot');
assert.ok(farmActors.every(v=>Math.floor(v.fx)===20&&Math.floor(v.fy)===20),'working actors stay within their actual farm');
console.log('PASS: two working farmers are visible, separated and remain inside their assigned field.');

console.log('PASS: authoritative hauling movement/cargo, response sync continuity, reassignment cargo retention, and no renderer deposits.');


// Elevated roof clicks must select their sprite, with solid-face boundaries and painter ordering.
const pickCity = newCity(1000, 7); pickCity.t.fill(G); pickCity.seen.fill(1); pickCity.b = {};
const pickView = { TW: 128, TH: 64, ox: 500, oy: 200, width: 1440, height: 1200, s: 2 };
const project = (x, y, z = 0) => [pickView.ox + (x - y) * pickView.TW / 2, pickView.oy + (x + y) * pickView.TH / 2 - z * pickView.s];
pickCity.b[idx(10, 10)] = { k: 'house', lvl: 1, doneAt: null };
assert.deepEqual(pickBuilding(pickView, pickCity, ...project(10.5, 10.5, 24)), { x: 10, y: 10 }, 'roof center');
assert.deepEqual(pickBuilding(pickView, pickCity, ...project(10.5, 10.5)), { x: 10, y: 10 }, 'ground base');
assert.equal(pickBuilding(pickView, pickCity, ...project(11.5, 10.5)), null, 'adjacent empty tile');
assert.equal(pickBuilding(pickView, pickCity, ...project(10.5, 10.5, 60)), null, 'air above roof');
pickCity.seen[idx(10, 10)] = 0;
assert.equal(pickBuilding(pickView, pickCity, ...project(10.5, 10.5, 24)), null, 'hidden building');
pickCity.seen[idx(10, 10)] = 1;
pickCity.b[idx(11, 11)] = { k: 'stonehouse', lvl: 3, doneAt: null };
assert.deepEqual(pickBuilding(pickView, pickCity, ...project(10.5, 10.5, .5)), { x: 11, y: 11 }, 'front sprite wins overlapping projected faces');
pickCity.b = { [idx(10, 10)]: { k: 'envoy', lvl: 1, doneAt: null } };
for (const [era, roof] of [[1, 20], [2, 22], [3, 30]]) {
  pickCity.era = era;
  assert.deepEqual(pickBuilding(pickView, pickCity, ...project(10.5, 10.5, roof)), { x: 10, y: 10 }, `envoy era ${era} roof`);
}
const overlapPoint=project(10.5,10.5,10);
const blockingPerson={...farmActors[0],id:99,visible:true,fx:10.5,fy:10.5};
assert.equal(pickVillageTarget(pickView,pickCity,[blockingPerson],1,...overlapPoint)?.type,'building','a person in front cannot steal a building click');
assert.equal(pickVillageTarget(pickView,pickCity,[blockingPerson],1,...overlapPoint,true)?.type,'person','modifier can explicitly select the overlapping person');
const lonePerson={...blockingPerson,fx:15.5,fy:15.5};
assert.equal(pickVillageTarget(pickView,pickCity,[lonePerson],1,...project(15.5,15.5,10))?.type,'person','people on empty terrain remain selectable');
console.log('PASS: building click survives actor overlap; modifier selects person; empty-ground people remain selectable.');
console.log('PASS: roof/base building picking, adjacent empty/fog/air rejection, frontmost overlap and three-era envoy heights.');

const fleeingCity=newCity(0,123);fleeingCity.t.fill(G);fleeingCity.seen.fill(1);fleeingCity.b={};fleeingCity.people=fleeingCity.people.slice(0,1);fleeingCity.camp=idx(10,10);
fleeingCity.b[idx(12,10)]={k:'house',lvl:1,doneAt:null};
const fleeingPerson=fleeingCity.people[0];fleeingPerson.pos=idx(20,10);fleeingPerson.task={t:'chop',at:idx(20,10)};
fleeingPerson.haul={phase:'return',at:0,nextAt:10000,tile:idx(20,10),route:[idx(20,10),idx(10,10)],routeStart:0,carried:10,capacity:10,resource:'wood',taskKey:'fixture'};
fleeingCity.raid={warn:0,at:20000,power:1,from:idx(30,10)};updateRefuges(fleeingCity,0);
const fleeingCrowd=new Crowd();fleeingCrowd.sync(fleeingCity);fleeingCrowd.update(fleeingCity,.1,1000);
const fleeingActor=fleeingCrowd.list.find(v=>v.id===fleeingPerson.id),expectedFlee=refugePosition(fleeingPerson,1000);
assert.equal(fleeingActor.run,true);assert.equal(fleeingActor.cargo,10);assert.equal(fleeingActor.fx,expectedFlee.x);assert.equal(fleeingActor.fy,expectedFlee.y);
fleeingCrowd.update(fleeingCity,.1,10000);assert.equal(fleeingActor.visible,false);assert.equal(fleeingActor.swing,0);
delete fleeingCity.raid;updateRefuges(fleeingCity,10000);fleeingCrowd.update(fleeingCity,.1,11000);assert.equal(fleeingActor.visible,true);assert.equal(fleeingActor.run,true);
console.log('PASS: a loaded worker runs to shelter before hauling logic, hides only on arrival and returns with cargo intact.');

} finally { fs.rmSync(temp, { recursive: true, force: true }); }
