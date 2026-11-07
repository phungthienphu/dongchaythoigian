import { ENGINE_VER, applyAction, settle, type Action, type City } from './engine';
import { isActionInput } from './action-input';

export const BATCH_DELAY_MS = 10_000;
export const BATCH_LIMIT = 32;
export const BATCH_BYTES = 256 * 1024;
export const QUEUE_LIMIT = 256;
export const QUEUE_BYTES = 1024 * 1024;
export const QUEUE_AGE_MS = 30 * 60_000;
export const ANCHOR_WINDOW_MS = 90_000;
export type SyncCommand = { seq:number; id:string; at:number; anchor:string; action:Action };
export type SyncResult = { seq:number; id:string; error:string|null; at:number; rescheduled?:boolean; digest?:string };
export type SyncLedger = { session:number; ack:number; lastAt:number; results:SyncResult[] };
export type CitySync = { cityId:string; session:number; engine:number; revision:number; ack:number; results:SyncResult[]; anchor:string; at:number; until:number };
export type BatchRequest = { engine:number; session:number; commands:SyncCommand[] };
export type BatchResponse = { state:City; serverNow:number; sync:CitySync };
export const byteLength = (value:unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
export function validBatch(value:unknown): value is BatchRequest {
  if (!value || typeof value !== 'object') return false;
  const b=value as BatchRequest;
  return b.engine===ENGINE_VER && Number.isSafeInteger(b.session) && b.session>0
    && Array.isArray(b.commands) && b.commands.length>0 && b.commands.length<=BATCH_LIMIT
    && b.commands.every((c,n)=>!!c && Number.isSafeInteger(c.seq) && c.seq>0
      && typeof c.id==='string' && /^[a-zA-Z0-9_-]{1,100}$/.test(c.id)
      && Number.isSafeInteger(c.at) && c.at>=0 && typeof c.anchor==='string' && c.anchor.length<=2048
      && isActionInput(c.action) && (n===0 || c.seq===b.commands[n-1].seq+1));
}

/** Shared timeline runner. Never rewinds a checkpoint written by another system. */
export function applyCommandBatch(c:City, commands:SyncCommand[], now:number):SyncResult[] {
  const results:SyncResult[]=[];
  for(const command of commands) {
    const at=Math.max(c.last,Math.min(now,command.at));
    const expired=now-command.at>QUEUE_AGE_MS;
    const error=expired?'Thao tác đã chờ quá 30 phút. Hãy kiểm tra làng và giao lại việc.'
      :c.battleId?'Làng đang trong trận đánh. Thao tác chưa thực hiện; hãy dùng bảng chỉ huy trận.'
      :applyAction(c,command.action,at);
    results.push({seq:command.seq,id:command.id,error,at,...(at>command.at?{rescheduled:true}:{})});
  }
  if(!c.battleId)settle(c,now);
  return results;
}
