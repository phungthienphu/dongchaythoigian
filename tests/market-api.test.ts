// Transactional in-memory test database. Never touches live villages or notifications.
// @ts-expect-error Bun test module
import {mock,test,expect} from 'bun:test';
import {newCity,G,idx,troopCount} from '../lib/engine';
let pid:string|null='seller',failWrite=false;
let hints:string[]=[];
const now=Date.now();
let tables:Record<string,any[]>={cities:[],orders:[],ships:[]};
const value=(d:any,key:string)=>key.split('.').reduce((a,k)=>a?.[k],d);
function matches(d:any,q:any):boolean{return Object.entries(q).every(([k,v]:any)=>k==='$or'?v.some((p:any)=>matches(d,p)):v&&typeof v==='object'?Object.entries(v).every(([op,x]:any)=>op==='$ne'?value(d,k)!==x:op==='$in'?x.includes(value(d,k)):false):value(d,k)===v);}
const collection=(name:string)=>({
 findOne:async(q:any)=>structuredClone(tables[name].find(d=>matches(d,q))??null),
 countDocuments:async(q:any)=>tables[name].filter(d=>matches(d,q)).length,
 find:(q:any)=>{let rows=tables[name].filter(d=>matches(d,q));const cursor={sort:(sort:any)=>{rows.sort((a,b)=>{for(const [key,dir]of Object.entries(sort)){const delta=(value(a,key)??0)-(value(b,key)??0);if(delta)return delta*(dir as number);}return 0;});return cursor;},limit:(n:number)=>{rows=rows.slice(0,n);return cursor;},toArray:async()=>structuredClone(rows)};return cursor;},
 insertOne:async(d:any)=>{if(tables[name].some(r=>r._id===d._id))throw new Error('duplicate');tables[name].push(structuredClone(d));},
 replaceOne:async(q:any,d:any)=>{const i=tables[name].findIndex(r=>matches(r,q));if(i>=0)tables[name][i]=structuredClone(d);},
 updateOne:async(q:any,u:any)=>{if(failWrite&&name==='cities')throw new Error('simulated write failure');const d=tables[name].find(r=>matches(r,q));if(!d)return{matchedCount:0};for(const [k,v]of Object.entries(u.$set??{}))d[k]=structuredClone(v);for(const [k,v]of Object.entries(u.$inc??{}))d[k]=(d[k]??0)+(v as number);return{matchedCount:1};},
});
let queue=Promise.resolve();
const session=()=>({withTransaction:async(fn:()=>Promise<any>)=>{let release!:()=>void;const previous=queue;queue=new Promise(r=>{release=r;});await previous;const before=structuredClone(tables);try{return await fn();}catch(e){tables=before;throw e;}finally{release();}},endSession:async()=>{}});
mock.module('../lib/db',()=>({cities:async()=>collection('cities'),marketOrders:async()=>collection('orders'),caravans:async()=>collection('ships'),mongoClient:async()=>({startSession:session})}));
mock.module('../lib/war',()=>({warConfigured:()=>true,workerRequest:async(path:string)=>{hints.push(path);},socketUrl:()=> 'wss://worker.example/market-feed'}));
mock.module('../lib/city-store',()=>({battlePlayerId:async()=>pid}));
const {marketAction,advanceCaravan,marketData}=await import('../lib/market');
const api=await import('../app/api/market/route');
function reset(){hints=[];failWrite=false;pid='seller';tables={cities:['seller','buyer','raider','other'].map((id,n)=>{const c=newCity(now,1);c.t.fill(G);c.seen.fill(1);c.b={[idx(20,20)]:{k:'market',lvl:1,doneAt:null},[idx(22,20)]:{k:'barracks',lvl:3,doneAt:null}};c.era=2;c.camp=idx(19,20);c.res={food:10000,wood:200,stone:200,copper:0,gold:100,diamond:20};c.army={club:20,sword:20};c.discoveries=['seller','buyer'];c.shieldUntil=now+999999;return{_id:id,name:id,owner:id,ver:0,state:c,world:{x:40+n*10,y:40}};}),orders:[],ships:[]};}
const city=(id:string)=>tables.cities.find(d=>d._id===id).state;
const create=(requestId='create_123',escorts={})=>marketAction('seller',{type:'create',resource:'stone',amount:100,currency:'gold',price:20,escorts,requestId});
const buy=(requestId='buy_12345',buyer='buyer')=>marketAction(buyer,{type:'buy',id:tables.orders[0]._id,requestId});
test('escrow, cancellation, idempotency and transactions cannot duplicate goods or troops',async()=>{
 reset();await create('create_123',{club:2});expect(city('seller').res.stone).toBe(100);expect(city('seller').army.club).toBe(18);
 await create('create_123',{club:2});expect(tables.orders.length).toBe(1);expect(city('seller').res.stone).toBe(100);
 await expect(marketAction('buyer',{type:'cancel',id:tables.orders[0]._id,requestId:'cancel_123'})).rejects.toThrow();
 await marketAction('seller',{type:'cancel',id:tables.orders[0]._id,requestId:'cancel_123'});expect(city('seller').res.stone).toBe(200);expect(city('seller').army.club).toBe(20);
 await marketAction('seller',{type:'cancel',id:tables.orders[0]._id,requestId:'cancel_123'});expect(city('seller').res.stone).toBe(200);
 reset();failWrite=true;await expect(create()).rejects.toThrow('simulated');expect(tables.orders.length).toBe(0);expect(city('seller').res.stone).toBe(200);
});
test('two concurrent buyers produce one convoy and one charge; repeated buy is safe',async()=>{
 reset();await create();const result=await Promise.allSettled([buy(),buy('otherbuy_123','other')]);expect(result.filter(r=>r.status==='fulfilled').length).toBe(1);expect(tables.ships.length).toBe(1);
 expect(city('buyer').res.gold+city('other').res.gold).toBe(180);await buy();expect(city('buyer').res.gold).toBe(80);
 const s=tables.ships[0];await advanceCaravan(s._id,s.arrive);expect(city('buyer').res.stone).toBe(300);expect(city('seller').res.gold).toBe(120);
 await advanceCaravan(s._id,s.back+1000);await advanceCaravan(s._id,s.back+2000);expect(city('buyer').res.stone).toBe(300);expect(tables.ships[0].status).toBe('completed');
});
test('full warehouse and active battle keep cargo safe, then deliver exactly once',async()=>{
 reset();await create();await buy();let s=tables.ships[0];city('buyer').res.stone=500;city('seller').res.gold=500;
 await advanceCaravan(s._id,s.back+1000);expect(tables.ships[0].goodsDelivered).not.toBe(true);expect(tables.ships[0].paymentDelivered).not.toBe(true);
 city('buyer').res.stone=0;city('buyer').battleId='frozen';city('seller').res.gold=0;
 await advanceCaravan(s._id,s.back+2000);expect(city('buyer').res.stone).toBe(0);expect(city('seller').res.gold).toBe(20);
 delete city('buyer').battleId;await advanceCaravan(s._id,s.back+3000);expect(city('buyer').res.stone).toBe(100);expect(tables.ships[0].status).toBe('completed');
});
test('raiders march, warn both parties, fight, refund buyers and return loot/survivors once',async()=>{
 reset();await create();await buy();let s=tables.ships[0];
 await marketAction('raider',{type:'raid',id:s._id,units:{club:3},requestId:'raid_12345'});s=tables.ships[0];expect(s.raid.meetAt).toBeGreaterThan(s.raid.depart);expect(city('raider').army.club).toBe(17);expect(city('raider').shieldUntil).toBeUndefined();
 for(const id of ['seller','buyer'])expect(city(id).log.some((l:any)=>l.msg.includes('CẢNH BÁO'))).toBe(true);
 await marketAction('raider',{type:'raid',id:s._id,units:{club:3},requestId:'raid_12345'});expect(city('raider').army.club).toBe(17);
 await advanceCaravan(s._id,s.raid.meetAt+2000);s=tables.ships[0];expect(s.robbed).toBe(true);expect(city('buyer').res.gold).toBe(100);expect(city('buyer').res.stone).toBe(200);expect(city('seller').res.gold).toBe(100);
 const until=Math.max(s.back,s.raid.backAt)+1000;await advanceCaravan(s._id,until);await advanceCaravan(s._id,until+1000);expect(city('raider').res.stone).toBe(300);expect(city('raider').army.club).toBe(20);expect(city('raider').provisionedSoldiers).toBe(0);expect(tables.ships[0].status).toBe('completed');
});
test('strong escorts inflict losses, deny robbery and return remaining troops without duplicating slots',async()=>{
 reset();await create('create_123',{sword:10});await buy();let s=tables.ships[0];
 await marketAction('raider',{type:'raid',id:s._id,units:{club:1},requestId:'raid_12345'});s=tables.ships[0];await advanceCaravan(s._id,s.raid.meetAt+61000);s=tables.ships[0];expect(s.raid.won).toBe(false);expect(troopCount(s.raid.units)).toBe(0);
 await advanceCaravan(s._id,Math.max(s.back,s.raid.backAt)+1000);expect(city('raider').army.club).toBe(19);expect(city('seller').army.sword).toBe(20);expect(city('seller').deployedArmy.sword).toBe(0);expect(city('buyer').res.stone).toBe(300);
});
test('auth, validation, discovery, no fighter and blocked exits reject without charging',async()=>{
 reset();pid=null;expect((await api.GET()).status).toBe(401);pid='seller';expect((await api.POST(new Request('http://localhost/api/market',{method:'POST',body:'{}'}))).status).toBe(400);
 await create();await buy();const s=tables.ships[0];city('raider').discoveries=[];await expect(marketAction('raider',{type:'raid',id:s._id,units:{club:2},requestId:'raid_12345'})).rejects.toThrow();expect(city('raider').army.club).toBe(20);
 city('raider').discoveries=['seller','buyer'];await expect(marketAction('raider',{type:'raid',id:s._id,units:{medic:1},requestId:'raid_12345'})).rejects.toThrow('chiến binh');
 for(let y=19;y<=21;y++)for(let x=21;x<=23;x++)if(x!==22||y!==20)city('raider').b[idx(x,y)]={k:'wall',lvl:1,doneAt:null};
 await expect(marketAction('raider',{type:'raid',id:s._id,units:{club:2},requestId:'raid_12345'})).rejects.toThrow('đường');expect(city('raider').army.club).toBe(20);
 const data=await marketData('buyer');expect(data.caravans.length).toBe(1);
});

test('trade receipts identify buyer, goods, price and link to the exact convoy only once',async()=>{
 reset();const othersLog=structuredClone(city('other').log);await create();expect(hints).toContain('/rooms/market-feed/notify');
 expect(city('other').log).toEqual(othersLog);
 await buy();const ship=tables.ships[0];
 const receipt=city('seller').log.find((l:any)=>l.caravanId===ship._id);
 expect(receipt.msg).toContain('buyer');expect(receipt.msg).toContain('100 Đá');expect(receipt.msg).toContain('20 Vàng');
 await buy();expect(city('seller').log.filter((l:any)=>l.caravanId===ship._id).length).toBe(1);
 await advanceCaravan(ship._id,ship.arrive);
 expect(city('seller').log.find((l:any)=>l.msg.includes('Nhận tiền bán hàng')).caravanId).toBe(ship._id);
 expect(city('buyer').log.find((l:any)=>l.msg.includes('Đã nhận')).caravanId).toBe(ship._id);
});
test('tracking can recover an older own convoy but cannot expose a strangers convoy',async()=>{
 reset();await create();await buy();const ship=structuredClone(tables.ships[0]);ship.status='completed';ship._id='old-convoy';ship.createdAt=now-1000;
 tables.ships=[ship,...Array.from({length:35},(_,i)=>({...ship,_id:`new-convoy-${i}`,createdAt:now+i}))];
 expect((await marketData('seller')).caravans.some(c=>c._id===ship._id)).toBe(false);
 expect((await marketData('seller',ship._id)).caravans.some(c=>c._id===ship._id)).toBe(true);
 expect((await marketData('other',ship._id)).caravans.some(c=>c._id===ship._id)).toBe(false);
 expect((await marketData('seller')).socket).toBe('wss://worker.example/market-feed');
});
