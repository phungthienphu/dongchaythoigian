import test from 'node:test';
import assert from 'node:assert/strict';
import {newCity,idx,R,F,W,H,settle,type City} from './engine';
import {stepZombies,zombiePath,zombieWave} from './zombies';
function fixture(){const c=newCity(0,123);c.era=6;c.t.fill(0);c.seen.fill(1);c.b={};c.army={};c.people=[];c.pop=0;c.camps=[];c.herds=[];c.zombies!.nextAt=1000;c.zombies!.warning=idx(50,50);c.zombies!.peaks=[{at:0,pop:680}];return c;}

test('a wave scatters locally without crossing walls, fog, water, trees, people or buildings',()=>{
 const c=fixture(),origin=idx(50,50),occupied=idx(50,51);c.people=[{id:1,name:'QA',pos:occupied,task:{t:'idle'}}];c.pop=1;
 for(let y=0;y<H;y++)c.b[idx(51,y)]={k:'wall',lvl:1,doneAt:null};
 c.t[idx(49,50)]=R;c.t[idx(50,49)]=F;c.seen[idx(49,49)]=0;
 stepZombies(c,1000);const actors=c.zombies!.actors;
 assert.equal(actors.length,zombieWave(680,6,1).total);assert.ok(new Set(actors.map(z=>idx(Math.floor(z.x),Math.floor(z.y)))).size>1);
 assert.equal(idx(Math.floor(actors[0].x),Math.floor(actors[0].y)),origin);
 for(const z of actors){const x=Math.floor(z.x),y=Math.floor(z.y),tile=idx(x,y);assert.ok(Math.abs(x-50)+Math.abs(y-50)<=2);assert.ok(x<51);assert.equal(c.t[tile],0);assert.equal(c.seen[tile],1);assert.equal(c.b[tile],undefined);assert.notEqual(tile,occupied);assert.ok(z.nextHit>=z.emergesAt!);}
 const gaps=actors.slice(1).map((z,n)=>z.emergesAt!-actors[n].emergesAt!);assert.ok(new Set(gaps).size>1);assert.ok(gaps.every(ms=>ms>=250&&ms<=650));
});

test('a sealed crack keeps its wave inside instead of teleporting through the enclosure',()=>{
 const c=fixture();for(const [x,y]of [[49,50],[51,50],[50,49],[50,51]])c.b[idx(x,y)]={k:'wall',lvl:1,doneAt:null};
 stepZombies(c,1000);for(const z of c.zombies!.actors){assert.equal(Math.floor(z.x),50);assert.equal(Math.floor(z.y),50);}
});

test('individual routes vary and avoid crowds while respecting a single bridge and sealed barriers',()=>{
 const c=fixture(),from=idx(10,10),to=idx(20,20),empty=new Map<number,number>();
 const routes=Array.from({length:8},(_,seed)=>zombiePath(c,from,to,[],100,false,undefined,{seed,crowd:empty})!);
 assert.ok(new Set(routes.map(r=>r.join(','))).size>1);
 const crowd=new Map<number,number>();for(let x=11;x<20;x++)crowd.set(idx(x,10),4);
 const bypass=zombiePath(c,from,idx(20,10),[],100,false,undefined,{seed:7,crowd})!;assert.ok(bypass.some(tile=>Math.floor(tile/W)!==10));
 for(let y=0;y<H;y++)c.t[idx(15,y)]=R;
 assert.equal(zombiePath(c,from,to,[],100,false,undefined,{seed:7,crowd:empty}),null);
 const bridge=idx(15,15),route=zombiePath(c,from,to,[],100,false,new Set([bridge]),{seed:7,crowd:empty})!;
 assert.ok(route.includes(bridge));for(let n=1;n<route.length;n++){assert.equal(Math.abs(route[n]%W-route[n-1]%W)+Math.abs(Math.floor(route[n]/W)-Math.floor(route[n-1]/W)),1);}
});

test('spread, headings and movement replay identically after a saved split and with offline settlement',()=>{
 const c=fixture();c.b[idx(44,48)]={k:'house',lvl:1,doneAt:null};c.b[idx(44,52)]={k:'house',lvl:1,doneAt:null};c.b[idx(43,50)]={k:'house',lvl:1,doneAt:null};
 const replay=structuredClone(c);for(let at=1000;at<=90000;at+=1000)stepZombies(c,at);
 for(let at=1000;at<=17000;at+=1000)stepZombies(replay,at);const loaded=JSON.parse(JSON.stringify(replay)) as City;
 for(let at=18000;at<=90000;at+=1000)stepZombies(loaded,at);assert.deepEqual(loaded,c);
 const online=fixture();online.b[idx(44,50)]={k:'house',lvl:1,doneAt:null};settle(online,0);const offline=structuredClone(online);
 for(let at=1000;at<=60000;at+=1000)settle(online,at);settle(offline,60000);assert.deepEqual(offline,online);
});

test('distant zombies advance toward the village and hold their target without reversing',()=>{
 const c=fixture();c.zombies!.nextAt=1000000;c.b[idx(50,10)]={k:'house',lvl:3,doneAt:null};
 c.zombies!.actors=[{id:1,kind:'normal',hp:90,maxHp:90,x:10.5,y:10.5,era:6,until:100000,nextHit:0,repath:0}];
 let previous=10.5;
 for(let at=1000;at<=10000;at+=1000){stepZombies(c,at);const z=c.zombies!.actors[0];assert.equal(z.target,'b:'+idx(50,10));assert.ok(z.x>=previous);previous=z.x;}
 assert.ok(previous>13);
});

function attacker(c:City,x:number,y:number){c.zombies!.nextAt=1000000;c.zombies!.actors=[{id:1,kind:'normal',hp:90,maxHp:90,x:x+.5,y:y+.5,era:6,until:100000,nextHit:0,repath:0}];}
test('failed pursuit switches across the reachable bank instead of holding a closer target across water',()=>{
 const c=fixture();for(let y=0;y<H;y++)c.t[idx(15,y)]=R;
 const blocked=idx(16,10),reachable=idx(10,30);c.b[blocked]={k:'house',lvl:3,doneAt:null};c.b[reachable]={k:'house',lvl:3,doneAt:null};attacker(c,10,10);
 for(let at=1000;at<=20000;at+=1000){stepZombies(c,at);const z=c.zombies!.actors[0];assert.equal(z.target,'b:'+reachable);assert.ok(z.x<15);}
 assert.ok(c.zombies!.actors[0].y>16);assert.equal(c.b[blocked].zombieDamage,undefined);
});
test('zombies attack a reachable blocking structure rather than an enclosed inner target',()=>{
 const c=fixture(),inner=idx(20,20);c.b[inner]={k:'house',lvl:3,doneAt:null};
 for(let x=17;x<=23;x++)for(let y=17;y<=23;y++)if(x===17||x===23||y===17||y===23)c.b[idx(x,y)]={k:'wall',lvl:3,doneAt:null};
 attacker(c,14,20);c.zombies!.actors[0].target='b:'+inner;c.zombies!.actors[0].targetUntil=100000;
 for(let at=1000;at<=12000;at+=1000)stepZombies(c,at);
 assert.ok(Object.values(c.b).some(b=>b.k==='wall'&&(b.zombieDamage??0)>0));assert.equal(c.b[inner].zombieDamage,undefined);
});
test('an isolated zombie never teleports through a river and resumes after a crossing opens',()=>{
 const c=fixture();for(let y=0;y<H;y++)c.t[idx(15,y)]=R;c.b[idx(18,10)]={k:'house',lvl:3,doneAt:null};attacker(c,10,10);
 for(let at=1000;at<=5000;at+=1000)stepZombies(c,at);assert.equal(c.zombies!.actors[0].x,10.5);
 c.t[idx(15,10)]=0;for(let at=6000;at<=30000;at+=1000)stepZombies(c,at);
 assert.ok((c.b[idx(18,10)].zombieDamage??0)>0);
});

test('fallback pursuit replays identically after saving and loading',()=>{
 const c=fixture();for(let y=0;y<H;y++)c.t[idx(15,y)]=R;c.b[idx(16,10)]={k:'house',lvl:3,doneAt:null};c.b[idx(10,30)]={k:'house',lvl:3,doneAt:null};attacker(c,10,10);
 for(let at=1000;at<=7000;at+=1000)stepZombies(c,at);const saved=JSON.parse(JSON.stringify(c)) as City;
 for(let at=8000;at<=30000;at+=1000){stepZombies(c,at);stepZombies(saved,at);}assert.deepEqual(saved,c);
});
