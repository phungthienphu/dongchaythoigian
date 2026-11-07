/** T06 dry-run only: a snapshot transaction, no City/ownership/DO mutation. */
import assert from 'node:assert/strict';
import { MongoClient } from 'mongodb';
import { preflightVillage,type TransferCity,type PreflightResult } from '../lib/village-preflight';
import type { UserDoc } from '../lib/db';
const uri=process.env.MONGODB_URI??'',name=process.env.MONGODB_DB??'',id=process.argv[2]??'';
assert.ok(/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\//.test(uri),'Explicit loopback MongoDB only');
assert.ok(/^sync_qa_[a-zA-Z0-9_]+$/.test(name),'Dedicated sync_qa_ database only');
assert.ok(/^sync-qa-[a-zA-Z0-9_-]{1,90}$/.test(id),'Specify one synthetic sync-qa-* village');
const client=new MongoClient(uri,{serverSelectionTimeoutMS:10000});await client.connect();
const db=client.db(name),session=client.startSession();
let result:PreflightResult|undefined,revision:number|undefined,ack:number|undefined;
try {
  await session.withTransaction(async()=>{
    const city=await db.collection<TransferCity>('cities').findOne({_id:id},{session});assert.ok(city,'Synthetic fixture not found');
    const account=city.owner?await db.collection<UserDoc>('users').findOne({_id:city.owner},{session,projection:{sessionVersion:1}}):null;
    // Driver transactions do not support parallel operations on the same session.
    const marketOrders=await db.collection('market_orders').countDocuments({seller:id,status:'open'},{session});
    const caravans=await db.collection('caravans').countDocuments({$or:[{$and:[{$or:[{seller:id},{buyer:id},{'raid.by':id}]},{status:{$ne:'completed'}}]},{'raid.by':id,'raid.returned':{$ne:true}}]},{session});
    const battles=await db.collection('battles').countDocuments({$or:[{attackerId:id},{defenderId:id}],status:{$nin:['completed','cancelled']}},{session});
    const envoyVisits=await db.collection('envoy_visits').countDocuments({$or:[{from:id},{to:id}],expiresAt:{$gt:new Date()}},{session});
    revision=city.ver;ack=city.citySync?.ack??0;
    result=await preflightVillage(city,{consistentSnapshot:true,marketOrders,caravans,battles,envoyVisits},account?.sessionVersion??0,Date.now());
  },{readConcern:{level:'snapshot'},maxCommitTimeMS:10000});
  assert.ok(result);
  console.log(JSON.stringify({source:'read-only local Mongo snapshot; not migration authorization',cityId:id,revision,ack,...(result.ready?{candidate:true,bytes:result.bytes,checksum:result.checksum}:{candidate:false,blockers:result.blockers})},null,2));
} finally {await session.endSession();await client.close();}
