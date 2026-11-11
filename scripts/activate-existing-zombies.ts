import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {MongoClient} from 'mongodb';
import type {CityDoc} from '../lib/db';
import {initialZombieState,ZOMBIE_ACTIVATION_NOTICE} from '../lib/zombies';

// Explicit one-time rollout requested by the game owner. Dry-run unless --apply.
// Partial CAS updates preserve city contents, queues and concurrent player actions.
const args=process.argv.slice(2);
if(args.some(arg=>arg!=='--apply'))throw new Error('Usage: bun scripts/activate-existing-zombies.ts [--apply]');
const apply=args.includes('--apply');
const env=parseEnv(readFileSync(new URL('../.env.local',import.meta.url),'utf8'));
if(!env.MONGODB_URI)throw new Error('Missing Mongo configuration');
const client=new MongoClient(env.MONGODB_URI,{maxPoolSize:1,serverSelectionTimeoutMS:10000});
const missing={$or:[{'state.zombies':{$exists:false}},{'state.zombies':null}]};
const eligible={'state':{$type:'object' as const},...missing};
try {
 const col=client.db(env.MONGODB_DB||'dong_song_thoi_dai').collection<CityDoc>('cities');
 const total=await col.countDocuments(),pending=await col.countDocuments(eligible);
 console.log(JSON.stringify({mode:apply?'apply':'dry-run',total,pending,alreadyEnabled:total-pending}));
 if(apply){
  let activated=0,raced=0;
  const ids=await col.find(eligible,{projection:{_id:1}}).toArray();
  for(const {_id}of ids){
   let finished=false;
   for(let attempt=0;attempt<10;attempt++){
    const doc=await col.findOne({_id,...eligible},{projection:{ver:1,'state.people':1,'state.last':1}});
    if(!doc){raced++;finished=true;break;}
    const at=Date.now();
    if(!Number.isSafeInteger(doc.ver)||!Array.isArray(doc.state?.people)||!Number.isFinite(doc.state?.last)||doc.state.last>at)throw new Error('Invalid city revision/timeline; activation stopped');
    const result=await col.updateOne({_id,ver:doc.ver,...eligible},{
     $set:{'state.zombies':initialZombieState(at,doc.state.people.length),updatedAt:new Date(at)},
     $push:{'state.log':{$each:[{at,msg:ZOMBIE_ACTIVATION_NOTICE,cls:'warn' as const}],$slice:-60}},
     $inc:{ver:1},
    });
    if(result.modifiedCount===1){activated++;finished=true;break;}
   }
   if(!finished)throw new Error('Concurrent updates prevented activation; rerun safely');
  }
  const remaining=await col.countDocuments(eligible),totalAfter=await col.countDocuments(),enabled=await col.countDocuments({'state.zombies':{$type:'object'}});
  const nam=await col.findOne({name:'Nam Quốc Sơn Hà'},{projection:{_id:0,name:1,'state.zombies.activatedAt':1,'state.zombies.nextAt':1}});
  console.log(JSON.stringify({activated,alreadyActivatedByConcurrentRequest:raced,remaining,total:totalAfter,enabled,nam}));
  if(remaining||enabled!==totalAfter)throw new Error('Some villages still require activation; rerun safely');
 }
}finally{await client.close();}
