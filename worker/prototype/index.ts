/** T05 synthetic-only experiment. No Mongo, production routing or client tokens. */
import { ENGINE_VER, HOUR, MAX_SETTLE_MS, newCity, settle, type City } from '../../lib/engine';
import { ANCHOR_WINDOW_MS, BATCH_BYTES, applyCommandBatch, validBatch, type BatchResponse, type SyncLedger } from '../../lib/city-sync';
import { syncFixture } from '../../tests/sync-workload';
import { digest, readAnchor, signAnchor } from './anchor';
import type { PrototypeContext, PrototypeNamespace } from './runtime';

interface Env { VILLAGES:PrototypeNamespace; PROTOTYPE_ENABLED:string; PROTOTYPE_SECRET:string }
type Checkpoint={cityId:string;revision:number;state:City;ledger:SyncLedger;catchupTo?:number};
const CATCHUP_SLICE_MS=6*HOUR;
type Metrics={rowsRead:number;rowsWritten:number;storageBytes:number;handlerWallMs:number};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
const authorized=(r:Request,e:Env)=>e.PROTOTYPE_ENABLED==='true'&&e.PROTOTYPE_SECRET?.length>=32&&r.headers.get('authorization')===`Bearer ${e.PROTOTYPE_SECRET}`;
const route=(r:Request)=>new URL(r.url).pathname.match(/^\/villages\/(qa-[a-zA-Z0-9_-]{1,90})(?:\/(seed|batch|checkpoint|session|stats))?$/);
const workloads=['fresh','workers50','workers200','full','offline1h','offline24h','offline14d','offline14d200'] as const;
export type Workload=typeof workloads[number];
export function prototypeFixture(workload:Workload):City {
  if(workload==='fresh')return newCity(0,123);
  return syncFixture(workload==='workers200'||workload==='offline14d200'?200:50,workload==='full');
}
export const workloadUntil=(name:Workload)=>name.startsWith('offline14d')?14*24*HOUR:name==='offline24h'?24*HOUR:name==='offline1h'?HOUR:60_000;
class InputError extends Error { constructor(message:string,readonly status=409){super(message);} }
async function body(request:Request):Promise<unknown> {
  const reader=request.body?.getReader();if(!reader)throw new InputError('Missing body',400);
  const chunks:Uint8Array[]=[];let bytes=0;
  while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>BATCH_BYTES){await reader.cancel();throw new InputError('Payload too large',413);}chunks.push(value);}
  const raw=new Uint8Array(bytes);let offset=0;for(const c of chunks){raw.set(c,offset);offset+=c.byteLength;}
  try{return JSON.parse(new TextDecoder().decode(raw));}catch{throw new InputError('Invalid JSON',400);}
}
export default {
  async fetch(request:Request,env:Env) {
    if(!authorized(request,env))return json({error:'Prototype disabled or unauthorized'},401);
    const match=route(request);if(!match)return json({error:'Synthetic qa-* villages only'},404);
    if(!['GET','POST'].includes(request.method))return json({error:'Method not allowed'},405);
    // No engine runs in this router. Namespace is entirely separate from combat.
    return env.VILLAGES.get(env.VILLAGES.idFromName(match[1])).fetch(request);
  }
};
export class VillagePrototype {
  constructor(private ctx:PrototypeContext,private env:Env) {
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS checkpoint (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)');
  }
  fetch(request:Request):Promise<Response> {
    // Includes asynchronous anchor/digest checks: another request cannot overwrite
    // a checkpoint loaded before those awaits. No timer or continuously running loop.
    return this.ctx.blockConcurrencyWhile(async()=>{
      const started=performance.now(),metrics:Metrics={rowsRead:0,rowsWritten:0,storageBytes:0,handlerWallMs:0};
      const exec=<T=Record<string,unknown>>(query:string,...args:(string|number|null)[])=>{
        const cursor=this.ctx.storage.sql.exec<T>(query,...args),rows=cursor.toArray();
        metrics.rowsRead+=cursor.rowsRead;metrics.rowsWritten+=cursor.rowsWritten;return rows;
      };
      try {
        if(!authorized(request,this.env))return json({error:'Unauthorized'},401);
        const match=route(request);if(!match)return json({error:'Invalid route'},404);
        const [,cityId,op]=match;
        const stored=exec<{value:string}>('SELECT value FROM checkpoint WHERE id=1')[0];
        let c:Checkpoint|undefined=stored?JSON.parse(stored.value):undefined;
        let now=c?.state.last??0,resultRange:readonly[number,number]|undefined;
        const write=(value:Checkpoint,fail=false)=>this.ctx.storage.transactionSync(()=>{
          exec('INSERT INTO checkpoint(id,value) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value',JSON.stringify(value));
          // An opt-in synthetic fault proves checkpoint+ACK roll back together.
          if(fail)exec('INSERT INTO deliberately_missing_qa_table VALUES(1)');
        });
        if(request.method==='POST'&&op==='seed') {
          if(c)throw new InputError('Already seeded');
          const b=await body(request) as {workload?:Workload};
          if(!b||!workloads.includes(b.workload!))throw new InputError('Unknown fixture',400);
          c={cityId,revision:0,state:prototypeFixture(b.workload!),ledger:{session:1,ack:0,lastAt:0,results:[]}};write(c);
        } else {
          if(!c)throw new InputError('Seed a synthetic fixture first',404);
          if(c.cityId!==cityId)throw new InputError('Checkpoint identity mismatch');
          if(c.state.ver!==ENGINE_VER)throw new InputError('Checkpoint engine requires an explicit migration');
          if(request.method==='POST'&&op==='checkpoint') {
            const b=await body(request) as {now?:number};
            if(!b||!Number.isSafeInteger(b.now)||b.now!<c.state.last)throw new InputError('Invalid synthetic clock',400);
            // T05 supports the actual 14-day window, not a manual rewrite of
            // old timestamps to imitate the engine's cap for older saves.
            if(b.now!-c.state.last>MAX_SETTLE_MS)throw new InputError('Beyond prototype catch-up window',400);
            if(c.catchupTo!==undefined&&b.now!==c.catchupTo)throw new InputError('Finish the existing catch-up target first');
            now=Math.min(b.now!,c.state.last+CATCHUP_SLICE_MS);
            if(now>c.state.last||c.catchupTo!==undefined){
              settle(c.state,now);
              if(now<b.now!)c.catchupTo=b.now!;else delete c.catchupTo;
              c.revision++;write(c);
            }
          } else if(request.method==='POST'&&op==='session') {
            const b=await body(request) as {version?:number};
            if(!b||!Number.isSafeInteger(b.version)||b.version!<=c.ledger.session)throw new InputError('Session must increase',400);
            c.ledger={session:b.version!,ack:0,lastAt:c.state.last,results:[]};c.revision++;write(c);
          } else if(request.method==='POST'&&op==='batch') {
            const b=await body(request) as {batch?:unknown;now?:number;failWrite?:boolean};
            if(!b||!validBatch(b.batch)||!Number.isSafeInteger(b.now)||b.now!<c.state.last)throw new InputError('Invalid batch or synthetic clock',400);
            const req=b.batch;now=b.now!;
            if(req.session!==c.ledger.session)throw new InputError('Session replaced',401);
            if(c.catchupTo!==undefined)throw new InputError('Catch-up is in progress; command not consumed');
            if(now-c.state.last>CATCHUP_SLICE_MS)throw new InputError('Advance the durable catch-up checkpoint before applying commands');
            for(const command of req.commands){
              const anchor=await readAnchor(command.anchor,this.env.PROTOTYPE_SECRET);
              if(!anchor||anchor.cityId!==cityId||anchor.session!==req.session||command.at<anchor.at||command.at>anchor.until||command.at>now+1000)
                throw new InputError('Invalid anchor');
            }
            const hashed=await Promise.all(req.commands.map(digest));
            for(const [n,command]of req.commands.entries())if(command.seq<=c.ledger.ack){
              const receipt=c.ledger.results.find(r=>r.seq===command.seq);
              if(receipt&&(receipt.id!==command.id||receipt.digest!==hashed[n]))throw new InputError('Sequence payload conflict');
            }
            const fresh=req.commands.filter(cmd=>cmd.seq>c!.ledger.ack);
            resultRange=[req.commands[0].seq,req.commands.at(-1)!.seq];
            if(fresh.length){
              if(fresh[0].seq!==c.ledger.ack+1)throw new InputError('Sequence gap');
              let lastAt=c.ledger.lastAt;
              for(const cmd of fresh){if(cmd.at<lastAt)throw new InputError('Time moved backwards');lastAt=cmd.at;}
              const results=applyCommandBatch(c.state,fresh,now).map((r,n)=>({...r,digest:hashed[req.commands.length-fresh.length+n]}));
              c.ledger={session:req.session,ack:fresh.at(-1)!.seq,lastAt,results:[...c.ledger.results,...results].slice(-256)};
              c.revision++;write(c,b.failWrite===true);
            }
          } else if(request.method!=='GET'||op&&op!=='stats')throw new InputError('Method not allowed',405);
        }
        metrics.storageBytes=this.ctx.storage.sql.databaseSize;metrics.handlerWallMs=performance.now()-started;
        if(op==='stats')return json({cityId,revision:c!.revision,ack:c!.ledger.ack,receipts:c!.ledger.results.length,...metrics});
        const anchor={cityId,session:c!.ledger.session,engine:ENGINE_VER,revision:c!.revision,at:now,until:now+ANCHOR_WINDOW_MS};
        const result:BatchResponse={state:c!.state,serverNow:now,sync:{...anchor,checkpointAt:c!.state.last,ack:c!.ledger.ack,anchor:await signAnchor(anchor,this.env.PROTOTYPE_SECRET),results:c!.ledger.results.filter(r=>!resultRange||r.seq>=resultRange[0]&&r.seq<=resultRange[1]).map(({digest:_digest,...r})=>r)}};
        return json({...result,prototype:true,catchup:c!.catchupTo===undefined?null:{target:c!.catchupTo,at:c!.state.last},metrics},c!.catchupTo===undefined?200:202);
      } catch(e) {
        if(e instanceof InputError)return json({error:e.message},e.status);
        // Never send internal SQL errors, state, secret or tokens to logs/client.
        return json({error:'Synthetic storage/handler failure; batch not acknowledged'},503);
      }
    });
  }
}
