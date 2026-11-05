// Shared game engine. Runs on the server (source of truth) and on the client
// (to show live numbers between requests). Must stay deterministic: same city +
// same timestamp => same result, so random events use a seeded RNG.

export const W = 24;
export const H = 16;
export const G = 0, F = 1, HL = 2, R = 3, O = 4;

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const SEASON_MS = 6 * HOUR; // 4 seasons = 1 real day
export const MAX_SETTLE_MS = 14 * 24 * HOUR; // offline progress cap
const BASE_STORAGE = 500;
const FOOD_PER_POP = 4; // per hour
const MIN_POP = 3;

export const SEASONS = ["Xuân", "Hạ", "Thu", "Đông"];
export const ERA_NAMES = ["", "Thời đồ đá", "Thời đồ đồng", "Thời đồ sắt"];
export const TERRAIN = ["Đồng cỏ", "Rừng", "Đồi đá", "Sông", "Mỏ đồng"];
export const RES = ["food", "wood", "stone", "copper"] as const;
export type ResKey = (typeof RES)[number];
export type Res = Record<ResKey, number>;
export const RN: Record<ResKey, string> = { food: "Lương thực", wood: "Gỗ", stone: "Đá", copper: "Đồng" };

type Need = "forest" | "hill" | "ore" | "water" | "river" | "bank";
export type Def = {
  n: string;
  era: number;
  cost: Partial<Res>;
  sec: number; // build time for level 1
  jobs?: number;
  prod?: Partial<Res>; // per hour at level 1
  use?: Partial<Res>; // per hour at level 1
  house?: number;
  storage?: number;
  need?: Need;
  max?: number;
  up?: boolean; // can upgrade to level 3
  d: string;
};

const DEFS = {
  hut: { n: "Lều", era: 1, cost: { wood: 30 }, sec: 20, house: 3, up: true, d: "Chỗ ở cho 3 người mỗi cấp." },
  gather: { n: "Trại hái lượm", era: 1, cost: { wood: 25 }, sec: 20, jobs: 2, prod: { food: 60 }, up: true, d: "Lương thực. Thêm 50% trên đất phù sa." },
  wood: { n: "Trại đốn gỗ", era: 1, cost: { food: 30 }, sec: 20, jobs: 2, prod: { wood: 60 }, need: "forest", up: true, d: "Phải kề rừng." },
  quarry: { n: "Bãi đá", era: 1, cost: { wood: 50 }, sec: 40, jobs: 2, prod: { stone: 40 }, need: "hill", up: true, d: "Đặt trên đồi." },
  storehouse: { n: "Kho", era: 1, cost: { wood: 60, stone: 20 }, sec: 90, storage: 1000, up: true, d: "+1.000 sức chứa mỗi loại, mỗi cấp." },
  fire: { n: "Bếp lửa chung", era: 1, cost: { wood: 80, stone: 30 }, sec: 60, max: 2, d: "Dân tăng nhanh gấp đôi. Tối đa 2 bếp." },
  farm: { n: "Ruộng lúa", era: 2, cost: { wood: 80 }, sec: 120, jobs: 2, prod: { food: 90 }, up: true, d: "Gấp đôi trên đất phù sa." },
  canal: { n: "Kênh tưới", era: 2, cost: { stone: 40 }, sec: 30, need: "water", d: "Nối thẳng vào sông hoặc kênh. Đất quanh kênh thành phù sa." },
  levee: { n: "Đê đất", era: 2, cost: { stone: 30, wood: 20 }, sec: 60, need: "bank", d: "Sát bờ sông. Che lũ cho công trình trong 2 ô." },
  house: { n: "Nhà gỗ", era: 2, cost: { wood: 120, stone: 40 }, sec: 300, house: 7, up: true, d: "Chỗ ở cho 7 người mỗi cấp." },
  smelter: { n: "Lò đúc đồng", era: 2, cost: { wood: 100, stone: 120 }, sec: 600, jobs: 3, prod: { copper: 20 }, use: { wood: 20 }, need: "ore", up: true, d: "Kề mỏ đồng. Đốt gỗ ra đồng." },
  market: { n: "Chợ", era: 2, cost: { wood: 200, stone: 100 }, sec: 900, jobs: 2, max: 3, d: "+10% mọi sản lượng. Tối đa 3 chợ." },
  stonehouse: { n: "Nhà đá", era: 3, cost: { stone: 250, copper: 30 }, sec: 1200, house: 12, up: true, d: "12 người mỗi cấp. Lũ không làm ngập." },
  forge: { n: "Lò rèn", era: 3, cost: { stone: 200, copper: 100 }, sec: 1800, jobs: 3, max: 2, d: "+25% hái lượm, ruộng, gỗ, đá. Tối đa 2." },
  wheel: { n: "Cối nước", era: 3, cost: { wood: 200, stone: 100 }, sec: 1200, jobs: 2, prod: { food: 150 }, need: "river", up: true, d: "Sát sông. Mùa đông không giảm." },
  temple: { n: "Đền Sông Mẹ", era: 3, cost: { wood: 800, stone: 1200, copper: 400 }, sec: 4 * 3600, max: 1, d: "Kỳ quan của thành phố." },
} satisfies Record<string, Def>;
export type BKey = keyof typeof DEFS;
export const B: Record<BKey, Def> = DEFS;
export const BKEYS = Object.keys(B) as BKey[];
export const def = (k: BKey): Def => B[k];

const FLOODPROOF = new Set<BKey>(["canal", "levee", "wheel", "stonehouse", "temple"]);
export const isFloodproof = (k: BKey) => FLOODPROOF.has(k);
export const LVL_MULT = [0, 1, 1.6, 2.4];
export const MAX_LVL = 3;

export const ERA_REQ: Record<number, { pop: number; cost: Partial<Res> }> = {
  2: { pop: 15, cost: { food: 300, wood: 300, stone: 150 } },
  3: { pop: 40, cost: { food: 1000, stone: 700, copper: 200 } },
};
const ERA_UP: Record<number, string> = {
  2: "Bước vào Thời đồ đồng: mở ruộng lúa, kênh tưới, đê đất, nhà gỗ, lò đúc đồng và chợ.",
  3: "Bước vào Thời đồ sắt: mở nhà đá, lò rèn, cối nước và Đền Sông Mẹ.",
};

export type Building = { k: BKey; lvl: number; doneAt: number | null; flooded?: boolean };
export type LogEntry = { at: number; msg: string; cls?: "warn" | "good" };
export type City = {
  seed: number;
  t: number[];
  oldbed: number[];
  xs: number[];
  b: (Building | null)[];
  res: Res;
  pop: number;
  popAcc: number;
  era: number;
  t0: number;
  last: number;
  seasonIdx: number;
  boostUntil: number;
  shift: { warn: number; at: number; xs: number[] | null; done: boolean } | null;
  templeAt: number | null;
  log: LogEntry[];
};

export const idx = (x: number, y: number) => y * W + x;
export const inb = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
export const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
export const N8 = [...N4, [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;

export function rng(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function riverSet(xs: number[]) {
  const s = new Set<number>();
  for (let y = 0; y < H; y++) {
    const a = y ? Math.min(xs[y - 1], xs[y]) : xs[y];
    const b = y ? Math.max(xs[y - 1], xs[y]) : xs[y];
    for (let x = a; x <= b; x++) s.add(idx(x, y));
  }
  return s;
}

export const seasonIndexAt = (c: City, at: number) => Math.floor((at - c.t0) / SEASON_MS);
export const seasonAt = (c: City, at: number) => seasonIndexAt(c, at) % 4;
export const stamp = (c: City, at: number) => {
  const si = seasonIndexAt(c, at);
  return `Năm ${Math.floor(si / 4) + 1}, mùa ${SEASONS[si % 4]}`;
};
export const costText = (cost: Partial<Res>) =>
  RES.filter((r) => cost[r]).map((r) => `${cost[r]} ${RN[r].toLowerCase()}`).join(" · ") || "Miễn phí";

function log(c: City, at: number, msg: string, cls?: LogEntry["cls"]) {
  c.log.unshift(cls ? { at, msg, cls } : { at, msg });
  if (c.log.length > 60) c.log.length = 60;
}

export function newCity(now: number, seed = (Math.random() * 1e9) | 0): City {
  const r = rng(seed);
  const t = new Array<number>(W * H).fill(G);
  const blob = (cx: number, cy: number, rad: number, val: number, p: number) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
      if (Math.hypot(x - cx, y - cy) < rad && r() < p) t[idx(x, y)] = val;
  };
  for (let k = 0; k < 7; k++) blob(r() * W, r() * H, 1.6 + r() * 2.2, F, 0.85);
  for (let k = 0; k < 4; k++) {
    const left = k % 2 === 0;
    blob(left ? r() * 5 : W - 1 - r() * 5, 2 + r() * (H - 4), 1.4 + r() * 1.4, HL, 0.9);
  }
  const xs: number[] = [];
  let x = (W >> 1) + (((r() * 5) | 0) - 2);
  for (let y = 0; y < H; y++) {
    if (y > 0) {
      const q = r();
      if (q < 0.3) x--; else if (q < 0.6) x++;
      x = Math.max(5, Math.min(W - 6, x));
    }
    xs.push(x);
  }
  for (const i of riverSet(xs)) t[i] = R;
  const hills: number[] = [];
  t.forEach((v, i) => { if (v === HL) hills.push(i); });
  for (let k = 0; k < 4 && hills.length; k++) t[hills.splice((r() * hills.length) | 0, 1)[0]] = O;
  if (!t.includes(O)) { t[idx(1, 2)] = O; t[idx(2, 2)] = HL; }
  const c: City = {
    seed, t, oldbed: new Array(W * H).fill(0), xs, b: new Array(W * H).fill(null),
    res: { food: 100, wood: 120, stone: 30, copper: 0 }, pop: 5, popAcc: 0, era: 1,
    t0: now, last: now, seasonIdx: 0, boostUntil: 0, shift: null, templeAt: null, log: [],
  };
  log(c, now, "Bộ lạc 5 người dừng chân bên sông. Dựng lều và tìm thức ăn trước mùa đông.");
  return c;
}

export type Derived = { rd: number[]; wet: boolean[]; fert: boolean[]; prot: boolean[] };
const built = (b: Building | null): b is Building => !!b && b.lvl >= 1;

export function derive(c: City): Derived {
  const t = c.t, riv: number[] = [];
  t.forEach((v, i) => { if (v === R) riv.push(i); });
  const rd = new Array<number>(W * H).fill(99);
  for (let i = 0; i < W * H; i++) {
    const x = i % W, y = (i / W) | 0;
    for (const j of riv) {
      const d = Math.max(Math.abs(x - (j % W)), Math.abs(y - ((j / W) | 0)));
      if (d < rd[i]) rd[i] = d;
    }
  }
  const isCanal = (j: number) => { const b = c.b[j]; return built(b) && b.k === "canal"; };
  const wet = new Array<boolean>(W * H).fill(false), q: number[] = [];
  for (let i = 0; i < W * H; i++) {
    if (!isCanal(i)) continue;
    const x = i % W, y = (i / W) | 0;
    if (N4.some(([dx, dy]) => inb(x + dx, y + dy) && t[idx(x + dx, y + dy)] === R)) { wet[i] = true; q.push(i); }
  }
  while (q.length) {
    const i = q.pop()!, x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of N4) {
      if (!inb(x + dx, y + dy)) continue;
      const j = idx(x + dx, y + dy);
      if (!wet[j] && isCanal(j)) { wet[j] = true; q.push(j); }
    }
  }
  const fert = new Array<boolean>(W * H).fill(false), prot = new Array<boolean>(W * H).fill(false);
  for (let i = 0; i < W * H; i++) if (t[i] === G && (rd[i] <= 2 || c.oldbed[i])) fert[i] = true;
  c.b.forEach((b, i) => {
    if (!built(b)) return;
    const x = i % W, y = (i / W) | 0;
    const around = (r: number, fn: (j: number) => void) => {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (inb(x + dx, y + dy)) fn(idx(x + dx, y + dy));
    };
    if (b.k === "canal" && wet[i]) around(1, (j) => { if (t[j] === G) fert[j] = true; });
    if (b.k === "levee") around(2, (j) => { prot[j] = true; });
  });
  return { rd, wet, fert, prot };
}

const count = (c: City, k: BKey) => c.b.reduce((n, b) => n + (b && b.k === k ? 1 : 0), 0);
export const builders = (c: City) => c.era + 1;
export const busyBuilders = (c: City) => c.b.reduce((n, b) => n + (b && b.doneAt ? 1 : 0), 0);
export const buildMs = (k: BKey, lvl: number) => def(k).sec * 1000 * 3 ** (lvl - 1);
export const levelCost = (k: BKey, lvl: number): Partial<Res> => {
  const m = [0, 1, 2, 4][lvl], out: Partial<Res> = {};
  for (const r of RES) if (def(k).cost[r]) out[r] = def(k).cost[r]! * m;
  return out;
};
export const repairCost = (k: BKey): Partial<Res> => {
  const out: Partial<Res> = {};
  for (const r of RES) if (def(k).cost[r]) out[r] = Math.ceil(def(k).cost[r]! / 4);
  return out;
};
const canAfford = (c: City, cost: Partial<Res>) => RES.every((r) => (cost[r] ?? 0) <= c.res[r]);
const missing = (c: City, cost: Partial<Res>) => {
  const m = RES.filter((r) => (cost[r] ?? 0) > c.res[r]);
  return m.length ? "Thiếu " + m.map((r) => RN[r].toLowerCase()).join(", ") + "." : null;
};
const pay = (c: City, cost: Partial<Res>, sign = -1) => { for (const r of RES) c.res[r] += sign * (cost[r] ?? 0); };

export type Stats = {
  rate: Res; // net per hour
  woodUse: number;
  copperRate: number;
  jobs: number;
  housing: number;
  storage: number;
  fires: number;
};

export function stats(c: City, D: Derived, at: number): Stats {
  const cnt: Partial<Record<BKey, number>> = {};
  let jobs = 0, housing = 0, storage = BASE_STORAGE;
  for (const b of c.b) {
    if (!built(b) || b.flooded) continue;
    const d = def(b.k);
    jobs += d.jobs ?? 0;
    housing += (d.house ?? 0) * b.lvl;
    storage += (d.storage ?? 0) * b.lvl;
    cnt[b.k] = (cnt[b.k] ?? 0) + 1;
  }
  const eff = jobs ? Math.min(1, c.pop / jobs) : 0;
  const mult = 1 + 0.1 * Math.min(3, cnt.market ?? 0);
  const tools = 1 + 0.25 * Math.min(2, cnt.forge ?? 0);
  const winter = seasonAt(c, at) === 3;
  const boost = at < c.boostUntil;
  const rate: Res = { food: 0, wood: 0, stone: 0, copper: 0 };
  let woodUse = 0;
  c.b.forEach((b, i) => {
    if (!built(b) || b.flooded) return;
    const d = def(b.k);
    if (d.use?.wood) woodUse += d.use.wood * LVL_MULT[b.lvl] * eff;
    if (!d.prod) return;
    for (const r of RES) {
      let v = d.prod[r];
      if (!v) continue;
      v *= LVL_MULT[b.lvl];
      const crop = b.k === "farm" || b.k === "gather";
      if (crop && D.fert[i]) v *= b.k === "farm" ? 2 : 1.5;
      if (crop && D.fert[i] && boost) v *= 1.5;
      if (crop && winter) v *= 0.4;
      if (crop || b.k === "wood" || b.k === "quarry") v *= tools;
      rate[r] += v * eff * mult;
    }
  });
  const copperRate = rate.copper;
  rate.food -= c.pop * FOOD_PER_POP;
  return { rate, woodUse, copperRate, jobs, housing, storage, fires: Math.min(2, cnt.fire ?? 0) };
}

function newCourse(c: City, r: () => number) {
  for (let a = 0; a < 30; a++) {
    const top = 2 + ((r() * 3) | 0), bot = H - 3 - ((r() * 3) | 0);
    const off = (r() < 0.5 ? -1 : 1) * (3 + ((r() * 2) | 0));
    const xs = c.xs.map((x, y) => {
      if (y < top || y > bot) return x;
      const k = Math.min(y - top, bot - y, 2) / 2;
      return Math.max(1, Math.min(W - 2, Math.round(x + off * k)));
    });
    if ([...riverSet(xs)].some((i) => c.t[i] === O)) continue;
    if (xs.every((x, y) => x === c.xs[y])) continue;
    return xs;
  }
  return c.xs.slice();
}

function flood(c: City, D: Derived, at: number, r: () => number) {
  if (r() > 0.6) { log(c, at, "Mùa thu êm, sông không tràn bờ."); return; }
  const hit: string[] = [];
  c.b.forEach((b, i) => {
    if (b && !b.flooded && D.rd[i] === 1 && !isFloodproof(b.k) && !D.prot[i] && r() < 0.45) {
      b.flooded = true;
      hit.push(def(b.k).n);
    }
  });
  c.boostUntil = at + 4 * SEASON_MS;
  const tail = "Phù sa mới: hái lượm và ruộng trên đất phù sa +50% trong một năm.";
  log(c, at, hit.length
    ? `Lũ mùa thu làm ngập ${hit.length} công trình (${[...new Set(hit)].join(", ")}). Bấm vào để sửa. ${tail}`
    : `Lũ tràn bờ nhưng không gây hại. ${tail}`, hit.length ? "warn" : "good");
}

function applyShift(c: City, at: number) {
  const s = c.shift!;
  const oldS = riverSet(c.xs), newS = riverSet(s.xs!);
  let lost = 0;
  for (const i of oldS) if (!newS.has(i)) { c.t[i] = G; c.oldbed[i] = 1; }
  for (const i of newS) { if (c.b[i]) { c.b[i] = null; lost++; } c.t[i] = R; c.oldbed[i] = 0; }
  c.xs = s.xs!;
  s.done = true;
  c.boostUntil = at + 4 * SEASON_MS;
  const D = derive(c);
  const dry = c.b.filter((b, i) => b && b.k === "canal" && b.lvl >= 1 && !D.wet[i]).length;
  log(c, at, `Đại hồng thủy: sông đổi dòng${lost ? `, nuốt ${lost} công trình` : ""}. Lòng sông cũ thành bãi bồi màu mỡ.${dry ? ` ${dry} đoạn kênh mất nguồn nước.` : ""}`, "warn");
}

function onSeason(c: City, si: number) {
  const at = c.t0 + si * SEASON_MS;
  const r = rng(c.seed ^ Math.imul(si + 1, 2654435761));
  const s = c.shift;
  if (s && !s.done && si === s.warn) {
    s.xs = newCourse(c, r);
    log(c, at, "Già làng xem nước: mùa thu tới sông sẽ đổi dòng. Ô viền nét đứt là dòng mới.", "warn");
  }
  if (si % 4 === 2) {
    if (s && !s.done && si === s.at && s.xs) applyShift(c, at);
    else flood(c, derive(c), at, r);
  }
}

/** Advance the city to `now`: finish construction, run seasons, produce, grow. Mutates `c`. */
export function settle(c: City, now: number) {
  if (now <= c.last) return;
  let t = c.last;
  if (now - t > MAX_SETTLE_MS) {
    t = now - MAX_SETTLE_MS;
    c.seasonIdx = Math.max(c.seasonIdx, seasonIndexAt(c, t));
  }
  let D = derive(c), st = stats(c, D, t), dirty = false;
  while (t < now) {
    const nt = Math.min(now, (Math.floor(t / MIN) + 1) * MIN); // absolute minute steps so client and server agree
    for (const b of c.b) {
      if (b && b.doneAt && b.doneAt <= nt) {
        b.lvl += 1;
        b.doneAt = null;
        dirty = true;
        if (b.k === "temple" && !c.templeAt) {
          c.templeAt = nt;
          log(c, nt, "Đền Sông Mẹ khánh thành. Thành phố đã đi từ lều cỏ tới kỳ quan.", "good");
        }
      }
    }
    const si = seasonIndexAt(c, nt);
    while (c.seasonIdx < si) { c.seasonIdx++; onSeason(c, c.seasonIdx); dirty = true; }
    if (dirty) { D = derive(c); st = stats(c, D, nt); dirty = false; }

    const h = (nt - t) / HOUR;
    const woodBefore = c.res.wood + st.rate.wood * h;
    const need = st.woodUse * h;
    const ratio = need > 0 ? Math.max(0, Math.min(1, woodBefore / need)) : 1;
    c.res.food += st.rate.food * h;
    c.res.wood = woodBefore - need * ratio;
    c.res.stone += st.rate.stone * h;
    c.res.copper += st.copperRate * ratio * h;
    for (const r of RES) c.res[r] = Math.max(r === "food" ? -Infinity : 0, Math.min(st.storage, c.res[r]));

    const popBefore = c.pop;
    if (c.res.food < 0) {
      c.res.food = 0;
      c.popAcc -= h * 6; // lose 1 person / 10 min while starving
    } else if (c.pop < st.housing) {
      c.popAcc += h * 12 * (1 + st.fires); // 1 person / 5 min
    } else c.popAcc = 0;
    while (c.popAcc >= 1 && c.pop < st.housing) { c.pop++; c.popAcc--; }
    while (c.popAcc <= -1 && c.pop > MIN_POP) { c.pop--; c.popAcc++; }
    c.popAcc = Math.max(-1, Math.min(1, c.popAcc));
    if (c.pop !== popBefore) dirty = true;
    t = nt;
  }
  c.last = now;
}

export function canPlace(c: City, D: Derived, k: BKey, x: number, y: number): string | null {
  const d = def(k), i = idx(x, y), t = c.t[i];
  if (d.era > c.era) return "Chưa tới thời đại này.";
  if (c.b[i]) return "Ô này đã có công trình.";
  if (t === R) return "Không xây được trên sông.";
  if (k === "quarry") { if (t !== HL) return "Bãi đá phải đặt trên đồi."; }
  else if (t === HL || t === O) return "Đồi đá chỉ đặt được bãi đá.";
  else if (t === F) return "Rừng rậm, hãy chọn ô cỏ.";
  const near = (dirs: readonly (readonly [number, number])[], fn: (j: number) => boolean) =>
    dirs.some(([dx, dy]) => inb(x + dx, y + dy) && fn(idx(x + dx, y + dy)));
  if (d.need === "forest" && !near(N8, (j) => c.t[j] === F)) return "Trại đốn gỗ phải kề rừng.";
  if (d.need === "ore" && !near(N8, (j) => c.t[j] === O)) return "Lò đúc phải kề mỏ đồng (đốm cam trên đồi).";
  if (d.need === "water" && !near(N4, (j) => c.t[j] === R || c.b[j]?.k === "canal")) return "Kênh phải nối thẳng (không chéo) vào sông hoặc kênh khác.";
  if (d.need === "river" && !near(N4, (j) => c.t[j] === R)) return "Cối nước phải sát sông (không chéo).";
  if (d.need === "bank" && D.rd[i] !== 1) return "Đê phải đặt sát bờ sông.";
  if (d.max && count(c, k) >= d.max) return `Đã đủ số lượng tối đa (${d.max}).`;
  if (busyBuilders(c) >= builders(c)) return "Tất cả thợ đang bận.";
  return missing(c, d.cost);
}

export function reqMet(c: City) {
  const r = ERA_REQ[c.era + 1];
  return !!r && c.pop >= r.pop && canAfford(c, r.cost);
}

export function score(c: City) {
  let s = c.era * 1000 + c.pop * 5 + (c.templeAt ? 5000 : 0);
  for (const b of c.b) if (b) s += b.lvl * 10;
  return s;
}

export type Action =
  | { type: "build"; k: BKey; x: number; y: number }
  | { type: "upgrade"; x: number; y: number }
  | { type: "repair"; x: number; y: number }
  | { type: "demolish"; x: number; y: number }
  | { type: "advance" };

/** Validate and apply a player action at time `now`. Returns an error message or null. Mutates `c`. */
export function applyAction(c: City, a: Action, now: number): string | null {
  settle(c, now);
  if (a.type === "advance") {
    if (!reqMet(c)) return "Chưa đủ điều kiện lên thời đại mới.";
    pay(c, ERA_REQ[c.era + 1].cost);
    c.era++;
    log(c, now, ERA_UP[c.era], "good");
    if (c.era === 2) {
      let at = seasonIndexAt(c, now) + 4;
      while (at % 4 !== 2) at++;
      c.shift = { warn: at - 4, at, xs: null, done: false };
    }
    return null;
  }
  if (!Number.isInteger(a.x) || !Number.isInteger(a.y) || !inb(a.x, a.y)) return "Ô không hợp lệ.";
  const i = idx(a.x, a.y), b = c.b[i];
  if (a.type === "build") {
    if (!(a.k in B)) return "Công trình không hợp lệ.";
    const err = canPlace(c, derive(c), a.k, a.x, a.y);
    if (err) return err;
    pay(c, def(a.k).cost);
    c.b[i] = { k: a.k, lvl: 0, doneAt: now + buildMs(a.k, 1) };
    return null;
  }
  if (!b) return "Ô này trống.";
  if (a.type === "demolish") {
    const refund = levelCost(b.k, Math.max(1, b.lvl));
    for (const r of RES) c.res[r] += Math.floor((refund[r] ?? 0) / 2);
    c.b[i] = null;
    return null;
  }
  if (a.type === "repair") {
    if (!b.flooded) return "Công trình không bị ngập.";
    const cost = repairCost(b.k);
    const err = missing(c, cost);
    if (err) return err;
    pay(c, cost);
    b.flooded = false;
    return null;
  }
  if (a.type === "upgrade") {
    const d = def(b.k);
    if (!d.up) return "Công trình này không nâng cấp được.";
    if (b.doneAt) return "Đang xây dở.";
    if (b.flooded) return "Phải sửa trước khi nâng cấp.";
    if (b.lvl >= MAX_LVL) return "Đã cấp tối đa.";
    if (busyBuilders(c) >= builders(c)) return "Tất cả thợ đang bận.";
    const cost = levelCost(b.k, b.lvl + 1);
    const err = missing(c, cost);
    if (err) return err;
    pay(c, cost);
    b.doneAt = now + buildMs(b.k, b.lvl + 1);
    return null;
  }
  return "Hành động không hợp lệ.";
}
