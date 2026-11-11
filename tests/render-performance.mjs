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
  // Bundle the entry modules and everything they import (lib/ and components/), flattened
  // into temp/<name>.js. Walking the imports keeps this check working as modules are added.
  const seen = new Map(); // source path -> flat name
  const queue = ['components/draw.ts', 'components/villagers.ts', 'components/actor-art.ts', 'components/villager-art.ts', 'lib/engine.ts'];
  const resolve = (from, spec) => {
    let rel;
    if (spec.startsWith('@/')) rel = spec.slice(2);
    else if (spec.startsWith('.')) rel = path.relative(root, path.resolve(root, path.dirname(from), spec));
    else return null; // packages and node: built-ins stay as they are
    for (const ext of ['.ts', '.tsx', '/index.ts']) if (fs.existsSync(path.join(root, rel + ext))) return rel + ext;
    return fs.existsSync(path.join(root, rel)) ? rel : null;
  };
  const flat = (rel) => rel.replace(/\.(tsx?|js)$/, '').replace(/\//g, '__');
  while (queue.length) {
    const input = queue.shift();
    if (seen.has(input)) continue;
    seen.set(input, flat(input));
    let output = stripTypeScriptTypes(fs.readFileSync(path.join(root, input), 'utf8'));
    output = output.replace(/(from\s*|import\s*\(\s*|import\s+)(['"])([^'"]+)\2/g, (all, lead, quote, spec) => {
      const target = resolve(input, spec);
      if (!target) return all;
      queue.push(target);
      return `${lead}${quote}./${flat(target)}.js${quote}`;
    });
    fs.writeFileSync(path.join(temp, `${flat(input)}.js`), output);
  }
  // Short names (file basename) for the checks below, e.g. temp/engine.js, temp/fortifications.js.
  const short = new Map();
  for (const [rel, name] of seen) { const base = path.basename(rel).replace(/\.(tsx?|js)$/, ''); short.set(base, short.has(base) ? null : name); }
  for (const [base, name] of short) if (name) fs.writeFileSync(path.join(temp, `${base}.js`), `export * from './${name}.js';\n`);
  fs.writeFileSync(path.join(temp, 'package.json'), '{"type":"module"}');
  const { visibleTileBounds, fitView, camView, focusOn, pickBuilding, pickVillageTarget, pickHomeSoldier } = await import(pathToFileURL(path.join(temp, 'draw.js')).href);
  const { Crowd } = await import(pathToFileURL(path.join(temp, 'villagers.js')).href);
  const { newCity, G, R, W, idx, homeSoldiers, applyAction, haulPosition, updateRefuges, refugePosition } = await import(pathToFileURL(path.join(temp, 'engine.js')).href);
// Shared art must not leak transforms/styles into the next actor or generate
// invalid Canvas coordinates in mirrored, walking and attacking poses.
const { drawSoldierArt, drawAnimalArt, drawFutureArt } = await import(pathToFileURL(path.join(temp, 'actor-art.js')).href);
const { UKEYS } = await import(pathToFileURL(path.join(temp, 'engine.js')).href);
const primitives = new Set(['translate','scale','rotate','beginPath','moveTo','lineTo','closePath','fill','stroke','ellipse','quadraticCurveTo','fillRect']);
let artChecks = 0;
for (const [draw, kinds] of [[drawSoldierArt,UKEYS],[drawAnimalArt,['buffalo','elephant','deer','boar']],[drawFutureArt,['tank','fighter','radar','oil','coal','helicopter','drone','mech','fusion','satellite','orbital']]]) {
 for (const kind of kinds) for (const face of [-1,1]) for (const mode of ['idle','walk','attack']) for (const time of [0,12345,1e9]) {
  let state={fillStyle:'#112233',strokeStyle:'#334455',lineWidth:7,lineCap:'butt',lineJoin:'miter'},stack=[],operations=0;
  const initial={...state};
  const context=new Proxy({}, {
   set(_,key,value){state[key]=value;return true;},
   get(_,key){
    if(key==='save')return ()=>stack.push({...state});
    if(key==='restore')return ()=>{assert.ok(stack.length,'unbalanced Canvas restore');state=stack.pop();};
    if(key in state)return state[key];
    assert.ok(primitives.has(key),`unexpected Canvas primitive ${String(key)}`);
    return (...args)=>{operations++;assert.ok(args.every(v=>typeof v!=='number'||Number.isFinite(v)),`${kind}: non-finite Canvas coordinate`);if(key==='ellipse')assert.ok(args[2]>=0&&args[3]>=0,'negative ellipse radius');};
   }
  });
  const pose=Object.freeze({face,time,walking:mode==='walk',fighting:mode==='attack',active:mode!=='idle',antlers:true,graze:mode==='idle',seed:.37});
  draw(context,kind,30,50,.7,pose);
  assert.equal(stack.length,0,`${kind}: leaked Canvas transform stack`);
  assert.deepEqual(state,initial,`${kind}: leaked Canvas style`);
  assert.ok(operations>10,`${kind}: empty actor`);artChecks++;
 }
}
console.log(`PASS: ${artChecks} shared-art poses with finite coordinates, nonempty drawing and isolated Canvas state.`);
const {drawVillagerArt}=await import(pathToFileURL(path.join(temp,'villager-art.js')).href);
function villagerTrace(pose){
 const trace=[];let depth=0;
 const c=new Proxy({}, {set(){return true;},get(_,key){
  if(key==='save')return ()=>depth++;
  if(key==='restore')return ()=>{assert.ok(depth>0);depth--;};
  assert.ok(primitives.has(key));
  return (...args)=>{assert.ok(args.every(v=>typeof v!=='number'||Number.isFinite(v)));trace.push([key,...args]);};
 }});
 drawVillagerArt(c,20,30,1,Object.freeze(pose));assert.equal(depth,0);return trace;
}
let villagerChecks=0;
for(const job of ['idle','farm','gather','wood','quarry','build','smith','hunt','trade','explore','other'])for(const era of [1,4,5,6])for(const face of [-1,1])for(const mode of ['idle','walk','run','work','carry']){
 const p={job,era,face,time:12345,seed:.3,walking:mode==='walk'||mode==='run',running:mode==='run',working:mode==='work',carrying:mode==='carry',resource:'coal',swing:.8,skin:'#dfb28a',shirt:'#8c9c87',band:'#bc986b'};
 villagerTrace(p);villagerChecks++;
 if(p.walking||p.carrying)assert.deepEqual(villagerTrace({...p,working:true}),villagerTrace({...p,working:false}),'walking/loaded villagers must not work');
}
console.log(`PASS: ${villagerChecks} villager poses and work suppression while walking/carrying.`);
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
// Frames must read the current snapshot, even when a server clone reuses IDs.
// In-place Person updates are visible without rebuilding the per-frame index.
const indexed = structuredClone(hauling), indexedCrowd = new Crowd();
indexedCrowd.sync(indexed);
const indexedActor = indexedCrowd.list[0];
indexed.people[0].haul.carried = 7;
indexedCrowd.update(indexed,.016,9000);
assert.equal(indexedActor.cargo,7);
const replacement = structuredClone(indexed);
replacement.people[0].haul.carried = 3;
indexedCrowd.sync(replacement);indexedCrowd.update(replacement,.016,9000);
assert.equal(indexedActor.cargo,3,'sync must replace stale Person references with identical IDs');
replacement.people = replacement.people.map(p=>({...p,haul:{...p.haul,carried:5}}));
indexedCrowd.update(replacement,.016,9000);
assert.equal(indexedActor.cargo,5,'array replacement between syncs must refresh the index');
replacement.people.pop();indexedCrowd.update(replacement,.016,9000);
assert.equal(indexedActor.cargo,0,'population removal must not keep reading a departed worker');
console.log('PASS: crowd index follows cloned snapshots, mutable cargo, array replacement and population removal.');
const farmers=newCity(0,123);farmers.t.fill(G);farmers.seen.fill(1);farmers.b={};const farm=idx(20,20);
farmers.b[farm]={k:'farm',lvl:1,doneAt:null};farmers.people=farmers.people.slice(0,2);
for(const p of farmers.people){p.task={t:'work',at:farm};p.haul={phase:'work',at:0,nextAt:10000,tile:farm,route:[farm],routeStart:0,carried:0,capacity:10,workRate:5400,resource:'food',source:{kind:'building',key:farm},taskKey:'farm'};}
const farmCrowd=new Crowd();farmCrowd.sync(farmers);farmCrowd.update(farmers,.1,1000);
const farmActors=farmCrowd.list.filter(v=>v.id!==null);
assert.equal(farmActors.length,2);assert.ok(farmActors.every(v=>v.visible&&v.job==='farm'&&v.state==='work'));
assert.notDeepEqual([farmActors[0].fx,farmActors[0].fy],[farmActors[1].fx,farmActors[1].fy],'farmers must not overlap in one spot');
assert.ok(farmActors.every(v=>Math.floor(v.fx)===20&&Math.floor(v.fy)===20),'working actors stay within their actual farm');
console.log('PASS: two working farmers are visible, separated and remain inside their assigned field.');
// Same-array task edits must refresh slots, without rescanning all people per farmer.
const indexedFarms=structuredClone(farmers),indexedFarmCrowd=new Crowd();indexedFarmCrowd.sync(indexedFarms);
indexedFarms.people.reverse();indexedFarmCrowd.update(indexedFarms,.016,1000);
const stableSlots=new Map(indexedFarmCrowd.list.map(v=>[v.id,[v.fx,v.fy]]));
assert.deepEqual(stableSlots.get(farmActors[0].id),[farmActors[0].fx,farmActors[0].fy]);
indexedFarms.people.find(p=>p.id===farmActors[0].id).task={t:'idle',at:warehouseForSlot()};
indexedFarmCrowd.update(indexedFarms,.016,1000);
assert.deepEqual([indexedFarmCrowd.list.find(v=>v.id===farmActors[1].id).fx,indexedFarmCrowd.list.find(v=>v.id===farmActors[1].id).fy],stableSlots.get(farmActors[0].id));
function warehouseForSlot(){return idx(24,20);}
let fullScans=0;const realFilter=indexedFarms.people.filter;
indexedFarms.people.filter=function(...args){fullScans++;return realFilter.apply(this,args);};
indexedFarmCrowd.update(indexedFarms,.016,1000);assert.equal(fullScans,0,'farm visuals cannot filter the entire population per actor');
delete indexedFarms.people.filter;
console.log('PASS: farmer slots survive reordered snapshots and in-place task changes without per-actor population scans.');

const idleVillage=newCity(0,123);idleVillage.t.fill(G);idleVillage.seen.fill(1);idleVillage.b={};idleVillage.camp=idx(10,20);idleVillage.raid=null;idleVillage.raidEncounter=undefined;idleVillage.zombies.actors=[];
for(const x of [16,24,32])idleVillage.b[idx(x,20)]={k:'house',lvl:x===32?3:1,doneAt:null};
const unreachableHome=idx(50,20);idleVillage.b[unreachableHome]={k:'house',lvl:3,doneAt:null};
for(let y=19;y<=21;y++)for(let x=49;x<=51;x++)if(idx(x,y)!==unreachableHome)idleVillage.t[idx(x,y)]=R;
idleVillage.people=Array.from({length:120},(_,i)=>({id:i+1,name:`Dân ${i+1}`,task:{t:'idle'},pos:idleVillage.camp}));idleVillage.pop=120;
const savedIdle=JSON.stringify(idleVillage),idleCrowd=new Crowd();idleCrowd.sync(idleVillage);
const assignedHomes=new Map(idleCrowd.list.map(v=>[v.id,v.home]));
assert.equal(new Set(assignedHomes.values()).size,3,'reachable houses share idle residents');
assert.ok(idleCrowd.list.every(v=>Math.abs(v.home%W-50)>2),'isolated houses cannot attract villagers across water');
const largeHouseResidents=idleCrowd.list.filter(v=>Math.abs(v.home%W-32)<=1).length;
assert.ok(largeHouseResidents>60&&largeHouseResidents<85,'larger residences receive proportionally more idle people');
const cloneIdle=structuredClone(idleVillage);cloneIdle.people.reverse();idleCrowd.sync(cloneIdle);
assert.deepEqual(new Map(idleCrowd.list.map(v=>[v.id,v.home])),assignedHomes,'ID-based homes survive reordered/cloned snapshots');
for(let i=0;i<600;i++)idleCrowd.update(cloneIdle,.1,1000+i*100);
assert.ok(new Set(idleCrowd.list.map(v=>Math.floor(v.fx/5))).size>=3,'idle people actually walk to several residential areas');
assert.equal(JSON.stringify(idleVillage),savedIdle,'decorative dispersal never changes saved positions, orders, resources or simulation');
cloneIdle.raid={at:30000,power:1};idleCrowd.update(cloneIdle,.1,25000);
assert.ok(idleCrowd.list.every(v=>v.fx===10.5&&v.fy===20.5),'threats restore authoritative idle positions');
const orderedIdle=structuredClone(idleVillage);orderedIdle.people[0].task={t:'idle',at:idx(12,25)};const orderedCrowd=new Crowd();orderedCrowd.sync(orderedIdle);
assert.equal(orderedCrowd.list[0].home,idx(12,25),'manual standing orders are never redistributed');
console.log('PASS: capacity-weighted idle homes are stable and reachable; threats/manual orders remain authoritative without state mutation.');
// Waiting/blocked farmers at the warehouse must not hoe at their last position.
const warehouse = idx(24, 20);
for (const p of farmers.people) { delete p.haul; p.pos = warehouse; }
const waitingFarmers = new Crowd(); waitingFarmers.sync(farmers);
assert.ok(waitingFarmers.list.every(v => v.state === 'rest'), 'initial sync cannot invent farm work');
farmCrowd.sync(farmers); farmCrowd.update(farmers, .1, 2000);
assert.ok(farmActors.every(v => v.state === 'rest' && !v.moving && v.swing === 0), 'existing actors stop hoeing without an authoritative job phase');
waitingFarmers.update(farmers, .1, 2000);
assert.ok(waitingFarmers.list.every(v => v.state === 'rest' && Math.floor(v.fx) === 24), 'waiting workers stay at their real position');
const farmer = farmers.people[0];
for (const phase of ['travel', 'return', 'unload', 'work']) {
  farmer.haul = { phase, at: 0, nextAt: 10000, tile: warehouse, route: [warehouse], routeStart: 0, carried: phase === 'return' || phase === 'unload' ? 10 : 0, capacity: 10, workRate: 5400, resource: 'food', source: { kind: 'building', key: farm }, taskKey: 'farm' };
  waitingFarmers.update(farmers, .1, 2000);
  assert.notEqual(waitingFarmers.list[0].state, 'work', `${phase} at warehouse cannot animate farming`);
  assert.equal(Math.floor(waitingFarmers.list[0].fx), 24, 'no teleport to the field');
}
console.log('PASS: farmers wait without hoeing at warehouses, including stale work phases and delivery legs.');


console.log('PASS: authoritative hauling movement/cargo, response sync continuity, reassignment cargo retention, and no renderer deposits.');


// Builders leave their office, walk to construction and wait when enclosed.
const construction = newCity(0, 123); construction.t.fill(G); construction.seen.fill(1); construction.b = {}; construction.people = [];
const office = idx(20,20), site = idx(24,20);
construction.camp = idx(15,20); construction.b[office] = { k:'builderhouse', lvl:1, doneAt:null };
construction.b[site] = { k:'hut', lvl:0, doneAt:100000 };
const buildersCrowd = new Crowd(); buildersCrowd.sync(construction);
const builder = buildersCrowd.list[0];
assert.equal(builder.home,office); assert.equal(builder.state,'toWork');
assert.equal(Math.floor(builder.fx),20);
for(let step=0;step<120;step++)buildersCrowd.update(construction,.1,step*100);
assert.equal(builder.state,'work'); assert.equal(Math.floor(builder.fx),24);
const enclosed = structuredClone(construction);
for(let y=19;y<=21;y++)for(let x=19;x<=21;x++)if(x!==20||y!==20)enclosed.b[idx(x,y)]={k:'wall',lvl:1,doneAt:null};
const blockedBuilders = new Crowd();blockedBuilders.sync(enclosed);blockedBuilders.update(enclosed,10,10000);
assert.equal(blockedBuilders.list[0].state,'rest');assert.equal(Math.floor(blockedBuilders.list[0].fx),20,'enclosed builder cannot teleport');
delete enclosed.b[idx(21,20)];blockedBuilders.sync(enclosed);assert.equal(blockedBuilders.list[0].state,'toWork','opening a path resumes the trip');
construction.b[site].doneAt=null;construction.b[site].lvl=1;buildersCrowd.sync(construction);assert.equal(buildersCrowd.list.length,0);
console.log('PASS: builders walk from their house, work on arrival, wait without teleporting and resume after an exit opens.');

// Elevated roof clicks must select their sprite, with solid-face boundaries and painter ordering.
const pickCity = newCity(1000, 7); pickCity.t.fill(G); pickCity.seen.fill(1); pickCity.b = {};
const pickView = { TW: 128, TH: 64, ox: 500, oy: 200, width: 1440, height: 1200, s: 2 };
pickCity.army={club:1};
const soldier=homeSoldiers(pickCity,pickCity.last)[0];
const soldierScreen={x:pickView.ox+(soldier.x-soldier.y)*pickView.TW/2,y:pickView.oy+(soldier.x+soldier.y)*pickView.TH/2-10*pickView.s};
assert.equal(pickHomeSoldier(pickView,pickCity,pickCity.last,soldierScreen.x,soldierScreen.y)?.id,soldier.id);
assert.equal(pickHomeSoldier(pickView,pickCity,pickCity.last,-10000,-10000),null);
pickCity.army={};
console.log('PASS: home soldier hit testing matches the drawn actor and rejects empty space.');

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

// Every arm painted for an automatic junction must remain clickable after rotation.
const {wallHeight}=await import(pathToFileURL(path.join(temp,'fortifications.js')).href);
const {drawBuilding}=await import(pathToFileURL(path.join(temp,'draw.js')).href);
const wallCity=newCity(0,123);wallCity.t.fill(G);wallCity.seen.fill(1);wallCity.people=[];
let wallChecks=0,wallOps=0;
const wallContext=new Proxy({}, {set(){return true;},get(_,key){
 if(key==='measureText')return text=>({width:String(text).length*7});
 return (...args)=>{assert.ok(args.every(value=>typeof value!=='number'||Number.isFinite(value)),`wall/gate non-finite ${String(key)}`);wallOps++;};
}});
for(let era=1;era<=6;era++)for(let level=1;level<=3;level++)for(let mask=0;mask<16;mask++){
 wallCity.era=era;wallCity.b={[idx(10,10)]:{k:'wall',lvl:level,doneAt:null}};wallCity.seen.fill(0);wallCity.seen[idx(10,10)]=1;
 const directions=[[0,-1,1],[1,0,2],[0,1,4],[-1,0,8]];
 for(const [dx,dy,bit]of directions)if(mask&bit)wallCity.b[idx(10+dx,10+dy)]={k:'wall',lvl:level,doneAt:null};
 const h=wallHeight(era,level);
 for(const [dx,dy,bit]of directions)if((mask||10)&bit)assert.deepEqual(pickBuilding(pickView,wallCity,...project(10.5+dx*.35,10.5+dy*.35,h)),{x:10,y:10},`wall arm era${era} level${level} mask${mask} direction${bit}`);
 const rc={c:wallContext,v:pickView,city:wallCity,D:{},anim:0,now:0,season:0,deck:new Set()};
 drawBuilding(rc,'wall',10,10,level,idx(10,10));assert.equal(rc.turn,undefined);wallChecks++;
}
for(let era=1;era<=6;era++)for(let level=1;level<=3;level++)for(const orientation of ['x','y']){
 wallCity.era=era;wallCity.b={[idx(10,10)]:{k:'gate',lvl:level,doneAt:null,orientation}};
 const rc={c:wallContext,v:pickView,city:wallCity,D:{},anim:0,now:0,season:0,deck:new Set()};
 drawBuilding(rc,'gate',10,10,level,idx(10,10));assert.equal(rc.turn,undefined,'gate rotation must not rotate later buildings');
 const u=orientation==='x'?.36:0,v=orientation==='y'?.36:0;
 assert.deepEqual(pickBuilding(pickView,wallCity,...project(10.5+u,10.5+v,8)),{x:10,y:10},`rotated gate pier era${era}`);wallChecks++;
}
assert.ok(wallOps>10000);
console.log(`PASS: ${wallChecks} wall/gate patterns across six eras and three levels; finite art, clickable arms/piers and isolated rotation.`);

// Canal floors sit below ground and their connected arms extend beyond the center box.
const canalCity=newCity(0,123);canalCity.t.fill(G);canalCity.seen.fill(1);canalCity.b={};canalCity.people=[];
const center=idx(10,10),directions=[[1,0],[-1,0],[0,1],[0,-1]];
for(const era of [2,3])for(const [dx,dy]of directions){
 canalCity.era=era;canalCity.b={[center]:{k:'canal',lvl:1,doneAt:null}};canalCity.t.fill(G);canalCity.t[idx(10+dx,10+dy)]=R;
 const point=project(10.5+dx*.49,10.5+dy*.49,-3);
 assert.deepEqual(pickBuilding(pickView,canalCity,...point),{x:10,y:10},`canal era ${era} submerged arm ${dx},${dy}`);
 assert.deepEqual(pickVillageTarget(pickView,canalCity,[],1,...point)?.cell,{x:10,y:10},'lowered canal floor must not fall through to the neighbouring cell');
 canalCity.t.fill(G);canalCity.b[idx(10+dx,10+dy)]={k:'canal',lvl:1,doneAt:null};
 assert.deepEqual(pickBuilding(pickView,canalCity,...project(10.5+dx*.35,10.5+dy*.35,-3)),{x:10,y:10},`disconnected dry arm ${dx},${dy}`);
 assert.equal(pickBuilding(pickView,canalCity,...project(10.9,10.9)),null,'empty canal tile corner remains empty');
}
console.log('PASS: wet/dry canal branches and recessed floors are clickable in all four directions and both eras.');

// Camera turns must preserve world identity, centre, culling and picking.
const {rotatePoint,projectWorld,screenToWorld,screenToCell,rotateCam,viewDepth,travelFace,zoomAt,drawCity}=await import(pathToFileURL(path.join(temp,'draw.js')).href);
const {derive}=await import(pathToFileURL(path.join(temp,'engine.js')).href);
let rotationsChecked=0;
for(const [width,height]of [[390,844],[1440,900]])for(const zoom of [1,3,8,18])for(const [cx,cy]of [[.5,.5],[48.5,48.5],[95.5,95.5]]){
 const f=fitView(width,height),cam={zoom,px:0,py:0};focusOn(f,cam,cx,cy,zoom);
 const start=screenToWorld(camView(f,cam),width/2,height/2);
 for(let rotation=0;rotation<4;rotation++){
  const v=camView(f,cam),bounds=visibleTileBounds(v);
  const centre=screenToWorld(v,width/2,height/2);
  assert.ok(Math.hypot(centre[0]-start[0],centre[1]-start[1])<1e-8,'turn moved camera centre');
  for(let y=0;y<96;y++)for(let x=0;x<96;x++){
   const [sx,sy]=projectWorld(v,x+.5,y+.5);
   assert.deepEqual(screenToCell(v,sx,sy),{x,y},'rotated cell inverse mismatch');
   if(sx>-v.TW&&sx<v.width+v.TW&&sy>-v.TW*.5&&sy<v.height+v.TW*2)assert.ok(x>=bounds.x0&&x<=bounds.x1&&y>=bounds.y0&&y<=bounds.y1,'culling dropped a rotated visible tile');
  }
  const anchor=projectWorld(v,cx,cy);zoomAt(f,cam,zoom*1.2,...anchor);
  const after=screenToWorld(camView(f,cam),...anchor);
  // Edge clamping can limit the zoom anchor only at the full-map limit.
  if(zoom>1)assert.ok(Math.hypot(after[0]-cx,after[1]-cy)<1e-8,'zoom lost rotated anchor');
  focusOn(f,cam,...start,zoom);rotateCam(f,cam,1);rotationsChecked++;
 }
 assert.equal(cam.rotation,0,'four turns must return to north');
}
const rotationCity=newCity(0,123);rotationCity.era=4;rotationCity.t.fill(G);rotationCity.seen.fill(1);rotationCity.b={};rotationCity.camps=[];rotationCity.herds=[];rotationCity.people=[];
for(const rotation of [0,1,2,3]){
 const v={...pickView,rotation};
 for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){
  const p0=projectWorld(v,10,10),p1=projectWorld(v,10+dx,10+dy);
  if(Math.abs(p1[0]-p0[0])>1e-6)assert.equal(travelFace(v,dx,dy,-1),p1[0]>p0[0]?1:-1);
  assert.equal(Math.sign(viewDepth(v,10+dx,10+dy)-viewDepth(v,10,10)),Math.sign(p1[1]-p0[1]));
  rotationCity.b={[center]:{k:'canal',lvl:1,doneAt:null}};rotationCity.t.fill(G);rotationCity.t[idx(10+dx,10+dy)]=R;
  assert.deepEqual(pickBuilding(v,rotationCity,...projectWorld(v,10.5+dx*.49,10.5+dy*.49,-3*v.s)),{x:10,y:10});
 }
 rotationCity.t.fill(G);
 for(const key of ['house','envoy','temple']){
  rotationCity.b={[center]:{k:key,lvl:2,doneAt:null}};
  const p=projectWorld(v,10.5,10.5,8*v.s);
  assert.deepEqual(pickBuilding(v,rotationCity,...p),{x:10,y:10},'billboard art and pick must share their footprint');
 }
 for(const orientation of ['x','y']){
  rotationCity.b={[center]:{k:'gate',lvl:2,doneAt:null,orientation}};
  assert.deepEqual(pickBuilding(v,rotationCity,...projectWorld(v,10.5+(orientation==='x'?.36:0),10.5+(orientation==='y'?.36:0),8*v.s)),{x:10,y:10});
 }
}
let stackDepth=0,renderOps=0;
const renderContext=new Proxy({}, {set(){return true;},get(_,key){
 if(key==='save')return ()=>stackDepth++;
 if(key==='restore')return ()=>{assert.ok(stackDepth>0);stackDepth--;};
 if(key==='measureText')return text=>({width:String(text).length*7});
 if(key==='createRadialGradient')return ()=>({addColorStop(){}});
 return (...args)=>{assert.ok(args.every(n=>typeof n!=='number'||Number.isFinite(n)),`rotated render invalid ${String(key)}`);renderOps++;};
}});
rotationCity.b={[center]:{k:'house',lvl:2,doneAt:null},[idx(11,10)]:{k:'wall',lvl:2,doneAt:null},[idx(12,10)]:{k:'gate',lvl:2,doneAt:null,orientation:'y'},[idx(10,11)]:{k:'canal',lvl:1,doneAt:null}};
const snapshot=JSON.stringify(rotationCity),derived=derive(rotationCity);
for(const rotation of [0,1,2,3]){
 const f=fitView(390,844),cam={zoom:8,px:0,py:0,rotation};focusOn(f,cam,10.5,10.5,8);
 drawCity(renderContext,rotationCity,derived,{v:camView(f,cam),now:0,anim:12345,hover:{x:13,y:10},selected:{x:10,y:10},tool:'house',villagers:[],picked:new Set(),fx:[],chopping:new Set()});assert.equal(stackDepth,0);
}
assert.equal(JSON.stringify(rotationCity),snapshot,'camera rendering mutated persisted city');assert.ok(renderOps>1000);
for(const rotation of [0,1,2,3])for(let era=1;era<=6;era++)for(const orientation of ['x','y']){
 rotationCity.era=era;rotationCity.b={[center]:{k:'gate',lvl:2,doneAt:null,orientation}};
 const rc={c:renderContext,v:{...pickView,rotation},city:rotationCity,D:derive(rotationCity),anim:12345,now:0,season:0,deck:new Set()};
 drawBuilding(rc,'gate',10,10,2,center);assert.equal(stackDepth,0);
 rotationCity.b[center]={k:'wall',lvl:2,doneAt:null,orientation};drawBuilding(rc,'wall',10,10,2,center);assert.equal(stackDepth,0);
}

console.log(`PASS: ${rotationsChecked} camera/viewport combinations, exhaustive rotated cell/culling checks, centre retention, zoom anchors, connected infrastructure picking and immutable full renders.`);

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

// Exercise the optional browser caches without changing persisted simulation state.
const {createLayerCache,createTreeCache}=await import(pathToFileURL(path.join(temp,'draw.js')).href);
const {F}=await import(pathToFileURL(path.join(temp,'engine.js')).href);
const forest=newCity(0,123);forest.t.fill(G);forest.seen.fill(1);forest.b={};forest.people=[];forest.camps=[];forest.herds=[];
for(let y=8;y<=12;y++)for(let x=8;x<=12;x++)forest.t[idx(x,y)]=F;
const forestD=derive(forest),trees=createTreeCache(),ground=createLayerCache();let builds=0,blits=0;
ground.onBuild=()=>builds++;
const oldDocument=globalThis.document;
const offscreen=()=>new Proxy({}, {set(){return true;},get(_,key){
 if(key==='measureText')return text=>({width:String(text).length*7});
 if(String(key).startsWith('create'))return()=>({addColorStop(){}});
 return(...args)=>assert.ok(args.every(n=>typeof n!=='number'||Number.isFinite(n)),`cache invalid ${String(key)}`);
}});
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>offscreen()})};
const cachedContext=new Proxy(renderContext,{get(target,key){if(key==='drawImage')return()=>blits++;return target[key];}});
try{
 const f=fitView(390,844),cam={zoom:3,px:0,py:0,rotation:0};focusOn(f,cam,10.5,10.5,3);
 const options={v:camView(f,cam),now:0,anim:12345,hover:null,selected:null,tool:null,villagers:[],picked:new Set(),fx:[],chopping:new Set(),trees,dpr:2};
 const before=JSON.stringify(forest);
 drawCity(cachedContext,forest,forestD,options);const size=trees.size;
 assert.ok(size>0&&size<=20,'crown variants must be quantized and reusable');
 const warmBlits=blits;drawCity(cachedContext,forest,forestD,options);
 assert.equal(trees.size,size);assert.ok(blits>warmBlits,'warm crowns use bitmaps');
 for(const rotation of [1,2,3]){
  cam.rotation=rotation;focusOn(f,cam,10.5,10.5,3);
  drawCity(cachedContext,forest,forestD,{...options,v:camView(f,cam)});
  assert.equal(trees.size,size,'billboard crowns reuse sprites after rotation');
 }
 blits=0;drawCity(cachedContext,forest,forestD,{...options,chopping:new Set(Array.from({length:96*96},(_,i)=>i))});
 assert.equal(blits,0,'chopping crowns must stay live');
 drawCity(cachedContext,forest,forestD,{...options,ground});const first=builds;
 drawCity(cachedContext,forest,forestD,{...options,ground});assert.equal(builds,first);
 const changed=structuredClone(forest);changed.seen[idx(10,10)]=0;
 drawCity(cachedContext,changed,derive(changed),{...options,ground});assert.equal(builds,first+1,'new snapshot invalidates fog');
 // The visited village is settled in place, rather than replaced by queue snapshots.
 changed.last++;changed.t[idx(10,10)]=G;
 drawCity(cachedContext,changed,derive(changed),{...options,ground});assert.equal(builds,first+2,'in-place settlement invalidates terrain');
 assert.equal(JSON.stringify(forest),before,'cache rendering mutated the game');
 assert.ok(trees.weight<=12*1024*1024,'sprite retention exceeds memory budget');
 console.log('PASS: bounded tree sprites, rotation reuse, live chopping, immutable cached renders and terrain/fog invalidation.');
}finally{if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;}

// Expanded buildings must never silently share the old industrial fallback.
const {MAGIC_EXPANSION}=await import(pathToFileURL(path.join(temp,'building-expansion.js')).href);
function expansionTrace(k,lvl,rotation){
 const trace=[],stack=[];let state={globalAlpha:1};
 const c=new Proxy({}, {set(_,key,value){state[key]=value;trace.push(['style',key,value]);return true;},get(_,key){
  if(key==='save')return ()=>stack.push({...state});
  if(key==='restore')return ()=>{assert.ok(stack.length);state=stack.pop();};
  if(key in state)return state[key];
  if(key==='createRadialGradient'||key==='createLinearGradient')return (...args)=>{assert.ok(args.every(Number.isFinite));return {addColorStop(){}};};
  if(key==='measureText')return text=>({width:String(text).length*7});
  return (...args)=>{assert.ok(args.every(v=>typeof v!=='number'||Number.isFinite(v)),k+': invalid coordinate');trace.push([key,...args]);};
 }});
 const rc={c,v:{...pickView,rotation},city:rotationCity,D:derived,anim:0,now:0,season:0,deck:new Set()};
 drawBuilding(rc,k,10,10,lvl,-1);assert.equal(stack.length,0);return JSON.stringify(trace);
}
const screenshotKeys=['crystalgranary','wardbastion','herbalconservatory','forestenclave','stonecircle','arcaneresidence'];
for(const rotation of [0,1,2,3]){
 const traces=screenshotKeys.map(k=>expansionTrace(k,1,rotation));assert.equal(new Set(traces).size,screenshotKeys.length,'distinct building roles');
 for(const [k,d]of Object.entries(MAGIC_EXPANSION)){
  const first=expansionTrace(k,1,rotation);
  if(d.upgrade){const second=expansionTrace(k,2,rotation),third=expansionTrace(k,3,rotation);assert.notEqual(first,second,k+': level 2');assert.notEqual(second,third,k+': level 3');}
 }
}
console.log('PASS: expansion art has distinct roles, upgrades differ, and all four rotations have finite coordinates and balanced state.');

} finally { fs.rmSync(temp, { recursive: true, force: true }); }
