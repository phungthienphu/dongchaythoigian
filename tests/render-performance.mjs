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
  for (const [input, name] of [['lib/bridges.ts','bridges'], ['lib/economy-balance.ts','economy-balance'], ['lib/resource-history.ts','resource-history'], ['lib/hunger.ts','hunger'], ['lib/tower-balance.ts','tower-balance'], ['lib/industry.ts','industry'], ['lib/modern.ts','modern'], ['lib/era-military.ts','era-military'], ['lib/eras.ts','eras'], ['lib/medieval.ts','medieval'], ['lib/bounded-cache.ts', 'bounded-cache'], ['lib/action-input.ts', 'action-input'], ['lib/engine.ts', 'engine'], ['lib/villager-mood.ts','villager-mood'], ['lib/build-placement.ts', 'build-placement'], ['components/villager-art.ts', 'villager-art'], ['components/actor-art.ts', 'actor-art'], ['components/trade-actors.ts', 'trade-actors'], ['components/draw.ts', 'draw'], ['components/villagers.ts', 'villagers']]) {
    const output = stripTypeScriptTypes(fs.readFileSync(path.join(root, input), 'utf8'))
      .replaceAll('"./eras"', '"./eras.js"').replaceAll('"./medieval"', '"./medieval.js"').replaceAll('"./bounded-cache"', '"./bounded-cache.js"').replaceAll('"@/lib/bounded-cache"', '"./bounded-cache.js"').replaceAll('"./action-input"', '"./action-input.js"').replaceAll('"@/lib/villager-mood"', '"./villager-mood.js"').replaceAll('"@/lib/engine"', '"./engine.js"').replaceAll('"@/lib/build-placement"', '"./build-placement.js"').replaceAll("'./engine'", "'./engine.js'").replaceAll('"./villager-art"', '"./villager-art.js"').replaceAll('"./actor-art"', '"./actor-art.js"').replaceAll('"./trade-actors"', '"./trade-actors.js"').replaceAll('"./draw"', '"./draw.js"').replaceAll('"./villagers"', '"./villagers.js"');
    fs.writeFileSync(path.join(temp, `${name}.js`), output.replace(/from (['"])(?:@\/lib\/|\.\/)(bridges|economy-balance|resource-history|hunger|industry|modern|medieval|eras|era-military|tower-balance)\1/g, 'from $1./$2.js$1'));
  }
  fs.writeFileSync(path.join(temp, 'package.json'), '{"type":"module"}');
  const { visibleTileBounds, fitView, camView, focusOn, pickBuilding, pickVillageTarget, pickHomeSoldier } = await import(pathToFileURL(path.join(temp, 'draw.js')).href);
  const { Crowd } = await import(pathToFileURL(path.join(temp, 'villagers.js')).href);
  const { newCity, G, R, idx, homeSoldiers, applyAction, haulPosition, updateRefuges, refugePosition } = await import(pathToFileURL(path.join(temp, 'engine.js')).href);
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
const farmers=newCity(0,123);farmers.t.fill(G);farmers.seen.fill(1);farmers.b={};const farm=idx(20,20);
farmers.b[farm]={k:'farm',lvl:1,doneAt:null};farmers.people=farmers.people.slice(0,2);
for(const p of farmers.people){p.task={t:'work',at:farm};p.haul={phase:'work',at:0,nextAt:10000,tile:farm,route:[farm],routeStart:0,carried:0,capacity:10,workRate:5400,resource:'food',source:{kind:'building',key:farm},taskKey:'farm'};}
const farmCrowd=new Crowd();farmCrowd.sync(farmers);farmCrowd.update(farmers,.1,1000);
const farmActors=farmCrowd.list.filter(v=>v.id!==null);
assert.equal(farmActors.length,2);assert.ok(farmActors.every(v=>v.visible&&v.job==='farm'&&v.state==='work'));
assert.notDeepEqual([farmActors[0].fx,farmActors[0].fy],[farmActors[1].fx,farmActors[1].fy],'farmers must not overlap in one spot');
assert.ok(farmActors.every(v=>Math.floor(v.fx)===20&&Math.floor(v.fy)===20),'working actors stay within their actual farm');
console.log('PASS: two working farmers are visible, separated and remain inside their assigned field.');
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
