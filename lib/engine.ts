import { BoundedCache } from "./bounded-cache";
import { isActionInput } from "./action-input";

// Shared game engine. Runs on the server (source of truth) and on the client
// (to show live numbers between requests). Must stay deterministic: same city +
// same timestamp => same result, so random events use a seeded RNG.

export const ENGINE_VER = 3;
export const W = 96;
export const H = 96;
export const G = 0, F = 1, HL = 2, R = 3, O = 4, GOLD = 5, DIAMOND = 6;
export const isRock = (t: number) => t === HL || t === O || t === GOLD || t === DIAMOND;
export const mineralResource = (t:number): ResKey => t===GOLD?"gold":t===DIAMOND?"diamond":t===O?"copper":"stone";
export const depositCapacity = (t:number) => t===F?CAP.forest:t===GOLD?CAP.gold:t===DIAMOND?CAP.diamond:t===O?CAP.ore:t===HL?CAP.hill:0;

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const SEASON_MS = 6 * HOUR; // 4 seasons = 1 real day
export const MAX_SETTLE_MS = 14 * 24 * HOUR; // offline progress cap
const BASE_STORAGE = 500;
export const POP_GROWTH_PER_HOUR = 60;
const FOOD_PER_POP = 4; // per hour
const MIN_POP = 3;

// gathering by hand (per person per hour) and how much each tile/animal holds
export const GATHER_SPEED = 120; // Active play: a wood load takes 10 seconds, not 20 minutes.
const CHOP_RATE = 30 * GATHER_SPEED, STONE_RATE = 20 * GATHER_SPEED, ORE_RATE = 8 * GATHER_SPEED, HUNT_RATE = 40 * GATHER_SPEED;
export const CAP = { forest: 400, hill: 1500, ore: 1200, gold: 800, diamond: 120 };
const MEAT_PER_ANIMAL = 50, HERD_REGROW = 0.5; // animals per hour
export const EXPLORE_TILES_PER_MIN = 36; // matches the on-screen walking pace (~0.6 tiles/s)
const START_SIGHT = 9, SCOUT_SIGHT = 3;

export const SEASONS = ["Xuân", "Hạ", "Thu", "Đông"];
export const ERA_NAMES = ["", "Thời đồ đá", "Thời đồ đồng", "Thời đồ sắt"];
export const TERRAIN = ["Đồng cỏ", "Rừng", "Đồi đá", "Sông", "Mỏ đồng", "Mỏ vàng", "Mỏ kim cương"];
export const RES = ["food", "wood", "stone", "copper", "gold", "diamond"] as const;
export type ResKey = (typeof RES)[number];
export type Res = Record<ResKey, number>;
export const RN: Record<ResKey, string> = { food: "Lương thực", wood: "Gỗ", stone: "Đá", copper: "Đồng", gold: "Vàng", diamond: "Kim cương" };
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
  hut: { n: "Lều", era: 1, cost: { wood: 20 }, sec: 10, house: 3, up: true, d: "Chỗ ở cho 3 người mỗi cấp." },
  gather: { n: "Trại hái lượm", era: 1, cost: { wood: 15 }, sec: 10, jobs: 2, prod: { food: 60 }, up: true, d: "Lương thực. Thêm 50% trên đất phù sa." },
  wood: { n: "Trại đốn gỗ", era: 1, cost: { food: 10 }, sec: 10, jobs: 2, prod: { wood: 60 }, need: "forest", up: true, drop: ["wood"], d: "Phải kề rừng. Người chặt cây gần đây đỡ phải đi xa." },
  quarry: { n: "Bãi đá", era: 1, cost: { wood: 20 }, sec: 15, jobs: 2, prod: { stone: 40 }, need: "hill", up: true, drop: ["stone", "copper"], d: "Đặt trên đồi. Người đào đá gần đây đỡ phải đi xa." },
  storehouse: { n: "Kho", era: 1, cost: { wood: 40, stone: 10 }, sec: 30, storage: 1000, up: true, drop: ["food", "wood", "stone", "copper", "gold", "diamond"], d: "Cấp đầu +1.000 mỗi loại. Sau đó nâng riêng từng ngăn tài nguyên." },
  fire: { n: "Bếp lửa chung", era: 1, cost: { wood: 80, stone: 30 }, sec: 60, max: 2, drop: ["food"], d: "Dân tăng nhanh gấp đôi. Tối đa 2 bếp." },
  farm: { n: "Ruộng lúa", era: 2, cost: { wood: 80 }, sec: 120, jobs: 2, prod: { food: 90 }, up: true, d: "Gấp đôi trên đất phù sa." },
  canal: { n: "Kênh tưới", era: 2, cost: { stone: 40 }, sec: 30, need: "water", d: "Nối thẳng vào sông hoặc kênh. Đất quanh kênh thành phù sa." },
  levee: { n: "Đê đất", era: 2, cost: { stone: 30, wood: 20 }, sec: 60, need: "bank", d: "Sát bờ sông. Che lũ cho công trình trong 2 ô." },
  house: { n: "Nhà gỗ", era: 2, cost: { wood: 120, stone: 40 }, sec: 300, house: 7, up: true, d: "Chỗ ở cho 7 người mỗi cấp." },
  smelter: { n: "Lò đúc đồng", era: 2, cost: { wood: 100, stone: 120 }, sec: 600, jobs: 3, prod: { copper: 20 }, use: { wood: 20 }, need: "ore", up: true, drop: ["copper"], d: "Kề mỏ đồng. Đốt gỗ ra đồng." },
  market: { n: "Chợ", era: 2, cost: { wood: 200, stone: 100 }, sec: 900, jobs: 2, max: 3, d: "+10% mọi sản lượng. Đăng bán hàng, tự chọn giá và tài nguyên thanh toán; vận chuyển bằng đoàn xe có thể bị người chơi khác cướp. Tối đa 3 chợ." },
  stonehouse: { n: "Nhà đá", era: 3, cost: { stone: 250, copper: 30 }, sec: 1200, house: 12, up: true, d: "12 người mỗi cấp. Lũ không làm ngập." },
  builderhouse: { n: "Nhà thợ xây", era: 1, cost: { wood: 70, stone: 30 }, sec: 40, up: true, max: 2, d: "Mỗi cấp thêm 1 đội thợ, xây thêm 1 công trình đồng thời. Tối đa 2 nhà. Đội thợ chuyên trách, không lấy dân đang thu hoạch. Nhà cháy/ngập không cấp thêm đội; công trình đang xây vẫn được hoàn tất." },
  forge: { n: "Xưởng dụng cụ", era: 1, cost: { wood: 40, stone: 20 }, sec: 30, up: true, max: 2, d: "Mỗi cấp tăng 25% tốc độ chặt cây, đào đá, săn bắn và làm ruộng, trại hái lượm. Áp dụng toàn làng ngay khi xây xong, không cần giao thợ. Tối đa 2 xưởng; nâng cấp sau khi có Đình làng." },
  wheel: { n: "Cối nước", era: 3, cost: { wood: 200, stone: 100 }, sec: 1200, jobs: 2, prod: { food: 150 }, need: "river", up: true, d: "Sát sông. Mùa đông không giảm." },
  hall: { n: "Đình làng", era: 2, cost: { wood: 300, stone: 200, copper: 20 }, sec: 900, house: 5, storage: 500, up: true, max: 1, drop: ["food", "wood", "stone", "copper", "gold", "diamond"], d: "Nhà chính. Công trình khác chỉ nâng được tới cấp của Đình. Cấp 3 mở trung tâm điều khiển." },
  envoy: { n: "Nhà sứ giả", era: 1, cost: { wood: 80, stone: 30, food: 30 }, sec: 90, up: true, max: 1, d: "Có sứ giả để đi thăm các nước. Mỗi cấp thêm một sứ giả và đi nhanh hơn." },
  barracks: { n: "Trại lính", era: 1, cost: { wood: 120, stone: 40 }, sec: 120, up: true, max: 3, d: "Huấn luyện quân. Mỗi cấp chứa thêm 10 lính." },
  wall: { n: "Tường thành", era: 1, cost: { wood: 30, stone: 20 }, sec: 30, up: true, d: "Chặn quân địch. Độ bền tăng theo cấp và thời đại." },
  gate: { n: "Cổng làng", era: 1, cost: { wood: 60, stone: 30 }, sec: 60, up: true, d: "Cho quân nhà đi qua tuyến tường, chặn quân địch." },
  watchtower: { n: "Tháp canh", era: 1, cost: { wood: 100, stone: 80 }, sec: 120, up: true, d: "Tự bắn quân địch ở gần khi bảo vệ làng." },
  logistics: { n: "Trạm hậu cần", era: 2, cost: { wood: 100, stone: 40 }, sec: 90, up: true, max: 2, d: "Đào tạo đoàn vận tải; mỗi đoàn hỗ trợ 20 chiến binh trên đường xa. Nâng cấp tăng tốc đào tạo." },
  infirmary: { n: "Quân y viện", era: 2, cost: { wood: 80, stone: 60, food: 40 }, sec: 90, up: true, max: 2, d: "Đào tạo quân y; mỗi người chăm sóc 20 chiến binh khi hành quân và chữa thương trong trận." },
  temple: { n: "Đền Sông Mẹ", era: 3, cost: { wood: 800, stone: 1200, copper: 400 }, sec: 4 * 3600, max: 1, d: "Kỳ quan của thành phố." },
} satisfies Record<string, Def>;
export type BKey = keyof typeof DEFS;
export const B: Record<BKey, Def> = DEFS;
export const BKEYS = Object.keys(B) as BKey[];
export const def = (k: BKey): Def => B[k];

/* ---------- army ---------- */
export type UKey = "club" | "sling" | "spear" | "bow" | "sword" | "elephant" | "wagon" | "medic";
export type Unit = { n: string; era: number; cost: Partial<Res>; sec: number; atk: number; hp: number; space: number; building?: BKey; d: string };
export const UNITS: Record<UKey, Unit> = {
  club: { n: "Chiến binh gậy", era: 1, cost: { food: 30, wood: 10 }, sec: 30, atk: 4, hp: 20, space: 1, d: "Rẻ, nhanh, đánh gần." },
  sling: { n: "Lính ném đá", era: 1, cost: { food: 25, stone: 10 }, sec: 40, atk: 6, hp: 12, space: 1, d: "Đánh xa, máu mỏng." },
  spear: { n: "Giáo binh đồng", era: 2, cost: { food: 50, copper: 10 }, sec: 90, atk: 9, hp: 40, space: 1, d: "Chắc chắn, giữ hàng đầu." },
  bow: { n: "Cung thủ", era: 2, cost: { food: 40, wood: 30 }, sec: 90, atk: 11, hp: 25, space: 1, d: "Bắn xa, sát thương cao." },
  sword: { n: "Kiếm sĩ sắt", era: 3, cost: { food: 80, copper: 25 }, sec: 180, atk: 18, hp: 70, space: 1, d: "Tinh nhuệ thời đồ sắt." },
  elephant: { n: "Voi chiến", era: 3, cost: { food: 300, wood: 50 }, sec: 600, atk: 45, hp: 300, space: 5, d: "Phá trại, chiếm 5 chỗ." },
  wagon: { n: "Đoàn vận tải", era: 2, cost: { food: 30, wood: 40 }, sec: 25, atk: 0, hp: 50, space: 2, building: "logistics", d: "Xe lương và tùy tùng, hỗ trợ 20 chiến binh, giảm hao quân đường xa; không chiến đấu." },
  medic: { n: "Quân y", era: 2, cost: { food: 30, wood: 10, copper: 5 }, sec: 25, atk: 0, hp: 25, space: 1, building: "infirmary", d: "Chăm sóc 20 chiến binh trên đường xa, chữa người bị thương trong trận; không hồi sinh người chết." },
};
export const UKEYS = Object.keys(UNITS) as UKey[];
export type Troops = Partial<Record<UKey, number>>;
export type Camp = { id: number; at: number; power: number; loot: Partial<Res>; cleared: boolean; respawnAt: number | null; garrison?: Troops };
export type CampCombat = { last: number; rounds: number; hp: Partial<Record<UKey, number>>; defenders: Troops; defenderHp: Partial<Record<UKey, number>>; initial: Troops };
export type Expedition = { combatVersion?: 1; combat?: CampCombat; returnAt?: number; id: number; units: Troops; camp: number; depart: number; arrive: number; back: number; resolved: boolean; won?: boolean; loot?: Partial<Res>; recalled?: boolean; suppliesFood?: number; logisticsVersion?: number; marchLosses?: number; route?: number[]; recallAt?: number; returnProgress?: number };
const SOLDIER_FOOD = 2; // per soldier per hour
export const MARCH_TILES_PER_MIN = 4;
export const troopPower = (t: Troops) => UKEYS.reduce((a, u) => a + (t[u] ?? 0) * (UNITS[u].atk>0 ? UNITS[u].atk + UNITS[u].hp / 4 : 0), 0);
export const troopSpace = (t: Troops) => UKEYS.reduce((a, u) => a + (t[u] ?? 0) * UNITS[u].space, 0);
export const troopCount = (t: Troops) => UKEYS.reduce((a, u) => a + (t[u] ?? 0), 0);

/** Round-trip food plus a five-minute combat reserve. Elephants use five places. */
export function marchSupplies(troops: Troops, oneWayMs: number) {
  const minutes=(2*Math.max(MIN,oneWayMs))/MIN+5;
  return { food: Math.ceil(troopSpace(troops)*minutes/10), minutes };
}
/** Called inside the same transaction that reserves troops; failure changes nothing. */
export function reserveMarchFood(c: City, troops: Troops, oneWayMs: number) {
  const {food}=marchSupplies(troops,oneWayMs);
  if(c.res.food<food)throw new Error(`Cần ${food} lương thực dự trữ cho cả đi và về; hiện có ${Math.floor(c.res.food)}.`);
  c.res.food-=food;
  return food;
}

/** Predictable round-trip fatigue, applied once on arrival. Both support roles
 * independently cover twenty fighters; short journeys have no attrition. */
export function marchLogistics(troops: Troops, oneWayMs: number) {
  const fighters=Object.entries(troops).reduce((n,[u,count])=>n+(u==='wagon'||u==='medic'?0:count??0),0);
  const transport=Math.min(1,(troops.wagon??0)*20/Math.max(1,fighters));
  const medical=Math.min(1,(troops.medic??0)*20/Math.max(1,fighters));
  const base=Math.min(.25,Math.max(0,oneWayMs/MIN-10)*.01);
  const risk=base*(1-.6*transport)*(1-.75*medical);
  const survivors:Troops={...troops};let losses=0;
  // Stable proportional rounding conserves the exact predicted total.
  let accumulated=0,allocated=0;
  for(const u of ['club','sling','spear','bow','sword','elephant'] as const){
    const n=troops[u]??0;accumulated+=n*risk;
    const loss=Math.min(n,Math.floor(accumulated)-allocated);allocated+=loss;
    if(n)survivors[u]=n-loss;losses+=loss;
  }
  return {fighters,transport,medical,risk,losses,survivors,long:base>0};
}

const FLOODPROOF = new Set<BKey>(["canal", "levee", "wheel", "stonehouse", "temple"]);
export const isFloodproof = (k: BKey) => FLOODPROOF.has(k);
export const LVL_MULT = [0, 1, 1.6, 2.4];
export const MAX_LVL = 3;

export const ERA_REQ: Record<number, { pop: number; cost: Partial<Res>; hall?: number }> = {
  2: { pop: 15, cost: { food: 300, wood: 300, stone: 150 } },
  3: { pop: 50, cost: { food: 3000, wood: 1000, stone: 2000, copper: 600 }, hall: 3 },
};
const ERA_UP: Record<number, string> = {
  2: "Bước vào Thời đồ đồng: mở ruộng lúa, kênh tưới, đê đất, nhà gỗ, lò đúc đồng và chợ.",
  3: "Bước vào Thời đồ sắt: mở nhà đá, lò rèn, cối nước và Đền Sông Mẹ.",
};

export const storageLevel = (b: Building, r: ResKey) => b.storageLevels?.[r] ?? b.lvl;

export type Building = { storageLevels?: Partial<Record<ResKey, number>>; storageUpgrade?: ResKey; k: BKey; lvl: number; doneAt: number | null; flooded?: boolean; burned?: boolean; fertility?: number; tendUntil?: number };
export type Task =
  | { t: "idle"; at?: number } // at = where they stand and wait
  | { t: "work"; at: number }
  | { t: "chop"; at: number }
  | { t: "mine"; at: number }
  | { t: "hunt"; herd: number }
  | { t: "explore"; from: number; to: number; start: number; route?: number[]; seenTo?: number }; // seenTo: progress (0..1) already revealed
export type TaskInput =
  | { t: "idle" }
  | { t: "move"; to: number }
  | { t: "work" | "chop" | "mine"; at: number }
  | { t: "hunt"; herd: number }
  | { t: "explore"; to: number };
export type Haul = {
  phase: "travel" | "work" | "return" | "unload";
  at: number; nextAt: number; tile: number; route: number[]; routeStart: number;
  resource?: ResKey; carried: number; capacity: number; resting?: boolean;
  source?: { kind: "tile" | "herd" | "building"; key: number };
  taskKey: string; workRate?: number; drop?: number;
};
export type Refuge = { route: number[]; at: number; arrive: number; pausedAt: number; x: number; y: number; building?: number; returnAt?: number; back?: number; returnProgress?: number };
export type Person = { refuge?: Refuge; id: number; name: string; task: Task; pos?: number; haul?: Haul }; // pos: tile they last headed to
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
  preciousDepositsVersion?: number;
  copperDepositsVersion?: number; // one-time, additive ore enrichment; never resets the map
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
  haulAt?: number; // last complete authoritative one-second economy tick (lazy migration)
  seasonIdx: number;
  boostUntil: number;
  shift: { warn: number; at: number; xs: number[] | null; done: boolean } | null;
  templeAt: number | null;
  log: LogEntry[];
  provisionedSoldiers?: number; // deployed soldiers whose food was prepaid for this expedition
  deployedArmy?: Troops; // world marches / multiplayer battle, maintained by server
  shieldUntil?: number;
  battleId?: string; // active defending battle
  army: Troops; // at home
  queue: { u: UKey; doneAt: number; startedAt?: number }[];
  homeOrders?: Record<string, { route: number[]; at: number; x: number; y: number }>;
  camps: Camp[];
  exps: Expedition[];
  nextExp: number;
  wins: number;
  auto?: { on: boolean; mix: Record<ResKey, number> }; // auto-assign shares (control centre)
  raid?: { at: number; warn: number; power: number; from: number } | null; // incoming barbarians
  trips?: EnvoyTrip[]; // envoys travelling on the world map
  wildlife?: { route: number[]; start: number; arrive: number; end: number; resolved?: boolean };
  cropDamage?: { tile: number; until: number };
  discoveries?: string[]; // permanent nation IDs discovered by envoys
  visits?: Record<string, number>; // city id -> visit valid until (ms)
  merchantJourneys?: {id:string;depart:number;arrive:number;back:number;villageRoute:number[];incoming?:boolean;raider?:boolean}[];
  guardPosts?: { x: number; y: number }[]; // home army guard positions
  alarm?: boolean; // bell rung for the incoming raid
};

export type EnvoyTrip = { id: number; target: string; targetName: string; depart: number; arrive: number; back: number; arrived?: boolean; scouting?: boolean; villageRoute?: number[] };
/** Village leg of a diplomatic journey uses the same walkable terrain as villagers. */
export function envoyVillageRoute(c: City, kind:BKey="envoy"): number[] {
  const house=buildings(c).find(([,b])=>b.k===kind&&isBuildingActive(b));
  if(!house)return [];
  const from=house[0],prev=new Int32Array(W*H).fill(-1),queue=[from];prev[from]=from;
  for(let head=0;head<queue.length;head++){
    const i=queue[head],x=i%W,y=Math.floor(i/W);
    if(i!==from&&(x===0||y===0||x===W-1||y===H-1)){
      const route=[i];for(let tile=i;tile!==from;){tile=prev[tile];route.push(tile);}return route.reverse();
    }
    for(const [dx,dy] of N8){
      const nx=x+dx,ny=y+dy;if(!inb(nx,ny))continue;const next=idx(nx,ny);
      if(prev[next]!==-1||!haulPassable(c,next,-1,false))continue;
      if(dx&&dy&&(!haulPassable(c,idx(nx,y),-1,false)||!haulPassable(c,idx(x,ny),-1,false)))continue;
      prev[next]=i;queue.push(next);
    }
  }
  return [];
}
export function envoyVillagePosition(tr: Pick<EnvoyTrip,"depart"|"arrive"|"back"|"villageRoute">, at: number) {
  const route=tr.villageRoute;if(!route?.length || at<tr.depart || at>=tr.back)return null;
  const length=routeLength(route),leg=Math.max(1,Math.min(length*HAUL_TILE_MS,(tr.arrive-tr.depart)*.8,(tr.back-tr.arrive)*.8));
  let distance:number,returning=false;
  if(at<tr.depart+leg)distance=(at-tr.depart)/leg*length;
  else if(at>=tr.back-leg){distance=(tr.back-at)/leg*length;returning=true;}
  else return null;
  for(let i=1;i<route.length;i++){
    const a=route[i-1],b=route[i],dx=b%W-a%W,dy=Math.floor(b/W)-Math.floor(a/W),d=Math.hypot(dx,dy);
    if(distance<=d){const f=d?distance/d:1;return {x:a%W+.5+dx*f,y:Math.floor(a/W)+.5+dy*f,face:((dx-dy)*(returning?-1:1)>=0?1:-1) as 1|-1,returning};}distance-=d;
  }
  return {x:route[0]%W+.5,y:Math.floor(route[0]/W)+.5,face:1 as const,returning};
}

export const VISIT_MS = 3 * 24 * HOUR;
export const WORLD = 200; // world map is WORLD × WORLD cells
const ENVOY_CELLS_PER_MIN = 2;

/** Envoy house and envoy names change with the era. */
export const ENVOY_NAMES = ["", "Người đưa tin", "Sứ giả", "Sứ thần"];
export const ENVOY_HOUSE = ["", "Lều đưa tin", "Nhà sứ giả", "Sứ quán"];
export const DEFENSE_NAMES: Partial<Record<BKey, string[]>> = {
  wall: ["", "Hàng rào gỗ", "Tường đất", "Tường thành đá"],
  gate: ["", "Cổng gỗ", "Cổng đồng", "Cổng thành"],
  watchtower: ["", "Chòi canh", "Tháp canh gỗ", "Tháp canh đá"],
};
export const BUILDING_ERA_NAMES: Partial<Record<BKey, string[]>> = {
  hut: ["", "Lều", "Nhà gỗ nhỏ", "Nhà đá nhỏ"],
  house: ["", "Nhà gỗ", "Nhà gỗ", "Nhà xây mái ngói"],
  gather: ["", "Trại hái lượm", "Nhà thu hoạch", "Trạm lương thực"],
  wood: ["", "Trại đốn gỗ", "Xưởng gỗ", "Xưởng cưa"],
  quarry: ["", "Bãi đá", "Trạm khai thác đá", "Công trường đá"],
  storehouse: ["", "Kho tranh", "Kho gỗ", "Kho kiên cố"],
  builderhouse: ["", "Lều thợ xây", "Nhà thợ mộc", "Xưởng kiến trúc"],
  forge: ["", "Xưởng dụng cụ", "Lò rèn đồng", "Lò rèn sắt"],
  barracks: ["", "Trại chiến binh", "Doanh trại", "Doanh trại kiên cố"],
  fire: ["", "Bếp lửa chung", "Bếp làng", "Bếp xây"],
  farm: ["", "Ruộng lúa", "Ruộng lúa", "Ruộng có thủy lợi"],
  canal: ["", "Kênh tưới", "Kênh đất", "Kênh xây"],
  levee: ["", "Đê", "Đê đất", "Đê kè đá"],
  smelter: ["", "Lò đúc đồng", "Lò đúc đồng", "Lò luyện kim"],
  market: ["", "Chợ", "Chợ làng", "Thương quán"],
  logistics: ["", "Trạm hậu cần", "Trạm xe lương", "Cục hậu cần mái ngói"],
  infirmary: ["", "Quân y viện", "Nhà thuốc quân y", "Y viện mái ngói"],
  hall: ["", "Đình làng", "Đình gỗ", "Đình đá"],
};
export const buildingName = (c: City, k: BKey) => (k === "envoy" ? ENVOY_HOUSE[c.era] : DEFENSE_NAMES[k]?.[c.era] ?? BUILDING_ERA_NAMES[k]?.[c.era] ?? def(k).n);
/** Built structures cease providing services while flooded or burned. */
export const isBuildingActive = (b: Building | undefined): b is Building => !!b && b.lvl >= 1 && !b.flooded && !b.burned;
export const envoyCount = (c: City) => Object.values(c.b).reduce((a, b) => (b.k === "envoy" && isBuildingActive(b) ? Math.max(a, b.lvl) : a), 0);
export const envoysAway = (c: City) => (c.trips ?? []).length;
/** One-way travel time on the world map, faster with a higher-level envoy house. */
export const envoyMs = (c: City, cells: number) => (Math.max(1, cells) / (ENVOY_CELLS_PER_MIN * (1 + 0.5 * Math.max(0, envoyCount(c) - 1)))) * MIN;
export const canVisit = (c: City, id: string, at: number) => (c.visits?.[id] ?? 0) > at;

export type Mix = Record<ResKey, number>;
export const DEFAULT_MIX: Mix = { food: 40, wood: 30, stone: 20, copper: 10, gold: 0, diamond: 0 };
export const RAID_WARNING_MS = 30 * MIN;

/** Level of the village hall (0 = not built yet). */
export const hallLevel = (c: City) => Object.values(c.b).reduce((a, b) => (b.k === "hall" && isBuildingActive(b) ? Math.max(a, b.lvl) : a), 0);
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

/** Upgrade old worlds without moving buildings, refilling mined tiles, or
 * consuming the map generator's RNG stream. Only untouched stone hills change. */
export function enrichCopperDeposits(c: City): number {
  if ((c.copperDepositsVersion ?? 0) >= 1) return 0;
  const occupied = new Set([c.camp, ...Object.keys(c.b).map(Number), ...c.herds.map(h=>h.at), ...c.camps.map(b=>b.at),
    ...c.people.flatMap(p=>p.task.t==='mine'?[p.task.at]:[])]);
  const random=rng(c.seed ^ 0x43a91), candidates:{tile:number;rank:number}[]=[];
  let hills=0,ores=0,near=0;
  for(let tile=0;tile<c.t.length;tile++){
    if(c.t[tile]===O){ores++;if(cheb(c.camp,tile)<=18)near++;}
    if(c.t[tile]!==HL)continue;hills++;
    const rank=random();
    if(!occupied.has(tile)&&!Object.hasOwn(c.dep,tile))candidates.push({tile,rank});
  }
  // Keep at least three quarters of the remaining stone hills for quarrying.
  const budget=Math.floor(hills*.25);let added=0;
  const convert=(tile:number)=>{c.t[tile]=O;added++;ores++;};
  for(const {tile} of [...candidates].filter(p=>cheb(c.camp,p.tile)<=18).sort((a,b)=>cheb(c.camp,a.tile)-cheb(c.camp,b.tile)||a.rank-b.rank)){
    if(near>=3||added>=budget)break;convert(tile);near++;
  }
  const target=Math.max(12,Math.ceil((hills+ores-added)*.12));
  for(const {tile} of candidates.sort((a,b)=>a.rank-b.rank)){
    if(ores>=target||added>=budget)break;if(c.t[tile]===HL)convert(tile);
  }
  c.copperDepositsVersion=1;
  return added;
}

export function normalizeResources(c:City){
  c.res.gold ??= 0;c.res.diamond ??= 0;
  if(c.auto){c.auto.mix.gold ??= 0;c.auto.mix.diamond ??= 0;}
}
export const speedBuildCost=(b:Building,now:number)=>Math.max(0,Math.ceil(((b.doneAt??now)-now)/30_000));
const gatheringRate=(r:ResKey)=>r==='wood'?CHOP_RATE:r==='stone'?STONE_RATE:r==='gold'?ORE_RATE*.5:r==='diamond'?ORE_RATE*.08:ORE_RATE;
/** Deterministic additive migration on untouched hills; never builds over a route. */
export function enrichPreciousDeposits(c:City){
  normalizeResources(c);if((c.preciousDepositsVersion??0)>=1)return 0;
  const occupied=new Set([...Object.keys(c.b).map(Number),c.camp,...c.herds.map(h=>h.at),...c.camps.map(b=>b.at),...c.people.flatMap(p=>p.task.t==='mine'?[p.task.at]:[])]);
  const random=rng(c.seed^0x71b35),hills=c.t.flatMap((t,i)=>t===HL&&!occupied.has(i)&&!Object.hasOwn(c.dep,i)?[{tile:i,rank:random()}]:[]).sort((a,b)=>a.rank-b.rank);
  const budget=Math.floor(hills.length*.15),goldTarget=Math.min(8,Math.max(2,Math.floor(budget*.7))),diamondTarget=Math.min(3,Math.max(1,budget-goldTarget));let added=0;
  for(const [kind,count] of [[GOLD,goldTarget],[DIAMOND,diamondTarget]]){
    const ordered=[...hills].filter(p=>c.t[p.tile]===HL).sort((a,b)=>(cheb(c.camp,a.tile)<=24?0:1)-(cheb(c.camp,b.tile)<=24?0:1)||a.rank-b.rank);
    for(const {tile} of ordered.slice(0,Math.min(count,budget-added))){c.t[tile]=kind;added++;}
  }
  c.preciousDepositsVersion=1;return added;
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
    res: { food: 100, wood: 120, stone: 30, copper: 0, gold: 0, diamond: 0 }, pop: 0, popAcc: 0, era: 1,
    t0: now, last: now, seasonIdx: 0, boostUntil: 0, shift: null, templeAt: null, log: [],
  };
  enrichCopperDeposits(c);
  enrichPreciousDeposits(c);
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
const built = (b: Building | undefined): b is Building => !!b && b.lvl >= 1 && !b.burned;

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
export const builders = (c: City) => c.era + 1 + Object.values(c.b).reduce((n,b) => n + (b.k === "builderhouse" && isBuildingActive(b) ? b.lvl : 0), 0);
export const busyBuilders = (c: City) => Object.values(c.b).reduce((n, b) => n + (b.doneAt ? 1 : 0), 0);
export const buildMs = (k: BKey, lvl: number) => def(k).sec * 1000 * 3 ** (lvl - 1);
/** Prices depend on the buyer's era; base definitions remain stable for combat
 * valuation and demolition refunds (advancing must never mint refund resources). */
export const eraCost = (cost: Partial<Res>, era: number, ironMultiplier: number): Partial<Res> => {
  const out: Partial<Res> = {};
  for (const r of RES) if (cost[r]) out[r] = Math.ceil(cost[r]! * (era >= 3 ? ironMultiplier : 1));
  return out;
};
export const buildingCost = (k: BKey, era: number) => eraCost(def(k).cost, era, 3);
export const trainingCost = (u: UKey, era: number) => eraCost(UNITS[u].cost, era, 2);
export const levelCost = (k: BKey, lvl: number, era = 1): Partial<Res> => {
  const m = [0, 1, 2, 4][lvl], out: Partial<Res> = {};
  for (const r of RES) if (def(k).cost[r]) out[r] = def(k).cost[r]! * m;
  return eraCost(out, era, 3);
};
export const repairCost = (k: BKey, lvl = 1, burned = false, era = 1): Partial<Res> => {
  const out: Partial<Res> = {};
  for (const r of RES) if (def(k).cost[r]) out[r] = Math.ceil((levelCost(k, Math.max(1, lvl))[r] ?? 0) * (burned ? 0.5 : 0.25));
  return eraCost(out, era, 2);
};
/** Resource value used to weigh building damage in multiplayer battles. */
export const buildingValue = (b: Building) => RES.reduce((sum, r) => sum + (levelCost(b.k, Math.max(1, b.lvl))[r] ?? 0), 0);
const canAfford = (c: City, cost: Partial<Res>) => RES.every((r) => (cost[r] ?? 0) <= c.res[r]);
const missing = (c: City, cost: Partial<Res>) => {
  const m = RES.filter((r) => (cost[r] ?? 0) > c.res[r]);
  return m.length ? "Thiếu " + m.map((r) => RN[r].toLowerCase()).join(", ") + "." : null;
};
const pay = (c: City, cost: Partial<Res>, sign = -1) => { for (const r of RES) c.res[r] += sign * (cost[r] ?? 0); };

export const soldiers = (c: City) => troopCount(c.army) + troopCount(c.deployedArmy ?? {}) + c.queue.length + c.exps.reduce((a, e) => a + troopCount(e.units), 0);
export const armyCap = (c: City) => Object.values(c.b).reduce((a, b) => a + (b.k === "barracks" && isBuildingActive(b) ? b.lvl * 10 : 0), 0);
export const armyUsed = (c: City) => troopSpace(c.army) + troopSpace(c.deployedArmy ?? {}) + c.queue.reduce((a, q) => a + UNITS[q.u].space, 0) + c.exps.reduce((a, e) => a + troopSpace(e.units), 0);
export const campStrength = (camp:Camp) => camp.garrison ? Math.round(troopPower(camp.garrison)) : camp.power;
export const campById = (c: City, id: number) => c.camps.find((k) => k.id === id);
export const marchMs = (from: number, to: number) => (Math.max(1, cheb(from, to)) / EXPLORE_TILES_PER_MIN) * MIN;

export const workersAt = (c: City, i: number) => c.people.reduce((n, p) => n + (p.task.t === "work" && p.task.at === i ? 1 : 0), 0);
export const herdById = (c: City, id: number) => c.herds.find((h) => h.id === id);

/** Nearest place a villager can unload `res`, as a Chebyshev distance. */
export function dropDistance(c: City, at: number, res: ResKey) {
  let best = Infinity;
  for (const [i, b] of buildings(c)) if (built(b) && !b.flooded && def(b.k).drop?.includes(res)) best = Math.min(best, cheb(at, i));
  return Number.isFinite(best) ? best : cheb(at, c.camp);
}
const walkFactor = (d: number, rate = CHOP_RATE) => 1 / (1 + ((2 * d + 1) * rate) / (10 * 3600));

export type Drain = { kind: "tile" | "herd"; key: number; res: ResKey; perHour: number };
export type Stats = {
  rate: Res;
  woodUse: number;
  copperRate: number;
  jobs: number;
  housing: number;
  storage: Res;
  fires: number;
  drains: Drain[];
};

export function stats(c: City, D: Derived, at: number): Stats {
  const cnt: Partial<Record<BKey, number>> = {};
  let jobs = 0, housing = 0;
  const storage = Object.fromEntries(RES.map(r => [r, BASE_STORAGE])) as Res;
  for (const b of Object.values(c.b)) {
    if (!built(b) || b.flooded) continue;
    const d = def(b.k);
    jobs += d.jobs ?? 0;
    housing += (d.house ?? 0) * b.lvl;
    for (const r of RES) storage[r] += (d.storage ?? 0) * (b.k === "storehouse" ? storageLevel(b,r) : b.lvl);
    cnt[b.k] = (cnt[b.k] ?? 0) + 1;
  }
  const workers = new Map<number, number>();
  for (const p of c.people) if (!p.refuge && p.task.t === "work") workers.set(p.task.at, (workers.get(p.task.at) ?? 0) + 1);
  const mult = 1 + 0.1 * Math.min(3, cnt.market ?? 0);
  const tools = 1 + 0.25 * buildings(c).reduce((n, [, b]) => n + (b.k === "forge" && built(b) && !b.flooded ? b.lvl : 0), 0);
  const winter = seasonAt(c, at) === 3;
  const boost = at < c.boostUntil;
  const rate: Res = { food: 0, wood: 0, stone: 0, copper: 0, gold: 0, diamond: 0 };
  let woodUse = 0;
  for (const [i, b] of buildings(c)) {
    if (!built(b) || b.flooded) continue;
    const d = def(b.k);
    const eff = d.jobs ? Math.min(1, (workers.get(i) ?? 0) / d.jobs) : 0;
    if (d.use?.wood) woodUse += d.use.wood * LVL_MULT[b.lvl] * eff;
    if (!d.prod || (b.k==="farm" && (b.tendUntil || farmRemaining(b)<=0))) continue;
    for (const r of RES) {
      let v = d.prod[r];
      if (!v) continue;
      v *= LVL_MULT[b.lvl] * GATHER_SPEED;
      const crop = b.k === "farm" || b.k === "gather";
      if (crop && D.fert[i]) v *= b.k === "farm" ? 2 : 1.5;
      if (crop && D.fert[i] && boost) v *= 1.5;
      if (crop && winter) v *= 0.4;
      if (c.cropDamage?.tile===i && at<c.cropDamage.until) v *= .5;
      if (crop || b.k === "wood" || b.k === "quarry") v *= tools;
      rate[r] += v * eff * mult;
    }
  }
  // hand gathering by assigned people
  const drains: Drain[] = [];
  for (const p of c.people) {
    if(p.refuge)continue;
    const tk = p.task;
    if (tk.t === "chop" || tk.t === "mine") {
      const res: ResKey = tk.t === "chop" ? "wood" : mineralResource(c.t[tk.at]);
      const base = gatheringRate(res);
      const v = base * tools * mult * walkFactor(dropDistance(c, tk.at, res), base * tools * mult);
      rate[res] += v;
      drains.push({ kind: "tile", key: tk.at, res, perHour: v });
    } else if (tk.t === "hunt") {
      const h = herdById(c, tk.herd);
      if (!h || h.n < 0.05) continue;
      const v = HUNT_RATE * tools * mult * walkFactor(dropDistance(c, h.at, "food"), HUNT_RATE * tools * mult);
      rate.food += v;
      drains.push({ kind: "herd", key: h.id, res: "food", perHour: v });
    }
  }
  const copperRate = rate.copper;
  rate.food -= c.people.length * FOOD_PER_POP + Math.max(0,soldiers(c)-Math.min(troopCount(c.deployedArmy??{}),c.provisionedSoldiers??0)-c.exps.reduce((n,e)=>n+(e.suppliesFood!==undefined?troopCount(e.units):0),0)) * SOLDIER_FOOD;
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
  const idle = c.people.filter((p) => !p.refuge && p.task.t === "idle");
  if (!idle.length) return false;
  const resOf = (p: Person): ResKey | null => {
    const tk = p.task;
    if (tk.t === "chop") return "wood";
    if (tk.t === "mine") return mineralResource(c.t[tk.at]);
    if (tk.t === "hunt") return "food";
    if (tk.t === "work") return (Object.keys(def(c.b[tk.at]?.k ?? "hut").prod ?? {})[0] as ResKey) ?? null;
    return null;
  };
  const total = c.people.length, mixSum = RES.reduce((a, r) => a + (c.auto!.mix[r] ?? 0), 0) || 1;
  let changed = false;
  for (const p of idle) {
    const have: Res = { food: 0, wood: 0, stone: 0, copper: 0, gold: 0, diamond: 0 };
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
  if(r==='gold'&&c.era<2||r==='diamond'&&c.era<3)return null;
  const slots = buildings(c)
    .filter(([i, b]) => built(b) && !b.flooded && def(b.k).jobs && Object.keys(def(b.k).prod ?? {})[0] === r && workersAt(c, i) < def(b.k).jobs!)
    .sort((a, b) => cheb(a[0], c.camp) - cheb(b[0], c.camp));
  if (slots.length) return { t: "work", at: slots[0][0] };
  const ok = (i: number) => !!c.seen[i] && !c.b[i];
  if (r === "wood") { const i = nearestTile(c, c.camp, (j) => ok(j) && c.t[j] === F, 20); return i >= 0 ? { t: "chop", at: i } : null; }
  if (r === "stone") { const i = nearestTile(c, c.camp, (j) => ok(j) && c.t[j] === HL, 20); return i >= 0 ? { t: "mine", at: i } : null; }
  if (["copper","gold","diamond"].includes(r)) { const i = nearestTile(c, c.camp, (j) => ok(j) && isRock(c.t[j]) && mineralResource(c.t[j])===r, 40); return i >= 0 ? { t: "mine", at: i } : null; }
  const herd = c.herds.filter((h) => h.n >= 1 && c.seen[h.at] && cheb(h.at, c.camp) <= 20).sort((a, b) => cheb(a.at, c.camp) - cheb(b.at, c.camp))[0];
  return herd ? { t: "hunt", herd: herd.id } : null;
}

/** Fill open job slots in finished buildings with idle people. */
function autoStaff(c: City) {
  const idle = c.people.filter((p) => !p.refuge && p.task.t === "idle");
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
  if (tk.t === "mine") return isRock(c.t[tk.at]) ? (c.t[tk.at]===GOLD&&c.era<2?"Vàng mở từ đời đồng.":c.t[tk.at]===DIAMOND&&c.era<3?"Kim cương mở từ đời sắt.":null) : "Chỉ đào được đồi đá hoặc mỏ khoáng sản.";
  const b = c.b[tk.at];
  if (!b || !def(b.k).jobs) return "Công trình này không cần người làm.";
  if (!b || b.lvl < 1) return "Công trình chưa xây xong.";
  if (b.burned) return "Công trình bị cháy, sửa trước đã.";
  if (b.flooded) return "Công trình đang ngập, sửa trước đã.";
  if (workersAt(c, tk.at) + adding > def(b.k).jobs!) return `Chỉ nhận tối đa ${def(b.k).jobs} người.`;
  return null;
}

function setTask(c: City, p: Person, tk: TaskInput, now: number) {
  const exploring = p.task.t === "explore" ? explorerPos(p.task, now) : null;
  const point = haulPosition(p, now) ?? (exploring ? { x: exploring[0], y: exploring[1] } : null);
  const from = point ? idx(Math.min(W - 1, Math.max(0, Math.floor(point.x))), Math.min(H - 1, Math.max(0, Math.floor(point.y)))) : p.pos ?? c.camp;
  p.pos = from;
  const restLoaded = !!p.haul?.carried && (tk.t === "idle" || tk.t === "move" || tk.t === "explore") && !!p.haul.resource && c.res[p.haul.resource] + p.haul.carried > stats(c,derive(c),now).storage[p.haul.resource];
  if (p.haul?.carried) {
    p.haul.tile = from;
    p.haul.phase = "unload"; // reroute the existing cargo before beginning the new task
    p.haul.route = [from];
    p.haul.at = now;
    p.haul.nextAt = now;
    delete p.haul.drop;
    p.haul.resting = restLoaded;
    if (restLoaded) {
      const destination = tk.t === "move" || tk.t === "explore" ? tk.to : from;
      const route = haulPath(c,from,destination,haulingContext(c,derive(c))) ?? [from];
      p.haul.route=route;p.haul.phase=route.length>1?"travel":"unload";
      p.haul.nextAt=now+Math.max(HAUL_TILE_MS,Math.ceil(routeLength(route))*HAUL_TILE_MS);
    }
  } else delete p.haul;
  if (tk.t === "explore") {
    const route=haulPath(c,from,tk.to,haulingContext(c,derive(c)));
    if(!route){p.task={t:"idle",at:from};log(c,now,`${p.name} không tìm được đường do thám; hãy chọn hướng khác.`,"warn");return;}
    p.task = { t: "explore", from, to: tk.to, start: now, route };
    if(p.haul?.resting){p.haul.route=route;p.haul.phase="travel";p.haul.nextAt=now+Math.max(1,routeLength(route))/EXPLORE_TILES_PER_MIN*MIN;}
    return;
  }
  if (tk.t === "move") { p.task = { t: "idle", at: tk.to }; if (!p.haul) beginHaul(c, p, now, haulingContext(c, derive(c))); return; }
  p.task = tk as Task;
  if (!p.haul) beginHaul(c, p, now, haulingContext(c, derive(c)));
}

/** Where an explorer is along their straight-line walk at time `at` (fractional tile coords). */
export function explorerPos(tk: Extract<Task, { t: "explore" }>, at: number): [number, number, number] {
  const fx = tk.from % W, fy = (tk.from / W) | 0, tx = tk.to % W, ty = (tk.to / W) | 0;
  const dist = Math.max(1, tk.route ? routeLength(tk.route) : Math.max(Math.abs(tx - fx), Math.abs(ty - fy)));
  const p = Math.max(0, Math.min(1, (at - tk.start) / ((dist / EXPLORE_TILES_PER_MIN) * MIN)));
  if(tk.route?.length){
    let distance=p*routeLength(tk.route);
    for(let i=1;i<tk.route.length;i++){
      const a=tk.route[i-1],b=tk.route[i],d=Math.hypot(b%W-a%W,Math.floor(b/W)-Math.floor(a/W));
      if(distance<=d){const f=d?distance/d:1;return [a%W+.5+(b%W-a%W)*f,Math.floor(a/W)+.5+(Math.floor(b/W)-Math.floor(a/W))*f,p];}distance-=d;
    }
    const last=tk.route[tk.route.length-1];return [last%W+.5,Math.floor(last/W)+.5,p];
  }
  return [fx + (tx - fx) * p + 0.5, fy + (ty - fy) * p + 0.5, p];
}

function stepExplorers(c: City, at: number) {
  let changed = false;
  for (const p of c.people) {
    const tk = p.task;
    if (p.refuge || tk.t !== "explore" || p.haul?.carried && !p.haul.resting) continue;
    const [, , prog] = explorerPos(tk, at);
    // reveal every tile along the stretch walked since the last step, not just the end point
    const fx = tk.from % W, fy = (tk.from / W) | 0, tx = tk.to % W, ty = (tk.to / W) | 0;
    const dist = Math.max(1, tk.route ? routeLength(tk.route) : Math.max(Math.abs(tx - fx), Math.abs(ty - fy)));
    const p0 = tk.seenTo ?? 0, n = Math.max(1, Math.ceil((prog - p0) * dist));
    for (let k = 0; k <= n; k++) {
      const pp = p0 + ((prog - p0) * k) / n;
      const [px,py]=explorerPos(tk,tk.start+pp*dist/EXPLORE_TILES_PER_MIN*MIN);
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
      const end=tk.route?.[tk.route.length-1]??tk.to;
      p.task = { t: "idle", at: end };
      p.pos = end;
      changed = true;
    }
  }
  return changed;
}

/* ---------- authoritative gather / carry / deposit ---------- */
export const HAUL_CAPACITY = 10;
export const HAUL_TILE_MS = 1000;
const HAUL_UNLOAD_MS = 1000;
type HaulJob = { tile: number; resource: ResKey; rate: number; source: NonNullable<Haul["source"]> };
type HaulContext = { paths: BoundedCache<string, number[] | null>; D: Derived; tools: number; mult: number };
const taskKey = (p: Person) => JSON.stringify(p.task);

/** Tile-centre position along the persisted authoritative route. No client RNG. */
export function haulPosition(p: Person, now: number): { x: number; y: number; phase: Haul["phase"]; carried: number; resource?: ResKey } | null {
  const h = p.haul;
  if (!h) return null;
  let tile = h.tile, x = tile % W + 0.5, y = Math.floor(tile / W) + 0.5;
  if ((h.phase === "travel" || h.phase === "return") && h.route.length > 1) {
    const total = routeLength(h.route);
    let distance = total * Math.max(0, Math.min(1, (now - h.at) / Math.max(1, h.nextAt - h.at)));
    for (let i = 1; i < h.route.length; i++) {
      const a = h.route[i - 1], b = h.route[i], d = Math.hypot(a % W - b % W, Math.floor(a / W) - Math.floor(b / W));
      if (distance <= d) {
        const f = d ? distance / d : 1;
        x = a % W + 0.5 + (b % W - a % W) * f;
        y = Math.floor(a / W) + 0.5 + (Math.floor(b / W) - Math.floor(a / W)) * f;
        break;
      }
      distance -= d;
      tile = b; x = tile % W + 0.5; y = Math.floor(tile / W) + 0.5;
    }
  }
  return { x, y, phase: h.phase, carried: h.carried, resource: h.resource };
}
function routeLength(route: number[]) {
  let n = 0;
  for (let i = 1; i < route.length; i++) n += Math.hypot(route[i] % W - route[i - 1] % W, Math.floor(route[i] / W) - Math.floor(route[i - 1] / W));
  return n;
}
function haulPassable(c: City, tile: number, to: number, water: boolean) {
  const b = c.b[tile];
  if (b?.k === "wall" && built(b)) return false;
  if (isRock(c.t[tile])) return false;
  if (tile === to) return true;
  if (!water && c.t[tile] === R) return false;
  return !b || b.burned || b.k === "canal" || b.k === "farm" || b.k === "levee" || b.k === "gate";
}
function haulPath(c: City, from: number, to: number, ctx: HaulContext, exploredLand = false): number[] | null {
  const key = `${from}:${to}:${exploredLand}`;
  if (ctx.paths.has(key)) return ctx.paths.get(key)!;
  const rockyTarget = isRock(c.t[to]);
  const arrived = (tile: number) => rockyTarget ? tile !== to && cheb(tile, to) === 1 && haulPassable(c, tile, -1, true) : tile === to;
  if (arrived(from)) { const path = [from]; ctx.paths.set(key, path); return path; }
  const find = (water: boolean) => {
    const prev = new Int32Array(W * H).fill(-1), queue = [from]; prev[from] = from;
    let goal = -1;
    for (let head = 0; head < queue.length; head++) {
      const tile = queue[head]; if (arrived(tile)) { goal = tile; break; }
      const x = tile % W, y = Math.floor(tile / W);
      for (const [dx, dy] of N8) {
        if (!inb(x + dx, y + dy)) continue;
        const next = idx(x + dx, y + dy);
        if (exploredLand && !c.seen[next]) continue;
        if (prev[next] !== -1 || !haulPassable(c, next, to, water)) continue;
        if (dx && dy && (!haulPassable(c, idx(x + dx, y), to, water) || !haulPassable(c, idx(x, y + dy), to, water))) continue;
        prev[next] = tile; queue.push(next);
      }
    }
    if (goal < 0) return null;
    const route = [goal]; for (let tile = goal; tile !== from;) { tile = prev[tile]; route.push(tile); }
    return route.reverse();
  };
  const land = find(false), ford = exploredLand ? null : find(true);
  const path = land && (!ford || routeLength(land) <= routeLength(ford) * 1.6) ? land : ford;
  ctx.paths.set(key, path);
  return path;
}
function haulingContext(c: City, D: Derived): HaulContext {
  const active = Object.values(c.b).filter(b => built(b) && !b.flooded);
  return { paths: new BoundedCache<string,number[]|null>(256,32768,path=>path?.length??1), D, tools: 1 + 0.25 * active.filter(b => b.k === "forge").reduce((n,b) => n+b.lvl, 0), mult: 1 + 0.1 * Math.min(3, active.filter(b => b.k === "market").length) };
}
export function armyStagingTiles(c:City,limit=24,source?:number){
  const home=source??buildings(c).find(([,b])=>b.k==="barracks"&&isBuildingActive(b))?.[0]??c.camp;
  const queue=[home],seen=new Set(queue),tiles:number[]=[];
  for(let head=0;head<queue.length && tiles.length<limit;head++){const tile=queue[head],x=tile%W,y=Math.floor(tile/W);if(haulPassable(c,tile,-1,false))tiles.push(tile);
    for(const [dx,dy] of N8){const nx=x+dx,ny=y+dy,next=idx(nx,ny);if(!inb(nx,ny)||seen.has(next)||!haulPassable(c,next,-1,false))continue;
      if(dx&&dy&&(!haulPassable(c,idx(nx,y),-1,false)||!haulPassable(c,idx(x,ny),-1,false)))continue;
      seen.add(next);queue.push(next);
    }
  }
  return tiles;
}

/** Home slots follow the aggregate army; orders never create additional troops. */
export function pruneHomeOrders(c: City) {
  for (const key of Object.keys(c.homeOrders ?? {})) {
    const [u, n] = key.split(":");
    if (!UKEYS.includes(u as UKey) || Number(n) >= (c.army[u as UKey] ?? 0)) delete c.homeOrders![key];
  }
}
export function homeSoldiers(c: City, now: number, staging = armyStagingTiles(c)) {
  const result: { id: string; u: UKey; x: number; y: number; moving: boolean; face: 1 | -1 }[] = [];
  let n = 0;
  for (const u of UKEYS) for (let k = 0; k < (c.army[u] ?? 0); k++, n++) {
    const id = `${u}:${k}`, order = c.homeOrders?.[id], tile = staging[Math.floor(n / 3) % staging.length];
    if (!order && tile === undefined) continue;
    const guard=c.guardPosts?.[n % c.guardPosts.length], guardTile=guard?idx(guard.x,guard.y):-1;
    const validGuard=guard && haulPassable(c,guardTile,-1,false);
    const row=Math.floor(n/Math.max(1,c.guardPosts?.length??0));
    let x = validGuard ? guard.x+.3+(row%3)*.18 : tile % W + .3 + (n % 3) * .18;
    let y = validGuard ? guard.y+.3+(Math.floor(row/3)%3)*.18 : Math.floor(tile / W) + .5;
    let moving = false, face: 1 | -1 = -1;
    if (order) {
      x = order.x; y = order.y;
      let distance = Math.max(0, now - order.at) / 1000 * 1.9;
      for (const to of order.route.slice(1)) {
        const tx = to % W + .5, ty = Math.floor(to / W) + .5, length = Math.hypot(tx - x, ty - y);
        face = (tx - x) - (ty - y) >= 0 ? 1 : -1;
        if (distance < length) { const f = distance / length; x += (tx - x) * f; y += (ty - y) * f; moving = true; break; }
        distance -= length; x = tx; y = ty;
      }
    }
    result.push({ id, u, x, y, moving, face });
  }
  return result;
}
function orderHomeSoldier(c: City, id: string, to: number, now: number): boolean {
  const actor = homeSoldiers(c, now).find(s => s.id === id);
  if (!actor || !c.seen[to] || !haulPassable(c, to, -1, false)) return false;
  const from = idx(Math.floor(actor.x), Math.floor(actor.y));
  const route = haulPath(c, from, to, haulingContext(c, derive(c)), true);
  if (!route || route.some(i => !c.seen[i] || !haulPassable(c, i, -1, false))) return false;
  (c.homeOrders ??= {})[id] = { route, at: now, x: actor.x, y: actor.y };
  return true;
}
/** Local marches leave the barracks entrance and follow the same terrain rules as villagers. */
export function expeditionPlan(c:City,to:number){
  const home=buildings(c).find(([,b])=>b.k==="barracks"&&isBuildingActive(b))?.[0]??c.camp;
  const path=haulPath(c,home,to,haulingContext(c,derive(c)));
  if(!path)return null;
  const route=c.b[home] && path.length>1?path.slice(1):path;
  return {route,duration:Math.max(1000,routeLength(route)/EXPLORE_TILES_PER_MIN*MIN)};
}
export function expeditionPosition(e:Expedition,at:number,lag=0){
  if(!e.route?.length)return null;
  const progress=e.recallAt!==undefined ? (e.returnProgress??0)*(1-(at-e.recallAt)/Math.max(1,e.back-e.recallAt)) : at<e.arrive ? (at-e.depart)/Math.max(1,e.arrive-e.depart) : e.combatVersion && !e.resolved ? 1 : 1-(at-(e.returnAt??e.arrive))/Math.max(1,e.back-(e.returnAt??e.arrive));
  const length=routeLength(e.route),going=e.recallAt===undefined&&at<e.arrive;
  const fraction=Math.max(0,Math.min(1,progress+(going?-lag:lag)/Math.max(1,length)));
  const [x,y]=explorerPos({t:"explore",from:e.route[0],to:e.route[e.route.length-1],start:0,route:e.route},fraction*Math.max(1,length)/EXPLORE_TILES_PER_MIN*MIN);
  const next=explorerPos({t:"explore",from:e.route[0],to:e.route[e.route.length-1],start:0,route:e.route},Math.max(0,Math.min(1,fraction+(going?.001:-.001)))*Math.max(1,length)/EXPLORE_TILES_PER_MIN*MIN);
  return {x,y,going,face:((next[0]-x)-(next[1]-y)>=0?1:-1) as 1|-1};
}

/** Villagers keep their task and cargo while taking a real route to shelter and back. */
export function refugePosition(p:Person,now:number){
  const f=p.refuge;if(!f)return null;
  const duration=Math.max(1,f.arrive-f.at);
  const progress=f.returnAt===undefined ? Math.min(1,Math.max(0,(now-f.at)/duration)) : (f.returnProgress??1)*Math.max(0,1-(now-f.returnAt)/Math.max(1,f.back!-f.returnAt));
  let length=0,px=f.x,py=f.y;
  for(let i=1;i<f.route.length;i++){const tile=f.route[i],nx=tile%W+.5,ny=Math.floor(tile/W)+.5;length+=Math.hypot(nx-px,ny-py);px=nx;py=ny;}
  let distance=length*progress,x=f.x,y=f.y;px=f.x;py=f.y;
  for(let i=1;i<f.route.length;i++){const tile=f.route[i],nx=tile%W+.5,ny=Math.floor(tile/W)+.5,d=Math.hypot(nx-px,ny-py);if(distance<=d){const q=d?distance/d:1;x=px+(nx-px)*q;y=py+(ny-py)*q;break;}distance-=d;x=nx;y=ny;px=nx;py=ny;}
  const returning=f.returnAt!==undefined;
  return {x,y,hidden:!returning && progress>=1 && f.building!==undefined,moving:returning?now<f.back!:progress<1,returning};
}
export function updateRefuges(c:City,at:number){
  const danger=!!c.battleId || !!(c.raid && c.raid.warn<=at && at<c.raid.at);
  let changed=false,started=0,returning=0;
  let ctx:HaulContext|undefined;
  for(const p of c.people){
    let f=p.refuge;
    if(danger && (!f || f.returnAt!==undefined)){
      const old=refugePosition(p,at),haul=haulPosition(p,at),explore=p.task.t==="explore"?explorerPos(p.task,at):null;
      const x=old?.x??haul?.x??explore?.[0]??((p.pos??c.camp)%W+.5),y=old?.y??haul?.y??explore?.[1]??(Math.floor((p.pos??c.camp)/W)+.5);
      const from=idx(Math.max(0,Math.min(W-1,Math.floor(x))),Math.max(0,Math.min(H-1,Math.floor(y))));
      ctx??=haulingContext(c,derive(c));
      let route:number[]|null=null,building:number|undefined;
      const homes=buildings(c).filter(([,b])=>["hall","hut","house","stonehouse"].includes(b.k)&&isBuildingActive(b)).sort(([a],[b])=>cheb(a,from)-cheb(b,from)||a-b);
      for(const [tile] of homes){
        for(const [dx,dy] of N8){const tx=tile%W+dx,ty=Math.floor(tile/W)+dy;if(!inb(tx,ty))continue;const to=idx(tx,ty);if(!haulPassable(c,to,-1,false))continue;const path=haulPath(c,from,to,ctx);if(path){route=path;building=tile;break;}}
        if(route)break;
      }
      if(!route && haulPassable(c,c.camp,-1,false))route=haulPath(c,from,c.camp,ctx);
      route??=[from];
      const length=routeLength(route);
      p.refuge={route,at,arrive:at+length/1.9*1000,pausedAt:f?.pausedAt??at,x,y,...(building!==undefined?{building}:{})};
      f=p.refuge;started++;changed=true;
    }
    if(!f)continue;
    if(!danger && f.returnAt===undefined){
      const duration=Math.max(0,f.arrive-f.at),walked=Math.min(duration,Math.max(0,at-f.at));
      f.returnAt=at;f.returnProgress=duration?walked/duration:0;f.back=at+walked;
      returning++;changed=true;
    }
    if(f.back!==undefined && f.back<=at){
      const pause=f.back-f.pausedAt;
      if(p.haul){p.haul.at+=pause;p.haul.nextAt+=pause;p.haul.routeStart+=pause;}
      if(p.task.t==="explore")p.task.start+=pause;
      delete p.refuge;changed=true;
    }
  }
  if(started)log(c,at,"Có địch! Dân ngừng làm việc, giữ hàng đang mang và chạy tìm chỗ trú gần nhất.","warn");
  if(returning)log(c,at,"Đã an toàn. Dân rời chỗ trú, quay lại vị trí cũ rồi tiếp tục công việc.","good");
  return changed;
}

function haulingJob(c: City, p: Person, at: number, ctx: HaulContext): HaulJob | null {
  const tk = p.task;
  if (tk.t === "chop" || tk.t === "mine") {
    if (tk.t === "chop" ? c.t[tk.at] !== F : !isRock(c.t[tk.at])) return null;
    const resource: ResKey = tk.t === "chop" ? "wood" : mineralResource(c.t[tk.at]);
    const rate = gatheringRate(resource);
    return { tile: tk.at, resource, rate: rate * ctx.tools * ctx.mult, source: { kind: "tile", key: tk.at } };
  }
  if (tk.t === "hunt") {
    const herd = herdById(c, tk.herd);
    return herd && herd.n > 0 ? { tile: herd.at, resource: "food", rate: HUNT_RATE * ctx.tools * ctx.mult, source: { kind: "herd", key: herd.id } } : null;
  }
  if (tk.t !== "work") return null;
  const b = c.b[tk.at];
  if (!built(b) || b.flooded || (b.k==="farm" && (b.tendUntil || farmRemaining(b)<=0))) return null;
  const d = def(b.k), resource = RES.find(r => (d.prod?.[r] ?? 0) > 0);
  if (!resource || !d.jobs) return null;
  let rate = d.prod![resource]! * LVL_MULT[b.lvl] / d.jobs * ctx.mult * GATHER_SPEED;
  const crop = b.k === "farm" || b.k === "gather";
  if (crop && ctx.D.fert[tk.at]) rate *= b.k === "farm" ? 2 : 1.5;
  if (crop && ctx.D.fert[tk.at] && at < c.boostUntil) rate *= 1.5;
  if (crop && seasonAt(c, at) === 3) rate *= 0.4;
  if (c.cropDamage?.tile===tk.at && at<c.cropDamage.until) rate *= .5;
  if (crop || b.k === "wood" || b.k === "quarry") rate *= ctx.tools;
  let source: HaulJob["source"] = { kind: "building", key: tk.at };
  let tile = tk.at;
  if (b.k === "wood" || b.k === "quarry" || b.k === "smelter") {
    const terrain = b.k === "wood" ? F : b.k === "quarry" ? HL : O;
    // Keep working after the nearest tree/rock is exhausted; select a reachable source.
    tile = nearestTile(c, tk.at, i => !!c.seen[i] && c.t[i] === terrain && (!c.b[i] || i === tk.at) && !!haulPath(c,p.pos ?? c.camp,i,ctx), 6);
    if (tile < 0) return null;
    source = { kind: "tile", key: tile };
  }
  return { tile, resource, rate, source };
}
function activeDrop(c: City, tile: number, resource: ResKey) {
  // The original campsite is the starter stockpile even before the first hut.
  if (tile === c.camp) return true;
  const b = c.b[tile];
  return !!b && built(b) && !b.flooded && !!def(b.k).drop?.includes(resource);
}
function returnCargo(c: City, p: Person, at: number, ctx: HaulContext) {
  const h = p.haul!;
  if (!h.resource || !h.carried) return false;
  const candidates = [...buildings(c).filter(([i]) => i !== c.camp && activeDrop(c, i, h.resource!)).map(([i]) => i), c.camp];
  let best: number[] | null = null, drop = -1, length = Infinity;
  for (const tile of candidates) {
    // Use the starter stockpile only when no dedicated drop site is reachable.
    if (tile === c.camp && best) continue;
    const path = haulPath(c, h.tile, tile, ctx);
    const d = path ? routeLength(path) : Infinity;
    if (d < length) { length = d; best = path; drop = tile; }
  }
  if (!best) { h.phase = "unload"; h.nextAt = at + HAUL_TILE_MS; delete h.drop; return false; }
  h.drop = drop; h.route = best; h.routeStart = at; h.at = at;
  h.phase = best.length === 1 ? "unload" : "return";
  h.nextAt = at + (best.length === 1 ? HAUL_UNLOAD_MS : Math.max(HAUL_TILE_MS, Math.ceil(length) * HAUL_TILE_MS));
  return true;
}
function beginHaul(c: City, p: Person, at: number, ctx: HaulContext) {
  if(p.refuge)return;
  let job = haulingJob(c, p, at, ctx);
  if (!job && (p.task.t === "chop" || p.task.t === "mine")) {
    const task = p.task;
    const next = nearestTile(c, task.at, i => !!c.seen[i] && !c.b[i] && (task.t === "chop" ? c.t[i] === F : isRock(c.t[i]) && mineralResource(c.t[i])===(p.haul?.resource??mineralResource(c.t[task.at]))), 4);
    p.task = next >= 0 ? { t: task.t, at: next } : { t: "idle" };
    job = haulingJob(c, p, at, ctx);
  }
  if (!job && p.task.t === "hunt") {
    const origin = herdById(c, p.task.herd)?.at ?? p.pos ?? c.camp;
    const next = c.herds.filter(h => h.n >= 1 && c.seen[h.at] && cheb(h.at, origin) <= 14).sort((a,b) => cheb(a.at, origin) - cheb(b.at, origin))[0];
    p.task = next ? { t: "hunt", herd: next.id } : { t: "idle" };
    job = haulingJob(c, p, at, ctx);
  }
  if (!job) {
    const target = p.task.t === "idle" ? p.task.at : p.task.t === "work" && isBuildingActive(c.b[p.task.at]) ? p.task.at : undefined;
    const from = p.pos ?? c.camp;
    if (target !== undefined && from !== target) {
      const route = haulPath(c, from, target, ctx);
      if (route) p.haul = { phase: "travel", at, nextAt: at + Math.max(HAUL_TILE_MS, Math.ceil(routeLength(route)) * HAUL_TILE_MS), tile: from, route, routeStart: at, carried: 0, capacity: HAUL_CAPACITY, taskKey: taskKey(p) };
    }
    return;
  }
  const from = p.pos ?? c.camp, path = haulPath(c, from, job.tile, ctx);
  if (!path) return;
  const travel = Math.ceil(routeLength(path)) * HAUL_TILE_MS, capacity=job.resource==='diamond'?1:job.resource==='gold'?5:HAUL_CAPACITY;
  p.haul = { phase: travel ? "travel" : "work", at, nextAt: at + (travel || Math.ceil(capacity / job.rate * HOUR / HAUL_TILE_MS) * HAUL_TILE_MS), tile: from,
    route: path, routeStart: at, resource: job.resource, carried: 0, capacity, source: job.source, taskKey: taskKey(p), workRate: job.rate };
}
function takeCargo(c: City, h: Haul, at: number): number {
  if (!h.source) return 0;
  if (h.source.kind === "building") {
    const b=c.b[h.source.key];if(!isBuildingActive(b))return 0;
    if(b.k!=="farm")return h.capacity;
    if(b.tendUntil)return 0;
    const amount=Math.min(h.capacity,farmRemaining(b));b.fertility=farmRemaining(b)-amount;
    if(amount>0 && b.fertility===0)log(c,at,"Ruộng đã bạc màu, nông dân tạm nghỉ. Chọn ruộng để cải tạo đất và gieo lại.","warn");
    return amount;
  }
  if (h.source.kind === "herd") {
    const herd = herdById(c, h.source.key);
    if (!herd) return 0;
    const amount = Math.min(h.capacity, herd.n * MEAT_PER_ANIMAL);
    herd.n = Math.max(0, herd.n - amount / MEAT_PER_ANIMAL);
    return amount;
  }
  const tile = h.source.key, terrain = c.t[tile];
  if (terrain !== F && !isRock(terrain)) return 0;
  const cap = depositCapacity(terrain);
  const amount = Math.max(0, Math.min(h.capacity, cap - (c.dep[tile] ?? 0)));
  c.dep[tile] = (c.dep[tile] ?? 0) + amount;
  if (c.dep[tile] >= cap) { c.t[tile] = G; delete c.dep[tile]; }
  return amount;
}
/** Construction and river changes invalidate routes only when topology changes,
 * rather than running a full-map search for each person on every second. */
function refreshHauling(c: City, at: number, ctx: HaulContext) {
  for (const p of c.people) {
    const h = p.haul;
    if (!h || p.refuge) continue;
    if (h.phase === "work") {
      if (isRock(c.t[h.tile])) { p.pos = h.tile; delete p.haul; beginHaul(c, p, at, ctx); continue; }
      const job = haulingJob(c, p, at, ctx);
      if (job && h.workRate && job.rate !== h.workRate) {
        h.nextAt = at + Math.max(0, h.nextAt - at) * h.workRate / job.rate;
        h.workRate = job.rate;
      }
      continue;
    }
    if (h.phase !== "travel" && h.phase !== "return") continue;
    const target = h.route[h.route.length - 1];
    const point = haulPosition(p, at)!;
    const from = idx(Math.max(0, Math.min(W - 1, Math.floor(point.x))), Math.max(0, Math.min(H - 1, Math.floor(point.y))));
    // A ford is allowed by the existing villager policy; buildings and walls
    // must still be respected when a previously valid route becomes blocked.
    if (h.route.every(tile => haulPassable(c, tile, target, true) || tile === h.route[0])) continue;
    const route = haulPath(c, from, target, ctx);
    h.tile = from; p.pos = from;
    if (!route) { h.phase = "unload"; h.route = [from]; h.at = at; h.nextAt = at + HAUL_TILE_MS; delete h.drop; continue; }
    h.route = route; h.at = at; h.routeStart = at;
    h.nextAt = at + Math.max(HAUL_TILE_MS, Math.ceil(routeLength(route)) * HAUL_TILE_MS);
  }
}
/** Resource gathering runs only at persisted transition times. Cargo is credited
 * exactly once, at unload, never by the rates displayed in stats(). */
function stepHauling(c: City, at: number, ctx: HaulContext, storage: Res, smelt: number) {
  for (const p of c.people) {
    if(p.refuge)continue;
    if (!p.haul) { beginHaul(c, p, at, ctx); continue; }
    const h = p.haul;
    if (h.resting) {
      if(h.nextAt>at) continue;
      h.tile=h.route[h.route.length-1];p.pos=h.tile;h.route=[h.tile];h.phase="unload";h.at=at;
      if(h.resource && storage[h.resource]-c.res[h.resource]>=h.carried){h.resting=false;returnCargo(c,p,at,ctx);}
      else h.nextAt=at+HAUL_TILE_MS;
      continue;
    }
    if (h.phase === "work" && p.task.t === "work" && !isBuildingActive(c.b[p.task.at])) { delete p.haul; beginHaul(c, p, at, ctx); continue; }
    if (h.phase === "work" && h.source && (h.source.kind === "tile" ? c.t[h.source.key]!==F&&!isRock(c.t[h.source.key]) : h.source.kind === "building" ? !isBuildingActive(c.b[h.source.key]) : !herdById(c, h.source.key)?.n)) {
      delete p.haul; beginHaul(c, p, at, ctx); continue;
    }
    if (h.phase === "work" && p.task.t === "work" && def(c.b[p.task.at]?.k ?? "hut").use?.wood && smelt < 1) h.nextAt += HAUL_TILE_MS * (1 - smelt);
    if (h.nextAt > at) continue;
    if (h.phase === "travel") {
      h.tile = h.route[h.route.length - 1]; p.pos = h.tile;
      const job = haulingJob(c, p, at, ctx);
      if (!job || (job.tile !== h.tile && !(isRock(c.t[job.tile]) && cheb(job.tile, h.tile) === 1)) || taskKey(p) !== h.taskKey) { delete p.haul; beginHaul(c, p, at, ctx); continue; }
      h.phase = "work"; h.at = at; h.source = job.source; h.resource = job.resource; h.workRate = job.rate;
      h.nextAt = at + Math.ceil(h.capacity / job.rate * HOUR / HAUL_TILE_MS) * HAUL_TILE_MS;
    } else if (h.phase === "work") {
      if (taskKey(p) !== h.taskKey || !haulingJob(c, p, at, ctx)) { delete p.haul; beginHaul(c, p, at, ctx); continue; }
      h.carried = takeCargo(c, h, at);
      if (h.carried > 0) returnCargo(c, p, at, ctx);
      else { delete p.haul; beginHaul(c, p, at, ctx); }
    } else if (h.phase === "return") {
      h.tile = h.route[h.route.length - 1]; p.pos = h.tile; h.phase = "unload"; h.at = at; h.nextAt = at + HAUL_UNLOAD_MS;
      if (h.drop === undefined || !activeDrop(c, h.drop, h.resource!)) returnCargo(c, p, at, ctx);
    } else {
      if (!h.carried) { delete p.haul; beginHaul(c, p, at, ctx); continue; }
      if (h.drop === undefined || !activeDrop(c, h.drop, h.resource!) || (h.tile !== h.drop && !(isRock(c.t[h.drop]) && cheb(h.tile,h.drop) === 1))) { returnCargo(c, p, at, ctx); continue; }
      const amount = Math.min(h.carried, Math.max(0, storage[h.resource!] - c.res[h.resource!]));
      c.res[h.resource!] += amount; h.carried -= amount;
      if (h.carried > 1e-9) { h.nextAt = at + HAUL_TILE_MS; continue; }
      p.pos = h.tile; delete p.haul;
      if (p.task.t === "explore") { p.task.from = p.pos; p.task.start = at; p.task.seenTo=0; p.task.route=haulPath(c,p.pos,p.task.to,ctx)??[p.pos]; }
      beginHaul(c, p, at, ctx);
    }
  }
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
    if ([...set].some((i) => isRock(c.t[i]) && c.t[i]!==HL || i === c.camp)) continue;
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
  const near = c.camps.filter((k) => !k.cleared && campStrength(k)>0 && cheb(k.at, c.camp) <= 35).sort((a, b) => cheb(a.at, c.camp) - cheb(b.at, c.camp))[0];
  if (!near || r() > 0.6 || c.raid) return;
  c.raid = { warn: at, at: at + RAID_WARNING_MS, power: Math.round(campStrength(near) * 0.5 + c.era * 10), from: near.at };
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

/** Forest boars follow a real passable route. No threat during the first 30 minutes. */
export function wildlifePosition(c: City, at: number): [number,number] | null {
  const w=c.wildlife;if(!w || at>=w.end)return null;
  const progress=Math.max(0,Math.min(1,(at-w.start)/(w.arrive-w.start)))*(w.route.length-1);
  const i=Math.floor(progress),a=w.route[i],b=w.route[Math.min(i+1,w.route.length-1)],f=progress-i;
  return [a%W+.5+(b%W-a%W)*f,Math.floor(a/W)+.5+(Math.floor(b/W)-Math.floor(a/W))*f];
}
function stepWildlife(c: City, at: number): boolean {
  let changed=false;
  if(c.cropDamage && at>=c.cropDamage.until){delete c.cropDamage;log(c,at,"Ruộng đã phục hồi sau khi thú rừng giẫm phá.","good");changed=true;}
  const w=c.wildlife;
  if(w && !w.resolved && at>=w.arrive){
    w.resolved=true;const tile=w.route[w.route.length-1];
    const defended=buildings(c).some(([i,b])=>b.k==="watchtower"&&isBuildingActive(b)&&cheb(i,tile)<=7)||troopPower(c.army)>=20;
    if(defended)log(c,at,"Lính giữ làng / chòi canh đã xua đàn lợn rừng. Ruộng an toàn.","good");
    else if(c.b[tile]?.k==="farm"&&isBuildingActive(c.b[tile])){
      c.cropDamage={tile,until:at+2*MIN};
      log(c,at,"Lợn rừng giẫm phá một ruộng: năng suất giảm 50% trong 2 phút. Xây chòi trong 7 ô hoặc giữ quân ở làng (sức mạnh 20) để phòng lần sau.","warn");
    }else log(c,at,"Đàn lợn rừng đã bỏ đi vì ruộng không còn ở đó.");
    changed=true;
  }
  if(w && at>=w.end){delete c.wildlife;changed=true;}
  const slot=Math.floor((at-c.t0)/(30*MIN));
  if(slot<1 || (at-c.t0)%(30*MIN)!==0 || c.wildlife || c.battleId)return changed;
  const r=rng(c.seed^Math.imul(slot,1597334677));if(r()>.45)return changed;
  const farms=buildings(c).filter(([,b])=>b.k==="farm"&&isBuildingActive(b));
  if(!farms.length)return changed;
  const [tile]=farms[Math.floor(r()*farms.length)];
  const ctx=haulingContext(c,derive(c));
  const starts=c.t.map((t,i)=>t===F&&c.seen[i]&&cheb(i,tile)>=3&&cheb(i,tile)<=12?i:-1).filter(i=>i>=0);
  for(const from of starts.slice(0,24)){
    const route=haulPath(c,from,tile,ctx);if(!route || route.length<2)continue;
    c.wildlife={route,start:at,arrive:at+MIN,end:at+MIN+15_000};
    log(c,at,"Có lợn rừng đang tới ruộng, còn 1 phút! Chòi canh trong 7 ô hoặc quân ở làng có sức mạnh 20 sẽ xua chúng.","warn");return true;
  }
  return changed;
}

function stepEnvoys(c: City, nt: number) {
  let changed = false;
  for (const tr of [...(c.trips ?? [])]) {
    const local=envoyVillagePosition(tr,nt);
    if(local && reveal(c,idx(Math.floor(local.x),Math.floor(local.y)),2)) changed=true;
    // Exploration is resolved by the server; clients cannot predict a hidden target.
    if (tr.scouting && !tr.target) continue;
    if (!tr.arrived && tr.arrive <= nt) {
      tr.arrived = true;
      c.discoveries = [...new Set([...(c.discoveries ?? []), tr.target])];
      c.visits = { ...(c.visits ?? {}), [tr.target]: tr.arrive + VISIT_MS };
      log(c, tr.arrive, `${ENVOY_NAMES[c.era]} đã tới ${tr.targetName}. Có thể xem làng họ, và được phép xuất quân tới đó trong 3 ngày.`, "good");
      changed = true;
    }
    if (tr.back <= nt) {
      c.trips = (c.trips ?? []).filter((x) => x !== tr);
      log(c, tr.back, `${ENVOY_NAMES[c.era]} đã từ ${tr.targetName} trở về.`);
      changed = true;
    }
  }
  return changed;
}

/** Send an envoy to another city `cells` away on the world map (the API layer measures the distance). */
export function sendEnvoy(c: City, target: string, targetName: string, cells: number, now: number): string | null {
  settle(c, now);
  if (!envoyCount(c)) return `Cần xây ${ENVOY_HOUSE[c.era]} trước.`;
  if (envoysAway(c) >= envoyCount(c)) return `Tất cả ${ENVOY_NAMES[c.era].toLowerCase()} đang đi vắng.`;
  if ((c.trips ?? []).some((t) => t.target === target)) return `Đã có ${ENVOY_NAMES[c.era].toLowerCase()} đang đi tới đó.`;
  const villageRoute=envoyVillageRoute(c);
  if(villageRoute.length<2)return "Nhà sứ giả chưa có đường ra ngoài. Hãy mở lối trên đất, tránh núi đá, sông và tường kín.";
  const ms = envoyMs(c, cells);
  const id = (c.trips ?? []).reduce((a, t) => Math.max(a, t.id), 0) + 1;
  c.trips = [...(c.trips ?? []), { id, target, targetName, depart: now, arrive: now + ms, back: now + 2 * ms, villageRoute }];
  log(c, now, `${ENVOY_NAMES[c.era]} lên đường tới ${targetName}, tới nơi sau ${Math.max(1, Math.round(ms / MIN))} phút.`);
  return null;
}

/** Deterministic local combat, one simultaneous exchange per persisted second. */
export function campDefenders(power: number): Troops {
  if (power<=0) return {};
  const total=Math.max(1,Math.round(power/9));
  const sling=Math.floor(total/4);
  return {club:total-sling,...(sling?{sling}:{})};
}
const combatHealth=(units:Troops)=>Object.fromEntries(UKEYS.filter(u=>units[u]).map(u=>[u,units[u]!*UNITS[u].hp])) as Partial<Record<UKey,number>>;
const combatDamage=(units:Troops)=>UKEYS.reduce((n,u)=>n+(units[u]??0)*UNITS[u].atk,0);
function combatHit(units:Troops,hp:Partial<Record<UKey,number>>,damage:number){
  // Front line shields ranged units and noncombatants, who never attack.
  for(const u of ["elephant","sword","spear","club","bow","sling","wagon","medic"] as UKey[]){
    if(!units[u] || damage<=0)continue;
    const health=hp[u]??units[u]!*UNITS[u].hp,hit=Math.min(health,damage);
    hp[u]=Math.max(0,health-hit);units[u]=Math.ceil(hp[u]!/UNITS[u].hp);damage-=hit;
  }
}
function combatHeal(units:Troops,hp:Partial<Record<UKey,number>>){
  let healing=(units.medic??0)*3;
  for(const u of UKEYS){if(!units[u]||!healing)continue;const max=units[u]!*UNITS[u].hp,add=Math.min(healing,Math.max(0,max-(hp[u]??max)));hp[u]=(hp[u]??max)+add;healing-=add;}
}
function finishCampCombat(c:City,e:Expedition,camp:Camp|undefined,at:number){
  e.resolved=true;e.won=troopPower(e.units)>0 && !troopPower(e.combat!.defenders);
  e.returnAt=at;e.back=at+(e.arrive-e.depart);
  const lost:Troops={};for(const u of UKEYS){const n=(e.combat!.initial[u]??0)-(e.units[u]??0);if(n>0)lost[u]=n;}
  if(camp && !camp.cleared){
    camp.garrison={...e.combat!.defenders};
    if(e.won){camp.cleared=true;camp.respawnAt=at+2*24*HOUR;e.loot={...camp.loot};c.wins++;reveal(c,camp.at,4);}
  }
  log(c,at,e.won ? `Quân ta phá trại man rợ!${troopCount(lost)?` Hy sinh: ${troopText(lost)}.`:""} Đang mang về ${costText(e.loot??{})}.` : `Quân ta phải rút khỏi trại man rợ.${troopCount(lost)?` Hy sinh: ${troopText(lost)}.`:""} Quân địch còn ${troopCount(e.combat!.defenders)} người.`,e.won?"good":"warn");
}

function stepArmy(c: City, nt: number) {
  pruneHomeOrders(c);
  let changed = false;
  if (c.raid && c.raid.at <= nt) { raid(c, c.raid.at, rng(c.seed ^ Math.imul(Math.floor(c.raid.at / MIN), 3266489917))); changed = true; }
  while (c.queue.length && c.queue[0].doneAt <= nt) {
    const q = c.queue.shift()!;
    const k = c.army[q.u] ?? 0;
    c.army[q.u] = k + 1;
    const source = buildings(c).find(([, b]) => b.k === (UNITS[q.u].building ?? "barracks") && isBuildingActive(b))?.[0];
    const exit = source === undefined ? undefined : armyStagingTiles(c,1,source)[0];
    const entrance = exit === undefined ? undefined : {x:exit%W,y:Math.floor(exit/W)};
    if (entrance) {
      const id = `${q.u}:${k}`, tile = idx(entrance.x,entrance.y);
      (c.homeOrders ??= {})[id] = { route:[tile], at:q.doneAt, x:entrance.x+.5, y:entrance.y+.5 };
      const post = c.guardPosts?.[k % c.guardPosts.length];
      const destination = post ? idx(post.x,post.y) : armyStagingTiles(c)[k % Math.max(1,armyStagingTiles(c).length)];
      if (destination !== undefined) orderHomeSoldier(c,id,destination,q.doneAt);
    }
    changed = true;
  }
  for (const k of c.camps) {
    if (k.cleared && k.respawnAt && k.respawnAt <= nt) {
      k.cleared = false; k.respawnAt = null;
      delete k.garrison;
      k.power = Math.round(k.power * 1.25);
      for (const res of RES) if (k.loot[res]) k.loot[res] = Math.round(k.loot[res]! * 1.2);
      changed = true;
    }
  }
  for (const e of [...c.exps]) {
    const camp = campById(c, e.camp);
    if(!e.route && camp){e.route=expeditionPlan(c,camp.at)?.route??[];changed=true;}
    const position=expeditionPosition(e,nt);if(position && reveal(c,idx(Math.floor(position.x),Math.floor(position.y)),1))changed=true;
    if (e.combatVersion && !e.resolved && e.arrive <= nt && !e.recalled) {
      if (!e.combat) {
        if(e.logisticsVersion){const march=marchLogistics(e.units,e.arrive-e.depart);e.units=march.survivors;e.marchLosses=march.losses;if(march.losses)log(c,e.arrive,`Hành quân xa tới trại man rợ: hao ${march.losses} chiến binh do thiếu hỗ trợ.`,"warn");}
        const defenders = camp && !camp.cleared ? structuredClone(camp.garrison ?? campDefenders(camp.power)) : {};
        e.combat = { last: e.arrive, rounds: 0, hp: combatHealth(e.units), defenders, defenderHp: combatHealth(defenders), initial: { ...e.units } };
        if (troopCount(defenders)) log(c,e.arrive,`Man rợ ra tiếp chiến: ${troopText(defenders)}. Quân ta đang giao chiến.`,"warn");
      }
      const fight = e.combat;
      while (troopPower(e.units)>0 && troopPower(fight.defenders)>0 && fight.rounds<60 && fight.last+1000<=nt) {
        const attack = combatDamage(e.units), defense = combatDamage(fight.defenders);
        // Simultaneous blows: even a defeated garrison can inflict a final wound.
        combatHit(e.units,fight.hp,defense);
        combatHit(fight.defenders,fight.defenderHp,attack);
        combatHeal(e.units,fight.hp);
        fight.rounds++; fight.last+=1000;
        if(camp && !camp.cleared)camp.garrison={...fight.defenders};
      }
      if (!troopPower(e.units) || !troopPower(fight.defenders) || fight.rounds>=60) finishCampCombat(c,e,camp,fight.last);
      changed = true;
    }
    if (!e.combatVersion && !e.resolved && e.arrive <= nt && !e.recalled) {
      e.resolved = true;
      if(e.logisticsVersion){const march=marchLogistics(e.units,e.arrive-e.depart);e.units=march.survivors;e.marchLosses=march.losses;if(march.losses)log(c,e.arrive,`Hành quân xa tới trại man rợ: hao ${march.losses} chiến binh do thiếu hỗ trợ.`,"warn");}
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

function completeBuilding(c:City,b:Building,at:number){
  if(b.k === "storehouse" && b.storageUpgrade){
    const r=b.storageUpgrade;
    b.storageLevels![r]=storageLevel(b,r)+1;
    b.lvl=Math.max(...RES.map(key=>storageLevel(b,key)));
    delete b.storageUpgrade;b.doneAt=null;
    log(c,at,`Kho: ngăn ${RN[r]} lên cấp ${storageLevel(b,r)} (+1.000 sức chứa).`,"good");return;
  }
  b.lvl++;b.doneAt=null;
  log(c,at,`${buildingName(c,b.k)} ${b.lvl===1?"xây xong":"đã nâng lên cấp "+b.lvl}.`,"good");
  if(b.k==='temple'&&!c.templeAt){c.templeAt=at;log(c,at,"Đền Sông Mẹ khánh thành. Thành phố đã đi từ lều cỏ tới kỳ quan.","good");}
}

/** Advance the city to `now`: finish construction, run seasons, produce, grow. Mutates `c`. */
export function settle(c: City, now: number) {
  normalizeResources(c);
  if(c.merchantJourneys)c.merchantJourneys=c.merchantJourneys.filter(j=>j.back>now);
  if (now <= c.last) return;
  let t = c.haulAt ?? c.last;
  c.haulAt = t;
  const end = t + Math.floor((now - t) / HAUL_TILE_MS) * HAUL_TILE_MS;
  if (end - t > MAX_SETTLE_MS) {
    t = end - MAX_SETTLE_MS;
    c.seasonIdx = Math.max(c.seasonIdx, seasonIndexAt(c, t));
  }
  let D = derive(c), st = stats(c, D, t), dirty = false;
  let hauling = haulingContext(c, D);
  if(updateRefuges(c,t))dirty=true;
  refreshHauling(c, t, hauling);
  for (const p of c.people) if (!p.haul) beginHaul(c, p, t, hauling);
  while (t < end) {
    const nt = t + HAUL_TILE_MS; // fixed persisted ticks: polling never changes delivery or starvation timing
    for (const b of Object.values(c.b)) {
      if(b.k==="farm" && b.tendUntil && b.tendUntil<=nt){
        b.fertility=farmCapacity(b);delete b.tendUntil;dirty=true;
        log(c,nt,"Ruộng đã cải tạo và gieo lại, nông dân tiếp tục làm việc.","good");
      }
      if (b.doneAt && b.doneAt <= nt) {
        completeBuilding(c,b,nt);dirty = true;
      }
    }
    if (dirty) autoStaff(c);
    if (t < c.boostUntil && c.boostUntil <= nt) dirty = true;
    const si = seasonIndexAt(c, nt);
    while (c.seasonIdx < si) { c.seasonIdx++; onSeason(c, c.seasonIdx); dirty = true; }
    if (updateRefuges(c,nt)) dirty=true;
    if (stepExplorers(c, nt)) dirty = true;
    if (stepArmy(c, nt)) dirty = true;
    if (stepEnvoys(c, nt)) dirty = true;
    if (stepWildlife(c, nt)) dirty = true;
    if (autoAssign(c, nt)) dirty = true;
    if (dirty) { D = derive(c); st = stats(c, D, nt); hauling = haulingContext(c, D); refreshHauling(c, nt, hauling); dirty = false; }

    const h = (nt - t) / HOUR;
    // Displayed production rates are estimates. Only unload events credit stock.
    // Food and smelter fuel remain continuous costs, separate from carried goods.
    const need = st.woodUse * h;
    const smelt = need > 0 ? Math.max(0, Math.min(1, c.res.wood / need)) : 1;
    c.res.wood = Math.max(0, c.res.wood - need * smelt);
    c.res.food -= (c.people.length * FOOD_PER_POP + Math.max(0,soldiers(c)-Math.min(troopCount(c.deployedArmy??{}),c.provisionedSoldiers??0)-c.exps.reduce((n,e)=>n+(e.suppliesFood!==undefined?troopCount(e.units):0),0)) * SOLDIER_FOOD) * h;
    for (const r of RES) c.res[r] = Math.min(st.storage[r], c.res[r]);
    stepHauling(c, nt, hauling, st.storage, smelt);
    for (const herd of c.herds) if (herd.n < herd.max) herd.n = Math.min(herd.max, herd.n + HERD_REGROW * h);

    const popBefore = c.people.length;
    if (c.res.food < 0) {
      c.res.food = 0;
      c.popAcc -= h * 6;
    } else if (c.people.length < st.housing) {
      c.popAcc += h * POP_GROWTH_PER_HOUR * (1 + st.fires);
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
  c.haulAt = t;
  c.last = now;
}

export function canPlace(c: City, D: Derived, k: BKey, x: number, y: number): string | null {
  const d = def(k), i = idx(x, y), t = c.t[i];
  if (!c.seen[i]) return "Vùng này chưa khám phá.";
  if (d.era > c.era) return "Chưa tới thời đại này.";
  if (c.b[i]) return "Ô này đã có công trình.";
  if (t === R) return "Không xây được trên sông.";
  if(!["farm","canal","levee","gate"].includes(k) && [...c.exps,...(c.merchantJourneys??[]).filter(j=>j.back>c.last).map(j=>({route:j.villageRoute})),...(Object.keys(c.homeOrders??{}).length?homeSoldiers(c,c.last):[]).flatMap(s=>{const o=c.homeOrders?.[s.id];return o?[{route:s.moving?o.route:[idx(Math.floor(s.x),Math.floor(s.y))]}]:[];}),...c.people.flatMap(p=>p.refuge?[p.refuge]:[])].some(e=>e.route?.some((tile,n,route)=>tile===i || n>0 && tile%W!==route[n-1]%W && Math.floor(tile/W)!==Math.floor(route[n-1]/W) && (i===idx(tile%W,Math.floor(route[n-1]/W)) || i===idx(route[n-1]%W,Math.floor(tile/W))))))return "Đoàn quân hoặc dân tránh địch đang dùng lối này. Chờ họ trở về hoặc chọn ô khác để không chặn đường.";
  if (k === "quarry") { if (t !== HL) return "Bãi đá phải đặt trên đồi."; }
  else if (isRock(t)) return "Đồi đá chỉ đặt được bãi đá.";
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
  return missing(c, buildingCost(k, c.era));
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

export const FARM_TEND_MS = 30_000;
export const farmCapacity = (b: Building) => 600 * Math.max(1,b.lvl);
export const farmRemaining = (b: Building) => Math.max(0,b.fertility ?? farmCapacity(b));
export const farmTendCost = (b: Building, era = 1): Partial<Res> => eraCost({ food: 20*Math.max(1,b.lvl), wood: 5*Math.max(1,b.lvl) }, era, 2);

export type Action =
  | { type: "build"; k: BKey; x: number; y: number }
  | { type: "upgradeStorage"; resource: ResKey; x: number; y: number }
  | { type: "upgrade"; x: number; y: number }
  | { type: "repair"; x: number; y: number }
  | { type: "speedBuild"; x: number; y: number }
  | { type: "tendFarm"; x: number; y: number }
  | { type: "demolish"; x: number; y: number }
  | { type: "moveSoldier"; id: string; x: number; y: number }
  | { type: "setGuardPosts"; posts: { x: number; y: number }[] }
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
  if (!isActionInput(a)) return "Yêu cầu không hợp lệ.";
  settle(c, now);
  if (a.type === "speedBuild") {
    const b=c.b[idx(a.x,a.y)];
    if(!b?.doneAt||b.doneAt<=now)return "Công trình không còn đang xây.";
    const cost=speedBuildCost(b,now);
    if(c.res.diamond<cost)return `Cần ${cost} kim cương để hoàn tất.`;
    c.res.diamond-=cost;b.doneAt=now;
    // Use the normal construction completion path, including staffing and wonders.
    completeBuilding(c,b,now);autoStaff(c);
    log(c,now,`Dùng ${cost} kim cương hoàn tất ${def(b.k).n}.`,"good");return null;
  }
  if (a.type === "tendFarm") {
    const b=c.b[idx(a.x,a.y)];
    if (!b || b.k!=="farm" || !isBuildingActive(b) || b.doneAt) return "Cần chọn ruộng đã xây xong, không bị cháy/ngập.";
    if(b.tendUntil) return "Ruộng đang được cải tạo và gieo lại.";
    if(farmRemaining(b)>=farmCapacity(b)) return "Ruộng còn đầy dinh dưỡng, chưa cần cải tạo.";
    const cost=farmTendCost(b,c.era),err=missing(c,cost);if(err)return err;
    pay(c,cost);b.tendUntil=now+FARM_TEND_MS;
    for(const p of c.people)if(p.task.t==="work" && p.task.at===idx(a.x,a.y) && p.haul?.phase==="work")delete p.haul;
    log(c,now,"Đang cải tạo đất và gieo lại ruộng, hoàn tất sau 30 giây.");
    return null;
  }
  if (a.type === "moveSoldier") {
    if (c.battleId) return "Hãy điều quân trong màn trận đánh.";
    return orderHomeSoldier(c, a.id, idx(a.x,a.y), now) ? null : "Không có đường đất đã khám phá tới đó, hoặc lính đã xuất chinh.";
  }
  if (a.type === "setGuardPosts") {
    if (!Array.isArray(a.posts) || a.posts.length > 20) return "Chỉ đặt tối đa 20 điểm gác.";
    const seen = new Set<number>();
    for (const p of a.posts) {
      if (!p || !Number.isInteger(p.x) || !Number.isInteger(p.y) || !inb(p.x, p.y)) return "Điểm gác không hợp lệ.";
      const i = idx(p.x, p.y);
      if (!c.seen[i] || c.t[i] === R || (isBuildingActive(c.b[i]) && c.b[i].k === "wall")) return "Đặt điểm gác trên đất đã khám phá, ngoài tường thành.";
      if (seen.has(i)) return "Điểm gác bị trùng.";
      seen.add(i);
    }
    c.guardPosts = a.posts.map(({ x, y }) => ({ x, y }));
    for (const [n, soldier] of homeSoldiers(c, now).entries()) { const post = a.posts[n % a.posts.length]; if (post) orderHomeSoldier(c, soldier.id, idx(post.x,post.y), now); }
    return null;
  }
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
    if(u.building && !Object.values(c.b).some(b=>b.k===u.building && isBuildingActive(b)))return `Cần xây ${B[u.building].n} để đào tạo ${u.n}.`;
    const n = Math.max(1, Math.min(50, Math.floor(a.n)));
    if (armyUsed(c) + n * u.space > armyCap(c)) return `Trại lính hết chỗ (${armyUsed(c)}/${armyCap(c)}). Nâng cấp hoặc xây thêm trại.`;
    const cost: Partial<Res> = {};
    const single = trainingCost(a.u, c.era);
    for (const r of RES) if (single[r]) cost[r] = single[r]! * n;
    const err = missing(c, cost);
    if (err) return err;
    pay(c, cost);
    const lv = Object.values(c.b).reduce((a2, b) => a2 + (b.k === (u.building ?? "barracks") && isBuildingActive(b) ? b.lvl : 0), 0);
    const each = (u.sec * 1000) / (1 + 0.5 * (lv - 1));
    let start = Math.max(now, c.queue.length ? c.queue[c.queue.length - 1].doneAt : now);
    for (let k = 0; k < n; k++) { const startedAt = start; start += each; c.queue.push({ u: a.u, startedAt, doneAt: start }); }
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
    const oneWay = e.arrive - e.depart, walked = Math.min(oneWay, Math.max(0, now - e.depart));
    if (e.combat) { const camp = campById(c,e.camp); if(camp && !camp.cleared) camp.garrison={...e.combat.defenders}; }
    e.recallAt=now;e.returnProgress=Math.min(1,walked/Math.max(1,oneWay));
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
    if(c.exps.some(e=>e.camp===camp.id && !e.resolved))return "Đã có đoàn quân đang tiến đánh trại này. Chờ giao chiến kết thúc.";
    const units: Troops = {};
    for (const u of UKEYS) {
      const n = Math.max(0, Math.floor(a.units?.[u] ?? 0));
      if (n > (c.army[u] ?? 0)) return `Không đủ ${UNITS[u].n.toLowerCase()} ở nhà.`;
      if (n) units[u] = n;
    }
    if (!troopCount(units)) return "Chọn ít nhất một lính.";
    if(!troopPower(units))return "Cần có chiến binh đi cùng đoàn hỗ trợ.";
    const plan=expeditionPlan(c,camp.at);
    if(!plan)return "Không có đường từ trại lính tới trại man rợ. Hãy mở lối ra, đặt cổng hoặc dỡ công trình chắn đường.";
    const ms = plan.duration,suppliesFood=marchSupplies(units,ms).food;
    if(c.res.food<suppliesFood)return `Cần ${suppliesFood} lương thực dự trữ cho cả đi và về.`;
    c.res.food-=suppliesFood;
    for (const u of UKEYS) if (units[u]) c.army[u]! -= units[u]!;
    pruneHomeOrders(c);
    c.exps.push({ id: c.nextExp++, units, camp: camp.id, depart: now, arrive: now + ms, back: now + 2 * ms, resolved: false, route:plan.route, suppliesFood, logisticsVersion:1, combatVersion:1 });
    log(c, now, `Xuất quân (${troopText(units)}) đánh trại man rợ, tới nơi sau ${ms < MIN ? `${Math.ceil(ms / 1000)} giây` : `${Math.ceil(ms / MIN)} phút`}.`);
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
    if(people.some(p=>p.refuge))return "Dân đang tránh địch hoặc quay lại chỗ làm. Chờ an toàn để giao việc mới.";
    const moving = tk.t === "work" ? people.filter((p) => !(p.task.t === "work" && p.task.at === tk.at)).length : 0;
    const err = taskError(c, tk, moving);
    if (err) return err;
    for (const p of people) {
      // Economy positions are authoritative; client animation hints cannot
      // teleport a worker or a load of resources to the destination.
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
    pay(c, buildingCost(a.k, c.era));
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
    if (!b.flooded && !b.burned) return "Công trình không cần sửa.";
    if (b.doneAt) return "Đang xây dở.";
    const cost = repairCost(b.k, b.lvl, !!b.burned, c.era);
    const err = missing(c, cost);
    if (err) return err;
    pay(c, cost);
    b.flooded = false;
    b.burned = false;
    autoStaff(c);
    return null;
  }
  if (a.type === "upgradeStorage") {
    if(b.k!=="storehouse" || b.lvl<1)return "Chọn Kho đã xây xong.";
    if(b.doneAt)return "Kho đang được nâng cấp.";
    if(b.flooded||b.burned)return "Phải sửa Kho trước khi nâng cấp.";
    const lv=storageLevel(b,a.resource);
    if(lv>=MAX_LVL)return "Ngăn này đã cấp tối đa.";
    if(lv>=levelCap(c,b.k))return "Cần xây hoặc nâng Đình làng để nâng tiếp ngăn Kho.";
    if(busyBuilders(c)>=builders(c))return "Tất cả thợ đang bận.";
    const cost=levelCost(b.k,lv+1,c.era),err=missing(c,cost);if(err)return err;
    pay(c,cost);
    b.storageLevels=Object.fromEntries(RES.map(r=>[r,storageLevel(b,r)]));
    b.storageUpgrade=a.resource;b.doneAt=now+buildMs(b.k,lv+1);return null;
  }
  if (a.type === "upgrade") {
    if(b.k==="storehouse")return "Chọn ngăn tài nguyên cần nâng trong Kho.";
    const d = def(b.k);
    if (!d.up) return "Công trình này không nâng cấp được.";
    if (b.doneAt) return "Đang xây dở.";
    if (b.flooded || b.burned) return "Phải sửa trước khi nâng cấp.";
    if (b.lvl >= MAX_LVL) return "Đã cấp tối đa.";
    if (b.lvl >= levelCap(c, b.k)) return hallLevel(c) ? `Cần nâng Đình làng lên cấp ${b.lvl + 1} trước.` : "Cần xây Đình làng (mở ở Thời đồ đồng) để nâng cấp công trình.";
    if (busyBuilders(c) >= builders(c)) return "Tất cả thợ đang bận.";
    const cost = levelCost(b.k, b.lvl + 1, c.era);
    const err = missing(c, cost);
    if (err) return err;
    pay(c, cost);
    b.doneAt = now + buildMs(b.k, b.lvl + 1);
    return null;
  }
  return "Hành động không hợp lệ.";
}
