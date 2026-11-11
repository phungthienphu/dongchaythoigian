import {MAGIC_BUILDINGS,magicDef,type MagicBuilding} from './magic-data';
import {RELEASE_RULES,type EngineRules} from './eras';
import { B, RES, W, canPlace, type BKey, type City, type Derived } from './engine';

// Reuse tile checks across animation frames; simulation/actions invalidate them.
const cache = new WeakMap<Derived, { city: City; key: string; tools: Map<BKey, Int8Array> }>();
export function placementTiles(c: City, d: Derived, tool: BKey,rules:EngineRules=RELEASE_RULES) {
  const key = `${rules.maxEra}:${c.last}:${c.era}:${RES.map(r => c.res[r]).join(',')}:${Object.entries(c.b).map(([i,b])=>`${i}/${b.k}/${b.lvl}/${b.doneAt}/${b.burned}/${b.flooded}`).join('|')}`;
  let entry = cache.get(d);
  if (!entry || entry.city !== c || entry.key !== key) {
    entry = { city: c, key, tools: new Map() }; cache.set(d, entry);
  }
  let tiles = entry.tools.get(tool);
  if (!tiles) { tiles = new Int8Array(W * W).fill(-1); entry.tools.set(tool, tiles); }
  return (i: number) => {
    if (tiles[i] < 0) tiles[i] = canPlace(c,d,tool,i%W,Math.floor(i/W),rules) ? 0 : 1;
    return tiles[i] === 1;
  };
}
export function placementHint(k: BKey) {
  if(k in MAGIC_BUILDINGS){const d=magicDef(k as MagicBuilding),support=d.support?.map(s=>B[s as BKey].n).join(' hoặc ');if(support)return `Cần ${support} hoạt động trong 6 ô và có đường nối${d.mana?' cùng nguồn mana':''}. Đặt trên đất trống; thiếu điều kiện thì xây xong chưa sản xuất.`;}

  if(k==='bridgehead')return 'Đặt ở bờ đối diện Cầu Sắt đã xây, thẳng hàng qua hơn 2 ô nước liên tục.';
  if (k === 'coalmine')return 'Đặt trên ô mỏ than có vân đen, đã khám phá.';
  if (k === 'quarry') return 'Đặt trên ô đồi đá đã khám phá.';
  const need = B[k].need;
  if (need === 'forest') return 'Đặt trên ô cỏ kề rừng, kể cả kề chéo.';
  if (need === 'ore') return 'Đặt trên ô cỏ kề mỏ đồng có đốm cam.';
  if (need === 'water') return 'Đặt trên ô đất nối thẳng vào sông hoặc kênh; không nối chéo.';
  if (need === 'river') return 'Đặt trên ô đất sát sông; không kề chéo.';
  if (need === 'bank') return 'Đặt sát bờ sông hoặc nối thẳng đoạn đê khác. Khép kín vòng đê để che lũ cho đất bên trong.';
  return 'Đặt trên ô cỏ trống đã khám phá. Chặt hết cây trước nếu muốn dùng đất rừng.';
}
