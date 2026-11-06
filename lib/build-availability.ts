import {B, type BKey, type City} from './engine';
/** Includes unfinished and damaged structures: these still occupy their limit. */
export function buildAvailability(c:City,k:BKey){
  const definition=B[k],count=Object.values(c.b).filter(b=>b.k===k).length;
  const limit=definition.max,capped=limit!==undefined&&count>=limit;
  return {count,limit,capped,locked:capped||definition.era>c.era,
    reason:capped?`Đã đủ giới hạn ${count}/${limit}. Nâng cấp công trình hiện có để phát triển thêm.`:definition.era>c.era?'Chưa mở thời đại của công trình này.':null};
}
