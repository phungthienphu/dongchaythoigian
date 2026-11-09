import type {Building,City} from './engine';

export const SHORT_BRIDGE_WATER_TILES=2;
export const MAX_BRIDGE_WATER_TILES=24;
const SIDE=96,WATER=3;
const active=(b:Building|undefined)=>!!b&&b.lvl>0&&!b.doneAt&&!b.burned&&!b.flooded&&!b.off;
export type BridgeSpan={to:number;tiles:number[];ready:boolean};

/** A straight crossing over one continuous river, with both banks discovered.
 * Water stays water: boats, irrigation and disasters keep their terrain rules. */
export function bridgeGeometry(c:Pick<City,'t'|'seen'|'b'>,from:number,to:number){
  const tiles:number[]=[];
  let error:string|null=null;
  if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=SIDE*SIDE||to>=SIDE*SIDE||from===to)error='Chọn hai bờ khác nhau.';
  else if(from%SIDE!==to%SIDE&&Math.floor(from/SIDE)!==Math.floor(to/SIDE))error='Hai đầu cầu phải thẳng hàng ngang hoặc dọc, không nối chéo.';
  else {
    const step=from%SIDE===to%SIDE?(to>from?SIDE:-SIDE):(to>from?1:-1);
    for(let i=from+step;i!==to;i+=step)tiles.push(i);
    if(!c.seen[from]||!c.seen[to]||tiles.some(i=>!c.seen[i]))error='Cần khám phá cả hai bờ và toàn bộ tuyến cầu.';
    else if(c.t[from]!==0||c.t[to]!==0)error='Hai đầu cầu phải nằm trên đất trống ở hai bờ sông.';
    else if(!tiles.length||tiles.some(i=>c.t[i]!==WATER||c.b[i]))error='Cầu phải vượt liên tục qua sông đến bờ đối diện, không đi qua đất hoặc công trình.';
    else if(tiles.length>MAX_BRIDGE_WATER_TILES)error=`Tuyến quá dài: tối đa ${MAX_BRIDGE_WATER_TILES} ô nước. Chọn đoạn sông hẹp hơn.`;
    else if(c.b[to]&&c.b[to].k!=='bridgehead')error='Bờ đối diện đang có công trình khác. Chọn ô trống hoặc Đầu cầu sắt.';
  }
  return {tiles,width:tiles.length,needsHead:tiles.length>SHORT_BRIDGE_WATER_TILES,error};
}

export function bridgeReady(c:Pick<City,'t'|'seen'|'b'>,from:number){
  const b=c.b[from],span=b?.bridge;
  if(b?.k!=='ironbridge'||!span?.ready||!active(b))return false;
  const plan=bridgeGeometry(c,from,span.to);
  if(plan.error||plan.tiles.length!==span.tiles.length||plan.tiles.some((i,n)=>span.tiles[n]!==i))return false;
  return !plan.needsHead||c.b[span.to]?.k==='bridgehead'&&active(c.b[span.to]);
}

/** Computed once per routing/render context, never by changing river terrain. */
export function bridgeDeck(c:Pick<City,'t'|'seen'|'b'>):ReadonlySet<number>{
  const tiles=new Set<number>();
  for(const [tile,b]of Object.entries(c.b))if(b.k==='ironbridge'&&bridgeReady(c,+tile))for(const i of b.bridge!.tiles)tiles.add(i);
  return tiles;
}

export function bridgeHeadSite(c:Pick<City,'t'|'seen'|'b'>,to:number){
  return Object.entries(c.b).some(([from,b])=>{
    if(b.k!=='ironbridge'||!active(b))return false;
    const plan=bridgeGeometry(c,+from,to);
    return !plan.error&&plan.needsHead&&(!b.bridge||!bridgeReady(c,+from)||b.bridge.to===to);
  });
}

/** Reserving land prevents building over the unoccupied short-bridge exit. */
export function bridgeExitReserved(c:Pick<City,'b'>,tile:number){
  return Object.values(c.b).some(b=>b.k==='ironbridge'&&b.bridge?.to===tile);
}
