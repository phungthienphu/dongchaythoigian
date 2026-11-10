import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newCity,G,HL,R,idx,applyAction,homeSoldiers,settle,UNITS,type City} from './engine';
import {commandBattle,createBattle,advanceBattle,battleCommandError,type BattleSide} from './battle';
import {isActionInput} from './action-input';
import {inSelection,selectionMoved,type SelectionDrag} from '../components/map-selection';

function city():City {
 const c=newCity(0,123);c.t.fill(G);c.seen.fill(1);c.b={};c.camp=idx(10,10);c.herds=[];c.camps=[];c.army={club:3,bow:2};
 c.homeOrders=Object.fromEntries(['club:0','club:1','club:2','bow:0','bow:1'].map((id,n)=>[id,{at:0,x:10.5,y:10.5+n,route:[idx(10,10+n)]}]));
 return c;
}
test('group selection works in either drag direction and rejects accidental clicks',()=>{
 const box:SelectionDrag={pointerId:1,start:{x:90,y:100},end:{x:20,y:10},additive:false};
 assert.equal(selectionMoved(box),true);assert.equal(inSelection(box,{x:90,y:10}),true);assert.equal(inSelection(box,{x:19,y:50}),false);
 assert.equal(selectionMoved({...box,end:{x:92,y:102}}),false);
});
test('bounded group command accepts mixed troop types but rejects duplicates and forged IDs',()=>{
 const a={type:'moveSoldiers',ids:['club:0','bow:1'],x:18,y:10};assert.equal(isActionInput(a),true);
 for(const ids of [[],['club:0','club:0'],['attacker:club'],['club:-1'],Array.from({length:361},(_,i)=>`club:${i}`)])assert.equal(isActionInput({...a,ids}),false);
});
test('home group routes around obstacles, keeps unselected orders, retargets continuously and persists',()=>{
 const c=city(),ids=['club:0','bow:1'];for(let y=8;y<=16;y++)c.t[idx(14,y)]=HL;
 const untouched=structuredClone(c.homeOrders!['club:1']);assert.equal(applyAction(c,{type:'moveSoldiers',ids,x:18,y:10},0),null);
 for(const id of ids)assert.ok(c.homeOrders![id].route.every(i=>c.t[i]!==HL));
 assert.deepEqual(c.homeOrders!['club:1'],untouched);
 const positions=new Map(homeSoldiers(c,777).map(s=>[s.id,s]));assert.equal(applyAction(c,{type:'moveSoldiers',ids,x:18,y:17},777),null);
 for(const s of homeSoldiers(c,777).filter(s=>ids.includes(s.id))){assert.equal(s.x,positions.get(s.id)!.x);assert.equal(s.y,positions.get(s.id)!.y);}
 const saved=JSON.parse(JSON.stringify(c));assert.deepEqual(homeSoldiers(saved,100000),homeSoldiers(c,100000));
 for(const s of homeSoldiers(c,100000).filter(s=>ids.includes(s.id))){assert.equal(s.x,18.5);assert.equal(s.y,17.5);assert.equal(s.moving,false);}
});
test('failed home group order is atomic even if only one soldier cannot reach the target',()=>{
 const c=city();for(let y=0;y<96;y++)c.t[idx(15,y)]=R;
 c.homeOrders!['bow:1']={at:0,x:20.5,y:10.5,route:[idx(20,10)]};const before=structuredClone(c.homeOrders);
 assert.ok(applyAction(c,{type:'moveSoldiers',ids:['club:0','bow:1'],x:12,y:10},0));assert.deepEqual(c.homeOrders,before);assert.equal(c.ferryBookings?.length??0,0);
 assert.ok(applyAction(c,{type:'moveSoldiers',ids:['club:0','club:9'],x:12,y:10},0));assert.deepEqual(c.homeOrders,before);
});
test('civilian group move holds manual orders instead of being autoassigned to nearby jobs',()=>{
 const c=city();c.b[idx(10,16)]={k:'gather',lvl:1,doneAt:null};
 assert.equal(applyAction(c,{type:'assign',ids:c.people.map(p=>p.id),task:{t:'move',to:idx(12,12)}},0),null);
 settle(c,30000);for(const p of c.people){assert.equal(p.task.t,'idle');assert.equal(p.pos,idx(12,12));assert.equal(p.assignment,'manual');}
});
for(const side of ['attacker','defender'] as BattleSide[])test(`${side} multiple engaged groups obey move, stop at destination and do not reacquire the old enemy en route`,()=>{
 const c=city(),s=createBattle({id:'group',attackerId:'a',defenderId:'d',attacker:c,defender:c,troops:{club:20,bow:20},now:0,defenderOnline:true});
 const ours=s.groups.filter(g=>g.side===side).slice(0,2),enemy=s.groups.find(g=>g.side!==side)!;
 for(const g of s.groups){g.x=70.5;g.y=70.5;g.order={type:'guard',x:g.x,y:g.y};}
 for(const g of ours){g.x=10.5;g.y=10.5;g.count=50;g.initial=50;g.hp=g.count*UNITS[g.u].hp;g.order={type:'attack',targetId:enemy.id};g.resumeOrder={type:'attack',targetId:enemy.id};}
 enemy.x=11;enemy.y=10.5;enemy.order={type:'guard',x:enemy.x,y:enemy.y};
 const ids=ours.map(g=>g.id),enemyHp=enemy.hp;
 assert.equal(commandBattle(s,side,{type:'move',groupIds:ids,x:5.5,y:10.5}),true);
 advanceBattle(s,100);for(const g of ours){assert.ok(g.x<10.5);assert.equal(g.order.type,'move');assert.equal(g.resumeOrder,undefined);}assert.equal(enemy.hp,enemyHp);
 const fragmented=structuredClone(s);advanceBattle(s,3000);for(let at=200;at<=3000;at+=100)advanceBattle(fragmented,at);assert.deepEqual(s,fragmented);
 for(const g of ours){assert.equal(g.x,5.5);assert.equal(g.y,10.5);assert.equal(g.order.type,'guard');}
});
test('combat group rejects enemy IDs, dead groups and partial unreachable moves without changing any order',()=>{
 const c=city(),s=createBattle({id:'group',attackerId:'a',defenderId:'d',attacker:c,defender:c,troops:{club:20},now:0,defenderOnline:true});
 const own=s.groups.filter(g=>g.side==='defender');for(let y=0;y<96;y++)s.terrain[idx(15,y)]=R;own[0].x=10.5;own[1].x=20.5;
 const before=structuredClone(s.groups),ids=own.slice(0,2).map(g=>g.id);
 assert.match(battleCommandError(s,'defender',{type:'move',groupIds:ids,x:12.5,y:10.5})!,/Không có đường/);
 assert.equal(commandBattle(s,'defender',{type:'move',groupIds:ids,x:12.5,y:10.5}),false);assert.deepEqual(s.groups,before);
 assert.equal(commandBattle(s,'defender',{type:'move',groupIds:[own[0].id,s.groups[0].id],x:12.5,y:10.5}),false);assert.deepEqual(s.groups,before);
 assert.equal(commandBattle(s,'defender',{type:'move',groupIds:[own[0].id,own[0].id],x:12.5,y:10.5}),false);
});
test('combat group attacks a common target and refuses commands after battle ends',()=>{
 const c=city(),s=createBattle({id:'group',attackerId:'a',defenderId:'d',attacker:c,defender:c,troops:{club:20,bow:20},now:0});
 const ids=s.groups.filter(g=>g.side==='attacker').map(g=>g.id),targetId=s.groups.find(g=>g.side==='defender')!.id;
 assert.equal(commandBattle(s,'attacker',{type:'attack',groupIds:ids,targetId}),true);for(const g of s.groups.filter(g=>ids.includes(g.id)))assert.deepEqual(g.order,{type:'attack',targetId});
 s.status='finished';assert.equal(commandBattle(s,'attacker',{type:'move',groupIds:ids,x:1,y:1}),false);
});
