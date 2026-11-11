import test from 'node:test';
import assert from 'node:assert/strict';
import {newCity,applyAction,settle,idx,G,F,HL,MIN,type City,type Mix} from './engine';
const wood:Mix={food:0,wood:100,stone:0,copper:0,gold:0,diamond:0,coal:0,aetherCrystal:0,rune:0,essence:0};
function fixture():City {
 const c=newCity(0,123);c.t.fill(G);c.seen.fill(1);c.camp=idx(20,20);
 c.b={[idx(19,20)]:{k:'hall',lvl:3,doneAt:null}};c.herds=[];c.camps=[];c.army={};
 c.people=c.people.slice(0,4);c.pop=c.people.length;
 for(const p of c.people){p.pos=c.camp;p.task={t:'idle'};delete p.haul;}
 c.res={food:1000,wood:1000,stone:1000,copper:1000,gold:0,diamond:0,coal:0,aetherCrystal:0,rune:0,essence:0};
 c.t[idx(22,20)]=F;c.t[idx(20,22)]=HL;
 return c;
}
test('enabling auto assigns idle workers immediately at the saved mix',()=>{
 const c=fixture();assert.equal(applyAction(c,{type:'auto',on:true,mix:{...wood,wood:50,stone:50}},0),null);
 assert.equal(c.people.filter(p=>p.task.t==='chop').length,2);
 assert.equal(c.people.filter(p=>p.task.t==='mine').length,2);
});
test('finishing a building does not override the auto mix for idle villagers',()=>{
 const c=fixture();c.auto={on:true,mix:wood};c.b[idx(21,21)]={k:'gather',lvl:0,doneAt:500};
 settle(c,1000);assert.ok(c.people.every(p=>p.task.t==='chop'));
});
test('auto skips exhausted or tending farms and extractors without a source',()=>{
 for(const tending of [false,true]){
  const c=fixture();c.b[idx(21,20)]={k:'farm',lvl:1,doneAt:null,fertility:tending?600:0,...(tending?{tendUntil:30_000}:{})};
  c.b[idx(23,20)]={k:'gather',lvl:1,doneAt:null};
  c.people=c.people.slice(0,2);c.auto={on:true,mix:{...wood,wood:0,food:100}};settle(c,1000);
  assert.ok(c.people.every(p=>p.task.t==='work'&&p.task.at===idx(23,20)));
 }
 const c=fixture();c.b[idx(30,20)]={k:'wood',lvl:1,doneAt:null};c.auto={on:true,mix:wood};settle(c,1000);
 assert.ok(c.people.every(p=>p.task.t==='chop'));
});
test('auto skips an enclosed source and chooses a reachable alternative',()=>{
 const c=fixture(),blocked=idx(22,20);for(let y=19;y<=21;y++)for(let x=21;x<=23;x++)if(idx(x,y)!==blocked)c.b[idx(x,y)]={k:'wall',lvl:1,doneAt:null};
 c.t[idx(20,24)]=F;c.auto={on:true,mix:wood};settle(c,1000);
 assert.ok(c.people.every(p=>p.task.t==='chop'&&p.task.at===idx(20,24)));
});
test('saving a mix preserves existing jobs, exploration, refuge and carried cargo',()=>{
 const c=fixture();c.people[0].task={t:'mine',at:idx(20,22)};
 c.people[1].task={t:'explore',from:c.camp,to:idx(30,30),start:0};
 c.people[2].refuge={route:[c.camp],at:0,arrive:0,pausedAt:0,x:20.5,y:20.5};
 c.people[3].haul={phase:'unload',tile:c.camp,route:[c.camp],at:0,nextAt:1000,routeStart:0,carried:10,resource:'stone',capacity:10,taskKey:'idle'};
 assert.equal(applyAction(c,{type:'auto',on:true,mix:wood},0),null);
 assert.equal(c.people[0].task.t,'mine');assert.equal(c.people[1].task.t,'explore');assert.equal(c.people[2].task.t,'idle');
 assert.equal(c.people[3].task.t,'chop');assert.equal(c.people[3].haul?.carried,10);
});
test('all-zero enabled mix is rejected and disabled auto leaves idle workers alone',()=>{
 const c=fixture();assert.ok(applyAction(c,{type:'auto',on:true,mix:{...wood,wood:0}},0));assert.ok(!c.auto?.on);
 assert.equal(applyAction(c,{type:'auto',on:false,mix:wood},0),null);settle(c,1000);assert.ok(c.people.every(p=>p.task.t==='idle'));
});
test('automatic allocation settles identically online and offline',()=>{
 const a=fixture();a.auto={on:true,mix:{...wood,wood:50,stone:50}};const b=structuredClone(a);
 settle(a,MIN);for(let at=137;at<MIN;at+=1731)settle(b,at);settle(b,MIN);assert.deepEqual(a,b);
});
test('new villagers follow the mix instead of filling an unrelated empty building',()=>{
 const c=fixture();c.auto={on:true,mix:wood};
 c.b[idx(21,21)]={k:'gather',lvl:1,doneAt:null};c.popAcc=.9999;
 for(const p of c.people)p.task={t:'chop',at:idx(22,20)};
 const count=c.people.length;settle(c,1000);assert.equal(c.people.length,count+1);assert.equal(c.people.at(-1)?.task.t,'chop');
});
test('missing sources leave villagers idle; finding a source lets them resume allocation',()=>{
 const c=fixture();c.t[idx(22,20)]=G;c.auto={on:true,mix:wood};settle(c,1000);assert.ok(c.people.every(p=>p.task.t==='idle'));
 c.t[idx(22,20)]=F;settle(c,2000);assert.ok(c.people.every(p=>p.task.t==='chop'));
});
test('idle workers prefer a source near their current position',()=>{
 const c=fixture();c.people=c.people.slice(0,1);c.people[0].pos=idx(35,20);c.t[idx(34,20)]=F;
 assert.equal(applyAction(c,{type:'auto',on:true,mix:wood},0),null);assert.deepEqual(c.people[0].task,{t:'chop',at:idx(34,20)});
});
