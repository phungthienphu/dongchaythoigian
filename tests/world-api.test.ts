// Isolated process: these routes use an in-memory database, never the configured MongoDB.
// @ts-expect-error Bun provides this runtime API; application TypeScript uses Node types.
import { mock, test, expect } from 'bun:test';
import { newCity, idx, type City } from '../lib/engine';
const now=Date.now();
const mine={_id:'me',name:'Mine',owner:'u-me',world:{x:10,y:10},state:newCity(now,1),ver:1};
const friend={_id:'friend',name:'Secret friend',owner:'u-friend',world:{x:91,y:87},state:newCity(now,2),ver:1};
const stranger={_id:'stranger',name:'Secret stranger',owner:'u-other',world:{x:72,y:84},state:newCity(now,3),ver:1};
const docs=[mine,friend,stranger];
let friends=['u-friend'];
function matches(doc:Record<string,unknown>,query:Record<string,unknown>):boolean {
 return Object.entries(query).every(([k,v])=>{
  if(v&&typeof v==='object'){
   const q=v as Record<string,unknown>;
   if('$in' in q)return (q.$in as unknown[]).includes(doc[k]);
   if('$ne' in q)return doc[k]!==q.$ne;
   if('$exists' in q)return (doc[k]!==undefined)===q.$exists;
  }
  return doc[k]===v;
 });
}
const cityCol={find:(q:Record<string,unknown>)=>({toArray:async()=>docs.filter(d=>matches(d,q))}),findOne:async(q:Record<string,unknown>)=>docs.find(d=>matches(d,q))??null,updateOne:async()=>({modifiedCount:1})};
const userDocs=[{_id:'u-me',name:'Me',friends},{_id:'u-friend',name:'Friend',friends:['u-me']},{_id:'u-other',name:'Other',friends:[]}];
const userCol={find:(q:Record<string,unknown>)=>({toArray:async()=>userDocs.filter(d=>matches(d,q))}),findOne:async(q:Record<string,unknown>)=>userDocs.find(d=>matches(d,q))??null};
mock.module('../lib/db',()=>({cities:async()=>cityCol,users:async()=>userCol}));
mock.module('../lib/auth',()=>({currentUser:async()=>({_id:'u-me',cityId:'me',friends})}));
mock.module('../lib/city-store',()=>({playerId:async()=>'me',withCity:async(_pid:string,fn:(c:City,t:number)=>unknown)=>({doc:mine,result:fn(mine.state,now),now})}));
const world=await import('../app/api/world/route');
const envoy=await import('../app/api/world/envoy/route');
const visit=await import('../app/api/visit/[id]/route');
test('world API returns only home and explicitly discovered nations, never unknown friend coordinates',async()=>{
 let body=await (await world.GET()).json();expect(body.nations.map((n:{id:string})=>n.id)).toEqual(['me']);expect(JSON.stringify(body)).not.toContain('Secret friend');expect(JSON.stringify(body.nations)).not.toContain('"x":91');
 mine.state.discoveries=['friend'];body=await (await world.GET()).json();expect(body.nations.map((n:{id:string})=>n.id)).toEqual(['me','friend']);expect(body.nations[1].friend).toBe(true);expect(body.nations[1].x).toBe(91);mine.state.discoveries=[];
});
test('friend village API works without scouting and strips the owners world intelligence',async()=>{
 friend.state.discoveries=['stranger'];friend.state.visits={stranger:now+10000};friend.state.log=[{at:now,msg:'private'}];
 const res=await visit.GET(new Request('http://localhost/api/visit/friend'),{params:Promise.resolve({id:'friend'})});expect(res.status).toBe(200);
 const body=await res.json();expect(body.name).toBe('Secret friend');expect(body.state.discoveries).toBeUndefined();expect(body.state.visits).toBeUndefined();expect(body.state.log).toEqual([]);expect(body.world).toBeUndefined();
 friends=[];const denied=await visit.GET(new Request('http://localhost/api/visit/friend'),{params:Promise.resolve({id:'friend'})});expect(denied.status).toBe(403);friends=['u-friend'];
});
test('forging a targeted envoy to an undiscovered friend is rejected; exploration contains no hidden target',async()=>{
 mine.state.visits={};mine.state.discoveries=[];mine.state.b[idx(1,1)]={k:'envoy',lvl:1,doneAt:null};
 const request=(body:unknown)=>new Request('http://localhost/api/world/envoy',{method:'POST',body:JSON.stringify(body)});
 expect((await envoy.POST(request({target:'friend'}))).status).toBe(403);
 const res=await envoy.POST(request({explore:true}));expect(res.status).toBe(200);const body=await res.json();expect(body.state.trips[0].target).toBe('');expect(body.state.trips[0].targetName).toBe('Vùng chưa biết');expect(JSON.stringify(body)).not.toContain('Secret friend');
});
