import { cities, envoyVisits, mongoClient } from './db';
import type { EnvoyTrip } from './engine';
import type { DiplomaticMessage, EnvoyVisit } from './diplomacy-types';

export const DIPLOMACY_MS = 7 * 24 * 60 * 60_000;
export function diplomaticView(row: EnvoyVisit, pid: string, now: number): DiplomaticMessage | null {
  if (row.arrive > now || row.expiresAt.getTime() <= now) return null;
  const host = row.to === pid;
  if (!host && (row.from !== pid || !row.requestedAt)) return null;
  return { id: row._id, side: host ? 'host' : 'visitor', name: host ? row.fromName : row.toName,
    arrive: row.arrive, requestedAt: row.requestedAt, decidedAt: row.decidedAt, decision: row.decision };
}
export function diplomacyPermission(row: EnvoyVisit, pid: string, action: string, now: number): string | null {
  if (row.arrive > now) return 'Sứ giả chưa tới nơi.';
  if (row.expiresAt.getTime() <= now) return 'Lời nhắn đã hết hạn sau 7 ngày.';
  if (action === 'request') return row.to === pid ? null : 'Chỉ nước được thăm mới được xin vị trí.';
  if (action !== 'accept' && action !== 'decline') return 'Lựa chọn không hợp lệ.';
  if (row.from !== pid) return 'Chỉ chủ nước có sứ giả mới được quyết định chia sẻ vị trí.';
  return row.requestedAt ? null : 'Chưa nhận được lời xin vị trí.';
}
/** Notifications are hints; MongoDB remains authoritative and reconnect recovers the inbox. */
export async function notifyDiplomacy(ids: string[]) {
  const origin=process.env.BATTLE_WORKER_URL, secret=process.env.BATTLE_SERVER_SECRET;
  if (!origin || !secret || secret.length < 32) return;
  let url:URL;try{url=new URL(origin);}catch{return;}if(url.protocol!=='https:')return;
  await Promise.allSettled([...new Set(ids)].map(id=>fetch(`${url.origin}/rooms/player-${encodeURIComponent(id)}/notify`,{
    method:'POST',headers:{authorization:`Bearer ${secret}`,'content-type':'application/json'},body:JSON.stringify({type:'update'}),signal:AbortSignal.timeout(3000),
  })));
}
/** Called only after the city save succeeds; the ID makes retries and reloads idempotent. */
export async function registerEnvoyVisits(pid: string, name: string, trips: Pick<EnvoyTrip,"id"|"depart"|"target"|"targetName"|"arrive">[]) {
  const known=trips.filter(t=>t.target && t.target!==pid); if(!known.length)return;
  const col=await envoyVisits(), notify:string[]=[];
  for(const tr of known){
    const result=await col.updateOne({_id:`${pid}:${tr.depart}:${tr.id}`},{$setOnInsert:{from:pid,to:tr.target,fromName:name,toName:tr.targetName,arrive:tr.arrive,eventAt:tr.arrive,expiresAt:new Date(tr.arrive+DIPLOMACY_MS)}},{upsert:true});
    if(result.upsertedCount)notify.push(tr.target);
  }
  if(notify.length)await notifyDiplomacy(notify);
}
export async function decideDiplomacy(pid: string, id: string, action: 'request'|'accept'|'decline', now: number) {
  const visits=await envoyVisits(), col=await cities(), session=(await mongoClient()).startSession();
  let notify:string[]=[];
  try {
    await session.withTransaction(async()=>{
      notify=[];
      const row=await visits.findOne({_id:id},{session});
      if(!row)throw new Error('Không tìm thấy lời nhắn.');
      const error=diplomacyPermission(row,pid,action,now);if(error)throw new Error(error);
      if(action==='request'){
        if(row.requestedAt)return;
        const known=await col.findOne({_id:pid},{session,projection:{'state.discoveries':1,'state.visits':1}});
        if(known?.state.discoveries?.includes(row.from) || Object.hasOwn(known?.state.visits??{},row.from))throw new Error('Bạn đã biết vị trí nước này.');
        await visits.updateOne({_id:id},{$set:{requestedAt:now,eventAt:now}},{session});
      }else{
        const decision=action==='accept'?'accepted':'declined';
        if(row.decision){if(row.decision!==decision)throw new Error('Lời nhắn này đã được trả lời.');return;}
        if(action==='accept'){
          // Grant discovery only, never a scouting report or permission to attack.
          const result=await col.updateOne({_id:row.to},{$addToSet:{'state.discoveries':row.from},$inc:{ver:1}},{session});
          if(!result.matchedCount)throw new Error('Nước xin vị trí không còn tồn tại.');
        }
        await visits.updateOne({_id:id},{$set:{decision,decidedAt:now,eventAt:now}},{session});
      }
      notify=[row.from,row.to];
    });
  } finally {await session.endSession();}
  await notifyDiplomacy(notify);
}
