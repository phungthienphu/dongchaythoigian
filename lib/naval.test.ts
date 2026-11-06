import test from 'node:test';
import assert from 'node:assert/strict';
import {newCity,G,R,HL,H,W,idx,derive,canPlace,applyAction,settle,shipCost,shipBuildMs,shipsNeeded,shipsFree,expeditionPlan,homeSoldiers,returningFerries,type City} from './engine';
import {createBattle,advanceBattle,commandBattle} from './battle';
function fixture():City{
 const c=newCity(0,123);c.t.fill(G);c.seen.fill(1);c.people=[];c.herds=[];c.camps=[];c.b={};c.era=2;c.camp=idx(10,10);c.army={club:12};
 for(let y=0;y<H;y++)for(let x=15;x<=17;x++)c.t[idx(x,y)]=R;
 c.b[c.camp]={k:'barracks',lvl:2,doneAt:null};c.b[idx(14,12)]={k:'dock',lvl:1,doneAt:null};
 c.res={wood:500,food:500,stone:500,copper:400,gold:200,diamond:0};return c;
}
test('dock placement, expensive ship payment, bounded serial queue and offline completion',()=>{
 const c=fixture(),dock=c.b[idx(14,12)];
 assert.match(canPlace(c,derive(c),'dock',12,12)!,/sát sông/);
 const before={...c.res};assert.equal(applyAction(c,{type:'buildShip',x:14,y:12},0),null);
 for(const [r,n]of Object.entries(shipCost(2)))assert.equal(c.res[r as keyof typeof c.res],before[r as keyof typeof c.res]-n!);
 assert.equal(dock.shipQueue?.[0],shipBuildMs(dock));assert.equal(shipsFree(c),0);
 const online=structuredClone(c);settle(c,90_000);for(let t=1000;t<=90_000;t+=1000)settle(online,t);assert.deepEqual(c,online);assert.equal(c.transportShips,1);
 c.transportShips=3;const snapshot=structuredClone(c);assert.ok(applyAction(c,{type:'buildShip',x:14,y:12},c.last));assert.deepEqual(c,snapshot);
 assert.deepEqual(shipCost(3),{wood:1200,copper:300,gold:120,food:240});
});
test('damaged dock pauses construction; absent funds never queue or charge',()=>{
 const c=fixture();c.res.wood=399;const before=structuredClone(c);assert.ok(applyAction(c,{type:'buildShip',x:14,y:12},0));assert.deepEqual(c,before);
 c.res.wood=500;assert.equal(applyAction(c,{type:'buildShip',x:14,y:12},0),null);c.b[idx(14,12)].burned=true;settle(c,90_000);assert.equal(c.transportShips,undefined);
 c.b[idx(14,12)].burned=false;settle(c,180_000);assert.equal(c.transportShips,1);
});
test('soldiers cross visible dock-connected rivers aboard reserved transports, and cannot be redirected midstream',()=>{
 const c=fixture();assert.ok(applyAction(c,{type:'moveSoldier',id:'club:0',x:22,y:10},0));
 c.transportShips=1;assert.equal(applyAction(c,{type:'moveSoldier',id:'club:0',x:22,y:10},0),null);
 assert.ok(c.homeOrders!['club:0'].route.some(i=>c.t[i]===R));assert.equal(shipsFree(c),0);
 assert.ok(applyAction(c,{type:'moveSoldier',id:'club:1',x:22,y:10},0));
 let sailingAt=0;for(let t=0;t<10000;t+=100){const p=homeSoldiers(c,t)[0];if(c.t[idx(Math.floor(p.x),Math.floor(p.y))]===R){sailingAt=t;break;}}
 assert.ok(sailingAt);assert.ok(applyAction(c,{type:'moveSoldier',id:'club:0',x:10,y:20},sailingAt));
 const landed=homeSoldiers(c,20000)[0];assert.equal(landed.x,22.5);assert.equal(landed.y,10.5);
 const booking=c.ferryBookings![0];assert.deepEqual(returningFerries(c,booking.arrive!-1),[]);
 const returning=returningFerries(c,(booking.arrive!+booking.back)/2)[0];assert.ok(returning);assert.ok(returning.x>10&&returning.x<22.5);assert.equal(returning.face,-1);
 assert.deepEqual(returningFerries(c,booking.back),[]);
 settle(c,30000);assert.equal(shipsFree(c),1);
});
test('armies need enough boats, keep reservations through combat/return, and never ford rivers without ships',()=>{
 const c=fixture();c.camps=[{id:1,at:idx(22,10),power:0,loot:{},cleared:false,respawnAt:null}];
 assert.equal(expeditionPlan(c,idx(22,10),{club:12}),null);c.transportShips=1;assert.equal(expeditionPlan(c,idx(22,10),{club:12}),null);
 c.transportShips=2;assert.equal(shipsNeeded({club:11,elephant:3,wagon:4,medic:1}),7);
 assert.equal(applyAction(c,{type:'attack',camp:1,units:{club:12}},0),null);assert.equal(c.exps[0].ships,2);assert.equal(shipsFree(c),0);
 const end=c.exps[0].arrive*2+5000;settle(c,end);assert.equal(c.exps.length,0);assert.equal(shipsFree(c),2);assert.equal(c.army.club,12);
 const damaged=fixture();damaged.transportShips=2;damaged.b[idx(14,12)].flooded=true;assert.equal(expeditionPlan(damaged,idx(22,10)),null);
});
test('combat troops really cross rivers with sufficient transports, remain blocked without them, and replay deterministically',()=>{
 const attacker=fixture(),defender=fixture();defender.b={[idx(30,30)]:{k:'hall',lvl:1,doneAt:null}};defender.army={};defender.t.fill(G);
 for(let y=0;y<H;y++)defender.t[idx(15,y)]=R;
 const make=(ships:number)=>{const s=createBattle({id:'naval',attackerId:'a',defenderId:'d',attacker,defender,troops:{club:10},attackerShips:ships,now:0});s.groups[0].x=10.5;s.groups[0].y=10.5;commandBattle(s,'attacker',{type:'move',groupId:s.groups[0].id,x:22.5,y:10.5});return s;};
 const noBoat=make(0);advanceBattle(noBoat,10000);assert.ok(noBoat.groups[0].x<15);
 const boat=make(1),online=structuredClone(boat);advanceBattle(boat,10000);for(let t=100;t<=10000;t+=100)advanceBattle(online,t);assert.deepEqual(boat,online);assert.ok(boat.groups[0].x>18);assert.equal(boat.groups[0].count,10);
 defender.t[idx(15,10)]=HL;const rock=make(1);advanceBattle(rock,1000);assert.ok(rock.groups[0].x<15);
});
test('transport passengers land before attacking shoreline buildings',()=>{
 const c=fixture(),defender=fixture();defender.t.fill(G);for(let y=0;y<H;y++)defender.t[idx(15,y)]=R;
 defender.b={[idx(16,10)]:{k:'hall',lvl:1,doneAt:null}};defender.army={};
 const s=createBattle({id:'landing',attackerId:'a',defenderId:'d',attacker:c,defender,troops:{club:2},attackerShips:1,now:0});
 const g=s.groups[0];g.x=15.5;g.y=10.5;const hp=s.buildings[0].hp;
 advanceBattle(s,100);assert.equal(s.buildings[0].hp,hp);
 advanceBattle(s,3000);assert.notEqual(s.terrain[idx(Math.floor(g.x),Math.floor(g.y))],R);assert.ok(s.buildings[0].hp<hp);
});
