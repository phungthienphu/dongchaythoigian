import { createHmac, timingSafeEqual } from 'node:crypto';
import { ENGINE_VER } from './engine';
import { ANCHOR_WINDOW_MS, type CitySync, type SyncLedger } from './city-sync';

type Anchor = { cityId:string; session:number; engine:number; revision:number; at:number; until:number };
function sign(value:string) {
  const secret=process.env.AUTH_SECRET;
  if(!secret || secret.length<32)throw new Error('Thiếu AUTH_SECRET.');
  return createHmac('sha256',secret).update('city-sync-v1:'+value).digest('base64url');
}
export function citySync(doc:{_id:string;ver:number;citySync?:SyncLedger;state?:{last:number}},session:number,at:number,checkpointAt=doc.state?.last??at,resultRange?:readonly[number,number]):CitySync {
  const a:Anchor={cityId:doc._id,session,engine:ENGINE_VER,revision:doc.ver,at,until:at+ANCHOR_WINDOW_MS};
  const raw=Buffer.from(JSON.stringify(a)).toString('base64url');
  const ledger=doc.citySync?.session===session?doc.citySync:undefined;
  const results=(ledger?.results??[]).filter(r=>!resultRange||r.seq>=resultRange[0]&&r.seq<=resultRange[1]).map(({digest:_digest,...r})=>r);
  return {...a,checkpointAt,anchor:`${raw}.${sign(raw)}`,ack:ledger?.ack??0,results};
}
export function readAnchor(token:string):Anchor|null {
  if(token.length>2048)return null;
  const [raw,sig,extra]=token.split('.');if(!raw||!sig||extra)return null;
  const want=Buffer.from(sign(raw)),got=Buffer.from(sig);
  if(want.length!==got.length||!timingSafeEqual(want,got))return null;
  try {
    const a=JSON.parse(Buffer.from(raw,'base64url').toString()) as Anchor;
    return typeof a.cityId==='string' && Number.isSafeInteger(a.session) && a.session>0
      && a.engine===ENGINE_VER && Number.isSafeInteger(a.revision) && a.revision>=0
      && Number.isSafeInteger(a.at) && a.until===a.at+ANCHOR_WINDOW_MS?a:null;
  } catch {return null;}
}
