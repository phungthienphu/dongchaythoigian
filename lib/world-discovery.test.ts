import test from 'node:test';
import assert from 'node:assert/strict';
import { idx, MIN, newCity, settle } from './engine';
import { beginDiscovery, canViewVillage, completeDiscoveries, knowsNation, SCOUT_MS, villageView } from './world-discovery';
import { warView } from './war-view';
import type { BattleDoc } from './war';
function fixture(){const c=newCity(0,1);c.b[idx(1,1)]={k:'envoy',lvl:2,doneAt:null};return c;}
const candidates=[{_id:'far',name:'Far',world:{x:90,y:90}},{_id:'near',name:'Near',world:{x:11,y:10}}];
test('friendship grants a village visit but never discovers a world location',()=>{
 const c=fixture();assert.equal(canViewVillage(c,'near',true,0),true);
 assert.equal(canViewVillage(c,'near',false,0),false);assert.equal(knowsNation(c,'near'),false);
 c.visits={near:100};assert.equal(canViewVillage(c,'near',false,99),true);assert.equal(canViewVillage(c,'near',false,100),false);
 assert.equal(knowsNation(c,'near'),true); // Expired legacy reports still establish permanent knowledge.
});
test('exploration payload and client simulation never reveal a target before server resolution',()=>{
 const c=fixture();assert.equal(beginDiscovery(c,0),null);
 completeDiscoveries(c,'me',{x:10,y:10},candidates,SCOUT_MS-1);
 assert.equal(c.trips![0].target,'');assert.equal(JSON.stringify(c).includes('Near'),false);
 settle(c,5*MIN);assert.equal(c.trips![0].target,'');assert.equal(knowsNation(c,'near'),false);
});
test('due exploration discovers the nearest new nation, persists location knowledge and frees the envoy on return',()=>{
 const c=fixture();beginDiscovery(c,0);
 completeDiscoveries(c,'me',{x:10,y:10},candidates,SCOUT_MS);
 settle(c,SCOUT_MS);assert.equal(c.trips![0].target,'near');assert.equal(knowsNation(c,'near'),true);
 assert.ok(c.visits!.near>SCOUT_MS);
 settle(c,4*MIN);assert.equal(c.trips!.length,0);assert.equal(knowsNation(c,'near'),true);
 c.visits={};assert.equal(knowsNation(c,'near'),true); // Friendship/report expiry is independent.
});
test('simultaneous scouts find different nations and skip the home nation',()=>{
 const c=fixture();beginDiscovery(c,0);beginDiscovery(c,0);
 completeDiscoveries(c,'me',{x:10,y:10},[{_id:'me',name:'Home',world:{x:10,y:10}},...candidates],SCOUT_MS);
 settle(c,SCOUT_MS);assert.deepEqual([...c.discoveries!].sort(),['far','near']);
});
test('empty exploration returns without adding a fake discovery and capacity is enforced',()=>{
 const c=fixture();beginDiscovery(c,0);beginDiscovery(c,0);assert.match(beginDiscovery(c,0)!,/vắng/);
 completeDiscoveries(c,'me',{x:10,y:10},[],SCOUT_MS);settle(c,4*MIN);
 assert.equal(c.trips!.length,0);assert.equal(c.discoveries?.length??0,0);assert.equal(Object.keys(c.visits??{}).length,0);
});
test('visiting a friend or battle cannot leak their world intelligence or a live battle identifier',()=>{
 const c=fixture();c.discoveries=['secret'];c.visits={secret:1234};c.trips=[{id:1,target:'secret',targetName:'Secret',depart:0,arrive:1,back:2}];c.log=[{at:0,msg:'Secret'}];c.battleId='private-room';
 const view=villageView(c);for(const k of ['trips','visits','discoveries','guardPosts'])assert.equal(Object.hasOwn(view,k),false);
 assert.deepEqual(view.log,[]);assert.equal(view.battleId,'active');assert.equal(c.battleId,'private-room');assert.deepEqual(c.discoveries,['secret']);
});
test('incoming war hides unknown origins and route duration, but exposes a previously discovered origin',()=>{
 const c=fixture();const w={_id:'war',attackerId:'far',defenderId:'me',attackerName:'Far',defenderName:'Me',from:{x:90,y:90},to:{x:10,y:10},depart:0,arrive:60_000,duration:60_000,troops:{club:1},status:'marching',createdAt:new Date(0)} satisfies BattleDoc;
 const hidden=warView(w,'me',c);for(const k of ['from','depart','duration','snapshot','createdAt','back'])assert.equal(Object.hasOwn(hidden,k),false);
 assert.deepEqual(hidden.to,w.to);assert.equal(hidden.arrive,w.arrive);
 c.discoveries=['far'];assert.deepEqual(warView(w,'me',c).from,w.from);
});
