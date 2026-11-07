// @ts-expect-error Bun runtime API
import {test,expect} from 'bun:test';
import {newCity,G,idx,settle,type City} from './engine';
function fixture(){const c=newCity(0,123);c.t.fill(G);c.seen.fill(1);c.people=[];c.pop=0;c.b={};c.herds=[];c.camps=[];c.wildernessAt=1e12;c.b[idx(40,40)]={k:'house',lvl:1,doneAt:null};c.disaster={kind:'earthquake',at:2000,level:0,center:idx(40,40)};return c;}
test('offline disaster reports carry affected tiles and survive economic log eviction and reload',()=>{
 const c=fixture();settle(c,3000);
 const impact=c.disasterNotices!.find(n=>n.phase==='impact')!;
 expect(impact.kind).toBe('earthquake');expect(impact.tiles).toEqual([idx(40,40)]);expect(impact.msg).toContain('Nhà');
 expect(c.disasterNotices!.some(n=>n.phase==='warning')).toBe(true);
 c.log=[];const saved=JSON.parse(JSON.stringify(c)) as City;settle(saved,4000);
 expect(saved.disasterNotices).toEqual(c.disasterNotices);
});
test('online and offline polling produce identical reports without duplicate delivery',()=>{
 const offline=fixture(),online=structuredClone(offline);settle(offline,3000);for(let at=1000;at<=3000;at+=1000)settle(online,at);
 expect(online).toEqual(offline);settle(online,4000);expect(online.disasterNotices).toEqual(offline.disasterNotices);
});
test('disaster inbox is bounded at 30 records while keeping the newest reports',()=>{
 const c=fixture();for(let n=1;n<=35;n++){c.b[idx(40,40)].burned=false;c.disaster={kind:'earthquake',at:n*1000,level:0,center:idx(40,40),warned:true};settle(c,n*1000);}
 expect(c.disasterNotices!.length).toBe(30);expect(c.disasterNotices![0].at).toBe(35000);expect(c.disasterNotices!.at(-1)!.at).toBe(6000);
});
