// @ts-expect-error Bun runtime API
import {test,expect} from 'bun:test';
import {newCity,G,R,H,idx,settle,applyAction,dockRelocationPlan,canPlace,derive,shipCapacity,shipsFree,isBuildingActive,type City} from './engine';
const source=idx(14,12),target=idx(19,12);
function fixture(){
 const c=newCity(0,123);c.t.fill(G);c.seen.fill(1);c.people=[];c.pop=0;c.b={};c.camps=[];c.herds=[];c.era=2;c.transportShips=2;c.res={food:1000,wood:1000,stone:0,copper:0,gold:0,diamond:0,coal:0,aetherCrystal:0,rune:0,essence:0,celestialStone:0};
 for(let y=0;y<H;y++)c.t[idx(20,y)]=R;
 c.b[source]={k:'dock',lvl:2,doneAt:null,shipQueue:[90000]};
 return c;
}
test('a legacy dock off the bank becomes stranded, cannot build ships and keeps fleet/queue',()=>{
 const c=fixture();settle(c,1000);
 expect(c.b[source].stranded).toBe(true);expect(isBuildingActive(c.b[source])).toBe(false);
 expect(shipCapacity(c)).toBe(0);expect(shipsFree(c)).toBe(0);expect(c.transportShips).toBe(2);
 expect(c.b[source].shipQueue![0]).toBe(91000);
 expect(applyAction(c,{type:'buildShip',x:14,y:12},1000)).toContain('mắc cạn');
 expect(c.log.filter(e=>e.msg.includes('mắc cạn')).length).toBe(1);
});
test('relocation charges by distance and level once, takes a builder, preserves progress and level on completion',()=>{
 const c=fixture(),plan=dockRelocationPlan(c,source,target);
 expect(plan.error).toBeNull();expect(plan.distance).toBe(5);expect(plan.cost).toEqual({wood:280,food:140});
 expect(dockRelocationPlan(c,source,idx(19,20)).cost.wood).toBeGreaterThan(plan.cost.wood!);
 expect(applyAction(c,{type:'relocateDock',x:14,y:12,to:target},0)).toBeNull();
 expect(c.res.wood).toBe(720);expect(c.res.food).toBe(860);expect(c.b[source]).toBeUndefined();expect(c.b[target].doneAt).toBe(80000);
 expect(applyAction(c,{type:'relocateDock',x:19,y:12,to:source},0)).toContain('đang');
 settle(c,80000);expect(c.b[target].lvl).toBe(2);expect(c.b[target].doneAt).toBeNull();expect(c.b[target].relocation).toBeUndefined();expect(c.b[target].stranded).toBe(false);
 expect(c.transportShips).toBe(2);expect(c.b[target].shipQueue!.length).toBe(1);
 settle(c,170000);expect(c.transportShips).toBe(3);
});
test('invalid destinations or insufficient funds cannot charge or move a dock',()=>{
 for(const to of [source,idx(18,12),idx(20,12)]){
  const c=fixture();settle(c,0);const before=structuredClone(c);
  expect(applyAction(c,{type:'relocateDock',x:14,y:12,to},0)).toBeTruthy();expect(c).toEqual(before);
 }
 const c=fixture();settle(c,0);c.res.food=0;const before=structuredClone(c);
 expect(applyAction(c,{type:'relocateDock',x:14,y:12,to:target},0)).toBeTruthy();expect(c).toEqual(before);
});
test('offline completion matches small settlements, and a destination drying out stays inactive',()=>{
 const c=fixture();applyAction(c,{type:'relocateDock',x:14,y:12,to:target},0);
 const online=structuredClone(c);settle(c,80000);for(let t=1000;t<=80000;t+=1000)settle(online,t);expect(c).toEqual(online);
 const dry=fixture();applyAction(dry,{type:'relocateDock',x:14,y:12,to:target},0);dry.t.fill(G);settle(dry,80000);expect(dry.b[target].stranded).toBe(true);expect(shipCapacity(dry)).toBe(0);
});

test('relocating at or above the dock limit replaces a dock and still enforces destination and builder rules',()=>{
 for(const total of [3,4]){
  const c=fixture();
  for(let n=1;n<total;n++)c.b[idx(14,12+n)]={k:'dock',lvl:1,doneAt:null};
  const before=structuredClone(c);
  expect(dockRelocationPlan(c,source,target).error).toBeNull();expect(c).toEqual(before);
  expect(canPlace(c,derive(c),'dock',19,18,undefined,true)).toContain('tối đa (3)');
  expect(dockRelocationPlan(c,source,idx(18,12)).error).toContain('sát sông');
  c.b[target]={k:'hut',lvl:1,doneAt:null};expect(dockRelocationPlan(c,source,target).error).toContain('đã có công trình');delete c.b[target];
  expect(applyAction(c,{type:'relocateDock',x:14,y:12,to:target},0)).toBeNull();
  expect(Object.values(c.b).filter(b=>b.k==='dock').length).toBe(total);expect(c.b[source]).toBeUndefined();
  expect(c.b[target].lvl).toBe(2);expect(c.transportShips).toBe(2);expect(c.res.wood).toBe(720);
 }
 const c=fixture();
 for(let n=1;n<=3;n++)c.b[idx(14,12+n)]={k:'hut',lvl:0,doneAt:10000};
 expect(dockRelocationPlan(c,source,target).error).toContain('thợ đang bận');
});

test('healthy docks require the office through both actions; stranded rescue stays available',()=>{
 for(const type of ['relocateDock','relocateBuilding'] as const){
  const c=fixture();delete c.b[source];c.b[target]={k:'dock',lvl:1,doneAt:null};
  expect(applyAction(c,{type,x:19,y:12,to:idx(19,14)},0)).toContain('Ty');
  c.b[idx(10,10)]={k:'relocationoffice',lvl:1,doneAt:null};
  expect(applyAction(c,{type,x:19,y:12,to:idx(19,14)},0)).toBeNull();
 }
});
