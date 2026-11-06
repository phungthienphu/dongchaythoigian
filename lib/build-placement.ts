import { B, RES, W, canPlace, type BKey, type City, type Derived } from './engine';

// Reuse tile checks across animation frames; simulation/actions invalidate them.
const cache = new WeakMap<Derived, { city: City; key: string; tools: Map<BKey, Int8Array> }>();
export function placementTiles(c: City, d: Derived, tool: BKey) {
  const key = `${c.last}:${c.era}:${RES.map(r => c.res[r]).join(',')}:${Object.entries(c.b).map(([i,b])=>`${i}/${b.k}/${b.lvl}/${b.doneAt}/${b.burned}/${b.flooded}`).join('|')}`;
  let entry = cache.get(d);
  if (!entry || entry.city !== c || entry.key !== key) {
    entry = { city: c, key, tools: new Map() }; cache.set(d, entry);
  }
  let tiles = entry.tools.get(tool);
  if (!tiles) { tiles = new Int8Array(W * W).fill(-1); entry.tools.set(tool, tiles); }
  return (i: number) => {
    if (tiles[i] < 0) tiles[i] = canPlace(c,d,tool,i%W,Math.floor(i/W)) ? 0 : 1;
    return tiles[i] === 1;
  };
}
export function placementHint(k: BKey) {
  if (k === 'quarry') return 'Đặt trên ô đồi đá đã khám phá.';
  const need = B[k].need;
  if (need === 'forest') return 'Đặt trên ô cỏ kề rừng, kể cả kề chéo.';
  if (need === 'ore') return 'Đặt trên ô cỏ kề mỏ đồng có đốm cam.';
  if (need === 'water') return 'Đặt trên ô đất nối thẳng vào sông hoặc kênh; không nối chéo.';
  if (need === 'river') return 'Đặt trên ô đất sát sông; không kề chéo.';
  if (need === 'bank') return 'Đặt trên ô đất sát bờ sông.';
  return 'Đặt trên ô cỏ trống đã khám phá. Chặt hết cây trước nếu muốn dùng đất rừng.';
}
