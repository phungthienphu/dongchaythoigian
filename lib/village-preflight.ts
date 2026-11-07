/** Read-only T06 preparation. This module never changes ownership or writes DB/DO. */
import { ENGINE_VER } from './engine';
import { RELEASE_RULES } from './eras';
import type { CityDoc } from './db';

export type VillageOwner={backend:'mongo'|'migrating'|'durable-object';epoch:number};
export type TransferCity=CityDoc&{villageOwner?:VillageOwner};
export type MigrationRelations={consistentSnapshot:boolean;marketOrders:number;caravans:number;battles:number;envoyVisits:number};
export type VillageTransfer={protocol:1;engine:number;rules:typeof RELEASE_RULES;epoch:number;session:number;capturedAt:number;city:Record<string,unknown>};
export type PreflightResult={ready:false;blockers:string[]}|{ready:true;envelope:VillageTransfer;checksum:string;bytes:number};

/** Stable JSON for a portable checkpoint; rejects values JSON would silently lose. */
export function canonicalTransfer(value:unknown):string {
  if(value===null)return 'null';
  if(value instanceof Date){if(!Number.isFinite(value.getTime()))throw new Error('Invalid date');return JSON.stringify(value.toISOString());}
  if(Array.isArray(value))return '['+value.map(v=>v===undefined?'null':canonicalTransfer(v)).join(',')+']';
  if(typeof value==='object')return '{'+Object.entries(value as Record<string,unknown>).filter(([,v])=>v!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>JSON.stringify(k)+':'+canonicalTransfer(v)).join(',')+'}';
  if(typeof value==='number'&&!Number.isFinite(value))throw new Error('Non-finite checkpoint number');
  if(['string','number','boolean'].includes(typeof value))return JSON.stringify(value);
  throw new Error('Unsupported checkpoint value');
}
export async function transferChecksum(value:unknown) {
  const bytes=new TextEncoder().encode(canonicalTransfer(value));
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');
}
export async function preflightVillage(doc:TransferCity,relations:MigrationRelations,session:number,at:number):Promise<PreflightResult> {
  const blockers:string[]=[];
  if(!doc.owner)blockers.push('missing-account-owner');
  if(!Number.isSafeInteger(session)||session<1)blockers.push('invalid-account-session');
  if(!Number.isSafeInteger(at)||at<0)blockers.push('invalid-capture-time');
  if(!Number.isSafeInteger(doc.ver)||doc.ver<0)blockers.push('invalid-city-revision');
  if(doc.state.ver!==ENGINE_VER)blockers.push('unsupported-engine');
  const owner=doc.villageOwner??{backend:'mongo',epoch:0};
  if(owner.backend!=='mongo')blockers.push('source-is-not-mongo-owner');
  if(!Number.isSafeInteger(owner.epoch)||owner.epoch<0)blockers.push('invalid-owner-epoch');
  if(!relations.consistentSnapshot)blockers.push('relations-not-read-in-consistent-snapshot');
  for(const key of ['marketOrders','caravans','battles','envoyVisits'] as const){
    if(!Number.isSafeInteger(relations[key])||relations[key]<0)blockers.push('invalid-relation-count:'+key);
    else if(relations[key]>0)blockers.push('active-relation:'+key);
  }
  if(doc.incomingBattleId||doc.outboundBattleId||doc.state.battleId)blockers.push('battle-reference');
  if(Object.values(doc.state.deployedArmy??{}).some(n=>(n??0)>0)||doc.state.deployedShips)blockers.push('deployed-force');
  if(doc.envoyOutbox?.length)blockers.push('pending-envoy-outbox');
  if(doc.state.trips?.length)blockers.push('travelling-envoys');
  if(doc.state.merchantJourneys?.length)blockers.push('merchant-journeys');
  if(doc.state.exps.length)blockers.push('active-exploration');
  const ledger=doc.citySync;
  if(ledger){
    if(ledger.session!==session)blockers.push('ledger-session-mismatch');
    if(!Number.isSafeInteger(ledger.ack)||ledger.ack<0||!Number.isSafeInteger(ledger.lastAt)||ledger.lastAt<0)blockers.push('invalid-ledger-watermark');
    if(!Array.isArray(ledger.results)||ledger.results.length>256||ledger.results.some((r,n)=>!Number.isSafeInteger(r.seq)||r.seq<1||r.seq>ledger.ack||(n>0&&r.seq<=ledger.results[n-1].seq)))blockers.push('invalid-ledger-receipts');
  }
  if(blockers.length)return {ready:false,blockers};
  try {
    // Clone all fields, including receipts, world location and future additive
    // metadata. No settlement, resource normalization or timer rewrites here.
    const city=JSON.parse(canonicalTransfer(doc)) as Record<string,unknown>;
    const envelope:VillageTransfer={protocol:1,engine:ENGINE_VER,rules:{...RELEASE_RULES},epoch:owner.epoch,session,capturedAt:at,city};
    const bytes=new TextEncoder().encode(canonicalTransfer(envelope)).byteLength;
    // Leave headroom for target SQL row metadata and later inbox/outbox fields.
    if(bytes>1536*1024)return {ready:false,blockers:['checkpoint-too-large']};
    return {ready:true,envelope,checksum:await transferChecksum(envelope),bytes};
  } catch{return {ready:false,blockers:['checkpoint-not-portable-json']};}
}
