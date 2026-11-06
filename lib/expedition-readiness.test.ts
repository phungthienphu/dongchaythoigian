import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newCity,G,R,idx,RES} from './engine';
import {expeditionReadiness} from './expedition-readiness';
function fixture(){const c=newCity(0,123);c.t.fill(G);c.seen.fill(1);c.people=[];c.herds=[];c.camps=[];c.camp=idx(10,10);c.era=3;c.b={[c.camp]:{k:'barracks' as const,lvl:3,doneAt:null},[idx(14,10)]:{k:'dock' as const,lvl:3,doneAt:null}};for(let y=0;y<96;y++)c.t[idx(15,y)]=R;for(const r of RES)c.res[r]=10000;return c;}
test('mixed army shows exact boat shortage, capacity and reserved transports without mutating city',()=>{
 const c=fixture();c.transportShips=4;c.deployedShips=2;const before=structuredClone(c);
 const r=expeditionReadiness(c,idx(20,10),{club:5,spear:1,bow:2,sword:2});
 assert.equal(r.reason,'ships');assert.equal(r.places,10);assert.equal(r.required,4);assert.equal(r.free,2);assert.ok(r.supplies!.food>0);assert.match(r.message,/Thiếu 2 thuyền: cần 4/);assert.deepEqual(c,before);
 c.transportShips=6;const enough=expeditionReadiness(c,idx(20,10),{club:5,spear:1,bow:2,sword:2});assert.equal(enough.reason,null);assert.equal(enough.plan?.ships,4);assert.ok(enough.supplies!.food>0);
});
test('land routes need no boats; absent ports and blocked exits explain different remedies',()=>{
 const c=fixture();delete c.b[idx(14,10)];assert.equal(expeditionReadiness(c,idx(12,10),{club:1}).plan?.ships,0);
 assert.equal(expeditionReadiness(c,idx(20,10),{club:1}).reason,'dock');
 for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy)c.b[idx(10+dx,10+dy)]={k:'wall',lvl:1,doneAt:null};
 assert.equal(expeditionReadiness(c,idx(20,10),{club:1}).reason,'exit');
});
test('more ships cannot cure an unexplored or disconnected route',()=>{
 const c=fixture();c.transportShips=100;for(let y=0;y<96;y++)c.seen[idx(16,y)]=0;
 const r=expeditionReadiness(c,idx(20,10),{club:1});assert.equal(r.reason,'route');assert.match(r.message,/Thêm thuyền chưa/);assert.equal(r.supplies,null);
 assert.equal(expeditionReadiness(c,idx(20,10),{}).reason,'troops');
});
