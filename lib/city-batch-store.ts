import { createHash } from 'node:crypto';
import { cities, type CityDoc, type UserDoc } from './db';
import { ENGINE_VER, normalizeResources, score } from './engine';
import { applyCommandBatch, type BatchRequest, type SyncResult } from './city-sync';
import { citySync, readAnchor } from './sync-anchor';
import { resolveDiscoveries } from './world';
import { registerEnvoyVisits } from './diplomacy';
import { UnsupportedCityVersionError } from './city-store';
import type { CommandMetrics } from './command-metrics';

export class BatchConflict extends Error {}
const digest=(c:BatchRequest['commands'][number])=>createHash('sha256').update(JSON.stringify(c)).digest('hex');
export async function saveCityBatch(user:UserDoc,request:BatchRequest,metrics:CommandMetrics) {
  const pid=user.cityId!,session=user.sessionVersion!;
  const col=await cities();
  const checkedAt=Date.now();
  for(const command of request.commands) {
    const a=readAnchor(command.anchor);
    if(!a || a.cityId!==pid || a.session!==session || command.at<a.at || command.at>a.until || command.at>checkedAt+1000)
      throw new BatchConflict('Mốc đồng bộ không hợp lệ. Hãy tải lại làng trước khi tiếp tục.');
  }
  for(let attempt=0;attempt<5;attempt++) {
    metrics.attempts++;
    const doc=await col.findOne({_id:pid,owner:user._id});
    if(!doc)return null;
    if(doc.state.ver!==ENGINE_VER)throw new UnsupportedCityVersionError();
    if(doc.citySync && doc.citySync.session>session)throw new BatchConflict('Phiên chơi này đã được thay thế.');
    const ledger=doc.citySync?.session===session?doc.citySync:{session,ack:0,lastAt:0,results:[]};
    const fresh=request.commands.filter(c=>c.seq>ledger.ack);
    for(const command of request.commands.filter(c=>c.seq<=ledger.ack)) {
      const receipt=ledger.results.find(r=>r.seq===command.seq);
      if(receipt && (receipt.id!==command.id || receipt.digest!==digest(command)))throw new BatchConflict('Sequence đã được dùng cho thao tác khác.');
    }
    if(!fresh.length) {
      metrics.replayed=true;
      return {state:doc.state,serverNow:Date.now(),sync:citySync(doc,session,Date.now(),doc.state.last,[request.commands[0].seq,request.commands.at(-1)!.seq])};
    }
    if(fresh[0].seq!==ledger.ack+1)throw new BatchConflict('Thiếu thao tác trước đó. Đang đối chiếu hàng đợi đã lưu.');
    let lastAt=ledger.lastAt;
    for(const c of fresh) {if(c.at<lastAt)throw new BatchConflict('Thời điểm thao tác không theo thứ tự.');lastAt=c.at;}
    const now=Date.now(),state=doc.state;
    normalizeResources(state);
    const arrivals=structuredClone(state.trips??[]);
    await resolveDiscoveries(pid,state,now);
    const started=performance.now();
    const results=applyCommandBatch(state,fresh,now).map((r,n)=>({...r,digest:digest(fresh[n])}));
    metrics.commandMs+=performance.now()-started;
    const nextLedger={session,ack:fresh.at(-1)!.seq,lastAt,results:[...ledger.results,...results].slice(-256)};
    const envoyOutbox=[...new Map([...(doc.envoyOutbox??[]),...[...arrivals,...(state.trips??[])].filter(t=>t.target).map(({id,depart,target,targetName,arrive})=>({key:`${pid}:${depart}:${id}`,trip:{id,depart,target,targetName,arrive}}))].filter(e=>e.trip.arrive+7*86400000>now).map(e=>[e.key,e])).values()];
    const saved=await col.updateOne({_id:pid,owner:user._id,ver:doc.ver},{$set:{state,citySync:nextLedger,envoyOutbox,score:score(state),era:state.era,pop:state.pop,templeAt:state.templeAt,updatedAt:new Date(now)},$inc:{ver:1}});
    if(saved.modifiedCount===1) {
      metrics.commands=Object.fromEntries([...new Set(fresh.map(c=>c.action.type))].map(type=>[type,fresh.filter(c=>c.action.type===type).length]));
      metrics.rejected=results.some(r=>!!r.error);
      try {
        await registerEnvoyVisits(pid,doc.name,envoyOutbox.map(e=>e.trip));
        if(envoyOutbox.length)await col.updateOne({_id:pid},{$pull:{envoyOutbox:{key:{$in:envoyOutbox.map(e=>e.key)}}}});
      } catch { /* Stored in the same write as ACK; read/mutation will retry. */ }
      const committed:CityDoc={...doc,state,citySync:nextLedger,ver:doc.ver+1};
      return {state,serverNow:now,sync:citySync(committed,session,now,state.last,[request.commands[0].seq,request.commands.at(-1)!.seq])};
    }
  }
  throw new BatchConflict('Làng đang được cập nhật. Giữ hàng đợi để thử lại.');
}
