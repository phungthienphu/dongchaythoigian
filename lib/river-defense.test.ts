// @ts-expect-error Bun runtime API
import {test,expect} from 'bun:test';
import {newCity,G,R,H,W,idx,riverSet,SEASON_MS,settle,derive,type City} from './engine';
function fixture(){
 const c=newCity(0,123);c.era=2;c.t.fill(G);c.seen.fill(1);c.b={};c.people=[];c.pop=0;c.herds=[];c.camps=[];
 c.camp=idx(60,48);c.xs=Array(H).fill(40);for(const i of riverSet(c.xs))c.t[i]=R;
 c.t0=1000-2*SEASON_MS;c.seasonIdx=1;c.shift={warn:0,at:2,xs:Array(H).fill(44),done:false};
 c.wildernessAt=1e12;c.disaster={kind:'earthquake',at:1e12,level:0,center:c.camp};return c;
}
test('a river shift cannot erase land/buildings protected by active dikes',()=>{
 const c=fixture(),home=idx(44,48);c.b[home]={k:'house',lvl:1,doneAt:null};c.b[idx(43,48)]={k:'levee',lvl:1,doneAt:null};
 const protectedLand=derive(c).prot,old=riverSet(c.xs);
 expect(protectedLand[home]).toBe(true);settle(c,1000);
 expect(c.b[home]?.k).toBe('house');expect(c.t[home]).not.toBe(R);
 expect([...riverSet(c.xs)].filter(i=>!old.has(i)&&protectedLand[i])).toEqual([]);
});
test('broken and unfinished dikes do not protect a saved forecast',()=>{
 for(const damage of [{burned:true},{flooded:true},{lvl:0,doneAt:5000}]){
  const c=fixture();c.b[idx(44,48)]={k:'house',lvl:1,doneAt:null};c.b[idx(43,48)]={k:'levee',lvl:1,doneAt:null,...damage};settle(c,1000);
  expect(c.b[idx(44,48)]).toBeUndefined();expect(c.shift!.done).toBe(true);
 }
});
test('a newly finished dike revises a saved forecast before the river event',()=>{
 const c=fixture();c.t0=0;c.seasonIdx=0;c.shift!.at=2;c.b[idx(43,48)]={k:'levee',lvl:0,doneAt:1000};
 settle(c,1000);const protectedLand=derive(c).prot,old=riverSet(c.xs);
 expect(c.shift!.done).toBe(false);expect([...riverSet(c.shift!.xs!)].filter(i=>!old.has(i)&&protectedLand[i])).toEqual([]);
 expect(c.log.some(e=>e.msg.includes('tính lại'))).toBe(true);
});
test('a dock engulfed by the new river remains salvageable with its level and ship queue',()=>{
 const c=fixture();const dock=idx(44,48);c.b[dock]={k:'dock',lvl:2,doneAt:null,shipQueue:[90000]};c.transportShips=2;settle(c,1000);
 expect(c.b[dock]?.k).toBe('dock');expect(c.b[dock]?.lvl).toBe(2);expect(c.b[dock]?.stranded).toBe(true);expect(c.b[dock]?.flooded).toBe(true);expect(c.transportShips).toBe(2);expect(c.b[dock].shipQueue!.length).toBe(1);
});
test('a fully protected migration corridor keeps the original river course',()=>{
 const c=fixture(),old=[...c.xs];
 for(let y=27;y<=69;y+=3)for(let x=30;x<=54;x+=3){const i=idx(x,y);if(c.t[i]!==R)c.b[i]={k:'levee',lvl:1,doneAt:null};}
 settle(c,1000);expect(c.xs).toEqual(old);expect(c.shift!.done).toBe(true);expect(c.log.some(e=>e.msg.includes('giữ được dòng sông cũ'))).toBe(true);
});
test('reinforcing the existing river bank also prevents a protected dock from losing its water',()=>{
 const c=fixture(),dock=idx(39,48);c.b[dock]={k:'dock',lvl:1,doneAt:null};c.b[idx(39,47)]={k:'levee',lvl:1,doneAt:null};
 const old=riverSet(c.xs),protection=derive(c).prot;settle(c,1000);
 expect(c.b[dock].stranded).not.toBe(true);expect(c.t[idx(40,48)]).toBe(R);
 expect([...old].filter(i=>protection[i]&&c.t[i]!==R)).toEqual([]);
});
