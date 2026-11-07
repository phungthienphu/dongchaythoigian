import type {City,Res,ResKey} from './engine';

const BUCKET_MS=10_000;
export const RESOURCE_HISTORY_MS=300_000;
export type ResourceHistory={since:number;buckets:{at:number;received:Partial<Res>;spent:Partial<Res>}[]};

/** Thirty ten-second buckets: bounded save size and no extra network traffic.
 * Receipts are production unloaded at a drop point, never a nominal hourly rate. */
export function recordResourceFlow(c:City,at:number,kind:'received'|'spent',resource:ResKey,amount:number){
 if(!(amount>0)||!Number.isFinite(amount))return;
 const history=c.resourceHistory??={since:at,buckets:[]},time=Math.floor(at/BUCKET_MS)*BUCKET_MS;
 const latest=Math.max(time,history.buckets.at(-1)?.at??time),cutoff=latest-RESOURCE_HISTORY_MS+BUCKET_MS;
 if(time<cutoff)return;
 while(history.buckets.length&&history.buckets[0].at<cutoff)history.buckets.shift();
 let bucket=history.buckets.at(-1);
 if(bucket?.at!==time){
  bucket=history.buckets.find(b=>b.at===time);
  if(!bucket){bucket={at:time,received:{},spent:{}};history.buckets.push(bucket);if(time<latest)history.buckets.sort((a,b)=>a.at-b.at);}
 }
 bucket[kind][resource]=(bucket[kind][resource]??0)+amount;
}
export function recentResourceFlow(c:City,now:number){
 const empty=()=>({food:0,wood:0,stone:0,copper:0,gold:0,diamond:0,coal:0}) as Res;
 const received=empty(),spent=empty(),history=c.resourceHistory;
 const from=Math.max(history?.since??now,Math.floor(now/BUCKET_MS)*BUCKET_MS-RESOURCE_HISTORY_MS+BUCKET_MS);
 for(const bucket of history?.buckets??[])if(bucket.at>=from-from%BUCKET_MS&&bucket.at<=now){
  for(const [r,n]of Object.entries(bucket.received))received[r as ResKey]+=n??0;
  for(const [r,n]of Object.entries(bucket.spent))spent[r as ResKey]+=n??0;
 }
 return {received,spent,elapsedMs:Math.max(0,now-from)};
}
