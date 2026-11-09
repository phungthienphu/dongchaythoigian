import test from 'node:test';
import assert from 'node:assert/strict';
import {bridgeDeck,bridgeGeometry,bridgeReady,SHORT_BRIDGE_WATER_TILES} from './bridges';
import {newCity,G,R,F,HL,W,H,idx,applyAction,bridgeQuote,canPlace,derive,settle,homeSoldiers,expeditionPlan,demolitionQuote,wildernessKeep,type City} from './engine';
import {createBattle,advanceBattle,commandBattle,battleBridgeTiles} from './battle';

const from=idx(14,10);
function fixture(width=2):City{
 const c=newCity(0,123);c.t.fill(G);c.seen.fill(1);c.herds=[];c.camps=[];c.people=[];c.pop=0;c.b={};c.era=5;c.camp=idx(10,10);c.army={club:1};c.manualWorkforce=true;
 c.disaster={kind:'earthquake',at:1e10,center:idx(90,90),level:1,warned:false};
 for(let y=0;y<H;y++)for(let x=15;x<15+width;x++)c.t[idx(x,y)]=R;
 c.b[from]={k:'ironbridge',lvl:1,doneAt:null};c.b[idx(10,10)]={k:'barracks',lvl:1,doneAt:null};
 c.res={food:100000,wood:100000,stone:100000,copper:100000,gold:100000,diamond:100000,coal:100000};return c;
}
const end=(width:number)=>idx(15+width,10);
function completed(c:City,width:number){c.b[from].bridge={to:end(width),tiles:Array.from({length:width},(_,n)=>idx(15+n,10)),ready:true};if(width>2)c.b[end(width)]={k:'bridgehead',lvl:1,doneAt:null};return c;}
const move={type:'moveSoldier',id:'club:0',x:22,y:10} as const;

test('threshold is exactly two water cells; horizontal and vertical crossings use real river tiles',()=>{
 assert.equal(SHORT_BRIDGE_WATER_TILES,2);
 for(const width of [1,2,3,24]){const c=fixture(width),q=bridgeGeometry(c,from,end(width));assert.equal(q.error,null);assert.equal(q.width,width);assert.equal(q.needsHead,width>2);}
 const c=fixture();c.t.fill(G);for(const y of [11,12])c.t[idx(14,y)]=R;
 assert.deepEqual(bridgeGeometry(c,from,idx(14,13)),{tiles:[idx(14,11),idx(14,12)],width:2,needsHead:false,error:null});
 delete c.b[from];assert.equal(bridgeGeometry(c,idx(14,13),from).error,null);
});
test('rejects diagonal, islands, fog, occupied banks, missing water and excessive spans',()=>{
 const c=fixture(2);
 for(const to of [-1,W*H,from,from+.5,idx(17,11),idx(13,10)])assert.ok(bridgeGeometry(c,from,to).error);
 c.seen[idx(15,10)]=0;assert.match(bridgeGeometry(c,from,end(2)).error!,/khám phá/);c.seen.fill(1);
 c.t[idx(15,10)]=G;assert.ok(bridgeGeometry(c,from,end(2)).error);c.t[idx(15,10)]=R;
 c.b[end(2)]={k:'house',lvl:1,doneAt:null};assert.ok(bridgeGeometry(c,from,end(2)).error);
 assert.match(bridgeGeometry(fixture(25),from,end(25)).error!,/tối đa 24/);
});
test('only opposite long-bank site permits a bridgehead, with cap including unfinished heads',()=>{
 const c=fixture(3);assert.equal(canPlace(c,derive(c),'bridgehead',18,10),null);
 assert.ok(canPlace(c,derive(c),'bridgehead',14,11));assert.ok(canPlace(c,derive(c),'bridgehead',18,11));
 c.b[end(3)]={k:'bridgehead',lvl:0,doneAt:1000};assert.match(bridgeQuote(c,from,end(3)).error!,/xây xong/);
 const short=fixture(2);assert.ok(canPlace(short,derive(short),'bridgehead',17,10));
});
test('link charges once, requires complete opposite head for 3+ cells and consumes a builder',()=>{
 const c=fixture(3),before=structuredClone(c.res);assert.ok(applyAction(c,{type:'connectBridge',x:14,y:10,to:end(3)},0));assert.deepEqual(c.res,before);
 c.b[end(3)]={k:'bridgehead',lvl:1,doneAt:null};const quote=bridgeQuote(c,from,end(3));assert.equal(quote.error,null);
 assert.equal(applyAction(c,{type:'connectBridge',x:14,y:10,to:end(3)},0),null);
 assert.equal(c.b[from].doneAt,quote.duration);assert.equal(c.b[from].bridge?.ready,false);assert.equal(bridgeDeck(c).size,0);
 for(const [r,n]of Object.entries(quote.cost))assert.equal(c.res[r as keyof typeof c.res],before[r as keyof typeof c.res]-n!);
 const charged={...c.res};assert.ok(applyAction(c,{type:'connectBridge',x:14,y:10,to:end(3)},0));assert.deepEqual(c.res,charged);
});
test('construction completes deterministically, survives JSON and does not raise the wonder level',()=>{
 const c=fixture(),q=bridgeQuote(c,from,end(2));assert.equal(applyAction(c,{type:'connectBridge',x:14,y:10,to:end(2)},0),null);
 const online=structuredClone(c),serialized=JSON.parse(JSON.stringify(c));settle(c,q.duration);settle(serialized,q.duration);
 for(let at=1000;at<=q.duration;at+=1000)settle(online,at);
 assert.deepEqual(c,online);assert.deepEqual(c,serialized);assert.equal(c.b[from].lvl,1);assert.equal(c.b[from].doneAt,null);assert.ok(bridgeReady(c,from));
 assert.deepEqual([...bridgeDeck(c)],[idx(15,10),idx(16,10)]);assert.equal(c.t[idx(15,10)],R);
});
test('diamond speedup finishes a paid span and cannot bypass the opposite head requirement',()=>{
 const c=fixture();applyAction(c,{type:'connectBridge',x:14,y:10,to:end(2)},0);
 assert.equal(applyAction(c,{type:'speedBuild',x:14,y:10},0),null);assert.ok(bridgeReady(c,from));assert.equal(c.b[from].lvl,1);
 const long=fixture(3);long.b[end(3)]={k:'bridgehead',lvl:0,doneAt:1000};assert.ok(bridgeQuote(long,from,end(3)).error);
});
test('legacy wonder keeps benefit/progression and can add a physical span without rebuilding',()=>{
 const c=fixture();assert.equal(c.b[from].bridge,undefined);assert.equal(bridgeDeck(c).size,0);assert.equal(bridgeQuote(c,from,end(2)).error,null);
 assert.ok(applyAction(c,move,0));completed(c,2);assert.equal(applyAction(c,move,0),null);assert.equal(c.ferryBookings?.length??0,0);
 const soldier=homeSoldiers(c,20000)[0];assert.equal(soldier.x,22.5);assert.equal(soldier.y,10.5);
 assert.equal(expeditionPlan(c,idx(22,10),{club:1})?.ships,0);
});
test('troops standing on a complete bridge can receive a new order without inventing a boat',()=>{
 const c=completed(fixture(),2);c.homeOrders={'club:0':{route:[idx(15,10)],at:0,x:15.5,y:10.5}};
 assert.equal(applyAction(c,move,0),null);assert.equal(homeSoldiers(c,10000)[0].x,22.5);assert.equal(c.ferryBookings?.length??0,0);
});
test('burned, flooded, unfinished, forged or misaligned spans never open a crossing',()=>{
 for(const field of ['burned','flooded','off'] as const){const c=completed(fixture(3),3);c.b[end(3)][field]=true;assert.equal(bridgeDeck(c).size,0);assert.ok(applyAction(c,move,0));}
 const c=completed(fixture(),2);c.b[from].doneAt=1000;assert.equal(bridgeDeck(c).size,0);c.b[from].doneAt=null;
 c.b[from].bridge!.tiles=[idx(15,11),idx(16,11)];assert.equal(bridgeDeck(c).size,0);
 c.b[from].bridge!.tiles=[idx(15,10),idx(16,10)];c.t[idx(15,10)]=G;assert.equal(bridgeDeck(c).size,0);
});
test('protects short exit from construction and span/exit from wilderness renewal',()=>{
 const c=completed(fixture(),2);assert.match(canPlace(c,derive(c),'house',17,10)!,/lối ra/);
 const keep=wildernessKeep(c,0);for(const i of [idx(15,10),idx(16,10),end(2)])assert.equal(keep[i],1);
});
test('demolition waits for troops and hauling routes, then allows an unused span',()=>{
 const c=completed(fixture(),2);c.homeOrders={'club:0':{route:[idx(15,10)],at:0,x:15.5,y:10.5}};assert.match(demolitionQuote(c,from,0).error!,/đang dùng cầu/);
 c.homeOrders={};assert.equal(demolitionQuote(c,from,0).error,null);
 const long=completed(fixture(3),3);long.homeOrders={'club:0':{route:[idx(16,10)],at:0,x:16.5,y:10.5}};assert.ok(demolitionQuote(long,end(3),0).error);
});
function battle(width=2){
 const c=completed(fixture(width),width);c.b[idx(30,30)]={k:'hall',lvl:1,doneAt:null};c.army={club:1};
 const s=createBattle({id:'bridge',attackerId:'a',defenderId:'d',attacker:fixture(),defender:c,troops:{club:1},attackerShips:0,now:0,defenderOnline:true});
 for(const g of s.groups){g.x=g.side==='attacker'?10.5:22.5;g.y=g.side==='attacker'?10.5:25.5;g.order={type:'guard',x:g.x,y:g.y};}
 return s;
}
test('both battle sides physically cross the span without naval ability and replay deterministically',()=>{
 for(const side of ['attacker','defender'] as const){const s=battle(),g=s.groups.find(g=>g.side===side)!;g.x=10.5;g.y=10.5;
 const other=s.groups.find(g=>g!==s.groups.find(x=>x.side===side))!;other.x=80;other.y=80;
 assert.equal(g.naval,false);assert.equal(commandBattle(s,side,{type:'move',groupId:g.id,x:22.5,y:10.5}),true);
 const online=structuredClone(s);advanceBattle(s,12000);for(let at=100;at<=12000;at+=100)advanceBattle(online,at);
 assert.deepEqual(s,online);assert.equal(g.x,22.5);assert.equal(g.y,10.5);assert.equal(g.count,1);assert.equal(g.naval,false);}
});
test('a defender spawned on a bridge does not receive permanent naval capability',()=>{
 const c=completed(fixture(),2);c.homeOrders={'club:0':{route:[idx(15,10)],at:0,x:15.5,y:10.5}};
 const s=createBattle({id:'spawn',attackerId:'a',defenderId:'d',attacker:c,defender:c,troops:{club:1},attackerShips:0,now:0});assert.equal(s.groups.find(g=>g.side==='defender')!.naval,false);
});
test('destroying either long-bank head closes new crossings and evacuates stranded troops to a bank',()=>{
 for(const destroyed of [from,end(3)]){
 const s=battle(3),g=s.groups.find(g=>g.side==='defender')!;g.x=16.5;g.y=10.5;
 s.groups.find(g=>g.side==='attacker')!.x=80;s.groups.find(g=>g.side==='attacker')!.y=80;
 for(const b of s.buildings)if(b.bridge||b.k==='bridgehead')b.value=1;
 g.order={type:'move',x:22.5,y:10.5};s.buildings.find(b=>b.tile===destroyed)!.burned=true;
 assert.equal(battleBridgeTiles(s).size,0);advanceBattle(s,100);assert.ok(Math.abs(g.x-16.5)<=.25);assert.equal(g.naval,false);
 advanceBattle(s,5000);assert.notEqual(s.terrain[idx(Math.floor(g.x),Math.floor(g.y))],R);assert.equal(g.naval,false);
 }
});
test('troops standing on the deck fight normally instead of being treated as boat passengers',()=>{
 const s=battle(),a=s.groups.find(g=>g.side==='attacker')!,d=s.groups.find(g=>g.side==='defender')!;
 a.x=15.4;a.y=10.5;d.x=15.9;d.y=10.5;const hp=d.hp;advanceBattle(s,100);assert.ok(d.hp<hp);
});

test('workers near a bridge walk over it; a distant bridge does not force a long detour',()=>{
 for(const y of [10,70]){
 const c=completed(fixture(),2),p=newCity(0,8).people[0];p.pos=idx(12,y);p.task={t:'chop',at:idx(20,y)};Reflect.deleteProperty(p,'haul');c.people=[p];c.pop=1;c.b[idx(11,y)]={k:'hut',lvl:1,doneAt:null};c.t[idx(20,y)]=F;c.dep[idx(20,y)]=0;c.res.wood=0;c.b[idx(12,y)]={k:'storehouse',lvl:1,doneAt:null};
 settle(c,1000);assert.ok(p.haul?.route.some(i=>c.t[i]===R));
 assert.equal(p.haul!.route.some(i=>bridgeDeck(c).has(i)),y===10);
 if(y===10){assert.equal(c.res.wood,0);settle(c,240000);assert.ok(c.res.wood>0,'wood credited only after hauling to storage');}
 }
});
