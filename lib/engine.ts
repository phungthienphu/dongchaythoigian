// Shared game engine. Runs on the server (source of truth) and on the client
// (to show live numbers between requests). Must stay deterministic: same city +
// same timestamp => same result, so random events use a seeded RNG.

export const ENGINE_VER = 3;
export const W = 96;
export const H = 96;
export const G = 0, F = 1, HL = 2, R = 3, O = 4;

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const SEASON_MS = 6 * HOUR; // 4 seasons = 1 real day
export const MAX_SETTLE_MS = 14 * 24 * HOUR; // offline progress cap
const BASE_STORAGE = 500;
const FOOD_PER_POP = 4; // per hour
const MIN_POP = 3;

// gathering by hand (per person per hour) and how much each tile/animal holds
const CHOP_RATE = 30, STONE_RATE = 20, ORE_RATE = 8, HUNT_RATE = 40;
export const CAP = { forest: 400, hill: 1500, ore: 400 };
const MEAT_PER_ANIMAL = 50, HERD_REGROW = 0.5; // animals per hour
export const EXPLORE_TILES_PER_MIN = 36; // matches the on-screen walking pace (~0.6 tiles/s)
const START_SIGHT = 9, SCOUT_SIGHT = 3;

export const SEASONS = ["Xuân", "Hạ", "Thu", "Đông"];
export const ERA_NAMES = ["", "Thời đồ đá", "Thời đồ đồng", "Thời đồ sắt"];
export const TERRAIN = ["Đồng cỏ", "Rừng", "Đồi đá", "Sông", "Mỏ đồng"];
export const RES = ["food", "wood", "stone", "copper"] as const;
export type ResKey = (typeof RES)[number];
export type Res = Record<ResKey, number>;
export const RN: Record<ResKey, string> = { food: "Lương thực", wood: "Gỗ", stone: "Đá", copper: "Đồng" };
const NAMES = ["Tí", "Tèo", "Mận", "Đào", "Sửu", "Dần", "Bống", "Cò", "Sẻ", "Mít", "Na", "Bưởi", "Cốm", "Gạo", "Nụ", "Lúa", "Cau", "Sen", "Mây", "Gió", "Đá", "Suối", "Trúc", "Tre", "Muối", "Vừng", "Hến", "Ốc", "Ngô", "Khoai"];

type Need = "forest" | "hill" | "ore" | "water" | "river" | "bank";
export type Def = {
  n: string;
  era: number;
  cost: Partial<Res>;
  sec: number; // build time for level 1
  jobs?: number;
  prod?: Partial<Res>; // per hour at level 1, with all job slots filled
  use?: Partial<Res>;
  house?: number;
  storage?: number;
  need?: Need;
  max?: number;
  up?: boolean;
  drop?: ResKey[]; // villagers can unload these here (shortens their walk)
  d: string;
};

const DEFS = {
  hut: { n: "Lều", era: 1, cost: { wood: 30 }, sec: 20, house: 3, up: true, drop: ["food", "wood", "stone", "copper"], d: "Chỗ ở cho 3 người mỗi cấp." },
  gather: { n: "Trại hái lượm", era: 1, cost: { wood: 25 }, sec: 20, jobs: 2, prod: { food: 60 }, up: true, d: "Lương thực. Thêm 50% trên đất phù sa." },
  wood: { n: "Trại đốn gỗ", era: 1, cost: { food: 30 }, sec: 20, jobs: 2, prod: { wood: 60 }, need: "forest", up: true, drop: ["wood"], d: "Phải kề rừng. Người chặt cây gần đây đỡ phải đi xa." },
  quarry: { n: "Bãi đá", era: 1, cost: { wood: 50 }, sec: 40, jobs: 2, prod: { stone: 40 }, need: "hill", up: true, drop: ["stone", "copper"], d: "Đặt trên đồi. Người đào đá gần đây đỡ phải đi xa." },
  storehouse: { n: "Kho", era: 1, cost: { wood: 60, stone: 20 }, sec: 90, storage: 1000, up: true, drop: ["food", "wood", "stone", "copper"], d: "+1.000 sức chứa mỗi loại, mỗi cấp." },
  fire: { n: "Bếp lửa chung", era: 1, cost: { wood: 80, stone: 30 }, sec: 60, max: 2, drop: ["food"], d: "Dân tăng nhanh gấp đôi. Tối đa 2 bếp." },
  farm: { n: "Ruộng lúa", era: 2, cost: { wood: 80 }, sec: 120, jobs: 2, prod: { food: 90 }, up: true, d: "Gấp đôi trên đất phù sa." },
  canal: { n: "Kênh tưới", era: 2, cost: { stone: 40 }, sec: 30, need: "water", d: "Nối thẳng vào sông hoặc kênh. Đất quanh kênh thành phù sa." },
  levee: { n: "Đê đất", era: 2, cost: { stone: 30, wood: 20 }, sec: 60, need: "bank", d: "Sát bờ sông. Che lũ cho công trình trong 2 ô." },
  house: { n: "Nhà gỗ", era: 2, cost: { wood: 120, stone: 40 }, sec: 300, house: 7, up: true, drop: ["food", "wood", "stone", "copper"], d: "Chỗ ở cho 7 người mỗi cấp." },
  smelter: { n: "Lò đúc đồng", era: 2, cost: { wood: 100, stone: 120 }, sec: 600, jobs: 3, prod: { copper: 20 }, use: { wood: 20 }, need: "ore", up: true, drop: ["copper"], d: "Kề mỏ đồng. Đốt gỗ ra đồng." },
  market: { n: "Chợ", era: 2, cost: { wood: 200, stone: 100 }, sec: 900, jobs: 2, max: 3, d: "+10% mọi sản lượng. Tối đa 3 chợ." },
  stonehouse: { n: "Nhà đá", era: 3, cost: { stone: 250, copper: 30 }, sec: 1200, house: 12, up: true, drop: ["food", "wood", "stone", "copper"], d: "12 người mỗi cấp. Lũ không làm ngập." },
  forge: { n: "Lò rèn", era: 3, cost: { stone: 200, copper: 100 }, sec: 1800, jobs: 3, max: 2, d: "+25% chặt cây, đào đá, săn bắn và sản lượng ruộng, trại. Tối đa 2." },
  wheel: { n: "Cối nước", era: 3, cost: { wood: 200, stone: 100 }, sec: 1200, jobs: 2, prod: { food: 150 }, need: "river", up: true, d: "Sát sông. Mùa đông không giảm." },
  hall: { n: "Đình làng", era: 2, cost: { wood: 300, stone: 200, copper: 20 }, sec: 900, house: 5, storage: 500, up: true, max: 1, drop: ["food", "wood", "stone", "copper"], d: "Nhà chính. Công trình khác chỉ nâng được tới cấp của Đình. Cấp 3 mở trung tâm điều khiển." },
  barracks: { n: "Trại lính", era: 1, cost: { wood: 120, stone: 40 }, sec: 120, up: true, max: 3, d: "Huấn luyện quân. Mỗi cấp chứa thêm 10 lính." },
  temple: { n: "Đền Sông Mẹ", era: 3, cost: { wood: 800, stone: 1200, copper: 400 }, sec: 4 * 3600, max: 1, d: "Kỳ quan của thành phố." },
} satisfies Record<string, Def>;
export type BKey = keyof typeof DEFS;
export const B: Record<BKey, Def> = DEFS;
export const BKEYS = Object.keys(B) as BKey[];
export const def = (k: BKey): Def => B[k];

/* ---------- army ---------- */
export type UKey = "club" | "sling" | "spear" | "bow" | "sword" | "elephant";
export type Unit = { n: string; era: number; cost: Partial<Res>; sec: number; atk: number; hp: number; space: number; d: string };
export const UNITS: Record<UKey, Unit> = {
  club: { n: "Chiến binh gậy", era: 1, cost: { food: 30, wood: 10 }, sec: 30, atk: 4, hp: 20, space: 1, d: "Rẻ, nhanh, đánh gần." },
  sling: { n: "Lính ném đá", era: 1, cost: { food: 25, stone: 10 }, sec: 40, atk: 6, hp: 12, space: 1, d: "Đánh xa, máu mỏng." },
  spear: { n: "Giáo binh đồng", era: 2, cost: { food: 50, copper: 10 }, sec: 90, atk: 9, hp: 40, space: 1, d: "Chắc chắn, giữ hàng đầu." },
  bow: { n: "Cung thủ", era: 2, cost: { food: 40, wood: 30 }, sec: 90, atk: 11, hp: 25, space: 1, d: "Bắn xa, sát thương cao." },
  sword: { n: "Kiếm sĩ sắt", era: 3, cost: { food: 80, copper: 25 }, sec: 180, atk: 18, hp: 70, space: 1, d: "Tinh nhuệ thời đồ sắt." },
  elephant: { n: "Voi chiến", era: 3, cost: { food: 300, wood: 50 }, sec: 600, atk: 45, hp: 300, space: 5, d: "Phá trại, chiếm 5 chỗ." },
};
export const UKEYS = Object.keys(UNITS) as UKey[];
export type Troops = Partial<Record<UKey, number>>;
export type Camp = { id: number; at: number; power: number; loot: Partial<Res>; cleared: boolean; respawnAt: number | null };
export type Expedition = { id: number; units: Troops; camp: number; depart: number; arrive: number; back: number; resolved: boolean; won?: boolean; loot?: Partial<Res>; recalled?: boolean };
const SOLDIER_FOOD = 2; // per soldier per hour
export const MARCH_TILES_PER_MIN = 4;
export const troopPower = (t: Troops) => UKEYS.reduce((a, u) => a + (t[u] ?? 0) * (UNITS[u].atk + UNITS[u].hp / 4), 0);
export const troopSpace = (t: Troops) => UKEYS.reduce((a, u) => a + (t[u] ?? 0) * UNITS[u].space, 0);
export const troopCount = (t: Troops) => UKEYS.reduce((a, u) => a + (t[u] ?? 0), 0);

const FLOODPROOF = new Set<BKey>(["canal", "levee", "wheel", "stonehouse", "temple"]);
export const isFloodproof = (k: BKey) => FLOODPROOF.has(k);
export const LVL_MULT = [0, 1, 1.6, 2.4];
export const MAX_LVL = 3;

export const ERA_REQ: Record<number, { pop: number; cost: Partial<Res>; hall?: number }> = {
  2: { pop: 15, cost: { food: 300, wood: 300, stone: 150 } },
  3: { pop: 40, cost: { food: 1000, stone: 700, copper: 200 }, hall: 3 },
};
const ERA_UP: Record<number, string> = {
  2: "Bước vào Thời đồ đồng: mở ruộng lúa, kênh tưới, đê đất, nhà gỗ, lò đúc đồng và chợ.",
  3: "Bước vào Thời đồ sắt: mở nhà đá, lò rèn, cối nước và Đền Sông Mẹ.",
};

export type Building = { k: BKey; lvl: number; doneAt: number | null; flooded?: boolean };
export type Task =
  | { t: "idle"; at?: number } // at = where they stand and wait
  | { t: "work"; at: number }
  | { t: "chop"; at: number }
  | { t: "mine"; at: number }
  | { t: "hunt"; herd: number }
  | { t: "explore"; from: number; to: number; start: number; seenTo?: number }; // seenTo: progress (0..1) already revealed
export type TaskInput =
  | { t: "idle" }
  | { t: "move"; to: number }
  | { t: "work" | "chop" | "mine"; at: number }
  | { t: "hunt"; herd: number }
  | { t: "explore"; to: number };
export type Person = { id: number; name: string; task: Task; pos?: number }; // pos: tile they last headed to
export type Herd = { id: number; at: number; kind: "deer" | "boar"; n: number; max: number };
export type LogEntry = { at: number; msg: string; cls?: "warn" | "good" };
export type City = {
  ver: number;
  seed: number;
  t: number[];
  seen: number[]; // 1 = explored
  oldbed: number[]; // tile indices of the old riverbed
  xs: number[];
  camp: number;
  b: Record<string, Building>; // keyed by tile index
  dep: Record<string, number>; // amount already taken from a forest/hill tile
  herds: Herd[];
  people: Person[];
  nextId: number;
  res: Res;
  pop: number; // mirrors people.length
  popAcc: number;
  era: number;
  t0: number;
  last: number;
  seasonIdx: number;
  boostUntil: number;
  shift: { warn: number; at: number; xs: number[] | null; done: boolean } | null;
  templeAt: number | null;
  log: LogEntry[];
  army: Troops; // at home
  queue: { u: UKey; doneAt: number }[];
  camps: Camp[];
  exps: Expedition[];
  nextExp: number;
  wins: number;
  auto?: { on: boolean; mix: Record<ResKey, number> }; // auto-assign shares (control centre)
  raid?: { at: number; warn: number; power: number; from: number } | null; // incoming barbarians
  alarm?: boolean; // bell rung for the incoming raid
};

export type Mix = Record<ResKey, number>;
export const DEFAULT_MIX: Mix = { food: 40, wood: 30, stone: 20, copper: 10 };
export const RAID_WARNING_MS = 30 * MIN;

/** Level of the village hall (0 = not built yet). */
export const hallLevel = (c: City) => Object.values(c.b).reduce((a, b) => (b.k === "hall" && !b.flooded ? Math.max(a, b.lvl) : a), 0);
/** Highest level other buildings may reach: the hall's level (at least 1). */
export const levelCap = (c: City, k: BKey) => (k === "hall" ? MAX_LVL : Math.max(1, hallLevel(c)));
/** The control centre opens when the hall reaches its top level. */
export const hasControl = (c: City) => hallLevel(c) >= MAX_LVL;

export const idx = (x: number, y: number) => y * W + x;
export const inb = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
export const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
export const N8 = [...N4, [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
export const cheb = (a: number, b: number) => Math.max(Math.abs((a % W) - (b % W)), Math.abs(((a / W) | 0) - ((b / W) | 0)));
export const bAt = (c: City, i: number): Building | undefined => c.b[i];
export const buildings = (c: City) => Object.entries(c.b).map(([k, b]) => [Number(k), b] as const);

export function rng(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** River tiles: two tiles wide, rows joined horizontally. */
export function riverSet(xs: number[]) {
  const s = new Set<number>();
  for (let y = 0; y < H; y++) {
    const a = y ? Math.min(xs[y - 1], xs[y]) : xs[y];
    const b = (y ? Math.max(xs[y - 1], xs[y]) : xs[y]) + 1;
    for (let x = a; x <= b; x++) if (inb(x, y)) s.add(idx(x, y));
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

function reveal(c: City, center: number, rad: number) {
  const cx = center % W, cy = (center / W) | 0;
  let n = 0;
  for (let y = Math.max(0, cy - rad); y <= Math.min(H - 1, cy + rad); y++)
    for (let x = Math.max(0, cx - rad); x <= Math.min(W - 1, cx + rad); x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= rad * rad + rad && !c.seen[idx(x, y)]) { c.seen[idx(x, y)] = 1; n++; }
  return n;
}

function valueNoise(r: () => number, cells: number) {
  const g = Array.from({ length: (cells + 1) * (cells + 1) }, r);
  const sm = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const fx = (x / W) * cells, fy = (y / H) * cells;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = sm(fx - x0), ty = sm(fy - y0);
    const at = (a: number, b: number) => g[Math.min(cells, b) * (cells + 1) + Math.min(cells, a)];
    const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
    const bot = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
    return top + (bot - top) * ty;
  };
}

export function newCity(now: number, seed = (Math.random() * 1e9) | 0): City {
  const r = rng(seed);
  const t = new Array<number>(W * H).fill(G);
  const f1 = valueNoise(r, 7), f2 = valueNoise(r, 19), h1 = valueNoise(r, 6), h2 = valueNoise(r, 17);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const forest = 0.65 * f1(x, y) + 0.35 * f2(x, y);
    const hill = 0.6 * h1(x, y) + 0.4 * h2(x, y);
    if (hill > 0.66) t[idx(x, y)] = HL;
    else if (forest > 0.55) t[idx(x, y)] = F;
  }
  // meandering river from top to bottom
  const xs: number[] = [];
  let x = Math.round(W / 2 + (r() - 0.5) * 20), vel = 0;
  for (let y = 0; y < H; y++) {
    vel = Math.max(-1, Math.min(1, vel + (r() - 0.5) * 0.7));
    if (y > 0) x = Math.max(6, Math.min(W - 8, Math.round(x + vel)));
    xs.push(x);
  }
  for (const i of riverSet(xs)) t[i] = R;
  // camp on the east bank, mid-map, with a forest, a hill and some ore close by
  const cy = H >> 1, cx = xs[cy] + 6, camp = idx(cx, cy);
  const blob = (bx: number, by: number, rad: number, val: number) => {
    for (let y = by - 3; y <= by + 3; y++) for (let x2 = bx - 3; x2 <= bx + 3; x2++)
      if (inb(x2, y) && t[idx(x2, y)] !== R && Math.hypot(x2 - bx, y - by) < rad) t[idx(x2, y)] = val;
  };
  blob(cx + 5, cy - 5, 2.6, F);
  blob(cx + 7, cy + 5, 2.2, HL);
  t[idx(cx + 7, cy + 5)] = O;
  blob(cx, cy, 3.2, G);
  for (let i = 0; i < W * H; i++) if (t[i] === HL && r() < 0.04) t[i] = O;

  // animal herds
  const herds: Herd[] = [];
  const addHerd = (at: number) => {
    const kind = r() < 0.6 ? "deer" : "boar", max = 4 + Math.floor(r() * 5);
    herds.push({ id: herds.length + 1, at, kind, n: max, max });
  };
  addHerd(idx(cx + 3, cy - 9));
  for (let k = 0; k < 400 && herds.length < 34; k++) {
    const i = Math.floor(r() * W * H);
    if (t[i] !== F && t[i] !== G) continue;
    if (herds.some((h) => cheb(h.at, i) < 8) || cheb(i, camp) < 7) continue;
    addHerd(i);
  }

  // barbarian camps: tougher the further from home
  const camps: Camp[] = [];
  for (let k = 0; k < 600 && camps.length < 18; k++) {
    const i = Math.floor(r() * W * H);
    if (t[i] !== G && t[i] !== F) continue;
    const d = cheb(i, camp);
    if (d < 14 || camps.some((o) => cheb(o.at, i) < 10)) continue;
    const power = Math.round(15 + d * 3);
    camps.push({ id: camps.length + 1, at: i, power, cleared: false, respawnAt: null,
      loot: { food: power * 3, wood: power * 3, stone: power * 2, ...(d > 28 ? { copper: Math.round(power * 0.8) } : {}) } });
  }

  const c: City = {
    army: {}, queue: [], camps, exps: [], nextExp: 1, wins: 0,
    ver: ENGINE_VER, seed, t, seen: new Array(W * H).fill(0), oldbed: [], xs, camp, b: {}, dep: {}, herds,
    people: [], nextId: 1,
    res: { food: 100, wood: 120, stone: 30, copper: 0 }, pop: 0, popAcc: 0, era: 1,
    t0: now, last: now, seasonIdx: 0, boostUntil: 0, shift: null, templeAt: null, log: [],
  };
  reveal(c, camp, START_SIGHT);
  for (let k = 0; k < 5; k++) addPerson(c);
  log(c, now, "Bộ lạc 5 người dừng chân bên sông. Bấm chọn một người rồi bấm vào rừng, đồi hoặc đàn thú để giao việc. Bấm ra vùng sương mù để đi thám hiểm.");
  return c;
}

function addPerson(c: City) {
  const id = c.nextId++;
  const p: Person = { id, name: NAMES[(id - 1) % NAMES.length] + (id > NAMES.length ? ` ${Math.ceil(id / NAMES.length)}` : ""), task: { t: "idle" } };
  c.people.push(p);
  c.pop = c.people.length;
  return p;
}

export type Derived = { rd: number[]; wet: boolean[]; fert: boolean[]; prot: boolean[] };
const built = (b: Building | undefined): b is Building => !!b && b.lvl >= 1;

export function derive(c: City): Derived {
  const t = c.t, N = W * H;
  // distance to river (Chebyshev, capped at 3)
  const rd = new Array<number>(N).fill(99);
  let q: number[] = [];
  for (let i = 0; i < N; i++) if (t[i] === R) { rd[i] = 0; q.push(i); }
  for (let d = 1; d <= 3; d++) {
    const next: number[] = [];
    for (const i of q) {
      const x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of N8) {
        if (!inb(x + dx, y + dy)) continue;
        const j = idx(x + dx, y + dy);
        if (rd[j] > d) { rd[j] = d; next.push(j); }
      }
    }
    q = next;
  }
  const isCanal = (j: number) => { const b = c.b[j]; return built(b) && b.k === "canal"; };
  const wet = new Array<boolean>(N).fill(false);
  const stack: number[] = [];
  for (const [i, b] of buildings(c)) {
    if (b.k !== "canal" || !built(b)) continue;
    const x = i % W, y = (i / W) | 0;
    if (N4.some(([dx, dy]) => inb(x + dx, y + dy) && t[idx(x + dx, y + dy)] === R)) { wet[i] = true; stack.push(i); }
  }
  while (stack.length) {
    const i = stack.pop()!, x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of N4) {
      if (!inb(x + dx, y + dy)) continue;
      const j = idx(x + dx, y + dy);
      if (!wet[j] && isCanal(j)) { wet[j] = true; stack.push(j); }
    }
  }
  const fert = new Array<boolean>(N).fill(false), prot = new Array<boolean>(N).fill(false);
  for (let i = 0; i < N; i++) if (t[i] === G && rd[i] <= 2) fert[i] = true;
  for (const i of c.oldbed) if (t[i] === G) fert[i] = true;
  for (const [i, b] of buildings(c)) {
    if (!built(b)) continue;
    const x = i % W, y = (i / W) | 0;
    const around = (r: number, fn: (j: number) => void) => {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (inb(x + dx, y + dy)) fn(idx(x + dx, y + dy));
    };
    if (b.k === "canal" && wet[i]) around(1, (j) => { if (t[j] === G) fert[j] = true; });
    if (b.k === "levee") around(2, (j) => { prot[j] = true; });
  }
  return { rd, wet, fert, prot };
}

const count = (c: City, k: BKey) => Object.values(c.b).reduce((n, b) => n + (b.k === k ? 1 : 0), 0);
export const builders = (c: City) => c.era + 1;
export const busyBuilders = (c: City) => Object.values(c.b).reduce((n, b) => n + (b.doneAt ? 1 : 0), 0);
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

export const soldiers = (c: City) => troopCount(c.army) + c.queue.length + c.exps.reduce((a, e) => a + troopCount(e.units), 0);
export const armyCap = (c: City) => Object.values(c.b).reduce((a, b) => a + (b.k === "barracks" && b.lvl >= 1 ? b.lvl * 10 : 0), 0);
export const armyUsed = (c: City) => troopSpace(c.army) + c.queue.reduce((a, q) => a + UNITS[q.u].space, 0) + c.exps.reduce((a, e) => a + troopSpace(e.units), 0);
export const campById = (c: City, id: number) => c.camps.find((k) => k.id === id);
export const marchMs = (from: number, to: number) => (Math.max(1, cheb(from, to)) / MARCH_TILES_PER_MIN) * MIN;

export const workersAt = (c: City, i: number) => c.people.reduce((n, p) => n + (p.task.t === "work" && p.task.at === i ? 1 : 0), 0);
export const herdById = (c: City, id: number) => c.herds.find((h) => h.id === id);

/** Nearest place a villager can unload `res`, as a Chebyshev distance. */
export function dropDistance(c: City, at: number, res: ResKey) {
  let best = cheb(at, c.camp);
  for (const [i, b] of buildings(c)) if (built(b) && def(b.k).drop?.includes(res)) best = Math.min(best, cheb(at, i));
  return best;
}
const walkFactor = (d: number) => 1 / (1 + d / 12);

export type Drain = { kind: "tile" | "herd"; key: number; res: ResKey; perHour: number };
export type Stats = {
  rate: Res;
  woodUse: number;
  copperRate: number;
  jobs: number;
  housing: number;
  storage: number;
  fires: number;
  drains: Drain[];
};

export function stats(c: City, D: Derived, at: number): Stats {
  const cnt: Partial<Record<BKey, number>> = {};
  let jobs = 0, housing = 0, storage = BASE_STORAGE;
  for (const b of Object.values(c.b)) {
    if (!built(b) || b.flooded) continue;
    const d = def(b.k);
    jobs += d.jobs ?? 0;
    housing += (d.house ?? 0) * b.lvl;
    storage += (d.storage ?? 0) * b.lvl;
    cnt[b.k] = (cnt[b.k] ?? 0) + 1;
  }
  const workers = new Map<number, number>();
  for (const p of c.people) if (p.task.t === "work") workers.set(p.task.at, (workers.get(p.task.at) ?? 0) + 1);
  const mult = 1 + 0.1 * Math.min(3, cnt.market ?? 0);
  const tools = 1 + 0.25 * Math.min(2, cnt.forge ?? 0);
  const winter = seasonAt(c, at) === 3;
  const boost = at < c.boostUntil;
  const rate: Res = { food: 0, wood: 0, stone: 0, copper: 0 };
  let woodUse = 0;
  for (const [i, b] of buildings(c)) {
    if (!built(b) || b.flooded) continue;
    const d = def(b.k);
    const eff = d.jobs ? Math.min(1, (workers.get(i) ?? 0) / d.jobs) : 0;
    if (d.use?.wood) woodUse += d.use.wood * LVL_MULT[b.lvl] * eff;
    if (!d.prod) continue;
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
  }
  // hand gathering by assigned people
  const drains: Drain[] = [];
  for (const p of c.people) {
    const tk = p.task;
    if (tk.t === "chop" || tk.t === "mine") {
      const ore = c.t[tk.at] === O;
      const res: ResKey = tk.t === "chop" ? "wood" : ore ? "copper" : "stone";
      const base = tk.t === "chop" ? CHOP_RATE : ore ? ORE_RATE : STONE_RATE;
      const v = base * tools * mult * walkFactor(dropDistance(c, tk.at, res));
      rate[res] += v;
      drains.push({ kind: "tile", key: tk.at, res, perHour: v });
    } else if (tk.t === "hunt") {
      const h = herdById(c, tk.herd);
      if (!h || h.n < 0.05) continue;
      const v = HUNT_RATE * tools * mult * walkFactor(dropDistance(c, h.at, "food"));
      rate.food += v;
      drains.push({ kind: "herd", key: h.id, res: "food", perHour: v });
    }
  }
  const copperRate = rate.copper;
  rate.food -= c.people.length * FOOD_PER_POP + soldiers(c) * SOLDIER_FOOD;
  return { rate, woodUse, copperRate, jobs, housing, storage, fires: Math.min(2, cnt.fire ?? 0), drains };
}

/* ---------- people & tasks ---------- */

function nearestTile(c: City, from: number, ok: (i: number) => boolean, rad: number) {
  const fx = from % W, fy = (from / W) | 0;
  let best = -1, bd = 1e9;
  for (let y = Math.max(0, fy - rad); y <= Math.min(H - 1, fy + rad); y++)
    for (let x = Math.max(0, fx - rad); x <= Math.min(W - 1, fx + rad); x++) {
      const i = idx(x, y);
      if (!ok(i)) continue;
      const d = (x - fx) ** 2 + (y - fy) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
  return best;
}

/** Control centre: give idle people jobs so the workforce matches the chosen mix. */
function autoAssign(c: City, now: number) {
  if (!c.auto?.on || !hasControl(c)) return false;
  const idle = c.people.filter((p) => p.task.t === "idle");
  if (!idle.length) return false;
  const resOf = (p: Person): ResKey | null => {
    const tk = p.task;
    if (tk.t === "chop") return "wood";
    if (tk.t === "mine") return c.t[tk.at] === O ? "copper" : "stone";
    if (tk.t === "hunt") return "food";
    if (tk.t === "work") return (Object.keys(def(c.b[tk.at]?.k ?? "hut").prod ?? {})[0] as ResKey) ?? null;
    return null;
  };
  const total = c.people.length, mixSum = RES.reduce((a, r) => a + (c.auto!.mix[r] ?? 0), 0) || 1;
  let changed = false;
  for (const p of idle) {
    const have: Res = { food: 0, wood: 0, stone: 0, copper: 0 };
    for (const q of c.people) { const r = resOf(q); if (r) have[r]++; }
    const order = [...RES].sort((a, b) => (have[a] - (total * c.auto!.mix[a]) / mixSum) - (have[b] - (total * c.auto!.mix[b]) / mixSum));
    for (const r of order) {
      if ((c.auto!.mix[r] ?? 0) <= 0) continue;
      const tk = autoTarget(c, r);
      if (!tk) continue;
      setTask(c, p, tk, now);
      changed = true;
      break;
    }
  }
  return changed;
}

/** Nearest sensible job producing `r`: an open building slot first, then gathering by hand. */
function autoTarget(c: City, r: ResKey): TaskInput | null {
  const slots = buildings(c)
    .filter(([i, b]) => built(b) && !b.flooded && def(b.k).jobs && Object.keys(def(b.k).prod ?? {})[0] === r && workersAt(c, i) < def(b.k).jobs!)
    .sort((a, b) => cheb(a[0], c.camp) - cheb(b[0], c.camp));
  if (slots.length) return { t: "work", at: slots[0][0] };
  const ok = (i: number) => !!c.seen[i] && !c.b[i];
  if (r === "wood") { const i = nearestTile(c, c.camp, (j) => ok(j) && c.t[j] === F, 20); return i >= 0 ? { t: "chop", at: i } : null; }
  if (r === "stone") { const i = nearestTile(c, c.camp, (j) => ok(j) && c.t[j] === HL, 20); return i >= 0 ? { t: "mine", at: i } : null; }
  if (r === "copper") { const i = nearestTile(c, c.camp, (j) => ok(j) && c.t[j] === O, 25); return i >= 0 ? { t: "mine", at: i } : null; }
  const herd = c.herds.filter((h) => h.n >= 1 && c.seen[h.at] && cheb(h.at, c.camp) <= 20).sort((a, b) => cheb(a.at, c.camp) - cheb(b.at, c.camp))[0];
  return herd ? { t: "hunt", herd: herd.id } : null;
}

/** Fill open job slots in finished buildings with idle people. */
function autoStaff(c: City) {
  const idle = c.people.filter((p) => p.task.t === "idle");
  if (!idle.length) return;
  for (const [i, b] of buildings(c)) {
    const jobs = def(b.k).jobs ?? 0;
    if (!jobs || !built(b) || b.flooded) continue;
    let w = workersAt(c, i);
    while (w < jobs && idle.length) { idle.shift()!.task = { t: "work", at: i }; w++; }
  }
}

function taskError(c: City, tk: TaskInput, adding: number): string | null {
  if (tk.t === "idle") return null;
  if (tk.t === "move") {
    if (!Number.isInteger(tk.to) || tk.to < 0 || tk.to >= W * H) return "Ô không hợp lệ.";
    if (!c.seen[tk.to]) return "Vùng chưa khám phá: hãy cho đi thám hiểm.";
    return c.t[tk.to] === R ? "Không đứng chờ giữa sông được." : null;
  }
  if (tk.t === "explore") return Number.isInteger(tk.to) && tk.to >= 0 && tk.to < W * H ? null : "Đích không hợp lệ.";
  if (tk.t === "hunt") {
    const h = herdById(c, tk.herd);
    if (!h || !c.seen[h.at]) return "Không thấy đàn thú này.";
    return h.n < 1 ? "Đàn thú đã bị săn hết, chờ chúng sinh sôi lại." : null;
  }
  if (!Number.isInteger(tk.at) || tk.at < 0 || tk.at >= W * H) return "Ô không hợp lệ.";
  if (!c.seen[tk.at]) return "Vùng này chưa khám phá.";
  if (tk.t === "chop") return c.t[tk.at] === F ? null : "Chỉ chặt được ô rừng.";
  if (tk.t === "mine") return c.t[tk.at] === HL || c.t[tk.at] === O ? null : "Chỉ đào được ô đồi đá hoặc mỏ đồng.";
  const b = c.b[tk.at];
  if (!b || !def(b.k).jobs) return "Công trình này không cần người làm.";
  if (!built(b)) return "Công trình chưa xây xong.";
  if (b.flooded) return "Công trình đang ngập, sửa trước đã.";
  if (workersAt(c, tk.at) + adding > def(b.k).jobs!) return `Chỉ nhận tối đa ${def(b.k).jobs} người.`;
  return null;
}

function setTask(c: City, p: Person, tk: TaskInput, now: number) {
  const from = p.pos ?? c.camp;
  if (tk.t === "explore") { p.task = { t: "explore", from, to: tk.to, start: now }; p.pos = tk.to; return; }
  if (tk.t === "move") { p.task = { t: "idle", at: tk.to }; p.pos = tk.to; return; }
  p.task = tk as Task;
  if (tk.t === "hunt") p.pos = herdById(c, tk.herd)?.at ?? from;
  else if (tk.t !== "idle") p.pos = tk.at;
}

/** Where an explorer is along their straight-line walk at time `at` (fractional tile coords). */
export function explorerPos(tk: Extract<Task, { t: "explore" }>, at: number): [number, number, number] {
  const fx = tk.from % W, fy = (tk.from / W) | 0, tx = tk.to % W, ty = (tk.to / W) | 0;
  const dist = Math.max(1, Math.max(Math.abs(tx - fx), Math.abs(ty - fy)));
  const p = Math.max(0, Math.min(1, (at - tk.start) / ((dist / EXPLORE_TILES_PER_MIN) * MIN)));
  return [fx + (tx - fx) * p + 0.5, fy + (ty - fy) * p + 0.5, p];
}

function stepExplorers(c: City, at: number) {
  let changed = false;
  for (const p of c.people) {
    const tk = p.task;
    if (tk.t !== "explore") continue;
    const [, , prog] = explorerPos(tk, at);
    // reveal every tile along the stretch walked since the last step, not just the end point
    const fx = tk.from % W, fy = (tk.from / W) | 0, tx = tk.to % W, ty = (tk.to / W) | 0;
    const dist = Math.max(1, Math.max(Math.abs(tx - fx), Math.abs(ty - fy)));
    const p0 = tk.seenTo ?? 0, n = Math.max(1, Math.ceil((prog - p0) * dist));
    for (let k = 0; k <= n; k++) {
      const pp = p0 + ((prog - p0) * k) / n;
      const px = fx + (tx - fx) * pp + 0.5, py = fy + (ty - fy) * pp + 0.5;
      if (reveal(c, idx(Math.min(W - 1, Math.floor(px)), Math.min(H - 1, Math.floor(py))), SCOUT_SIGHT)) changed = true;
    }
    tk.seenTo = prog;
    if (prog >= 1) {
      const before = c.seen.reduce((a, v) => a + v, 0);
      reveal(c, tk.to, SCOUT_SIGHT + 2);
      const found = c.seen.reduce((a, v) => a + v, 0) - before;
      const near = (rad: number, fn: (i: number) => boolean) => nearestTile(c, tk.to, fn, rad) >= 0;
      const notes = [
        near(6, (i) => c.t[i] === O && !!c.seen[i]) && "mỏ đồng",
        c.herds.some((h) => cheb(h.at, tk.to) <= 6) && "đàn thú",
        near(5, (i) => c.t[i] === F && !!c.seen[i]) && "rừng",
      ].filter(Boolean);
      log(c, at, `${p.name} thám hiểm xong${found ? `, mở thêm ${found} ô` : ""}${notes.length ? `, thấy ${notes.join(", ")}` : ""}.`, "good");
      p.task = { t: "idle", at: tk.to };
      changed = true;
    }
  }
  return changed;
}

/** Take resources out of tiles and herds; retarget or free people whose target ran out. */
function applyDrains(c: City, drains: Drain[], h: number, ratio: (res: ResKey) => number) {
  let changed = false;
  for (const d of drains) {
    const amount = d.perHour * h * ratio(d.res);
    if (d.kind === "herd") {
      const herd = herdById(c, d.key);
      if (!herd) continue;
      herd.n = Math.max(0, herd.n - amount / MEAT_PER_ANIMAL);
      if (herd.n < 0.05) {
        herd.n = 0;
        for (const p of c.people) {
          if (p.task.t !== "hunt" || p.task.herd !== herd.id) continue;
          const next = c.herds.filter((o) => o.n >= 1 && c.seen[o.at] && cheb(o.at, herd.at) <= 14).sort((a, b) => cheb(a.at, herd.at) - cheb(b.at, herd.at))[0];
          p.task = next ? { t: "hunt", herd: next.id } : { t: "idle" };
        }
        changed = true;
      }
      continue;
    }
    const i = d.key, cap = c.t[i] === F ? CAP.forest : c.t[i] === O ? CAP.ore : CAP.hill;
    c.dep[i] = (c.dep[i] ?? 0) + amount;
    if (c.dep[i] >= cap) {
      const wasForest = c.t[i] === F;
      c.t[i] = G;
      delete c.dep[i];
      for (const p of c.people) {
        if ((p.task.t !== "chop" && p.task.t !== "mine") || p.task.at !== i) continue;
        const kind = p.task.t;
        const next = nearestTile(c, i, (j) => !!c.seen[j] && !c.b[j] && (wasForest ? c.t[j] === F : c.t[j] === HL || c.t[j] === O), 4);
        p.task = next >= 0 ? { t: kind, at: next } : { t: "idle" };
      }
      changed = true;
    }
  }
  return changed;
}

/* ---------- seasons, floods, river shift ---------- */

function newCourse(c: City, r: () => number) {
  const cy = (c.camp / W) | 0;
  for (let a = 0; a < 30; a++) {
    const top = Math.max(1, cy - 14 + ((r() * 4) | 0)), bot = Math.min(H - 2, cy + 10 + ((r() * 4) | 0));
    const off = (r() < 0.5 ? -1 : 1) * (4 + ((r() * 3) | 0));
    const xs = c.xs.map((x, y) => {
      if (y < top || y > bot) return x;
      const k = Math.min(y - top, bot - y, 3) / 3;
      return Math.max(1, Math.min(W - 3, Math.round(x + off * k)));
    });
    const set = riverSet(xs);
    if ([...set].some((i) => c.t[i] === O || i === c.camp)) continue;
    if (xs.every((x, y) => x === c.xs[y])) continue;
    return xs;
  }
  return c.xs.slice();
}

function flood(c: City, D: Derived, at: number, r: () => number) {
  if (r() > 0.6) { log(c, at, "Mùa thu êm, sông không tràn bờ."); return; }
  const hit: string[] = [];
  for (const [i, b] of buildings(c)) {
    if (!b.flooded && D.rd[i] === 1 && !isFloodproof(b.k) && !D.prot[i] && r() < 0.45) {
      b.flooded = true;
      hit.push(def(b.k).n);
    }
  }
  for (const p of c.people) if (p.task.t === "work" && c.b[p.task.at]?.flooded) p.task = { t: "idle" };
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
  const bed = new Set(c.oldbed);
  for (const i of oldS) if (!newS.has(i)) { c.t[i] = G; bed.add(i); }
  for (const i of newS) {
    if (c.b[i]) { delete c.b[i]; lost++; }
    c.t[i] = R; bed.delete(i); delete c.dep[i];
  }
  c.oldbed = [...bed];
  for (const p of c.people) {
    const tk = p.task;
    if ((tk.t === "work" && !c.b[tk.at]) || ((tk.t === "chop" || tk.t === "mine") && c.t[tk.at] === R)) p.task = { t: "idle" };
  }
  c.xs = s.xs!;
  s.done = true;
  c.boostUntil = at + 4 * SEASON_MS;
  const D = derive(c);
  const dry = buildings(c).filter(([i, b]) => b.k === "canal" && b.lvl >= 1 && !D.wet[i]).length;
  log(c, at, `Đại hồng thủy: sông đổi dòng${lost ? `, nuốt ${lost} công trình` : ""}. Lòng sông cũ thành bãi bồi màu mỡ.${dry ? ` ${dry} đoạn kênh mất nguồn nước.` : ""}`, "warn");
}

/** Lose a share of each unit type, rounding with the seeded RNG. */
function casualties(t: Troops, share: number, r: () => number): Troops {
  const lost: Troops = {};
  for (const u of UKEYS) {
    const n = t[u] ?? 0;
    if (!n) continue;
    const x = n * share, k = Math.min(n, Math.floor(x) + (r() < x - Math.floor(x) ? 1 : 0));
    if (k) { lost[u] = k; t[u] = n - k; }
  }
  return lost;
}
const troopText = (t: Troops) => UKEYS.filter((u) => t[u]).map((u) => `${t[u]} ${UNITS[u].n.toLowerCase()}`).join(", ");

/** Barbarians set out from a nearby camp; they reach the village RAID_WARNING_MS later. */
function scheduleRaid(c: City, at: number, r: () => number) {
  const near = c.camps.filter((k) => !k.cleared && cheb(k.at, c.camp) <= 35).sort((a, b) => cheb(a.at, c.camp) - cheb(b.at, c.camp))[0];
  if (!near || r() > 0.6 || c.raid) return;
  c.raid = { warn: at, at: at + RAID_WARNING_MS, power: Math.round(near.power * 0.5 + c.era * 10), from: near.at };
  c.alarm = false;
  log(c, at, `Trinh sát báo: man rợ (⚔ ${c.raid.power}) đang kéo đến làng, tới sau ${Math.round(RAID_WARNING_MS / MIN)} phút.${hasControl(c) ? " Có thể đánh kẻng ở Đình làng." : ""}`, "warn");
}

function raid(c: City, at: number, r: () => number) {
  const inc = c.raid!;
  const bell = !!c.alarm;
  c.raid = null; c.alarm = false;
  const attack = inc.power * (0.8 + r() * 0.4);
  // with the bell rung, villagers shelter and fighters gather at the hall
  const defense = (troopPower(c.army) * (bell ? 1.25 : 1) + 15) * (0.8 + r() * 0.4);
  if (defense >= attack) {
    const lost = casualties(c.army, Math.min(0.5, (attack / defense) * 0.25), r);
    log(c, at, `Man rợ kéo đến cướp làng nhưng bị đánh lui.${troopCount(lost) ? ` Hy sinh: ${troopText(lost)}.` : ""}`, "good");
  } else {
    const stolen: Partial<Res> = {};
    const share = bell ? 0.12 : 0.25;
    for (const k of RES) { stolen[k] = Math.floor(c.res[k] * share); c.res[k] -= stolen[k]!; }
    const lost = casualties(c.army, bell ? 0.4 : 0.6, r);
    log(c, at, `Man rợ cướp làng! Mất ${costText(stolen)}.${troopCount(lost) ? ` Hy sinh: ${troopText(lost)}.` : ""}${bell ? " Kẻng đã giúp dân kịp trú ẩn." : " Hãy luyện thêm quân để thủ."}`, "warn");
  }
}

function stepArmy(c: City, nt: number) {
  let changed = false;
  if (c.raid && c.raid.at <= nt) { raid(c, c.raid.at, rng(c.seed ^ Math.imul(Math.floor(c.raid.at / MIN), 3266489917))); changed = true; }
  while (c.queue.length && c.queue[0].doneAt <= nt) {
    const q = c.queue.shift()!;
    c.army[q.u] = (c.army[q.u] ?? 0) + 1;
    changed = true;
  }
  for (const k of c.camps) {
    if (k.cleared && k.respawnAt && k.respawnAt <= nt) {
      k.cleared = false; k.respawnAt = null;
      k.power = Math.round(k.power * 1.25);
      for (const res of RES) if (k.loot[res]) k.loot[res] = Math.round(k.loot[res]! * 1.2);
      changed = true;
    }
  }
  for (const e of [...c.exps]) {
    const camp = campById(c, e.camp);
    if (!e.resolved && e.arrive <= nt && !e.recalled) {
      e.resolved = true;
      const r = rng(c.seed ^ Math.imul(e.id + 7, 2246822519));
      const A = troopPower(e.units), Dp = camp && !camp.cleared ? camp.power : 0;
      const rollA = A * (0.8 + r() * 0.4), rollD = Dp * (0.8 + r() * 0.4);
      e.won = rollA >= rollD;
      const lost = casualties(e.units, e.won ? Math.min(0.9, (Dp / Math.max(1, A)) * 0.5) : 0.65, r);
      if (e.won && camp && !camp.cleared) {
        camp.cleared = true; camp.respawnAt = e.arrive + 2 * 24 * HOUR;
        e.loot = { ...camp.loot };
        c.wins++;
        reveal(c, camp.at, 4);
      }
      log(c, e.arrive, e.won
        ? `Quân ta phá trại man rợ!${troopCount(lost) ? ` Hy sinh: ${troopText(lost)}.` : ""} Đang mang về ${costText(e.loot ?? {})}.`
        : `Quân ta thua ở trại man rợ.${troopCount(lost) ? ` Hy sinh: ${troopText(lost)}.` : ""} Cần thêm quân mạnh hơn.`, e.won ? "good" : "warn");
      changed = true;
    }
    if (e.resolved && e.back <= nt) {
      for (const u of UKEYS) if (e.units[u]) c.army[u] = (c.army[u] ?? 0) + e.units[u]!;
      if (e.loot) for (const res of RES) c.res[res] += e.loot[res] ?? 0;
      c.exps = c.exps.filter((x) => x !== e);
      if (troopCount(e.units)) log(c, e.back, `Quân đã về làng${e.loot ? " cùng chiến lợi phẩm" : ""}.`);
      changed = true;
    }
  }
  return changed;
}

function onSeason(c: City, si: number) {
  const at = c.t0 + si * SEASON_MS;
  const r = rng(c.seed ^ Math.imul(si + 1, 2654435761));
  if (si >= 4 && si % 4 === 0) scheduleRaid(c, at, rng(c.seed ^ Math.imul(si + 3, 3266489917)));
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
    for (const b of Object.values(c.b)) {
      if (b.doneAt && b.doneAt <= nt) {
        b.lvl += 1;
        b.doneAt = null;
        dirty = true;
        if (b.k === "temple" && !c.templeAt) {
          c.templeAt = nt;
          log(c, nt, "Đền Sông Mẹ khánh thành. Thành phố đã đi từ lều cỏ tới kỳ quan.", "good");
        }
      }
    }
    if (dirty) autoStaff(c);
    const si = seasonIndexAt(c, nt);
    while (c.seasonIdx < si) { c.seasonIdx++; onSeason(c, c.seasonIdx); dirty = true; }
    if (stepExplorers(c, nt)) dirty = true;
    if (stepArmy(c, nt)) dirty = true;
    if (autoAssign(c, nt)) dirty = true;
    if (dirty) { D = derive(c); st = stats(c, D, nt); dirty = false; }

    const h = (nt - t) / HOUR;
    const woodBefore = c.res.wood + st.rate.wood * h;
    const need = st.woodUse * h;
    const smelt = need > 0 ? Math.max(0, Math.min(1, woodBefore / need)) : 1;
    const gain: Res = { food: st.rate.food * h, wood: st.rate.wood * h - need * smelt, stone: st.rate.stone * h, copper: st.copperRate * smelt * h };
    // gathering stops counting (and stops draining tiles) once the store is full
    const room = (r: ResKey) => (gain[r] <= 0 ? 1 : Math.max(0, Math.min(1, (st.storage - c.res[r]) / gain[r])));
    if (applyDrains(c, st.drains, h, (r) => (r === "food" ? 1 : room(r)))) dirty = true;
    for (const r of RES) c.res[r] = Math.max(r === "food" ? -Infinity : 0, Math.min(st.storage, c.res[r] + gain[r]));
    for (const herd of c.herds) if (herd.n < herd.max) herd.n = Math.min(herd.max, herd.n + HERD_REGROW * h);

    const popBefore = c.people.length;
    if (c.res.food < 0) {
      c.res.food = 0;
      c.popAcc -= h * 6;
    } else if (c.people.length < st.housing) {
      c.popAcc += h * 12 * (1 + st.fires);
    } else c.popAcc = 0;
    while (c.popAcc >= 1 && c.people.length < st.housing) { addPerson(c); c.popAcc--; autoStaff(c); }
    while (c.popAcc <= -1 && c.people.length > MIN_POP) {
      const k = c.people.findIndex((p) => p.task.t === "idle");
      const gone = c.people.splice(k >= 0 ? k : c.people.length - 1, 1)[0];
      log(c, nt, `Đói kém: ${gone.name} bỏ đi tìm nơi khác.`, "warn");
      c.popAcc++;
    }
    c.popAcc = Math.max(-1, Math.min(1, c.popAcc));
    c.pop = c.people.length;
    if (c.people.length !== popBefore) dirty = true;
    t = nt;
  }
  c.last = now;
}

export function canPlace(c: City, D: Derived, k: BKey, x: number, y: number): string | null {
  const d = def(k), i = idx(x, y), t = c.t[i];
  if (!c.seen[i]) return "Vùng này chưa khám phá.";
  if (d.era > c.era) return "Chưa tới thời đại này.";
  if (c.b[i]) return "Ô này đã có công trình.";
  if (t === R) return "Không xây được trên sông.";
  if (k === "quarry") { if (t !== HL) return "Bãi đá phải đặt trên đồi."; }
  else if (t === HL || t === O) return "Đồi đá chỉ đặt được bãi đá.";
  else if (t === F) return "Rừng rậm: cho người chặt hết cây trước, hoặc chọn ô cỏ.";
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
  return !!r && c.people.length >= r.pop && canAfford(c, r.cost) && hallLevel(c) >= (r.hall ?? 0);
}

export function score(c: City) {
  let s = c.era * 1000 + c.people.length * 5 + (c.templeAt ? 5000 : 0);
  for (const b of Object.values(c.b)) s += b.lvl * 10;
  s += Math.floor(c.seen.reduce((a, v) => a + v, 0) / 20) + c.wins * 50 + Math.floor(troopPower(c.army) / 5);
  return s;
}

export type Action =
  | { type: "build"; k: BKey; x: number; y: number }
  | { type: "upgrade"; x: number; y: number }
  | { type: "repair"; x: number; y: number }
  | { type: "demolish"; x: number; y: number }
  | { type: "advance" }
  | { type: "assign"; ids: number[]; task: TaskInput; pos?: Record<string, number> }
  | { type: "assignN"; n: number; task: TaskInput; pos?: Record<string, number> } // pos: where each person stands on screen
  | { type: "train"; u: UKey; n: number }
  | { type: "attack"; camp: number; units: Troops }
  | { type: "alarm" }
  | { type: "recall"; exp: number }
  | { type: "auto"; on: boolean; mix: Mix };

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
  if (a.type === "train") {
    const u = UNITS[a.u];
    if (!u) return "Loại quân không hợp lệ.";
    if (u.era > c.era) return "Chưa tới thời đại của loại quân này.";
    if (!armyCap(c)) return "Cần xây Trại lính trước.";
    const n = Math.max(1, Math.min(50, Math.floor(a.n)));
    if (armyUsed(c) + n * u.space > armyCap(c)) return `Trại lính hết chỗ (${armyUsed(c)}/${armyCap(c)}). Nâng cấp hoặc xây thêm trại.`;
    const cost: Partial<Res> = {};
    for (const r of RES) if (u.cost[r]) cost[r] = u.cost[r]! * n;
    const err = missing(c, cost);
    if (err) return err;
    pay(c, cost);
    const lv = Object.values(c.b).reduce((a2, b) => a2 + (b.k === "barracks" && b.lvl >= 1 ? b.lvl : 0), 0);
    const each = (u.sec * 1000) / (1 + 0.5 * (lv - 1));
    let start = Math.max(now, c.queue.length ? c.queue[c.queue.length - 1].doneAt : now);
    for (let k = 0; k < n; k++) { start += each; c.queue.push({ u: a.u, doneAt: start }); }
    return null;
  }
  if (a.type === "alarm") {
    if (!hasControl(c)) return "Cần Đình làng cấp 3.";
    if (!c.raid) return "Không có man rợ nào đang kéo đến.";
    if (c.alarm) return "Kẻng đã được đánh.";
    c.alarm = true;
    log(c, now, "Kẻng báo động vang lên: dân vào nhà trú ẩn, quân tập trung ở Đình làng.", "warn");
    return null;
  }
  if (a.type === "recall") {
    if (!hasControl(c)) return "Cần Đình làng cấp 3.";
    const e = c.exps.find((x) => x.id === a.exp);
    if (!e) return "Không thấy đoàn quân này.";
    if (e.resolved) return "Đoàn quân đang trên đường về rồi.";
    // turn back from where they are now: same distance home as already walked
    const oneWay = e.arrive - e.depart, walked = Math.max(0, now - e.depart);
    e.recalled = true; e.resolved = true;
    e.arrive = now - oneWay + walked; e.back = now + walked;
    log(c, now, "Đã gọi đoàn quân quay về.");
    return null;
  }
  if (a.type === "auto") {
    if (!hasControl(c)) return "Cần Đình làng cấp 3.";
    const mix = {} as Mix;
    for (const r of RES) mix[r] = Math.max(0, Math.min(100, Math.round(Number(a.mix?.[r]) || 0)));
    c.auto = { on: !!a.on, mix };
    return null;
  }
  if (a.type === "attack") {
    const camp = campById(c, a.camp);
    if (!camp || !c.seen[camp.at]) return "Không thấy trại này.";
    if (camp.cleared) return "Trại này đã bị phá, chờ chúng dựng lại.";
    const units: Troops = {};
    for (const u of UKEYS) {
      const n = Math.max(0, Math.floor(a.units?.[u] ?? 0));
      if (n > (c.army[u] ?? 0)) return `Không đủ ${UNITS[u].n.toLowerCase()} ở nhà.`;
      if (n) units[u] = n;
    }
    if (!troopCount(units)) return "Chọn ít nhất một lính.";
    for (const u of UKEYS) if (units[u]) c.army[u]! -= units[u]!;
    const ms = marchMs(c.camp, camp.at);
    c.exps.push({ id: c.nextExp++, units, camp: camp.id, depart: now, arrive: now + ms, back: now + 2 * ms, resolved: false });
    log(c, now, `Xuất quân (${troopText(units)}) đánh trại man rợ, tới nơi sau ${Math.round(ms / MIN)} phút.`);
    return null;
  }
  if (a.type === "assign" || a.type === "assignN") {
    const tk = a.task;
    if (!tk || typeof tk !== "object") return "Việc không hợp lệ.";
    let people: Person[];
    if (a.type === "assign") {
      if (!Array.isArray(a.ids)) return "Chưa chọn người.";
      people = c.people.filter((p) => a.ids.includes(p.id));
    } else {
      const n = Math.max(1, Math.min(50, Math.floor(a.n)));
      people = c.people.filter((p) => p.task.t === "idle").slice(0, n);
      if (!people.length) return "Không còn ai rảnh. Chọn người đang làm việc khác để đổi việc.";
    }
    if (!people.length) return "Chưa chọn người.";
    const moving = tk.t === "work" ? people.filter((p) => !(p.task.t === "work" && p.task.at === tk.at)).length : 0;
    const err = taskError(c, tk, moving);
    if (err) return err;
    for (const p of people) {
      // start walks from where the player sees them (visual position, prototype trusts the client)
      const hint = a.pos?.[p.id];
      if (Number.isInteger(hint) && hint! >= 0 && hint! < W * H) p.pos = hint;
      setTask(c, p, tk, now);
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
    delete c.b[i];
    for (const p of c.people) if (p.task.t === "work" && p.task.at === i) p.task = { t: "idle" };
    return null;
  }
  if (a.type === "repair") {
    if (!b.flooded) return "Công trình không bị ngập.";
    const cost = repairCost(b.k);
    const err = missing(c, cost);
    if (err) return err;
    pay(c, cost);
    b.flooded = false;
    autoStaff(c);
    return null;
  }
  if (a.type === "upgrade") {
    const d = def(b.k);
    if (!d.up) return "Công trình này không nâng cấp được.";
    if (b.doneAt) return "Đang xây dở.";
    if (b.flooded) return "Phải sửa trước khi nâng cấp.";
    if (b.lvl >= MAX_LVL) return "Đã cấp tối đa.";
    if (b.lvl >= levelCap(c, b.k)) return hallLevel(c) ? `Cần nâng Đình làng lên cấp ${b.lvl + 1} trước.` : "Cần xây Đình làng (mở ở Thời đồ đồng) để nâng cấp công trình.";
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
