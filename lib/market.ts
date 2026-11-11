import {nextCaravanEvent,caravanRecoveryAt} from './caravan-clock';
import type {ClientSession} from 'mongodb';
import {caravans,marketOrders,cities,mongoClient,type CityDoc} from './db';
import {isMagicResource,magicResourceEra} from './magic-data';
import {RN,RES,UKEYS,MIN,settle,score,stats,derive,normalizeResources,envoyVillageRoute,reserveMarchFood,pruneHomeOrders,troopCount,type City,type Troops,type ResKey} from './engine';
import {validMarketAction,hasMarket,fighters,interception,caravanView,CARAVAN_CELLS_PER_MIN} from './market-rules';
import {startRoadFight,advanceRoadFight} from './road-combat';
import type {MarketAction,Caravan,MarketData} from './market-types';
import {workerRequest,warConfigured,socketUrl} from './war';
async function transaction<T>(fn:(s:ClientSession)=>Promise<T>){const s=(await mongoClient()).startSession();try{return (await s.withTransaction(()=>fn(s)))!;}finally{await s.endSession();}}
function note(c:City,at:number,msg:string,warn=false,caravanId?:string){c.log.unshift({at,msg,...(caravanId?{caravanId}:{}),cls:warn?'warn':'good'});c.log=c.log.slice(0,200);}
function prepare(d:CityDoc,now:number){normalizeResources(d.state);if(!d.state.battleId)settle(d.state,now);}
async function save(d:CityDoc,s:ClientSession){await (await cities()).updateOne({_id:d._id},{$set:{state:d.state,score:score(d.state),era:d.state.era,pop:d.state.pop,templeAt:d.state.templeAt,updatedAt:new Date()},$inc:{ver:1}},{session:s});}
function usable(d:CityDoc|null,needsMarket=true):asserts d is CityDoc{if(!d?.owner)throw new Error('Cần đăng nhập Google và có làng.');if(d.state.battleId||d.incomingBattleId)throw new Error('Làng đang bị tấn công, chưa thể giao thương hoặc điều quân.');if(needsMarket&&!hasMarket(d.state))throw new Error('Cần có Chợ đã xây xong, không cháy/ngập.');}
function reserveUnits(c:City,t:Troops){for(const u of UKEYS)if((t[u]??0)>(c.army[u]??0))throw new Error('Không đủ quân đang ở nhà.');for(const u of UKEYS){const n=t[u]??0;c.army[u]=(c.army[u]??0)-n;(c.deployedArmy??={})[u]=(c.deployedArmy?.[u]??0)+n;}pruneHomeOrders(c);}
function returnUnits(c:City,t:Troops,initial:Troops){for(const u of UKEYS){c.army[u]=(c.army[u]??0)+(t[u]??0);(c.deployedArmy??={})[u]=Math.max(0,(c.deployedArmy?.[u]??0)-(initial[u]??0));}}
function receive(c:City,r:ResKey,n:number){if(c.battleId||c.res[r]+n>stats(c,derive(c),c.last).storage[r])return false;c.res[r]+=n;return true;}
async function hint(ids:string[]){if(warConfigured())await Promise.allSettled([...new Set(ids)].map(id=>workerRequest(`/rooms/player-${id}/notify`,{})));}
const journey=(c:City,id:string,route:number[],depart:number,arrive:number,back:number,extra={})=>{c.merchantJourneys=[...(c.merchantJourneys??[]).filter(j=>j.back>depart),{id,depart,arrive,back,villageRoute:route,...extra}];};

export async function marketAction(pid:string,a:MarketAction,metrics?:{replayed:boolean}){
 if(!validMarketAction(a))throw new Error('Thao tác giao thương không hợp lệ.');
 const now=Date.now(),orders=await marketOrders(),ships=await caravans(),col=await cities();
 const changed=await transaction(async session=>{
  if(metrics)metrics.replayed=false;
  const me=await col.findOne({_id:pid},{session});if(!me)throw new Error('Không có làng.');prepare(me,now);
  if(a.type==='create'){
   if((a.resource==='coal'||a.currency==='coal')&&me.state.era<5)throw new Error('Giao thương than mở từ Công nghiệp.');
   if([a.resource,a.currency].some(r=>isMagicResource(r)&&me.state.era<magicResourceEra(r)))throw new Error('Hàng ma pháp chỉ giao thương từ thời mở loại hàng đó (tinh thạch, phù văn: Thức tỉnh; tinh chất: Nguyên tố).');
   const id=`${pid}:${a.requestId}`;if(await orders.findOne({_id:id},{session})){if(metrics)metrics.replayed=true;return[pid];}usable(me);
   if(await orders.countDocuments({seller:pid,status:'open'},{session})>=10)throw new Error('Tối đa 10 lô hàng đang bán.');
   if(a.price>stats(me.state,derive(me.state),now).storage[a.currency])throw new Error('Giá lớn hơn sức chứa Kho: nâng Kho trước khi đăng bán.');
   if(me.state.res[a.resource]<a.amount)throw new Error('Không đủ hàng trong kho.');
   if(envoyVillageRoute(me.state,'market').length<2)throw new Error('Chợ chưa có đường đất ra ngoài làng.');
   reserveUnits(me.state,a.escorts);me.state.res[a.resource]-=a.amount;
   await orders.insertOne({_id:id,seller:pid,sellerName:me.name,resource:a.resource,amount:a.amount,currency:a.currency,price:a.price,escorts:a.escorts,status:'open',createdAt:now},{session});
   note(me.state,now,`Đã giữ riêng ${a.amount} ${RN[a.resource]} cho lô hàng ở Chợ.`);await save(me,session);return[pid];
  }
  if(a.type==='cancel'){
   const order=await orders.findOne({_id:a.id,seller:pid},{session});if(!order)throw new Error('Không tìm thấy lô hàng của bạn.');if(order.status==='cancelled'){if(metrics)metrics.replayed=true;return[pid];}if(order.status!=='open')throw new Error('Hàng đã bán, không thể hủy.');
   usable(me,false);if(!receive(me.state,order.resource,order.amount))throw new Error('Kho chật, dùng bớt hàng hoặc nâng Kho trước khi hủy.');returnUnits(me.state,order.escorts,order.escorts);
   await orders.updateOne({_id:order._id},{$set:{status:'cancelled'}},{session});await save(me,session);return[pid];
  }
  if(a.type==='buy'){
   const id=`${pid}:${a.requestId}`;if(await ships.findOne({_id:id},{session})){if(metrics)metrics.replayed=true;return[pid];}usable(me);
   const order=await orders.findOne({_id:a.id,status:'open'},{session});if(!order)throw new Error('Lô hàng đã được mua hoặc hủy.');if(order.seller===pid)throw new Error('Không thể tự mua hàng của mình.');
   const seller=await col.findOne({_id:order.seller},{session});usable(seller);prepare(seller,now);
   if((order.resource==='coal'||order.currency==='coal')&&(me.state.era<5||seller.state.era<5))throw new Error('Cả hai làng phải từ Công nghiệp để giao thương than.');
   if([order.resource,order.currency].some(r=>isMagicResource(r)&&Math.min(me.state.era,seller.state.era)<magicResourceEra(r)))throw new Error('Cả hai làng phải từ thời Thức tỉnh để giao thương hàng ma pháp.');
   if(!seller.world||!me.world)throw new Error('Mở Thế giới để xác lập vị trí làng trước.');
   const route=envoyVillageRoute(seller.state,'market'),incoming=envoyVillageRoute(me.state,'market');if(route.length<2||incoming.length<2)throw new Error('Chợ của một bên đang bị bịt lối ra.');
   if(me.state.res[order.currency]<order.price)throw new Error('Không đủ tài nguyên thanh toán.');
   if(order.amount>stats(me.state,derive(me.state),now).storage[order.resource])throw new Error('Lô hàng lớn hơn sức chứa Kho của bạn.');
   if(await ships.countDocuments({$or:[{seller:pid},{buyer:pid},{seller:order.seller},{buyer:order.seller}],status:{$ne:'completed'}},{session})>=30)throw new Error('Một bên đang có quá nhiều đoàn xe chưa hoàn tất.');
   me.state.res[order.currency]-=order.price;
   const duration=Math.max(2*MIN,Math.ceil(Math.hypot(seller.world.x-me.world.x,seller.world.y-me.world.y)/CARAVAN_CELLS_PER_MIN*MIN));
   // Food is reserved for escort round-trip; no escort means the cart still travels.
   reserveMarchFood(seller.state,order.escorts,duration);seller.state.provisionedSoldiers=(seller.state.provisionedSoldiers??0)+troopCount(order.escorts);
   const ship:Caravan={_id:id,orderId:order._id,seller:seller._id,buyer:pid,sellerName:seller.name,buyerName:me.name,resource:order.resource,amount:order.amount,currency:order.currency,price:order.price,from:seller.world,to:me.world,depart:now,arrive:now+duration,back:now+duration*2,escorts:{...order.escorts},initialEscorts:{...order.escorts},status:'travelling',createdAt:now};
   journey(seller.state,id,route,now,ship.arrive,ship.back);journey(me.state,id,incoming,now-duration,now,ship.arrive,{incoming:true});
   note(seller.state,now,`Làng ${me.name} đã mua ${order.amount} ${RN[order.resource]} của bạn với giá ${order.price} ${RN[order.currency]}. Đoàn xe đã xuất phát, ${troopCount(order.escorts)} quân hộ tống. Nhận tiền khi giao hàng thành công; có nguy cơ bị cướp.`,false,id);
   note(me.state,now,`Đã mua ${order.amount} ${RN[order.resource]} từ ${seller.name}, giữ riêng ${order.price} ${RN[order.currency]}. Đoàn xe đang tới; nếu bị cướp sẽ hoàn tiền.`,false,id);
   ship.nextCheckAt=nextCaravanEvent(ship);await ships.insertOne(ship,{session});await orders.updateOne({_id:order._id},{$set:{status:'sold'}},{session});await save(me,session);await save(seller,session);return[pid,seller._id];
  }
  // One interception per convoy; only independently discovered routes are targetable.
  const ship=await ships.findOne({_id:a.id},{session});if(!ship)throw new Error('Không tìm thấy đoàn xe.');
  if(ship.raid?.by===pid&&ship.raid.requestId===a.requestId){if(metrics)metrics.replayed=true;return[pid];}usable(me,false);
  const view=caravanView(ship,pid,me.state);if(!view?.canRaid||!me.world)throw new Error('Không thấy tuyến đường hoặc đoàn xe không còn có thể bị chặn.');
  if(!fighters(a.units!))throw new Error('Cần ít nhất một chiến binh để cướp.');
  const meet=interception(ship,me.world,now);if(!meet)throw new Error('Không thể đuổi kịp đoàn xe trước khi tới đích.');
  if(await ships.countDocuments({'raid.by':pid,'raid.returned':{$ne:true}},{session})>=3)throw new Error('Tối đa 3 đoàn quân đi chặn xe cùng lúc.');
  const seller=await col.findOne({_id:ship.seller},{session}),buyer=await col.findOne({_id:ship.buyer},{session});if(!seller||!buyer)throw new Error('Một làng không còn tồn tại.');prepare(seller,now);prepare(buyer,now);
  const route=envoyVillageRoute(me.state,'barracks');if(route.length<2)throw new Error('Trại lính chưa có đường đất ra ngoài làng.');
  reserveMarchFood(me.state,a.units!,meet.meetAt-now);reserveUnits(me.state,a.units!);me.state.provisionedSoldiers=(me.state.provisionedSoldiers??0)+troopCount(a.units!);delete me.state.shieldUntil;
  ship.raid={by:pid,name:me.name,requestId:a.requestId,from:me.world,to:meet.point,depart:now,meetAt:meet.meetAt,units:{...a.units},initial:{...a.units}};
  journey(me.state,ship._id,route,now,meet.meetAt,meet.meetAt+(meet.meetAt-now)+MIN,{raider:true});
  for(const d of [seller,buyer])note(d.state,now,`CẢNH BÁO: quân ${me.name} đang hành quân cướp đoàn xe ${seller.name} → ${buyer.name}, dự kiến chạm trán lúc ${new Date(meet.meetAt).toLocaleTimeString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}.`,true,ship._id);
  note(me.state,now,`Đã xuất ${troopCount(a.units!)} quân chặn đoàn xe ${seller.name} → ${buyer.name}.`,true,ship._id);
  await ships.updateOne({_id:ship._id},{$set:{raid:ship.raid,nextCheckAt:nextCaravanEvent(ship)}},{session});for(const d of [me,seller,buyer])await save(d,session);return[pid,ship.seller,ship.buyer];
 });
 await hint(changed);
 if(a.type==='create'||a.type==='buy'||a.type==='cancel'){
  if(warConfigured())await Promise.allSettled([workerRequest('/rooms/market-feed/notify',{})]);
 }
 return {ok:true};
}

/** Persistent convoy clock. Every transfer and unit return is transactional and
 * flagged once; missed cron/notifications are recovered by the next authenticated GET. */
export async function advanceCaravan(id:string,now=Date.now()){
 const ships=await caravans(),col=await cities();
 const changed=await transaction(async session=>{
  const s=await ships.findOne({_id:id,status:{$ne:'completed'}},{session});if(!s)return[];
  if(now<nextCaravanEvent(s))return[];
  const ids=[...new Set([s.seller,s.buyer,...(s.raid?[s.raid.by]:[])])],docs=new Map<string,CityDoc>();
  for(const id of ids){const d=await col.findOne({_id:id},{session});if(!d)return[];prepare(d,now);docs.set(id,d);}
  const seller=docs.get(s.seller)!,buyer=docs.get(s.buyer)!;let dirty=false;
  const raid=s.raid;
  if(raid&&now>=raid.meetAt&&raid.won===undefined){
   const existed=!!raid.fight,before=raid.fight?.last;
   const fight=raid.fight??=startRoadFight(raid.units,s.escorts,raid.meetAt);advanceRoadFight(fight,now);raid.units={...fight.attackers};s.escorts={...fight.defenders};s.status='fighting';dirty=!existed||fight.last!==before;
   if(fight.finished){raid.won=fight.won;raid.backAt=fight.last+(raid.meetAt-raid.depart);s.robbed=!!fight.won;
    s.arrive+=fight.last-raid.meetAt;s.back=s.robbed?fight.last+(raid.meetAt-s.depart):s.arrive+(s.arrive-s.depart);
    for(const d of docs.values())note(d.state,fight.last,`${s.robbed?'Đoàn xe bị cướp':'Hộ tống bảo vệ được đoàn xe'} ${s.sellerName} → ${s.buyerName}. Quân cướp còn ${troopCount(raid.units)}, hộ tống còn ${troopCount(s.escorts)}. ${s.robbed?'Người mua được hoàn tiền khi có chỗ trong kho.':''}`,s.robbed,s._id);
    const raider=docs.get(raid.by)!;for(const d of [seller,buyer,raider]){if(s.robbed&&d===buyer){d.state.merchantJourneys=d.state.merchantJourneys?.filter(j=>j.id!==s._id);continue;}for(const j of d.state.merchantJourneys??[])if(j.id===s._id){j.back=d===raider?raid.backAt:d===buyer?s.arrive:s.back;if(d===seller)j.arrive=s.robbed?fight.last:s.arrive;}}
   }
  }
  if(!raid||raid.won!==undefined){
   const arrival=s.robbed?raid!.fight!.last:s.arrive;
   if(now>=arrival){
    const recipient=s.robbed?docs.get(raid!.by)!:buyer,deliveryAt=s.robbed?raid!.backAt!:arrival;
    if(!s.goodsDelivered&&now>=deliveryAt&&receive(recipient.state,s.resource,s.amount)){s.goodsDelivered=true;note(recipient.state,now,`Đã nhận ${s.amount} ${RN[s.resource]} từ đoàn xe ${s.sellerName} → ${s.buyerName}.`,s.robbed,s._id);dirty=true;}
    const payee=s.robbed?buyer:seller;
    if(!s.paymentDelivered&&receive(payee.state,s.currency,s.price)){s.paymentDelivered=true;note(payee.state,now,`${s.robbed?'Hoàn tiền':'Nhận tiền bán hàng'}: ${s.price} ${RN[s.currency]} · ${s.sellerName} → ${s.buyerName}.`,false,s._id);dirty=true;}
   }
   if(now>=s.back&&!s.escortsReturned&&!seller.state.battleId){returnUnits(seller.state,s.escorts,s.initialEscorts);seller.state.provisionedSoldiers=Math.max(0,(seller.state.provisionedSoldiers??0)-troopCount(s.initialEscorts));s.escortsReturned=true;note(seller.state,now,'Quân hộ tống đoàn xe đã về làng.',false,s._id);dirty=true;}
   if(raid&&raid.backAt&&now>=raid.backAt&&!raid.returned){const d=docs.get(raid.by)!;if(!d.state.battleId){returnUnits(d.state,raid.units,raid.initial);d.state.provisionedSoldiers=Math.max(0,(d.state.provisionedSoldiers??0)-troopCount(raid.initial));raid.returned=true;note(d.state,now,'Đoàn quân chặn xe đã về làng.',false,s._id);dirty=true;}}
   const complete=s.goodsDelivered&&s.paymentDelivered&&s.escortsReturned&&(!raid||raid.returned);
   const status=complete?'completed':now>=arrival&&(!s.goodsDelivered||!s.paymentDelivered)?'waiting':now>=arrival?'returning':'travelling';
   if(s.status!==status){s.status=status;dirty=true;}
  }
  // Persist the simulated checkpoint even while a full warehouse blocks
  // transfer. Otherwise every cron replays the same growing offline interval.
  s.nextCheckAt=caravanRecoveryAt(s,now);
  if(!dirty){
   await ships.updateOne({_id:s._id},{$set:{nextCheckAt:s.nextCheckAt}},{session});
   for(const d of docs.values())await save(d,session);
   return[];
  }
  await ships.replaceOne({_id:s._id},s,{session});for(const d of docs.values())await save(d,session);return ids;
 });
 await hint(changed);
}
export async function reconcileCaravans(limit=30){
 const col=await caravans(),rows=await col.find({status:{$ne:'completed'},$or:[{nextCheckAt:{$exists:false}},{nextCheckAt:{$lte:Date.now()}}]}).sort({reconciledAt:1,createdAt:1}).limit(limit).toArray();
 let failed=0;for(const r of rows){try{if(nextCaravanEvent(r)<=Date.now())await advanceCaravan(r._id);else await col.updateOne({_id:r._id,nextCheckAt:r.nextCheckAt??{$exists:false}},{$set:{nextCheckAt:nextCaravanEvent(r)}});}catch{failed++;}finally{await col.updateOne({_id:r._id},{$set:{reconciledAt:Date.now()}});}}
 return {checked:rows.length,failed};
}
export async function marketData(pid:string,target?:string):Promise<MarketData>{
 const ships=await caravans(),col=await cities();
 const own=await ships.find({$or:[{seller:pid},{buyer:pid},{'raid.by':pid}],status:{$ne:'completed'}}).sort({arrive:1}).limit(30).toArray();for(const s of own)await advanceCaravan(s._id);
 const me=await col.findOne({_id:pid});if(!me)throw new Error('Không có làng.');normalizeResources(me.state);
 const book=await marketOrders(),publicOrders=await book.find({status:'open'}).sort({createdAt:-1}).limit(100).toArray(),ownOrders=await book.find({seller:pid,status:'open'}).limit(10).toArray();
 const orders=[...new Map([...ownOrders,...publicOrders].map(o=>[o._id,o])).values()];
 const ownRows=await ships.find({$or:[{seller:pid},{buyer:pid},{'raid.by':pid}]}).sort({createdAt:-1}).limit(30).toArray();
 const known=[...new Set([...(me.state.discoveries??[]),...Object.keys(me.state.visits??{})])];
 const visible=known.length?await ships.find({seller:{$in:known},buyer:{$in:known},status:{$ne:'completed'}}).sort({createdAt:-1}).limit(100).toArray():[];
 const active=await ships.find({$or:[{seller:pid},{buyer:pid},{'raid.by':pid}],status:{$ne:'completed'}}).limit(100).toArray();
 const selected=target?await ships.findOne({_id:target,$or:[{seller:pid},{buyer:pid},{'raid.by':pid}]}):null;
 const rows=[...new Map([...ownRows,...active,...visible,...(selected?[selected]:[])].map(s=>[s._id,s])).values()];
 return {socket:warConfigured()?await socketUrl("market-feed",pid,"defender"):null,orders,caravans:rows.flatMap(s=>{const v=caravanView(s,pid,me.state);return v?[v]:[];}),playerId:pid,enabled:hasMarket(me.state),serverNow:Date.now()};
}
