import {stepHunger,type HungerState} from './hunger';
import {ERA_UNITS} from './era-military';
import {selectTowerTiles,towerLimit} from './tower-balance';
import {MODERN_BUILDINGS,initializeModern,stepPower,serviceBonus,powerFraction,finalWonderError,completedWonder,floodProtection,retentionProtected,scheduleModernFlood,recoverModernFloods,canToggle,operationJobs,type ModernState,type PowerGroup} from './modern';
import {INDUSTRIAL_BUILDINGS,initializeIndustry,stepIndustry,pollutionFood,pollutionBirth,staffCounts,transportNetwork,transportSpeed,plantTree,type IndustryState} from './industry';
import { eraNames, RELEASE_RULES, type EngineRules } from "./eras";
import { MEDIEVAL_BUILDINGS, initializeMedieval, stepMedieval, scheduleDrought, medievalBonus, droughtFactor, hasWaterSource, isField, isStorage, type MedievalState } from "./medieval";
import { BoundedCache } from "./bounded-cache";
import { isActionInput } from "./action-input";

// Shared game engine. Runs on the server (source of truth) and on the client
// (to show live numbers between requests). Must stay deterministic: same city +
// same timestamp => same result, so random events use a seeded RNG.

export const ENGINE_VER = 3;
export const W = 96;
export const H = 96;
export const G = 0, F = 1, HL = 2, R = 3, O = 4, GOLD = 5, DIAMOND = 6, COAL = 7;
export const isRock = (t: number) => t === HL || t === O || t === GOLD || t === DIAMOND || t === COAL;
export const mineralResource = (t:number): ResKey => t===COAL?"coal":t===GOLD?"gold":t===DIAMOND?"diamond":t===O?"copper":"stone";
export const depositCapacity = (t:number) => t===COAL?CAP.coal:t===F?CAP.forest:t===GOLD?CAP.gold:t===DIAMOND?CAP.diamond:t===O?CAP.ore:t===HL?CAP.hill:0;

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const SEASON_MS = 6 * HOUR; // 4 seasons = 1 real day
export const MAX_SETTLE_MS = 14 * 24 * HOUR; // offline progress cap
const BASE_STORAGE = 500;
export const WATERMILL_WOOD_PER_HOUR = 120;
export const GATHER_IRRIGATED_FOOD_PER_HOUR = 120;
export const GATHER_DRY_FOOD_PER_HOUR = 240;
export const POP_GROWTH_PER_HOUR = 60;
/** Hourly engine units; food is consumed continuously at 2/4 per minute in era 1. */
export function upkeepRates(era:number){
  const scale=2**Math.max(0,Math.min(3,Math.floor(era))-1);
  return { civilian:{food:120*scale,wood:scale},soldier:{food:240*scale,wood:2*scale} };
}
/** Better food tools and baskets keep food production in step with era upkeep. */
export const foodEraScale=(c:City,at:number)=>c.upkeepStartsAt!==undefined&&at<c.upkeepStartsAt?1:2**Math.max(0,Math.min(3,c.era)-1);
const MIN_POP = 3;

// gathering by hand (per person per hour) and how much each tile/animal holds
export const GATHER_SPEED = 120; // Active play: a wood load takes 10 seconds, not 20 minutes.
const CHOP_RATE = 30 * GATHER_SPEED, STONE_RATE = 20 * GATHER_SPEED, ORE_RATE = 8 * GATHER_SPEED, HUNT_RATE = 40 * GATHER_SPEED;
export const CAP = { forest: 400, hill: 1500, ore: 1200, gold: 800, diamond: 120, coal:30000 };
const MEAT_PER_ANIMAL = 50, HERD_REGROW = 0.5; // animals per hour
export const EXPLORE_TILES_PER_MIN = 36; // matches the on-screen walking pace (~0.6 tiles/s)
const START_SIGHT = 9, SCOUT_SIGHT = 3;

export const SEASONS = ["Xuân", "Hạ", "Thu", "Đông"];
export const ERA_NAMES = eraNames;
export const TERRAIN = ["Đồng cỏ", "Rừng", "Đồi đá", "Sông", "Mỏ đồng", "Mỏ vàng", "Mỏ kim cương", "Mỏ than"];
export const RES = ["food", "wood", "stone", "copper", "gold", "diamond", "coal"] as const;
export type ResKey = (typeof RES)[number];
export type Res = Record<ResKey, number>;
export const RN: Record<ResKey, string> = { food: "Lương thực", wood: "Gỗ", stone: "Đá", copper: "Đồng", gold: "Vàng", diamond: "Kim cương", coal:"Than" };
const NAMES = ["Tí", "Tèo", "Mận", "Đào", "Sửu", "Dần", "Bống", "Cò", "Sẻ", "Mít", "Na", "Bưởi", "Cốm", "Gạo", "Nụ", "Lúa", "Cau", "Sen", "Mây", "Gió", "Đá", "Suối", "Trúc", "Tre", "Muối", "Vừng", "Hến", "Ốc", "Ngô", "Khoai"];

type Need = "forest" | "hill" | "ore" | "water" | "river" | "bank";
export type Def = {
  n: string;
  era: number;
  cost: Partial<Res>;
  sec: number; // build time for level 1
  input?: Partial<Res>;
  emission?: number;
  demand?: number;
  supply?: number;
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
  ...MEDIEVAL_BUILDINGS,
  ...INDUSTRIAL_BUILDINGS,
  ...MODERN_BUILDINGS,
  hut: { n: "Lều", era: 1, cost: { wood: 20 }, sec: 10, house: 3, up: true, d: "Chỗ ở cho 3 người mỗi cấp." },
  gather: { n: "Trại hái lượm", era: 1, cost: { wood: 15 }, sec: 10, jobs: 2, prod: { food: 60 }, use: { food: GATHER_DRY_FOOD_PER_HOUR }, up: true, d: "Lương thực. Thêm 50% trên đất phù sa. Khi sản xuất, mỗi trại dùng 2 thực/phút nếu được kênh có nước tưới trong 1 ô, nếu không dùng 4 thực/phút. Cộng riêng với sức ăn dân, cố định mọi cấp và số thợ. Hết thực dân vẫn kiếm ăn." },
  wood: { n: "Trại đốn gỗ", era: 1, cost: { food: 10 }, sec: 10, jobs: 2, prod: { wood: 60 }, need: "forest", up: true, drop: ["wood"], d: "Phải kề rừng. Người chặt cây gần đây đỡ phải đi xa." },
  quarry: { n: "Bãi đá", era: 1, cost: { wood: 20 }, sec: 15, jobs: 2, prod: { stone: 40 }, need: "hill", up: true, drop: ["stone", "copper"], d: "Đặt trên đồi. Người đào đá gần đây đỡ phải đi xa." },
  storehouse: { n: "Kho", era: 1, cost: { wood: 40, stone: 10 }, sec: 30, storage: 1000, up: true, drop: ["food", "wood", "stone", "copper", "gold", "diamond", "coal"], d: "Cấp đầu +1.000 mỗi loại. Sau đó nâng riêng từng ngăn tài nguyên." },
  fire: { n: "Bếp lửa chung", era: 1, cost: { wood: 80, stone: 30 }, sec: 60, max: 2, use:{wood:300}, drop: ["food"], d: "Mỗi bếp đốt 50 gỗ / 10 phút để tăng tốc sinh dân. Thiếu củi giảm hiệu quả, hết củi bếp tắt. Tối đa 2 bếp." },
  farm: { n: "Ruộng lúa", era: 2, cost: { wood: 80 }, sec: 120, jobs: 2, prod: { food: 90 }, up: true, d: "Gấp đôi trên đất phù sa." },
  canal: { n: "Kênh tưới", era: 2, cost: { stone: 40 }, sec: 30, need: "water", d: "Nối thẳng vào sông hoặc kênh. Đất quanh kênh thành phù sa." },
  levee: { n: "Đê đất", era: 2, cost: { stone: 30, wood: 20 }, sec: 60, need: "bank", d: "Xây sát sông hoặc nối thẳng đê khác. Che lũ trong 2 ô; vòng đê kín bảo vệ toàn bộ đất bên trong khỏi lũ mùa thu." },
  house: { n: "Nhà gỗ", era: 2, cost: { wood: 120, stone: 40 }, sec: 300, house: 7, up: true, d: "Chỗ ở cho 7 người mỗi cấp." },
  smelter: { n: "Lò đúc đồng", era: 2, cost: { wood: 100, stone: 120 }, sec: 600, jobs: 3, prod: { copper: 20 }, use: { wood: 600,stone:600 }, need: "ore", up: true, drop: ["copper"], d: "Kề mỏ đồng. Cấp 1 đủ 3 người dùng 10 gỗ + 10 đá / phút. Nâng cấp tăng sản lượng và nguyên liệu; thiếu một loại thì giảm hoặc ngừng đúc." },
  dock: { n: "Bến cảng", era: 2, cost: { wood: 600, stone: 400, copper: 120, gold: 40 }, sec: 180, need: "river", up: true, max: 3, d: "Đóng thuyền vận tải, mỗi cấp hỗ trợ 3 thuyền. Một thuyền chở 10 chỗ; voi chiếm 5, xe hậu cần chiếm 3. Quân tự lên thuyền khi đường đi cần qua sông có bến hoạt động." },
  market: { n: "Chợ", era: 2, cost: { wood: 200, stone: 100 }, sec: 900, jobs: 2, max: 3, d: "+10% mọi sản lượng. Đăng bán hàng, tự chọn giá và tài nguyên thanh toán; vận chuyển bằng đoàn xe có thể bị người chơi khác cướp. Tối đa 3 chợ." },
  stonehouse: { n: "Nhà đá", era: 3, cost: { stone: 250, copper: 30 }, sec: 1200, house: 12, up: true, d: "12 người mỗi cấp. Lũ không làm ngập." },
  builderhouse: { n: "Nhà thợ xây", era: 1, cost: { wood: 70, stone: 30 }, sec: 40, up: true, max: 2, d: "Mỗi cấp thêm 1 đội thợ, xây thêm 1 công trình đồng thời. Tối đa 2 nhà. Đội thợ chuyên trách, không lấy dân đang thu hoạch. Nhà cháy/ngập không cấp thêm đội; công trình đang xây vẫn được hoàn tất." },
  forge: { n: "Xưởng dụng cụ", era: 1, cost: { wood: 40, stone: 20 }, sec: 30, up: true, max: 2, d: "Mỗi cấp tăng 25% tốc độ chặt cây, đào đá, săn bắn và làm ruộng, trại hái lượm. Áp dụng toàn làng ngay khi xây xong, không cần giao thợ. Tối đa 2 xưởng; nâng cấp sau khi có Đình làng." },
  wheel: { n: "Cối nước", era: 3, cost: { wood: 200, stone: 100 }, sec: 1200, jobs: 2, prod: { food: 150 }, use: { wood: WATERMILL_WOOD_PER_HOUR }, need: "river", up: true, d: "Sát sông. Mùa đông không giảm. Mỗi cối dùng 2 gỗ/phút khi sản xuất, không tăng theo cấp hay số thợ. Hết gỗ tạm dừng; có gỗ tự chạy lại." },
  hall: { n: "Đình làng", era: 2, cost: { wood: 300, stone: 200, copper: 20 }, sec: 900, house: 5, storage: 500, up: true, max: 1, drop: ["food", "wood", "stone", "copper", "gold", "diamond", "coal"], d: "Nhà chính. Công trình khác chỉ nâng được tới cấp của Đình. Cấp 3 mở trung tâm điều khiển." },
  envoy: { n: "Nhà sứ giả", era: 1, cost: { wood: 80, stone: 30, food: 30 }, sec: 90, up: true, max: 1, d: "Có sứ giả để đi thăm các nước. Mỗi cấp thêm một sứ giả và đi nhanh hơn." },
  barracks: { n: "Trại lính", era: 1, cost: { wood: 120, stone: 40 }, sec: 120, up: true, max: 3, d: "Huấn luyện quân. Mỗi cấp chứa thêm 10 lính." },
  wall: { n: "Tường thành", era: 1, cost: { wood: 30, stone: 20 }, sec: 30, up: true, d: "Chặn quân địch. Độ bền tăng theo cấp và thời đại." },
  gate: { n: "Cổng làng", era: 1, cost: { wood: 60, stone: 30 }, sec: 60, up: true, d: "Cho quân nhà đi qua tuyến tường, chặn quân địch." },
  watchtower: { n: "Tháp canh", era: 1, cost: { wood: 100, stone: 80 }, sec: 120, up: true, d: "Tầm 6 ô, bắn mỗi giây: cấp 1/2/3 gây 6/9/12 sát thương. Giới hạn theo đời: 2/3/4/5/6/8 trụ; cần phối hợp quân phòng thủ." },
  logistics: { n: "Trạm hậu cần", era: 2, cost: { wood: 100, stone: 40 }, sec: 90, up: true, max: 2, d: "Đào tạo đoàn vận tải; mỗi đoàn hỗ trợ 20 chiến binh trên đường xa. Nâng cấp tăng tốc đào tạo." },
  infirmary: { n: "Quân y viện", era: 2, cost: { wood: 80, stone: 60, food: 40 }, sec: 90, up: true, max: 2, d: "Đào tạo quân y; mỗi người chăm sóc 20 chiến binh khi hành quân và chữa thương trong trận." },
  temple: { n: "Đền Sông Mẹ", era: 3, cost: { wood: 800, stone: 1200, copper: 400 }, sec: 4 * 3600, max: 1, d: "Kỳ quan của thành phố." },
} satisfies Record<string, Def>;
export type BKey = keyof typeof DEFS;
export const B: Record<BKey, Def> = DEFS;
export const buildingJobs=(b:Building)=>operationJobs(b,B[b.k]);
export const BKEYS = Object.keys(B) as BKey[];
export const buildingLimit=(c:City,k:BKey)=>k==='watchtower'?towerLimit(c.era):B[k].max;
export function defendingTowers(c:City){
 const center=Number(Object.keys(c.b).find(i=>c.b[i].k==='hall')??c.camp);
 return selectTowerTiles(Object.entries(c.b).filter(([,b])=>b.k==='watchtower'&&isBuildingActive(b)).map(([tile,b])=>({tile:+tile,lvl:b.lvl})),c.era,center);
}
export const def = (k: BKey): Def => B[k];

/* ---------- army ---------- */
export type UKey = "crossbow"|"cavalry"|"musket"|"cannon"|"infantry"|"armor"| "club" | "sling" | "spear" | "bow" | "sword" | "elephant" | "wagon" | "medic";
export type Unit = {range?:number;attackMs?:number;speed?:number;shot?:'arrow'|'melee'|'bullet'|'shell';buildingAtk?:number; n: string; era: number; cost: Partial<Res>; sec: number; atk: number; hp: number; space: number; building?: BKey; d: string };
export const UNITS: Record<UKey, Unit> = {
  ...ERA_UNITS,
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
export type Expedition = { ships?: number; combatVersion?: 1; combat?: CampCombat; returnAt?: number; id: number; units: Troops; camp: number; depart: number; arrive: number; back: number; resolved: boolean; won?: boolean; loot?: Partial<Res>; recalled?: boolean; suppliesFood?: number; logisticsVersion?: number; marchLosses?: number; route?: number[]; recallAt?: number; returnProgress?: number };
export const MARCH_TILES_PER_MIN = 4;
export const troopPower = (t: Troops) => UKEYS.reduce((a, u) => a + (t[u] ?? 0) * (UNITS[u].atk>0 ? UNITS[u].atk + UNITS[u].hp / 4 : 0), 0);
export const troopSpace = (t: Troops) => UKEYS.reduce((a, u) => a + (t[u] ?? 0) * UNITS[u].space, 0);
export const troopCount = (t: Troops) => UKEYS.reduce((a, u) => a + (t[u] ?? 0), 0);

/** Round-trip food plus a five-minute combat reserve. Elephants use five places. */
export function marchSupplies(troops: Troops, oneWayMs: number, era=1) {
  const minutes=(2*Math.max(MIN,oneWayMs))/MIN+5;
  return { food: Math.ceil(troopSpace(troops)*minutes*upkeepRates(era).soldier.food/60), minutes };
}
/** Called inside the same transaction that reserves troops; failure changes nothing. */
export function reserveMarchFood(c: City, troops: Troops, oneWayMs: number) {
  const {food}=marchSupplies(troops,oneWayMs,c.era);
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
  for(const u of UKEYS.filter(u=>UNITS[u].atk>0)){
    const n=troops[u]??0;accumulated+=n*risk;
    const loss=Math.min(n,Math.floor(accumulated)-allocated);allocated+=loss;
    if(n)survivors[u]=n-loss;losses+=loss;
  }
  return {fighters,transport,medical,risk,losses,survivors,long:base>0};
}

const FLOODPROOF = new Set<BKey>(["canal", "levee", "wheel", "stonehouse", "temple", "tilehouse", "reservoir", "well", "tenement", "apartment", "retention", "hydro", "dam"]);
export const isFloodproof = (k: BKey) => FLOODPROOF.has(k);
export const LVL_MULT = [0, 1, 1.6, 2.4];
export const MAX_LVL = 3;

export const ERA_REQ: Record<number, { pop: number; cost: Partial<Res>; hall?: number; wonder?: BKey }> = {
  2: { pop: 15, cost: { food: 300, wood: 300, stone: 150 } },
  3: { pop: 50, cost: { food: 3000, wood: 1000, stone: 2000, copper: 600 }, hall: 3 },
  4: { pop:100, hall:3, wonder:"temple", cost:{food:12000,wood:6000,stone:6000,copper:1800,gold:300} },
  6: {pop:300,hall:5,wonder:"ironbridge",cost:{food:80000,wood:20000,stone:35000,copper:10000,gold:3000,coal:6000}},
  5: { pop:180, hall:4, wonder:"academy", cost:{food:35000,wood:12000,stone:16000,copper:5000,gold:1200} },
};
const ERA_UP: Record<number, string> = {
  5: "Bước vào Công nghiệp: mở than, vườn ươm, vận tải, xử lý nước và Cầu Sắt Đại Hà. Chú ý ô nhiễm.",
  6: "Bước vào Hiện đại: điện, dịch vụ đô thị và hai hướng kỳ quan cuối.",
  4: "Bước vào Trung đại: mở Đại kho, nhà ngói, giếng, hồ chứa, nông trang, trường làng, xưởng thủ công và Văn Miếu. Nhà và công việc cũ được giữ nguyên.",
  2: "Bước vào Thời đồ đồng: mở ruộng lúa, kênh tưới, đê đất, nhà gỗ, lò đúc đồng và chợ.",
  3: "Bước vào Thời đồ sắt: mở nhà đá, lò rèn, cối nước và Đền Sông Mẹ.",
};

export const storageLevel = (b: Building, r: ResKey) => b.storageLevels?.[r] ?? b.lvl;

/** Optional metadata preserves old saves without inventing construction dates. */
export type Building = { builtAt?: number; investment?: Partial<Res>; investmentEstimated?: boolean; stranded?: boolean; relocation?: { from: number; startedAt: number; duration: number }; floodUntil?:number; off?:boolean; damageCause?: 'earthquake'; shipQueue?: number[]; storageLevels?: Partial<Record<ResKey, number>>; storageUpgrade?: ResKey; k: BKey; lvl: number; doneAt: number | null; flooded?: boolean; burned?: boolean; fertility?: number; tendUntil?: number };
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
export type Person = { assignment?: "manual" | "scout"; refuge?: Refuge; id: number; name: string; task: Task; pos?: number; haul?: Haul }; // pos: tile they last headed to
export type Herd = { id: number; at: number; kind: "deer" | "boar"; n: number; max: number };
export type DisasterNotice = { id:string; at:number; kind:"flood"|"earthquake"|"river"|"dock"; phase:"warning"|"impact"|"protected"; msg:string; tiles:number[] };
export type LogEntry = { caravanId?: string; at: number; msg: string; cls?: "warn" | "good" };
export type RaidEncounter = { start:number; engage:number; resolveAt:number; end:number; route:number[]; power:number; won?:boolean };
export type City = {
  modern?:ModernState;
  industry?: IndustryState;
  medieval?: MedievalState;
  upkeepStartsAt?: number;
  wheelFuelStartsAt?: number;
  gatherFoodStartsAt?: number;
  farmAutoStartsAt?: number;
  hungerStartsAt?: number;
  hunger?: HungerState;
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
  wildernessAt?: number;
  wildernessWarned?: number;
  disaster?: { kind:'flood'|'earthquake'; at:number; level:number; center:number; warned?:boolean };
  boostUntil: number;
  shift: { warn: number; at: number; xs: number[] | null; done: boolean } | null;
  templeAt: number | null;
  log: LogEntry[];
  disasterNotices?: DisasterNotice[];
  provisionedSoldiers?: number; // deployed soldiers whose food was prepaid for this expedition
  deployedArmy?: Troops; // world marches / multiplayer battle, maintained by server
  shieldUntil?: number;
  battleId?: string; // active defending battle
  army: Troops; // at home
  queue: { u: UKey; doneAt: number; startedAt?: number }[];
  transportShips?: number;
  deployedShips?: number;
  ferryBookings?: { id:string; ships:number; back:number; at?:number; arrive?:number; route?:number[] }[];
  homeOrders?: Record<string, { route: number[]; at: number; x: number; y: number }>;
  camps: Camp[];
  exps: Expedition[];
  nextExp: number;
  wins: number;
  auto?: { on: boolean; mix: Record<ResKey, number> }; // auto-assign shares (control centre)
  manualWorkforce?: boolean; // exact headcounts chosen by player; newborns wait for orders
  raid?: { at: number; warn: number; power: number; from: number } | null; // incoming barbarians
  raidEncounter?: RaidEncounter; // short arrival, clash and withdrawal after the warning expires
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
export const ENVOY_NAMES = ["", "Người đưa tin", "Sứ giả", "Sứ thần", "Sứ bộ", "Đại sứ", "Nhà ngoại giao"];
export const ENVOY_HOUSE = ["", "Lều đưa tin", "Nhà sứ giả", "Sứ quán", "Sứ quán mái ngói", "Tòa đại sứ", "Bộ ngoại giao"];
export const DEFENSE_NAMES: Partial<Record<BKey, string[]>> = {
  wall: ["", "Hàng rào gỗ", "Tường đất", "Tường thành đá", "Tường đá mái ngói", "Tường gạch thép", "Tường bê tông"],
  gate: ["", "Cổng gỗ", "Cổng đồng", "Cổng thành", "Cổng thành ngói", "Cổng sắt", "Cổng kiểm soát"],
  watchtower: ["", "Chòi canh", "Tháp canh gỗ", "Tháp canh đá", "Tháp nỏ", "Tháp súng", "Ụ phòng thủ"],
};
export const BUILDING_ERA_NAMES: Partial<Record<BKey, string[]>> = {
  hut: ["", "Lều", "Nhà gỗ nhỏ", "Nhà đá nhỏ"],
  house: ["", "Nhà gỗ", "Nhà gỗ", "Nhà xây mái ngói"],
  gather: ["", "Trại hái lượm", "Nhà thu hoạch", "Trạm lương thực", "Trạm thu hoạch mái ngói", "Trạm lương thực cơ giới", "Trạm lương thực đô thị"],
  wood: ["", "Trại đốn gỗ", "Xưởng gỗ", "Xưởng cưa", "Xưởng gỗ mái ngói", "Xưởng cưa máy", "Xưởng gỗ hiện đại"],
  quarry: ["", "Bãi đá", "Trạm khai thác đá", "Công trường đá", "Công trường đá mái ngói", "Mỏ đá cơ giới", "Mỏ đá đô thị"],
  storehouse: ["", "Kho tranh", "Kho gỗ", "Kho kiên cố"],
  builderhouse: ["", "Lều thợ xây", "Nhà thợ mộc", "Xưởng kiến trúc"],
  forge: ["", "Xưởng dụng cụ", "Lò rèn đồng", "Lò rèn sắt"],
  barracks: ["", "Trại chiến binh", "Doanh trại", "Doanh trại kiên cố", "Doanh trại mái ngói", "Doanh trại công nghiệp", "Căn cứ quân sự"],
  fire: ["", "Bếp lửa chung", "Bếp làng", "Bếp xây"],
  farm: ["", "Ruộng lúa", "Ruộng lúa", "Ruộng có thủy lợi"],
  canal: ["", "Kênh tưới", "Kênh đất", "Kênh xây"],
  levee: ["", "Đê", "Đê đất", "Đê kè đá"],
  smelter: ["", "Lò đúc đồng", "Lò đúc đồng", "Lò luyện kim"],
  dock: ["", "Bến thuyền", "Bến cảng gỗ", "Cảng đá mái ngói", "Bến ngói", "Cảng khung thép", "Cảng vận tải hiện đại"],
  market: ["", "Chợ", "Chợ làng", "Thương quán"],
  logistics: ["", "Trạm hậu cần", "Trạm xe lương", "Cục hậu cần mái ngói", "Trạm tiếp vận", "Cục vận tải", "Trung tâm hậu cần"],
  infirmary: ["", "Quân y viện", "Nhà thuốc quân y", "Y viện mái ngói", "Y quán quân sự", "Bệnh xá quân đội", "Trung tâm quân y"],
  hall: ["", "Đình làng", "Đình gỗ", "Đình đá"],
};
export const buildingName = (c: City, k: BKey) => (k === "envoy" ? (ENVOY_HOUSE[c.era] ?? "Sứ quán") : DEFENSE_NAMES[k]?.[c.era] ?? BUILDING_ERA_NAMES[k]?.[c.era] ?? def(k).n);
/** Built structures cease providing services while flooded or burned. */
export const isBuildingActive = (b: Building | undefined): b is Building => !!b && b.lvl >= 1 && !b.flooded && !b.burned && !b.off && !b.stranded && !b.relocation;
export const envoyCount = (c: City) => Object.values(c.b).reduce((a, b) => (b.k === "envoy" && isBuildingActive(b) ? Math.max(a, b.lvl) : a), 0);
export const envoysAway = (c: City) => (c.trips ?? []).length;
/** One-way travel time on the world map, faster with a higher-level envoy house. */
export const envoyMs = (c: City, cells: number) => (Math.max(1, cells) / (ENVOY_CELLS_PER_MIN * (1 + 0.5 * Math.max(0, envoyCount(c) - 1)))) * MIN;
export const canVisit = (c: City, id: string, at: number) => (c.visits?.[id] ?? 0) > at;

export type Mix = Record<ResKey, number>;
export const DEFAULT_MIX: Mix = { food: 40, wood: 30, stone: 20, copper: 10, gold: 0, diamond: 0, coal:0 };
export const RAID_WARNING_MS = 30 * MIN;
export const RAID_SHELTER_MS = MIN; // Work through the warning; shelter only just before arrival.

/** Level of the village hall (0 = not built yet). */
export const hallLevel = (c: City) => Object.values(c.b).reduce((a, b) => (b.k === "hall" && isBuildingActive(b) ? Math.max(a, b.lvl) : a), 0);
/** Highest level other buildings may reach: the hall's level (at least 1). */
export const levelCap = (c: City, k: BKey) => (k === "hall" ? Math.max(MAX_LVL,c.era) : Math.min(MAX_LVL, Math.max(1, hallLevel(c))));
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

/** Separate bounded inbox: economic log traffic cannot erase offline disaster reports. */
function notifyDisaster(c:City,at:number,kind:DisasterNotice["kind"],phase:DisasterNotice["phase"],msg:string,tiles:number[]=[]){
  log(c,at,msg,phase==="protected"?"good":"warn");
  const id=`${kind}:${phase}:${at}`;
  c.disasterNotices=[{id,at,kind,phase,msg,tiles:[...new Set(tiles)].slice(0,24)},...(c.disasterNotices??[]).filter(n=>n.id!==id)].slice(0,30);
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
  c.res.gold ??= 0;c.res.diamond ??= 0;c.res.coal??=0;
  if(c.auto){c.auto.mix.gold ??= 0;c.auto.mix.diamond ??= 0;c.auto.mix.coal??=0;}
}
export const speedBuildCost=(b:Building,now:number)=>Math.max(0,Math.ceil(((b.doneAt??now)-now)/30_000));
const gatheringRate=(r:ResKey)=>r==='wood'?CHOP_RATE:r==='stone'?STONE_RATE:r==='gold'?ORE_RATE*.5:r==='diamond'?ORE_RATE*.08:r==='coal'?60:ORE_RATE;
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
    res: { food: 100, wood: 120, stone: 30, copper: 0, gold: 0, diamond: 0, coal:0 }, pop: 0, popAcc: 0, era: 1,
    t0: now, last: now, upkeepStartsAt:now, wheelFuelStartsAt:now, gatherFoodStartsAt:now, farmAutoStartsAt:now, hungerStartsAt:now, hunger:{stressMs:0,lossMs:0,warned:0}, seasonIdx: 0, boostUntil: 0, shift: null, templeAt: null, log: [],
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
const built = (b: Building | undefined): b is Building => !!b && b.lvl >= 1 && !b.burned && !b.off;

// Cache only the enclosure mask: harvesting and ordinary actions do not change it.
const leveeEnclosures = new WeakMap<City,{key:string;mask:Uint8Array}>();
function enclosedByLevees(c:City,rivers:number[],levees:number[]){
  const key=rivers.join(",")+"|"+levees.join(","),cached=leveeEnclosures.get(c);
  if(cached?.key===key)return cached.mask;
  const n=W*H,barrier=new Uint8Array(n),outside=new Uint8Array(n),queue:number[]=[];
  for(const i of levees)barrier[i]=1;
  const visit=(i:number)=>{if(!barrier[i]&&!outside[i]){outside[i]=1;queue.push(i);}};
  // Water already inside an enclosure remains a flood source.
  for(const i of rivers)visit(i);
  for(let x=0;x<W;x++){visit(idx(x,0));visit(idx(x,H-1));}
  for(let y=0;y<H;y++){visit(idx(0,y));visit(idx(W-1,y));}
  for(let head=0;head<queue.length;head++){
    const i=queue[head],x=i%W,y=Math.floor(i/W);
    for(const [dx,dy]of N8)if(inb(x+dx,y+dy))visit(idx(x+dx,y+dy));
  }
  const mask=new Uint8Array(n);
  for(let i=0;i<n;i++)if(!outside[i]&&!barrier[i])mask[i]=1;
  leveeEnclosures.set(c,{key,mask});return mask;
}

export function derive(c: City): Derived {
  const t = c.t, N = W * H;
  // distance to river (Chebyshev, capped at 3)
  const rd = new Array<number>(N).fill(99);
  let q: number[] = [];
  for (let i = 0; i < N; i++) if (t[i] === R) { rd[i] = 0; q.push(i); }
  const rivers=q.slice(),levees:number[]=[];
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
    if (b.k === "levee" && isBuildingActive(b)) { levees.push(i);around(2, (j) => { prot[j] = true; }); }
  }
  if(levees.length>=4){const enclosed=enclosedByLevees(c,rivers,levees);for(let i=0;i<N;i++)if(enclosed[i])prot[i]=true;}
  return { rd, wet, fert, prot };
}

const count = (c: City, k: BKey) => Object.values(c.b).reduce((n, b) => n + (b.k === k ? 1 : 0), 0);
export const builders = (c: City) => c.era + 1 + Object.values(c.b).reduce((n,b) => n + (b.k === "builderhouse" && isBuildingActive(b) ? b.lvl : 0), 0);
export const busyBuilders = (c: City) => Object.values(c.b).reduce((n, b) => n + (b.doneAt ? 1 : 0), 0);
export const buildMs = (k: BKey, lvl: number) => k==="hall"&&lvl>=4 ? (lvl-3)*2*HOUR : def(k).sec * 1000 * 3 ** (lvl - 1);
/** Prices depend on the buyer's era; base definitions remain stable for combat
 * valuation and demolition refunds (advancing must never mint refund resources). */
export const eraCost = (cost: Partial<Res>, era: number, ironMultiplier: number): Partial<Res> => {
  const out: Partial<Res> = {};
  for (const r of RES) if (cost[r]) out[r] = Math.ceil(cost[r]! * (era >= 3 ? ironMultiplier : 1));
  return out;
};
export const buildingCost = (k: BKey, era: number) => def(k).era>=4 ? {...def(k).cost} : eraCost(def(k).cost, era, 3);
export const storageCapacity = (b:Building,r:ResKey) => b.k==="grandstore" ? 10000*2**(storageLevel(b,r)-1) : (def(b.k).storage??0)*(b.k==="storehouse"?storageLevel(b,r):b.lvl);
export const trainingCost = (u: UKey, era: number) => UNITS[u].era>=4?{...UNITS[u].cost}:eraCost(UNITS[u].cost, era, 2);
export const levelCost = (k: BKey, lvl: number, era = 1): Partial<Res> => {
  if(k==="hall"&&lvl===4)return {wood:3000,stone:5000,copper:1000,gold:200};
  if(k==="hall"&&lvl===6)return {wood:8000,stone:18000,copper:5000,gold:1500,coal:3000};
  if(k==="hall"&&lvl===5)return {wood:5000,stone:10000,copper:2500,gold:600};
  const m = 2**Math.max(0,lvl-1), out: Partial<Res> = {};
  for (const r of RES) if (def(k).cost[r]) out[r] = def(k).cost[r]! * m;
  return def(k).era>=4?out:eraCost(out, era, 3);
};
export const DEMOLITION_FULL_RATE_MS = 6 * HOUR;
/** Legacy saves have no payment ledger. Use their old, era-independent refund
 * basis conservatively; all payments from now on are recorded exactly. */
function demolitionInvestment(b: Building): Partial<Res> {
  return b.investment ?? levelCost(b.k, Math.max(1, b.lvl));
}
function recordBuildingInvestment(b: Building, cost: Partial<Res>) {
  if (!b.investment) { b.investment = {...demolitionInvestment(b)}; b.investmentEstimated = true; }
  for (const r of RES) if (cost[r]) b.investment[r] = (b.investment[r] ?? 0) + cost[r]!;
}
export function demolitionQuote(c: City, tile: number, now: number) {
  const b = c.b[tile];
  const age = b?.lvl === 0 ? 0 : b?.builtAt === undefined ? null : Math.max(0, now - b.builtAt);
  const percent = age !== null && age < DEMOLITION_FULL_RATE_MS ? 50 : 20;
  const gross: Partial<Res> = {}, refund: Partial<Res> = {}, overflow: Partial<Res> = {};
  let error: string | null = !b ? "Ô này trống." : null;
  if (b) {
    if ((b.k === 'dam' || b.k === 'green') && c.modern?.completedAt) error = "Kỳ quan cuối đã khánh thành; có thể sửa chữa nhưng không phá hoặc đổi nhánh.";
    else if (b.shipQueue?.length) error = "Cảng đang đóng thuyền; chờ hoàn tất trước khi phá.";
    // Mirror stats() storage rules without deriving the whole map for a preview.
    const capacity = Object.fromEntries(RES.map(r => [r, BASE_STORAGE])) as Res;
    for (const [i, other] of buildings(c)) if (i !== tile && other.lvl >= 1 && !other.burned && !other.flooded)
      for (const r of RES) capacity[r] += storageCapacity(other, r);
    const crowded = RES.filter(r => b.lvl >= 1 && !b.burned && !b.flooded && storageCapacity(b,r) > 0 && c.res[r] > capacity[r]);
    if (!error && crowded.length) error = `Chưa thể phá: kho còn lại thiếu chỗ cho ${crowded.map(r => `${RN[r].toLowerCase()} (${Math.ceil(c.res[r]-capacity[r])})`).join(", ")}. Dùng bớt tài nguyên hoặc bổ sung Kho trước.`;
    const paid = demolitionInvestment(b);
    for (const r of RES) {
      const amount = Math.floor((paid[r] ?? 0) * percent / 100);
      if (!amount) continue;
      gross[r] = amount;
      const accepted = Math.min(amount, Math.max(0, Math.floor(capacity[r] - c.res[r])));
      if (accepted) refund[r] = accepted;
      if (accepted < amount) overflow[r] = amount - accepted;
    }
  }
  return {age, percent, gross, refund, overflow, estimated: !!b && (!b.investment || !!b.investmentEstimated), error};
}
export const repairCost = (k: BKey, lvl = 1, burned = false, era = 1): Partial<Res> => {
  const out: Partial<Res> = {};
  for (const r of RES) if (def(k).cost[r]) out[r] = Math.ceil((levelCost(k, Math.max(1, lvl))[r] ?? 0) * (burned ? 0.5 : 0.25));
  return def(k).era>=4||k==="hall"&&lvl>=4?out:eraCost(out, era, 2);
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

/** Match the one-tile irrigation reach of canals; river fertility alone is not a canal. */
export function gatherFoodPerHour(c:City,D:Derived,tile:number){
  const x=tile%W,y=Math.floor(tile/W);
  return N8.some(([dx,dy])=>{
    if(!inb(x+dx,y+dy))return false;
    const j=idx(x+dx,y+dy),b=c.b[j];
    return b?.k==='canal'&&isBuildingActive(b)&&D.wet[j];
  })?GATHER_IRRIGATED_FOOD_PER_HOUR:GATHER_DRY_FOOD_PER_HOUR;
}

export type Drain = { kind: "tile" | "herd"; key: number; res: ResKey; perHour: number };
export type Stats = {
  rate: Res;
  upkeep: { food:number; wood:number; civilians:number; soldiers:number; foodSoldiers:number };
  woodUse: number;
  stoneUse: number;
  fireWoodUse: number;
  wheelWoodUse: number;
  gatherFoodUse: number;
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
    if (b.lvl<1 || b.burned || b.flooded) continue;
    const d = def(b.k);
    housing += (d.house ?? 0) * b.lvl;
    for (const r of RES) storage[r] += storageCapacity(b,r);
    if(b.off)continue;
    jobs += buildingJobs(b);
    cnt[b.k] = (cnt[b.k] ?? 0) + 1;
  }
  const workers = new Map<number, number>();
  for (const p of c.people) if (!p.refuge && p.task.t === "work") workers.set(p.task.at, (workers.get(p.task.at) ?? 0) + 1);
  const mult = (1 + 0.1 * Math.min(3, cnt.market ?? 0))*(1+medievalBonus(c));
  const tools = 1 + 0.25 * buildings(c).reduce((n, [, b]) => n + (b.k === "forge" && built(b) && !b.flooded ? b.lvl : 0), 0);
  const winter = seasonAt(c, at) === 3;
  const boost = at < c.boostUntil;
  const rate: Res = { food: 0, wood: 0, stone: 0, copper: 0, gold: 0, diamond: 0, coal:0 };
  let woodUse = 0,stoneUse=0,fireWoodUse=0,wheelWoodUse=0,gatherFoodUse=0;
  const legacy=c.upkeepStartsAt!==undefined&&at<c.upkeepStartsAt;
  for (const [i, b] of buildings(c)) {
    if (!built(b) || b.flooded) continue;
    const d = def(b.k);
    const jobs=buildingJobs(b),eff = jobs ? Math.min(1, (workers.get(i) ?? 0) / jobs) : 1;
    if(b.k==='fire'){fireWoodUse+=legacy?0:300;woodUse+=legacy?0:300;}
    else if(b.k==='wheel'){const use=eff>0&&at>=(c.wheelFuelStartsAt??-Infinity)?WATERMILL_WOOD_PER_HOUR:0;wheelWoodUse+=use;woodUse+=use;}
    else if(b.k==='gather'){if(eff>0&&at>=(c.gatherFoodStartsAt??-Infinity))gatherFoodUse+=gatherFoodPerHour(c,D,i);}
    else if(d.use){woodUse+=(legacy?20:d.use.wood??0)*LVL_MULT[b.lvl]*eff;stoneUse+=(legacy?0:d.use.stone??0)*LVL_MULT[b.lvl]*eff;}
    if(b.k==='thermal')rate.coal-=(c.modern?.generation[i]??0)/80*240;
    if (!d.prod || (isField(b.k) && (b.tendUntil || farmRemaining(b)<=0))) continue;
    const output=Object.values(d.prod)[0]??1;
    if(d.input&&RES.some(r=>d.input?.[r]&&c.res[r]<d.input[r]!/output))continue;
    for(const r of RES)if(d.input?.[r])rate[r]-=d.input[r]!*LVL_MULT[b.lvl]*eff*mult*(d.demand?powerFraction(c,i):1);
    for (const r of RES) {
      let v = d.prod[r];
      if (!v) continue;
      v *= LVL_MULT[b.lvl] * (b.k==='artisan'||def(b.k).era>=5?1:GATHER_SPEED);
      v *= droughtFactor(c,i,b.k,at)*(d.demand?powerFraction(c,i):1);
      const crop = isField(b.k) || b.k === "gather";
      if (crop && D.fert[i]) v *= isField(b.k) ? (completedWonder(c,'dam')?1.5:2) : 1.5;
      if (crop && D.fert[i] && boost) v *= 1.5;
      if (crop && winter) v *= 0.4;
      if (c.cropDamage?.tile===i && at<c.cropDamage.until) v *= .5;
      if (crop || b.k === "wood" || b.k === "quarry") v *= tools;
      if(r==='food')v*=foodEraScale(c,at)*pollutionFood(c);
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
      const v = HUNT_RATE * tools * mult * foodEraScale(c,at) * walkFactor(dropDistance(c, h.at, "food"), HUNT_RATE * tools * mult);
      rate.food += v;
      drains.push({ kind: "herd", key: h.id, res: "food", perHour: v });
    }
  }
  const copperRate = rate.copper;
  const costs=c.upkeepStartsAt!==undefined&&at<c.upkeepStartsAt
    ?{civilian:{food:4,wood:0},soldier:{food:2,wood:0}}
    :upkeepRates(c.era),civilians=c.people.length,totalSoldiers=soldiers(c);
  const foodSoldiers=Math.max(0,totalSoldiers-Math.min(troopCount(c.deployedArmy??{}),c.provisionedSoldiers??0)-c.exps.reduce((n,e)=>n+(e.suppliesFood!==undefined?troopCount(e.units):0),0));
  const upkeep={civilians,soldiers:totalSoldiers,foodSoldiers,food:civilians*costs.civilian.food+foodSoldiers*costs.soldier.food,wood:civilians*costs.civilian.wood+totalSoldiers*costs.soldier.wood};
  rate.food-=upkeep.food+gatherFoodUse;
  rate.wood-=upkeep.wood;
  return { rate, upkeep, woodUse, stoneUse, fireWoodUse, wheelWoodUse, gatherFoodUse, copperRate, jobs, housing, storage, fires: Math.min(2, cnt.fire ?? 0), drains };
}

/* ---------- people & tasks ---------- */

export const isScout = (p:Person) => p.assignment === "scout" || p.task.t === "explore";
/** Explicit moves and waiting scouts are not unassigned workers, including old saves. */
export const availableForWork = (p:Person) => !p.refuge && p.task.t === "idle" && p.task.at === undefined && !isScout(p);
/** A player clicking a resource explicitly replaces a non-scout standing/move
 * order. Automation and exact workforce plans must still preserve that order. */
export const availableForQuickAssign = (p:Person) => !p.refuge && p.task.t === "idle" && !isScout(p);
export function quickAssignBlockedReason(c:City) {
  if (!c.people.length) return "Làng chưa có dân để giao việc.";
  const scouts=c.people.filter(isScout).length, sheltered=c.people.filter(p=>!!p.refuge).length;
  if (sheltered) return `${sheltered} người đang tránh địch hoặc quay lại chỗ làm; chờ an toàn để giao việc.`;
  if (scouts) return `${scouts} người thuộc nhóm khám phá, đang giữ nhiệm vụ riêng. Chọn trực tiếp người đó rồi bấm nơi làm, hoặc Cho nghỉ để đưa về nhóm rảnh.`;
  return "Dân hiện đều đã có việc. Chọn người trong bảng Dân làng để đổi việc.";
}
export function taskResource(c:City,p:Person):ResKey|null {
  const tk=p.task;
  if(tk.t==="chop")return "wood";
  if(tk.t==="mine")return mineralResource(c.t[tk.at]);
  if(tk.t==="hunt")return "food";
  if(tk.t==="work")return RES.find(r=>(B[c.b[tk.at]?.k]?.prod?.[r]??0)>0)??null;
  return null;
}
export function workforceCounts(c:City) {
  const counts:Res={food:0,wood:0,stone:0,copper:0,gold:0,diamond:0,coal:0};
  let scouts=0;
  for(const p of c.people){if(isScout(p)){scouts++;continue;}const r=taskResource(c,p);if(r)counts[r]++;}
  return {counts,scouts};
}

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
function autoAssign(c: City, now: number, context?: HaulContext) {
  if (!c.auto?.on || !hasControl(c)) return false;
  const idle = c.people.filter((p) => availableForWork(p) && !p.assignment);
  if (!idle.length) return false;
  const total = c.people.length, mixSum = RES.reduce((a, r) => a + (c.auto!.mix[r] ?? 0), 0) || 1;
  const ctx = context ?? haulingContext(c, derive(c));
  let changed = false;
  for (const p of idle) {
    const have: Res = { food: 0, wood: 0, stone: 0, copper: 0, gold: 0, diamond: 0, coal:0 };
    for (const q of c.people) { const r = taskResource(c,q); if (r) have[r]++; }
    const order = [...RES].sort((a, b) => (have[a] - (total * c.auto!.mix[a]) / mixSum) - (have[b] - (total * c.auto!.mix[b]) / mixSum));
    for (const r of order) {
      if ((c.auto!.mix[r] ?? 0) <= 0) continue;
      const tk = autoTarget(c, r, p, now, ctx);
      if (!tk) continue;
      setTask(c, p, tk, now);
      changed = true;
      break;
    }
  }
  return changed;
}

/** Nearest sensible job producing `r`: an open building slot first, then gathering by hand. */
function autoTarget(c: City, r: ResKey, p: Person, now: number, ctx: HaulContext): TaskInput | null {
  if(r==='gold'&&c.era<2||r==='diamond'&&c.era<3||r==='coal'&&c.era<5)return null;
  const from = p.pos ?? c.camp;
  // Use the same source and path rules as actual harvesting. An empty logging
  // camp or an exhausted farm must not absorb workers who could gather elsewhere.
  const reachable = (tk: TaskInput) => {
    const job = haulingJob(c, { ...p, task: tk as Task }, now, ctx);
    return !!job && !!haulPath(c, from, job.tile, ctx);
  };
  const slots = buildings(c)
    .filter(([i, b]) => built(b) && !b.flooded && def(b.k).jobs && Object.keys(def(b.k).prod ?? {})[0] === r && workersAt(c, i) < buildingJobs(b))
    .sort((a, b) => cheb(a[0], from) - cheb(b[0], from));
  for (const [at] of slots) {
    const tk: TaskInput = { t: "work", at };
    if (reachable(tk)) return tk;
  }
  if (r === "food") {
    const herds = c.herds.filter(h => h.n >= 1 && c.seen[h.at] && cheb(h.at, c.camp) <= 20)
      .sort((a,b) => cheb(a.at,from)-cheb(b.at,from));
    for (const h of herds) { const tk: TaskInput = { t: "hunt", herd: h.id }; if (reachable(tk)) return tk; }
    return null;
  }
  const radius = r === "wood" || r === "stone" ? 20 : 40;
  const candidates: number[] = [];
  const x = c.camp % W, y = Math.floor(c.camp / W);
  for (let ty = Math.max(0,y-radius); ty <= Math.min(H-1,y+radius); ty++)
    for (let tx = Math.max(0,x-radius); tx <= Math.min(W-1,x+radius); tx++) {
      const i = idx(tx,ty);
      if (!c.seen[i] || c.b[i]) continue;
      if (r === "wood" ? c.t[i] === F : isRock(c.t[i]) && mineralResource(c.t[i]) === r) candidates.push(i);
    }
  candidates.sort((a,b) => cheb(a,from)-cheb(b,from));
  for (const at of candidates) { const tk: TaskInput = { t: r === "wood" ? "chop" : "mine", at }; if (reachable(tk)) return tk; }
  return null;
}

/** Plan on a copy so a missing source or locked group cannot partly reassign people. */
function setWorkforce(c:City,counts:Res,scouts:number,now:number):string|null {
  if(RES.reduce((n,r)=>n+counts[r],scouts)>c.people.length)return "Tổng số dân đã chọn vượt dân số hiện có.";
  const draft=structuredClone(c);
  const groups=[...RES,"scouts"] as const;
  const members=(key:typeof groups[number])=>draft.people.filter(p=>key==="scouts"?isScout(p):!isScout(p)&&taskResource(draft,p)===key);
  // Reduce first, making those people available to the other requested groups.
  for(const key of groups){
    const have=members(key),target=key==="scouts"?scouts:counts[key];
    const excess=Math.max(0,have.length-target);
    const movable=have.filter(p=>!p.refuge).sort((a,b)=>Number(a.task.t!=="idle")-Number(b.task.t!=="idle"));
    if(excess>movable.length)return "Nhóm đang tránh địch chưa thể đổi việc. Chờ họ quay lại rồi chỉnh số dân.";
    for(const p of movable.slice(0,excess)){p.assignment="manual";setTask(draft,p,{t:"idle"},now);}
  }
  const pool=draft.people.filter(availableForWork);
  const ctx=haulingContext(draft,derive(draft));
  for(const key of groups){
    const have=members(key),target=key==="scouts"?scouts:counts[key];
    for(let n=have.length;n<target;n++){
      const p=pool.shift();
      if(!p)return "Không đủ dân có thể đổi việc. Nhóm khám phá, người đang trú ẩn, làm dịch vụ hoặc đứng theo lệnh khác vẫn được giữ riêng.";
      if(key==="scouts"){p.assignment="scout";continue;}
      const tk=autoTarget(draft,key,p,now,ctx);
      if(!tk)return `Chưa đủ chỗ làm có đường tới để giao ${counts[key]} dân kiếm ${RN[key].toLowerCase()}. Kiểm tra nguồn đã khám phá, công trình còn chỗ, ruộng và thời đại.`;
      p.assignment="manual";setTask(draft,p,tk,now);
    }
  }
  for(const p of draft.people)if(!isScout(p)&&taskResource(draft,p))p.assignment="manual";
  c.people=draft.people;
  c.manualWorkforce=true;
  c.auto={on:false,mix:c.auto?.mix??{...DEFAULT_MIX}};
  log(c,now,`Đã giao số dân theo từng tài nguyên; giữ riêng ${scouts} người khám phá. Dân mới chờ lệnh, không tự đổi nhóm.`,"good");
  return null;
}

/** Fill open job slots only with villagers who have no explicit standing order. */
function autoStaff(c: City, now: number) {
  if(c.manualWorkforce)return;
  if (c.auto?.on && hasControl(c)) { autoAssign(c, now); return; }
  const idle = c.people.filter((p) => availableForWork(p) && !p.assignment);
  if (!idle.length) return;
  for (const [i, b] of buildings(c)) {
    const jobs = buildingJobs(b);
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
  if (tk.t === "mine") return isRock(c.t[tk.at]) ? (c.t[tk.at]===COAL&&c.era<5?"Than mở từ Công nghiệp.":c.t[tk.at]===GOLD&&c.era<2?"Vàng mở từ đời đồng.":c.t[tk.at]===DIAMOND&&c.era<3?"Kim cương mở từ đời sắt.":null) : "Chỉ đào được đồi đá hoặc mỏ khoáng sản.";
  const b = c.b[tk.at];
  if (!b || !def(b.k).jobs) return "Công trình này không cần người làm.";
  if (!b || b.lvl < 1) return "Công trình chưa xây xong.";
  if (b.burned) return "Công trình bị cháy, sửa trước đã.";
  if (b.flooded) return "Công trình đang ngập, sửa trước đã.";
  if (workersAt(c, tk.at) + adding > buildingJobs(b)) return `Chỉ nhận tối đa ${buildingJobs(b)} người.`;
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
      p.assignment = "scout";
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
type DropRoute = { route: number[]; drop: number; length: number };
type RouteTree = { prev: Int32Array; rank: Uint16Array; queue: Int32Array; head: number; size: number };
type HaulContext = { civic:ReturnType<typeof civicContext>; transport:ReturnType<typeof transportNetwork>; pass?: Uint8Array; trees: BoundedCache<string, RouteTree>; drops: BoundedCache<string, DropRoute | null>; paths: BoundedCache<string, number[] | null>; D: Derived; tools: number; mult: number; medievalBonus:number };
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
  return !b || b.burned || b.k === "canal" || isField(b.k) || b.k === "levee" || b.k === "gate";
}
function haulPath(c: City, from: number, to: number, ctx: HaulContext, exploredLand = false): number[] | null {
  const key = `${from}:${to}:${exploredLand}`;
  if (ctx.paths.has(key)) return ctx.paths.get(key)!;
  const rockyTarget = isRock(c.t[to]);
  const arrived = (tile: number) => rockyTarget ? tile !== to && cheb(tile, to) === 1 && haulPassable(c, tile, -1, true) : tile === to;
  if (arrived(from)) { const path = [from]; ctx.paths.set(key, path); return path; }
  const find = (water: boolean) => {
    const endpoint = !rockyTarget && !haulPassable(c,to,-1,water);
    if (!rockyTarget && (!haulPassable(c,to,to,water) || exploredLand && !c.seen[to])) return null;
    const goals: number[] = [];
    if (!rockyTarget && !endpoint) goals.push(to);
    else {
      const x = to % W, y = Math.floor(to / W);
      for (const [dx,dy] of N8) {
        if (!inb(x+dx,y+dy)) continue;
        const next = idx(x+dx,y+dy);
        if (rockyTarget) { if (!arrived(next)) continue; }
        else if (dx && dy && (!haulPassable(c,idx(x+dx,y),to,water) || !haulPassable(c,idx(x,y+dy),to,water))) continue;
        goals.push(next);
      }
    }
    const pass = ctx.pass ??= Uint8Array.from(c.t, (_,i) => (haulPassable(c,i,-1,true) ? 1 : 0) | (haulPassable(c,i,-1,false) ? 2 : 0));
    const mode = water ? 1 : 2;
    const treeKey = `${from}:${water}:${exploredLand}`;
    let tree = ctx.trees.get(treeKey);
    if (!tree) {
      const prev = new Int32Array(W * H).fill(-1), rank = new Uint16Array(W * H), queue = new Int32Array(W * H);
      queue[0] = from; prev[from] = from; rank[from] = 1;
      tree = {prev,rank,queue,head:0,size:1}; ctx.trees.set(treeKey,tree);
    }
    const {prev,rank,queue} = tree;
    const choose = () => goals.reduce((best,tile)=>rank[tile] && (best<0 || rank[tile]<rank[best]) ? tile : best,-1);
    let goal = choose();
    const targets = new Set(goals);
    // Extend a shared BFS prefix only as far as this target requires. Queue
    // order and predecessor ties remain identical to a fresh search.
    while (goal < 0 && tree.head < tree.size) {
      const tile = queue[tree.head++], x = tile % W, y = Math.floor(tile / W);
      for (const [dx,dy] of N8) {
        if (!inb(x+dx,y+dy)) continue;
        const next = idx(x+dx,y+dy);
        if (exploredLand && !c.seen[next]) continue;
        if (prev[next] !== -1 || !(pass[next] & mode)) continue;
        if (dx && dy && (!(pass[idx(x+dx,y)] & mode) || !(pass[idx(x,y+dy)] & mode))) continue;
        prev[next] = tile; rank[next] = tree.size+1; queue[tree.size++] = next;
        if (goal < 0 && targets.has(next)) goal = next;
      }
    }
    if (goal < 0) return null;
    // Opening an endpoint building cannot change its first predecessor: any
    // extra diagonal it enables starts from a cardinal neighbor which already
    // has a legal direct edge to that endpoint. Mining uses the earliest
    // adjacent goal in the same BFS order.
    const route = endpoint ? [to,goal] : [goal];
    for (let tile = goal; tile !== from;) { tile = prev[tile]; route.push(tile); }
    return route.reverse();
  };
  const land = find(false);
  // A ford cannot beat this geometric lower bound. Keep the existing land
  // preference (up to 1.6x the ford length) without searching the same map twice.
  const direct = Math.max(0, Math.hypot(from % W - to % W, Math.floor(from / W) - Math.floor(to / W)) - (rockyTarget ? Math.SQRT2 : 0) - 1e-9);
  const ford = exploredLand || land && routeLength(land) <= direct * 1.6 ? null : find(true);
  const path = land && (!ford || routeLength(land) <= routeLength(ford) * 1.6) ? land : ford;
  ctx.paths.set(key, path);
  return path;
}
/** References last only for this settlement context; structural changes rebuild it. */
function civicContext(c:City){
 const entries=Object.entries(c.b),pick=(keys:string[])=>entries.filter(([,b])=>keys.includes(b.k));
 return {fields:entries.filter(([,b])=>isField(b.k)).map(([tile,b])=>({tile:+tile,b,cost:farmTendCost(b,c.era)})),pending:entries.map(([,b])=>b).filter(b=>b.doneAt||b.tendUntil),
  bonus:pick(['school','academy','university','hospital','apartment']),
  power:entries.filter(([,b])=>def(b.k).supply||def(b.k).demand),
  transport:pick(['transport','ironbridge']),cleaners:pick(['treatment','park']),
  flooded:entries.map(([,b])=>b).filter(b=>b.floodUntil!==undefined),
  docks:pick(['dock']).map(([i,b])=>[+i,b] as [number,Building])};
}
function haulingContext(c: City, D: Derived): HaulContext {
  const active = Object.values(c.b).filter(b => built(b) && !b.flooded);
  const civic=civicContext(c);
  return { civic,transport:transportNetwork(c,undefined,civic.transport),medievalBonus:medievalBonus(c,undefined,civic.bonus), trees: new BoundedCache<string,RouteTree>(32,884736,tree=>tree.prev.length+tree.rank.length+tree.queue.length), drops: new BoundedCache<string,DropRoute|null>(512,65536,drop=>drop?.route.length??1), paths: new BoundedCache<string,number[]|null>(256,32768,path=>path?.length??1), D, tools: 1 + 0.25 * active.filter(b => b.k === "forge").reduce((n,b) => n+b.lvl, 0), mult: (1 + 0.1 * Math.min(3, active.filter(b => b.k === "market").length))*(1+medievalBonus(c)) };
}
/** Docks need a cardinal river neighbor; canals cannot float transports. */
export function dockOnRiver(c:City,tile:number){
  const x=tile%W,y=Math.floor(tile/W);
  return c.t[tile]!==R&&N4.some(([dx,dy])=>inb(x+dx,y+dy)&&c.t[idx(x+dx,y+dy)]===R);
}
function syncDockBanks(c:City,at:number){
  const dry:number[]=[];
  for(const [tile,b]of buildings(c)){
    if(b.k!=="dock"||b.relocation)continue;
    if(!dockOnRiver(c,tile)){if(!b.stranded){b.stranded=true;dry.push(tile);}}
    else delete b.stranded;
  }
  if(dry.length)notifyDisaster(c,at,"dock","impact",`${dry.length} bến cảng mắc cạn, ngừng đóng thuyền và đón chuyến qua sông. Chọn cảng → Chuyển bến để đưa ra bờ sông mới; giữ nguyên cấp và thuyền đã đóng.`,dry);
}
export function dockRelocationPlan(c:City,from:number,to:number,rules:EngineRules=RELEASE_RULES){
  const b=c.b[from],distance=cheb(from,to),lvl=Math.max(1,b?.lvl??1);
  const cost:Partial<Res>={wood:(40+20*distance)*lvl,food:(20+10*distance)*lvl};
  const duration=(30+10*distance)*1000;
  const error=b?.k!=="dock"||b.lvl<1?"Chọn bến cảng đã xây xong.":b.doneAt?"Cảng đang xây, nâng cấp hoặc di chuyển.":from===to?"Chọn một bờ sông khác.":
    canPlace(c,derive(c),"dock",to%W,Math.floor(to/W),rules,true,from)??missing(c,cost);
  return {distance,cost,duration,error};
}

export const SHIP_CAPACITY=10;
export const shipCost=(era:number):Partial<Res>=>eraCost({wood:400,copper:100,gold:40,food:80},era,3);
export const shipBuildMs=(b:Building)=>Math.ceil(90_000/Math.max(1,b.lvl));
export const shipPlaces=(u:UKey)=>u==="wagon"?3:UNITS[u].space;
export const shipsNeeded=(units:Troops)=>UKEYS.reduce((n,u)=>n+Math.ceil((units[u]??0)*shipPlaces(u)/SHIP_CAPACITY),0);
export function shipCapacity(c:City){return buildings(c).reduce((n,[,b])=>n+(b.k==="dock"&&isBuildingActive(b)?3*b.lvl:0),0);}
export function shipsFree(c:City,at=c.last){
  const bookings=(c.ferryBookings??[]).filter(b=>b.back>at).reduce((n,b)=>n+b.ships,0);
  const expeditions=c.exps.filter(e=>e.back>at||!e.resolved).reduce((n,e)=>n+(e.ships??0),0);
  return shipCapacity(c)?Math.max(0,(c.transportShips??0)-(c.deployedShips??0)-bookings-expeditions):0;
}
/** Troops use land first. A river leg requires enough unreserved transports and
 * water connected to a working dock; terrain and buildings still block travel. */
function militaryPath(c:City,from:number,to:number,ships=1){
  const context=haulingContext(c,derive(c)),land=haulPath(c,from,to,context,true);
  if(land)return {route:land,ships:0};
  if(shipsFree(c)<ships)return null;
  for(const [dock,b]of buildings(c)){
    if(b.k!=="dock"||!isBuildingActive(b))continue;
    const water=new Set<number>(),queue:number[]=[];
    const add=(tile:number)=>{if(c.t[tile]===R&&c.seen[tile]&&!water.has(tile)){water.add(tile);queue.push(tile);}};
    for(const [dx,dy]of N4){const x=dock%W+dx,y=Math.floor(dock/W)+dy;if(inb(x,y))add(idx(x,y));}
    for(let head=0;head<queue.length;head++){const tile=queue[head];for(const [dx,dy]of N4){const x=tile%W+dx,y=Math.floor(tile/W)+dy;if(inb(x,y))add(idx(x,y));}}
    const pass=(tile:number)=>c.seen[tile]&&(c.t[tile]===R?water.has(tile):haulPassable(c,tile,-1,false));
    const prev=new Int32Array(W*H).fill(-1),q=[from];prev[from]=from;
    for(let head=0;head<q.length;head++){
      const tile=q[head];if(tile===to){const route=[to];for(let i=to;i!==from;){i=prev[i];route.push(i);}return {route:route.reverse(),ships};}
      for(const [dx,dy]of N8){const x=tile%W+dx,y=Math.floor(tile/W)+dy;if(!inb(x,y))continue;const next=idx(x,y);
        if(prev[next]!==-1||!pass(next)||dx&&dy&&(!pass(idx(x,Math.floor(tile/W)))||!pass(idx(tile%W,y))))continue;
        prev[next]=tile;q.push(next);
      }
    }
  }
  return null;
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
      let distance = Math.max(0, now - order.at) / 1000 * 1.9 * (UNITS[u].speed??1);
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
  if(c.t[from]===R)return false; // finish the crossing before changing orders
  const plan=militaryPath(c,from,to,Math.ceil(shipPlaces(actor.u)/SHIP_CAPACITY)),route=plan?.route;
  if(!route)return false;
  if(plan!.ships){const duration=Math.max(1000,Math.ceil(routeLength(route)/(1.9*(UNITS[actor.u].speed??1))*1000));(c.ferryBookings??=[]).push({id,ships:plan!.ships,at:now,arrive:now+duration,back:now+duration*2,route});}
  (c.homeOrders ??= {})[id] = { route, at: now, x: actor.x, y: actor.y };
  return true;
}
/** Empty transports return by the same river route after disembarkation. */
export function returningFerries(c:City,now:number){
  return (c.ferryBookings??[]).flatMap(b=>{
    if(!b.route?.length||b.arrive===undefined||now<b.arrive||now>=b.back)return [];
    const f=Math.max(0,1-(now-b.arrive)/Math.max(1,b.back-b.arrive)),length=routeLength(b.route);
    const [x,y]=explorerPos({t:"explore",from:b.route[0],to:b.route[b.route.length-1],start:0,route:b.route},f*length/EXPLORE_TILES_PER_MIN*MIN);
    return [{x,y,face:((b.route[0]%W-b.route[b.route.length-1]%W)-(Math.floor(b.route[0]/W)-Math.floor(b.route[b.route.length-1]/W))>=0?1:-1) as 1|-1}];
  });
}
/** Local marches leave the barracks entrance and follow the same terrain rules as villagers. */
export function expeditionPlan(c:City,to:number,units:Troops={club:1}){
  const home=buildings(c).find(([,b])=>b.k==="barracks"&&isBuildingActive(b))?.[0]??c.camp;
  const start=armyStagingTiles(c,1,home)[0];if(start===undefined)return null;
  const plan=militaryPath(c,start,to,Math.max(1,shipsNeeded(units))),path=plan?.route;
  if(!path)return null;
  const route=path;
  return {route,ships:plan!.ships,duration:Math.max(1000,routeLength(route)/EXPLORE_TILES_PER_MIN*MIN)};
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
export function civiliansInDanger(c:City,at:number){
  return !!c.battleId || !!(c.raidEncounter && c.raidEncounter.start<=at && at<c.raidEncounter.end) || !!(c.raid && Math.max(c.raid.warn,c.raid.at-RAID_SHELTER_MS)<=at);
}
export function updateRefuges(c:City,at:number){
  const danger=civiliansInDanger(c,at);
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
  if(returning)log(c,at,c.raid && at<c.raid.at-RAID_SHELTER_MS ? "Địch còn ở xa. Dân quay lại công việc, sẽ tự trú ẩn trong 60 giây cuối trước khi địch tới." : "Đã an toàn. Dân rời chỗ trú, quay lại vị trí cũ rồi tiếp tục công việc.","good");
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
    return herd && herd.n > 0 ? { tile: herd.at, resource: "food", rate: HUNT_RATE * ctx.tools * ctx.mult * foodEraScale(c,at), source: { kind: "herd", key: herd.id } } : null;
  }
  if (tk.t !== "work") return null;
  const b = c.b[tk.at];
  if (!built(b) || b.flooded || (isField(b.k) && (b.tendUntil || farmRemaining(b)<=0))) return null;
  const d = def(b.k), resource = RES.find(r => (d.prod?.[r] ?? 0) > 0);
  if (!resource || !d.jobs) return null;
  if(d.demand&&!powerFraction(c,tk.at))return null;
  if(b.k==='artisan'&&(c.res.wood<20||c.res.stone<10))return null;
  if(d.input&&Object.entries(d.input).some(([r,n])=>c.res[r as ResKey]<(n??0)/d.prod![resource]!))return null;
  let rate = d.prod![resource]! * LVL_MULT[b.lvl] / buildingJobs(b) * ctx.mult * (b.k==='artisan'||def(b.k).era>=5?1:GATHER_SPEED);
  rate *= droughtFactor(c,tk.at,b.k,at)*(d.demand?powerFraction(c,tk.at):1);
  const crop = isField(b.k) || b.k === "gather";
  if (crop && ctx.D.fert[tk.at]) rate *= isField(b.k) ? (completedWonder(c,'dam')?1.5:2) : 1.5;
  if (crop && ctx.D.fert[tk.at] && at < c.boostUntil) rate *= 1.5;
  if (crop && seasonAt(c, at) === 3) rate *= 0.4;
  if (c.cropDamage?.tile===tk.at && at<c.cropDamage.until) rate *= .5;
  if (crop || b.k === "wood" || b.k === "quarry") rate *= ctx.tools;
  if(resource==='food')rate*=foodEraScale(c,at)*pollutionFood(c);
  let source: HaulJob["source"] = { kind: "building", key: tk.at };
  let tile = tk.at;
  if (b.k === "wood" || b.k === "quarry" || b.k === "smelter" || b.k === "coalmine") {
    const terrain = b.k === "wood" ? F : b.k === "quarry" ? HL : b.k === "coalmine"?COAL:O;
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
  // Workers sharing a source/resource choose the same drop until topology or
  // building state changes. Cache the decision separately so many rejected
  // candidate paths cannot evict the winning route and force another BFS sweep.
  const key = `${h.tile}:${h.resource}`;
  if (ctx.drops.has(key)) return useDrop(ctx.drops.get(key)!);
  const candidates = [...buildings(c).filter(([i]) => i !== c.camp && activeDrop(c, i, h.resource!)).map(([i]) => i), c.camp]
    .map((tile,order)=>({tile,order,lowerBound:Math.max(0,Math.hypot(h.tile % W-tile % W,Math.floor(h.tile / W)-Math.floor(tile / W))-(isRock(c.t[tile])?Math.SQRT2:0))}))
    .sort((a,b)=>a.tile===c.camp?1:b.tile===c.camp?-1:a.lowerBound-b.lowerBound||a.order-b.order);
  let best: number[] | null = null, drop = -1, length = Infinity, bestOrder = Infinity;
  for (const {tile,order,lowerBound} of candidates) {
    // Use the starter stockpile only when no dedicated drop site is reachable.
    if (tile === c.camp && best) continue;
    // Even a straight route cannot improve the current drop. Candidate order
    // and original tie-breaking stay unchanged, including starter-camp fallback.
    if (lowerBound > length + 1e-9) continue;
    const path = haulPath(c, h.tile, tile, ctx);
    const d = path ? routeLength(path) : Infinity;
    if (path && (d < length || d === length && order < bestOrder)) { length = d; best = path; drop = tile; bestOrder = order; }
  }
  const choice = best ? { route: best, drop, length } : null;
  ctx.drops.set(key, choice);
  return useDrop(choice);
  function useDrop(choice: DropRoute | null) {
    if (!choice) { h.phase = "unload"; h.nextAt = at + HAUL_TILE_MS; delete h.drop; return false; }
    h.drop = choice.drop; h.route = choice.route; h.routeStart = at; h.at = at;
    h.phase = choice.route.length === 1 ? "unload" : "return";
    h.nextAt = at + (choice.route.length === 1 ? HAUL_UNLOAD_MS : Math.max(HAUL_TILE_MS, Math.ceil(choice.length/transportSpeed(c,p.task.t==='work'?p.task.at:h.tile,ctx.transport)) * HAUL_TILE_MS));
    return true;
  }
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
  const travel = Math.ceil(routeLength(path)/transportSpeed(c,p.task.t==='work'?p.task.at:job.tile,ctx.transport)) * HAUL_TILE_MS, capacity=job.resource==='diamond'?1:job.resource==='gold'?5:job.resource==='food'?HAUL_CAPACITY*foodEraScale(c,at):HAUL_CAPACITY;
  p.haul = { phase: travel ? "travel" : "work", at, nextAt: at + (travel || Math.ceil(capacity / job.rate * HOUR / HAUL_TILE_MS) * HAUL_TILE_MS), tile: from,
    route: path, routeStart: at, resource: job.resource, carried: 0, capacity, source: job.source, taskKey: taskKey(p), workRate: job.rate };
}
function takeCargo(c: City, h: Haul, at: number): number {
  if (!h.source) return 0;
  if (h.source.kind === "building") {
    const b=c.b[h.source.key];if(!isBuildingActive(b))return 0;
    const d=def(b.k);if(d.input&&d.prod){
      const output=d.prod[h.resource!]??1;let amount=h.capacity;
      for(const r of RES)if(d.input[r])amount=Math.min(amount,c.res[r]*output/d.input[r]!);
      for(const r of RES)if(d.input[r]){const spent=amount*d.input[r]!/output;c.res[r]=Math.max(0,c.res[r]-spent);if(c.industry){const ledger=c.industry.inputsSpent??={};ledger[r]=(ledger[r]??0)+spent;}}
      if(c.industry&&d.era>=5&&amount>0)c.industry.processed=true;
      return amount;
    }
    if(b.k==='artisan'){
      const amount=Math.min(h.capacity,c.res.wood/20,c.res.stone/10);
      c.res.wood=Math.max(0,c.res.wood-20*amount);c.res.stone=Math.max(0,c.res.stone-10*amount);
      return amount;
    }
    if(!isField(b.k))return h.capacity;
    if(b.tendUntil)return 0;
    const amount=Math.min(h.capacity,farmRemaining(b));b.fertility=farmRemaining(b)-amount;
    if(amount>0 && b.fertility===0 && c.era<4)log(c,at,"Ruộng đã bạc màu, nông dân tạm nghỉ. Chọn ruộng để cải tạo đất và gieo lại.","warn");
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
function stepHauling(c: City, at: number, ctx: HaulContext, storage: Res, smelt: number, milling: number) {
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
    if (h.phase === "work" && p.task.t === "work") {
      const kind=c.b[p.task.at]?.k,eff=kind==='smelter'?smelt:kind==='wheel'?milling:1;
      if(eff<1)h.nextAt+=HAUL_TILE_MS*(1-eff);
    }
    if (h.nextAt > at) continue;
    if (h.phase === "travel") {
      h.tile = h.route[h.route.length - 1]; p.pos = h.tile;
      const job = haulingJob(c, p, at, ctx);
      if (!job || (job.tile !== h.tile && !(isRock(c.t[job.tile]) && cheb(job.tile, h.tile) === 1)) || taskKey(p) !== h.taskKey) { delete p.haul; beginHaul(c, p, at, ctx); continue; }
      h.phase = "work"; h.at = at; h.source = job.source; h.resource = job.resource; h.workRate = job.rate;
      h.nextAt = at + Math.ceil(h.capacity / job.rate * HOUR / HAUL_TILE_MS) * HAUL_TILE_MS;
    } else if (h.phase === "work") {
      if (taskKey(p) !== h.taskKey || !haulingJob(c, p, at, ctx)) { delete p.haul; beginHaul(c, p, at, ctx); continue; }
      const sourceTile = h.source?.kind === "tile" ? h.source.key : undefined;
      const beforeTerrain = sourceTile === undefined ? undefined : c.t[sourceTile];
      h.carried = takeCargo(c, h, at);
      if (sourceTile !== undefined && beforeTerrain !== undefined && isRock(beforeTerrain) && beforeTerrain !== c.t[sourceTile]) { ctx.pass = undefined; ctx.trees.clear(); ctx.drops.clear(); ctx.paths.clear(); }
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
      if(c.industry){const ledger=c.industry.delivered??={};ledger[h.resource!]=(ledger[h.resource!]??0)+amount;if(h.resource==='coal')c.industry.coalDelivered=(c.industry.coalDelivered??0)+amount;}
      if (h.carried > 1e-9) { h.nextAt = at + HAUL_TILE_MS; continue; }
      p.pos = h.tile; delete p.haul;
      if (p.task.t === "explore") { p.task.from = p.pos; p.task.start = at; p.task.seenTo=0; p.task.route=haulPath(c,p.pos,p.task.to,ctx)??[p.pos]; }
      beginHaul(c, p, at, ctx);
    }
  }
}

/* ---------- wilderness renewal and expansion hazards ---------- */
export const WILDERNESS_MS=30*MIN;
export const FRONTIER_WARNING_MS=5*MIN;
/** Permanent land is the starter clearing plus two tiles around every structure.
 * Active actors pin their route/source until the next cycle, never their cargo. */
export function wildernessKeep(c:City,at:number){
  const keep=new Uint8Array(W*H);
  const around=(tile:number,rad=1)=>{if(tile<0||tile>=W*H)return;const x=tile%W,y=Math.floor(tile/W);for(let dy=-rad;dy<=rad;dy++)for(let dx=-rad;dx<=rad;dx++)if(inb(x+dx,y+dy))keep[idx(x+dx,y+dy)]=1;};
  const route=(tiles:number[]|undefined)=>{for(const i of tiles??[])around(i);};
  for(const tile of Object.keys(c.industry?.seedlings??{}))around(+tile);
  for(let i=0;i<c.t.length;i++)if(c.t[i]===COAL)around(i,0);
  around(c.camp,START_SIGHT);
  for(const [i]of buildings(c))around(i,2);
  for(const p of c.people){
    around(p.pos??c.camp);const tk=p.task;
    if(tk.t==='explore'){
      route(tk.route);around(tk.from);around(tk.to);
      if(!tk.route?.length){const steps=Math.max(1,cheb(tk.from,tk.to));for(let n=0;n<=steps;n++)around(idx(Math.round(tk.from%W+(tk.to%W-tk.from%W)*n/steps),Math.round(Math.floor(tk.from/W)+(Math.floor(tk.to/W)-Math.floor(tk.from/W))*n/steps)));}
    }
    else if(tk.t==='idle'&&tk.at!==undefined)around(tk.at);
    else if(tk.t==='work'||tk.t==='mine'||tk.t==='chop')around(tk.at);
    else if(tk.t==='hunt'){const herd=herdById(c,tk.herd);if(herd)around(herd.at);}
    if(p.haul){around(p.haul.tile);route(p.haul.route);if(p.haul.source?.kind==='tile')around(p.haul.source.key);if(p.haul.drop!==undefined)around(p.haul.drop);}
    if(p.refuge)route(p.refuge.route);
  }
  for(const s of homeSoldiers(c,at)){around(idx(Math.floor(s.x),Math.floor(s.y)));if(s.moving)route(c.homeOrders?.[s.id]?.route);}
  if(c.raidEncounter && c.raidEncounter.end>at)route(c.raidEncounter.route);
  for(const e of c.exps)route(e.route);
  for(const e of c.trips??[])if(e.back>at)route(e.villageRoute);
  for(const e of c.merchantJourneys??[])if(e.back>at)route(e.villageRoute);
  for(const e of c.ferryBookings??[])if(e.back>at)route(e.route);
  for(const p of c.guardPosts??[])around(idx(p.x,p.y));
  if(c.wildlife&&c.wildlife.end>at)route(c.wildlife.route);
  return keep;
}
export function expansionRisk(c:City){
  const area=c.seen.reduce((n,s,i)=>n+(s&&c.t[i]!==R?1:0),0);
  const level=area>=3200?3:area>=1600?2:area>=700?1:0;
  return {area,level,interval:[6*HOUR,3*HOUR,90*MIN,HOUR][level]};
}
function scheduleDisaster(c:City,at:number){
  const risk=expansionRisk(c);
  if(c.disaster&&(c.disaster.warned||c.disaster.at<=at+risk.interval))return;
  const r=rng(c.seed^Math.imul(Math.floor(at/MIN)+71,2246822519));
  const targets=buildings(c).filter(([,b])=>isBuildingActive(b)).sort(([a],[b])=>cheb(b,c.camp)-cheb(a,c.camp)||a-b);
  c.disaster={kind:r()<.5?'flood':'earthquake',at:at+risk.interval,level:risk.level,center:targets[0]?.[0]??c.camp};
}
/** Seeded land patches; rivers retain their channel until a warned river shift. */
export function renewWilderness(c:City,at:number){
  const keep=wildernessKeep(c,at),terrainKeep=keep.slice();
  const pin=(tile:number)=>{for(const [dx,dy]of [[0,0],...N8]){const x=tile%W+dx,y=Math.floor(tile/W)+dy;if(inb(x,y))terrainKeep[idx(x,y)]=1;}};
  for(const k of c.camps)pin(k.at);for(const h of c.herds)pin(h.at);
  const random=rng(c.seed^Math.imul(Math.floor(at/WILDERNESS_MS)+1,3266489917));
  const forest=valueNoise(random,12),hill=valueNoise(random,15);
  let hidden=0,changed=0;
  for(let i=0;i<W*H;i++){
    if(keep[i])continue;
    if(c.seen[i])hidden++;c.seen[i]=0;
    if(terrainKeep[i]||c.t[i]===R)continue;
    const x=i%W,y=Math.floor(i/W),h=hill(x,y),f=forest(x,y),roll=random();
    const next=h>.64?(roll<.035?DIAMOND:roll<.13?GOLD:roll<.34?O:HL):f>.55?F:G;
    if(next!==c.t[i]||c.dep[i])changed++;c.t[i]=next;delete c.dep[i];
  }
  c.oldbed=c.oldbed.filter(i=>terrainKeep[i]||c.t[i]===R);
  log(c,at,`Sương phủ đất hoang: che lại ${hidden} ô, tái tạo ${changed} ô rừng/mỏ/đất. Công trình, vùng đệm 2 ô, điểm tập kết và tuyến đang dùng được giữ nguyên. Khám phá lại để tìm nguồn mới.`);
  return {hidden,changed};
}
function stepFrontier(c:City,at:number){
  let changed=false;
  if(c.battleId)return false;
  if(at>=c.wildernessAt!-FRONTIER_WARNING_MS&&c.wildernessWarned!==c.wildernessAt){
    c.wildernessWarned=c.wildernessAt;
    log(c,at,'Còn 5 phút: đất hoang chưa có công trình sẽ phủ sương và tái tạo. Công trình cùng vùng đệm và tuyến đang có người đi được giữ nguyên.','warn');
  }
  if(at>=c.wildernessAt!){
    scheduleDisaster(c,at);renewWilderness(c,at);c.wildernessAt=at+WILDERNESS_MS;changed=true;
  }
  const d=c.disaster!;
  if(!d.warned&&at>=d.at-FRONTIER_WARNING_MS){
    d.warned=true;notifyDisaster(c,at,d.kind,'warning',d.kind==='flood'?'Cảnh báo: lũ bất thường tới sau 5 phút. Kiểm tra đê và công trình sát sông.':`Cảnh báo: động đất sau 5 phút quanh ô (${d.center%W+1},${Math.floor(d.center/W)+1}). Chuẩn bị tài nguyên sửa công trình; đê không ngăn động đất.`,[d.center]);
  }
  if(at>=d.at){
    const random=rng(c.seed^Math.imul(Math.floor(d.at/MIN)+19,2654435761));
    if(d.kind==='flood')flood(c,derive(c),at,random,true);
    else{
      const targets=buildings(c).filter(([i,b])=>isBuildingActive(b)&&!b.doneAt&&cheb(i,d.center)<=3).sort(([a],[b])=>cheb(a,d.center)-cheb(b,d.center)||a-b).slice(0,d.level+1);
      for(const [,b]of targets){b.burned=true;b.damageCause='earthquake';}
      notifyDisaster(c,at,'earthquake',targets.length?'impact':'protected',`Động đất ${targets.length?`làm hư ${targets.length} công trình (${targets.map(([,b])=>def(b.k).n).join(', ')})`:'không làm hư công trình nào'} quanh ô (${d.center%W+1},${Math.floor(d.center/W)+1}). Công trình vẫn giữ vị trí và cấp; bấm Sửa để hoạt động lại.`,targets.map(([tile])=>tile));
    }
    delete c.disaster;scheduleDisaster(c,at);changed=true;
  }
  return changed;
}

/* ---------- seasons, floods, river shift ---------- */

function newCourse(c: City, r: () => number) {
  const protectedLand=derive(c).prot,oldRiver=riverSet(c.xs);
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
    if([...oldRiver].some(i=>protectedLand[i]&&!set.has(i)))continue;
    if ([...set].some((i) => isRock(c.t[i]) && c.t[i]!==HL || i === c.camp || !oldRiver.has(i)&&protectedLand[i])) continue;
    if (xs.every((x, y) => x === c.xs[y])) continue;
    return xs;
  }
  return c.xs.slice();
}

/** Recheck after dike completion/repair and at the event, including saved forecasts. */
function replanProtectedCourse(c:City,at:number){
  const shift=c.shift;if(!shift||shift.done||!shift.xs)return false;
  const oldRiver=riverSet(c.xs),protection=derive(c).prot;
  const next=riverSet(shift.xs);
  if(![...next].some(i=>!oldRiver.has(i)&&protection[i])&&![...oldRiver].some(i=>protection[i]&&!next.has(i)))return false;
  shift.xs=newCourse(c,rng(c.seed^Math.imul(Math.floor(at/1000)+29,2654435761)));
  return true;
}

function flood(c: City, D: Derived, at: number, r: () => number, extra=false) {
  if (!extra && r() > 0.6) { log(c, at, "Mùa thu êm, sông không tràn bờ."); return; }
  const hit: string[] = [],tiles:number[]=[];
  for (const [i, b] of buildings(c)) {
    if (!floodProtection(c,i) && !b.flooded && D.rd[i] === 1 && !isFloodproof(b.k) && !D.prot[i] && r() < 0.45) {
      b.flooded = true;
      if(c.era>=6)b.floodUntil=at+(retentionProtected(c,i)?.5:1)*6*HOUR*(!extra&&c.modern?.floodForecast?.at===at&&c.modern.floodForecast.major?1.5:1);
      hit.push(def(b.k).n);tiles.push(i);
    }
  }
  for (const p of c.people) if (p.task.t === "work" && c.b[p.task.at]?.flooded) p.task = { t: "idle" };
  c.boostUntil = at + 4 * SEASON_MS;
  const tail = "Phù sa mới: hái lượm và ruộng trên đất phù sa +50% trong một năm.";
  notifyDisaster(c, at, "flood",hit.length?"impact":"protected", hit.length
    ? `${extra?'Lũ bất thường':'Lũ mùa thu'} làm ngập ${hit.length} công trình (${[...new Set(hit)].join(", ")}). Bấm vào để sửa. ${tail}`
    : `Lũ tràn bờ nhưng không gây hại. Đê và vị trí công trình giúp làng an toàn. ${tail}`, tiles);
}

function applyShift(c: City, at: number) {
  replanProtectedCourse(c,at);
  const s = c.shift!;
  if(s.xs!.every((x,y)=>x===c.xs[y])){
    s.done=true;
    notifyDisaster(c,at,"river","protected","Đê và địa hình giữ được dòng sông cũ: không có tuyến đổi dòng an toàn qua vùng chưa được bảo vệ. Không mất công trình do đổi dòng; vẫn cần đề phòng lũ tràn bờ.");return;
  }
  const oldS = riverSet(c.xs), newS = riverSet(s.xs!);
  let lost = 0,salvaged=0;const lostNames:string[]=[],affected:number[]=[];
  const bed = new Set(c.oldbed);
  for (const i of oldS) if (!newS.has(i)) { c.t[i] = G; bed.add(i); }
  for (const i of newS) {
    if(c.b[i]?.k==="dock"){c.b[i].flooded=true;c.b[i].stranded=true;salvaged++;affected.push(i);}
    else if (c.b[i]) { lostNames.push(def(c.b[i].k).n);affected.push(i);delete c.b[i]; lost++; }
    c.t[i] = R; bed.delete(i); delete c.dep[i];
  }
  c.oldbed = [...bed];
  for (const p of c.people) {
    const tk = p.task;
    if ((tk.t === "work" && !c.b[tk.at]) || ((tk.t === "chop" || tk.t === "mine") && c.t[tk.at] === R)) p.task = { t: "idle" };
  }
  c.xs = s.xs!;
  syncDockBanks(c,at);
  s.done = true;
  c.boostUntil = at + 4 * SEASON_MS;
  const D = derive(c);
  const dry = buildings(c).filter(([i, b]) => b.k === "canal" && b.lvl >= 1 && !D.wet[i]).length;
  notifyDisaster(c, at,"river",lost||salvaged||dry?"impact":"protected", `Đại hồng thủy: sông đổi dòng${lost ? `, mất ${lost} công trình (${[...new Set(lostNames)].join(", ")})` : ", không mất công trình"}.${salvaged?` ${salvaged} cảng bị ngập/mắc cạn: Chuyển bến rồi Sửa, giữ cấp và thuyền.`:""} Lòng sông cũ thành bãi bồi màu mỡ.${dry ? ` ${dry} đoạn kênh mất nguồn nước; nối lại với sông.` : ""} Đất được đê che giữ nguyên.`,affected);
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
  if (!near || r() > 0.6 || c.raid || c.raidEncounter) return;
  c.raid = { warn: at, at: at + RAID_WARNING_MS, power: Math.round(campStrength(near) * 0.5 + c.era * 10), from: near.at };
  c.alarm = false;
  log(c, at, `Trinh sát báo: man rợ (⚔ ${c.raid.power}) đang kéo đến làng, tới sau ${Math.round(RAID_WARNING_MS / MIN)} phút.${hasControl(c) ? " Có thể đánh kẻng ở Đình làng." : ""}`, "warn");
}

/** Spawn near an explored outskirts corner, then follow dry, unblocked land.
 * If the centre is enclosed, stop on the reachable outside of the obstruction. */
export function raidEntryRoute(c:City,from:number):number[] {
  const target=buildings(c).find(([,b])=>b.k==="hall"&&isBuildingActive(b))?.[0]??c.camp;
  const places=[c.camp,...buildings(c).map(([tile])=>tile)];
  const xs=places.map(i=>i%W),ys=places.map(i=>Math.floor(i/W));
  const minX=Math.max(0,Math.min(...xs)-3),maxX=Math.min(W-1,Math.max(...xs)+3);
  const minY=Math.max(0,Math.min(...ys)-3),maxY=Math.min(H-1,Math.max(...ys)+3);
  const corner=[idx(minX,minY),idx(maxX,minY),idx(minX,maxY),idx(maxX,maxY)]
    .sort((a,b)=>cheb(a,from)-cheb(b,from)||a-b)[0];
  const pass=(i:number)=>!!c.seen[i]&&c.t[i]!==R&&haulPassable(c,i,-1,false);
  let entry=-1,score=Infinity;
  for(let i=0;i<W*H;i++){
    if(!pass(i)||c.b[i]||cheb(i,target)<3)continue;
    const d=(i%W-corner%W)**2+(Math.floor(i/W)-Math.floor(corner/W))**2;
    if(d<score){entry=i;score=d;}
  }
  if(entry<0)return [];
  const prev=new Int32Array(W*H).fill(-1),queue=[entry];prev[entry]=entry;
  let goal=entry,distance=cheb(entry,target);
  for(let head=0;head<queue.length;head++){
    const tile=queue[head],d=cheb(tile,target);
    if(d<distance){goal=tile;distance=d;}
    if(d<=1){goal=tile;break;}
    const x=tile%W,y=Math.floor(tile/W);
    for(const [dx,dy]of N8){
      if(!inb(x+dx,y+dy))continue;
      const next=idx(x+dx,y+dy);
      if(prev[next]!==-1||!pass(next))continue;
      if(dx&&dy&&(!pass(idx(x+dx,y))||!pass(idx(x,y+dy))))continue;
      prev[next]=tile;queue.push(next);
    }
  }
  const route=[goal];for(let tile=goal;tile!==entry;){tile=prev[tile];route.push(tile);}
  return route.reverse();
}
export function raidPhase(c:City,at:number):"warning"|"enter"|"fight"|"retreat"|null {
  const e=c.raidEncounter;
  if(e&&at>=e.start&&at<e.end)return at<e.engage?"enter":at<e.resolveAt?"fight":"retreat";
  return c.raid?"warning":null;
}
/** A bounded visual formation on the persisted route; no actors during warning. */
export function raidActors(c:City,at:number){
  const e=c.raidEncounter,phase=raidPhase(c,at);
  if(!e?.route.length||!phase||phase==="warning")return [];
  const length=routeLength(e.route),duration=Math.max(1,e.engage-e.start);
  const progress=phase==="enter"?(at-e.start)/duration:phase==="fight"?1:1-(at-e.resolveAt)/Math.max(1,e.end-e.resolveAt);
  return Array.from({length:7},(_,n)=>{
    const lag=Math.floor(n/3)*.35;
    let distance=Math.max(0,Math.min(length,length*progress+(phase==="enter"?-lag:phase==="retreat"?lag:0)));
    let tile=e.route[0],x=tile%W+.5,y=Math.floor(tile/W)+.5,face:1|-1=1;
    for(let i=1;i<e.route.length;i++){
      const a=e.route[i-1],b=e.route[i],dx=b%W-a%W,dy=Math.floor(b/W)-Math.floor(a/W),d=Math.hypot(dx,dy);
      face=((dx-dy)*(phase==="retreat"?-1:1)>=0?1:-1);
      if(distance<=d){const f=distance/d;x=a%W+.5+dx*f;y=Math.floor(a/W)+.5+dy*f;break;}
      distance-=d;tile=b;x=tile%W+.5;y=Math.floor(tile/W)+.5;
    }
    // Small within-cell spacing keeps the formation off neighbouring obstacles.
    const offset=((n%3)-1)*.12;
    return {x:x+offset,y:y+(phase==="fight"?(Math.floor(n/3)-1)*.12:offset),face,moving:phase!=="fight",fighting:phase==="fight",seed:n*.53};
  });
}

function raid(c: City, at: number, r: () => number) {
  const inc = c.raid!;
  const bell = !!c.alarm;
  c.raid = null; c.alarm = false;
  const attack = inc.power * (0.8 + r() * 0.4);
  // with the bell rung, villagers shelter and fighters gather at the hall
  const defense = (troopPower(c.army) * (bell ? 1.25 : 1) + 15) * (0.8 + r() * 0.4);
  if(c.raidEncounter)c.raidEncounter.won=defense>=attack;
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
    else if(isField(c.b[tile]?.k??"")&&isBuildingActive(c.b[tile])){
      c.cropDamage={tile,until:at+2*MIN};
      log(c,at,"Lợn rừng giẫm phá một ruộng: năng suất giảm 50% trong 2 phút. Xây chòi trong 7 ô hoặc giữ quân ở làng (sức mạnh 20) để phòng lần sau.","warn");
    }else log(c,at,"Đàn lợn rừng đã bỏ đi vì ruộng không còn ở đó.");
    changed=true;
  }
  if(w && at>=w.end){delete c.wildlife;changed=true;}
  const slot=Math.floor((at-c.t0)/(30*MIN));
  if(slot<1 || (at-c.t0)%(30*MIN)!==0 || c.wildlife || c.battleId)return changed;
  const r=rng(c.seed^Math.imul(slot,1597334677));if(r()>.45)return changed;
  const farms=buildings(c).filter(([,b])=>isField(b.k)&&isBuildingActive(b));
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
  for(const u of ["armor","cavalry","elephant","infantry","sword","spear","club","crossbow","musket","cannon","bow","sling","wagon","medic"] as UKey[]){
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

function stepArmy(c: City, nt: number,docks=buildings(c).filter(([,b])=>b.k==="dock")) {
  if(c.merchantJourneys?.some(j=>j.back<=nt))c.merchantJourneys=c.merchantJourneys.filter(j=>j.back>nt);
  if(c.ferryBookings)c.ferryBookings=c.ferryBookings.filter(b=>b.back>nt);
  for(const [,b]of docks){
    if(b.lvl<1||b.burned||b.flooded||b.off||b.stranded||b.relocation){if(b.shipQueue)b.shipQueue=b.shipQueue.map(done=>done+HAUL_TILE_MS);continue;}
    while(b.shipQueue?.length&&b.shipQueue[0]<=nt){const done=b.shipQueue.shift()!;c.transportShips=(c.transportShips??0)+1;log(c,done,"Đóng xong một thuyền vận tải (10 chỗ).","good");}
  }
  pruneHomeOrders(c);
  let changed = false;
  if(c.raid && c.raid.at<=nt && !c.raidEncounter){
    const start=c.raid.at,route=raidEntryRoute(c,c.raid.from),travel=Math.max(1000,Math.ceil(routeLength(route)/1.9)*1000);
    const engage=start+travel,resolveAt=engage+6000;
    c.raidEncounter={start,engage,resolveAt,end:resolveAt+travel,route,power:c.raid.power};
    log(c,start,"Man rợ xuất hiện ở rìa làng! Quân giữ làng chuẩn bị giao chiến.","warn");changed=true;
  }
  const encounter=c.raidEncounter;
  if(encounter && encounter.won===undefined && c.raid && encounter.resolveAt<=nt){
    raid(c,encounter.resolveAt,rng(c.seed ^ Math.imul(Math.floor(c.raid.at / MIN),3266489917)));changed=true;
  }
  if(encounter && encounter.end<=nt){delete c.raidEncounter;changed=true;}
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
  scheduleDrought(c,si);
  scheduleModernFlood(c,si);
  const r = rng(c.seed ^ Math.imul(si + 1, 2654435761));
  if (si >= 4 && si % 4 === 0) scheduleRaid(c, at, rng(c.seed ^ Math.imul(si + 3, 3266489917)));
  const s = c.shift;
  if (s && !s.done && si === s.warn) {
    s.xs = newCourse(c, r);
    notifyDisaster(c,at,"river","warning","Già làng xem nước: mùa thu tới sông có thể đổi dòng. Ô viền nét đứt là tuyến dự báo. Xây hoặc sửa đê để bảo vệ đất; dòng mới tránh vùng được đê che.");
  }
  if (si % 4 === 2) {
    if (s && !s.done && si === s.at && s.xs) applyShift(c, at);
    else flood(c, derive(c), at, r);
  }
}

function completeBuilding(c:City,b:Building,at:number){
  if(b.relocation){
    delete b.relocation;b.doneAt=null;
    const tile=buildings(c).find(([,building])=>building===b)?.[0];
    b.stranded=tile===undefined||!dockOnRiver(c,tile);
    log(c,at,b.stranded?"Đã chuyển bến nhưng sông lại rời bờ mới; cảng còn mắc cạn, cần chọn bờ khác.":"Chuyển bến hoàn tất, cảng hoạt động lại. Giữ nguyên cấp và đội thuyền.",b.stranded?"warn":"good");return;
  }
  if(isStorage(b.k) && b.storageUpgrade){
    const r=b.storageUpgrade;
    b.storageLevels![r]=storageLevel(b,r)+1;
    b.lvl=Math.max(...RES.map(key=>storageLevel(b,key)));
    delete b.storageUpgrade;b.doneAt=null;
    log(c,at,`Kho: ngăn ${RN[r]} lên cấp ${storageLevel(b,r)} (${storageCapacity(b,r).toLocaleString("vi-VN")} chỗ).`,"good");return;
  }
  if (b.lvl === 0) b.builtAt = at;
  b.lvl++;b.doneAt=null;
  if(b.k==="levee"&&replanProtectedCourse(c,at))log(c,at,"Đê vừa hoàn tất đã bảo vệ đất trên tuyến dự báo. Dòng sông dự kiến đã được tính lại; xem đường nét đứt mới.","good");
  log(c,at,`${buildingName(c,b.k)} ${b.lvl===1?"xây xong":"đã nâng lên cấp "+b.lvl}.`,"good");
  if((b.k==='dam'||b.k==='green')&&c.modern){c.modern.choice=b.k;c.modern.completedAt=at;log(c,at,`Khánh thành ${def(b.k).n}! Thành phố tiếp tục hoạt động và giao thương.`,"good");}
  if(b.k==='temple'&&!c.templeAt){c.templeAt=at;log(c,at,"Đền Sông Mẹ khánh thành. Thành phố đã đi từ lều cỏ tới kỳ quan.","good");}
}

/** Advance the city to `now`: finish construction, run seasons, produce, grow. Mutates `c`. */
export function settle(c: City, now: number) {
  normalizeResources(c);
  syncDockBanks(c,c.last);
  initializeMedieval(c,now);
  initializeIndustry(c,now);
  initializeModern(c,now);
  // Catch up legacy saves at their old upkeep before activating the new balance.
  c.upkeepStartsAt??=now;
  // Existing villages finish their offline catch-up before the new mill cost starts.
  c.wheelFuelStartsAt??=now;
  c.gatherFoodStartsAt??=now;
  c.farmAutoStartsAt??=now;
  c.hungerStartsAt??=now;
  if (now <= c.last) return;
  let t = c.haulAt ?? c.last;
  c.haulAt = t;
  c.wildernessAt??=t+WILDERNESS_MS;
  if(!c.disaster)scheduleDisaster(c,t);
  const end = t + Math.floor((now - t) / HAUL_TILE_MS) * HAUL_TILE_MS;
  if (end - t > MAX_SETTLE_MS) {
    t = end - MAX_SETTLE_MS;
    c.seasonIdx = Math.max(c.seasonIdx, seasonIndexAt(c, t));
    if(c.industry)c.industry.minuteAt=Math.max(c.industry.minuteAt,Math.floor(t/MIN)*MIN);
    if(c.medieval)c.medieval.minuteAt=Math.max(c.medieval.minuteAt,Math.floor(t/MIN)*MIN);
  }
  let D = derive(c), st = stats(c, D, t), dirty = false;
  let hauling = haulingContext(c, D);
  if(updateRefuges(c,t))dirty=true;
  refreshHauling(c, t, hauling);
  for (const p of c.people) if (!p.haul) beginHaul(c, p, t, hauling);
  while (t < end) {
    const nt = t + HAUL_TILE_MS; // fixed persisted ticks: polling never changes delivery or starvation timing
    if(c.era>=4 && t>=c.farmAutoStartsAt)for(const {tile,b,cost} of hauling.civic.fields){
      if(!isBuildingActive(b)||b.doneAt||b.tendUntil||farmRemaining(b)>0||missing(c,cost))continue;
      beginFarmCare(c,b,tile,cost,t);
      if(!hauling.civic.pending.includes(b))hauling.civic.pending.push(b);
      dirty=true;
    }
    for (const b of hauling.civic.pending) {
      if(isField(b.k) && b.tendUntil && b.tendUntil<=nt){
        b.fertility=farmCapacity(b);delete b.tendUntil;dirty=true;
        if(c.era<4)log(c,nt,"Ruộng đã cải tạo và gieo lại, nông dân tiếp tục làm việc.","good");
      }
      if (b.doneAt && b.doneAt <= nt) {
        completeBuilding(c,b,nt);dirty = true;
      }
    }
    if (dirty) autoStaff(c, nt);
    if (t < c.boostUntil && c.boostUntil <= nt) dirty = true;
    if(t<c.upkeepStartsAt&&c.upkeepStartsAt<=nt)dirty=true;
    if(t<c.wheelFuelStartsAt&&c.wheelFuelStartsAt<=nt)dirty=true;
    if(t<c.gatherFoodStartsAt&&c.gatherFoodStartsAt<=nt)dirty=true;
    const si = seasonIndexAt(c, nt);
    while (c.seasonIdx < si) { c.seasonIdx++; onSeason(c, c.seasonIdx); dirty = true; }
    const services=c.medieval?staffCounts(c):undefined;
    if(c.modern && recoverModernFloods(c,nt,hauling.civic.flooded))dirty=true;
    if(c.modern && stepPower(c,t,nt,B,services,hauling.civic.power))dirty=true;
    if(c.industry && stepIndustry(c,t,nt,B,services,hauling.civic.cleaners))dirty=true;
    if(c.medieval && stepMedieval(c,dirty?derive(c):D,t,nt))dirty=true;
    // Service bonuses change when their workers arrive or seek refuge.
    if(c.medieval && medievalBonus(c,services,hauling.civic.bonus)!==hauling.medievalBonus)dirty=true;
    if(c.industry){const network=transportNetwork(c,services,hauling.civic.transport);if(network.bridge!==hauling.transport.bridge||network.stations.join(',')!==hauling.transport.stations.join(','))dirty=true;}
    if(stepFrontier(c,nt))dirty=true;
    if (updateRefuges(c,nt)) dirty=true;
    if (stepExplorers(c, nt)) dirty = true;
    if (stepArmy(c, nt,hauling.civic.docks)) dirty = true;
    if (stepEnvoys(c, nt)) dirty = true;
    if (stepWildlife(c, nt)) dirty = true;
    if (autoAssign(c, nt, dirty ? undefined : hauling)) dirty = true;
    if (dirty) { D = derive(c); st = stats(c, D, nt); hauling = haulingContext(c, D); refreshHauling(c, nt, hauling); dirty = false; }

    const h = (nt - t) / HOUR;
    // Displayed production rates are estimates. Only unload events credit stock.
    // Population upkeep and smelter fuel remain continuous costs, separate from carried goods.
    c.res.wood=Math.max(0,c.res.wood-st.upkeep.wood*h);
    const fireNeed=st.fireWoodUse*h,fireEff=fireNeed>0?Math.min(1,c.res.wood/fireNeed):1;
    c.res.wood=Math.max(0,c.res.wood-fireNeed*fireEff);
    // Fuel is spent only while a worker is actually smelting. Travel, full
    // stores and exhausted/unreachable ore must not burn materials for no output.
    let furnaceLoad=0;
    if(t>=c.upkeepStartsAt&&c.res.copper<st.storage.copper)for(const p of c.people){
      const b=p.task.t==='work'?c.b[p.task.at]:undefined,haul=p.haul;
      if(!p.refuge&&b?.k==='smelter'&&isBuildingActive(b)&&haul?.phase==='work'&&haul.source?.kind==='tile'&&c.t[haul.source.key]===O)furnaceLoad+=LVL_MULT[b.lvl]/B.smelter.jobs!;
    }
    const need = (t<c.upkeepStartsAt?st.woodUse-st.fireWoodUse-st.wheelWoodUse:600*furnaceLoad) * h,stoneNeed=(t<c.upkeepStartsAt?st.stoneUse:600*furnaceLoad)*h;
    const smelt = t>=c.upkeepStartsAt&&c.res.copper>=st.storage.copper?0:Math.max(0,Math.min(1,need>0?c.res.wood/need:1,stoneNeed>0?c.res.stone/stoneNeed:1));
    c.res.wood = Math.max(0, c.res.wood - need * smelt);
    c.res.stone=Math.max(0,c.res.stone-stoneNeed*smelt);
    // One cost per working mill, regardless of level or workers. Returning
    // workers, full food storage and damaged mills never consume mill fuel.
    let milling=1;
    if(t>=c.wheelFuelStartsAt&&st.wheelWoodUse>0){
      const mills=new Set<number>();
      if(c.res.food<st.storage.food)for(const p of c.people){
        if(!p.refuge&&p.task.t==='work'&&c.b[p.task.at]?.k==='wheel'&&isBuildingActive(c.b[p.task.at])&&p.haul?.phase==='work'&&p.haul.source?.kind==='building'&&p.haul.source.key===p.task.at)mills.add(p.task.at);
      }
      const millNeed=mills.size*WATERMILL_WOOD_PER_HOUR*h;
      milling=c.res.food>=st.storage.food?0:millNeed>0?Math.min(1,c.res.wood/millNeed):1;
      c.res.wood=Math.max(0,c.res.wood-millNeed*milling);
    }
    let gatheringFood=0;
    if(t>=c.gatherFoodStartsAt&&st.gatherFoodUse>0&&c.res.food<st.storage.food){
      const camps=new Set<number>();
      for(const p of c.people){
        if(!p.refuge&&p.task.t==='work'&&c.b[p.task.at]?.k==='gather'&&isBuildingActive(c.b[p.task.at])&&p.haul?.phase==='work'&&p.haul.source?.kind==='building'&&p.haul.source.key===p.task.at)camps.add(p.task.at);
      }
      for(const tile of camps)gatheringFood+=gatherFoodPerHour(c,D,tile)*h;
    }
    // Gathering costs never gate production: an empty village must be able to recover.
    c.res.food -= st.upkeep.food*h+gatheringFood;
    for (const r of RES) c.res[r] = Math.min(st.storage[r], c.res[r]);
    stepHauling(c, nt, hauling, st.storage, smelt, milling);
    for (const herd of c.herds) if (herd.n < herd.max) herd.n = Math.min(herd.max, herd.n + HERD_REGROW * h);

    const popBefore = c.people.length;
    const shortage=c.res.food<0;
    if(t>=c.hungerStartsAt)stepHunger(c,nt,nt-t,shortage);
    if (shortage) {
      c.res.food = 0;
      if(t<c.hungerStartsAt)c.popAcc-=h*6;else c.popAcc=0;
    } else if ((c.hunger?.stressMs??0)>0) c.popAcc=0;
    else if (c.people.length < st.housing) {
      c.popAcc += h * POP_GROWTH_PER_HOUR * (1 + st.fires*fireEff)*pollutionBirth(c)*serviceBonus(c,services,hauling.civic.bonus).birth;
    } else c.popAcc = 0;
    while (c.popAcc >= 1 && c.people.length < st.housing) { addPerson(c); c.popAcc--; autoStaff(c, nt); }
    while (c.popAcc <= -1 && c.people.length > MIN_POP) {
      const k = c.people.findIndex((p) => p.task.t === "idle");
      const gone = c.people.splice(k >= 0 ? k : c.people.length - 1, 1)[0];
      log(c, nt, `Đói kém: ${gone.name} bỏ đi tìm nơi khác.`, "warn");
      c.popAcc++;
    }
    c.popAcc = Math.max(-1, Math.min(1, c.popAcc));
    c.pop = c.people.length;
    if (c.people.length !== popBefore) { updateRefuges(c,nt); dirty = true; }
    t = nt;
  }
  c.haulAt = t;
  c.last = now;
}

export function canPlace(c: City, D: Derived, k: BKey, x: number, y: number, rules:EngineRules=RELEASE_RULES,skipCost=false,relocatingDockFrom?:number): string | null {
  const d = def(k), i = idx(x, y), t = c.t[i];
  if(d.era>rules.maxEra)return "Thời đại này sắp ra mắt.";
  if (!c.seen[i]) return "Vùng này chưa khám phá.";
  if (d.era > c.era) return "Chưa tới thời đại này.";
  if(c.modern?.choice===k)return "Kỳ quan đã khánh thành, không thể xây lại hoặc đổi nhánh.";
  if (c.b[i]) return "Ô này đã có công trình.";
  if (t === R) return "Không xây được trên sông.";
  if(!["farm","estate","canal","levee","gate"].includes(k) && [...c.exps,...(c.raidEncounter && c.raidEncounter.end>c.last?[c.raidEncounter]:[]),...(c.merchantJourneys??[]).filter(j=>j.back>c.last).map(j=>({route:j.villageRoute})),...(Object.keys(c.homeOrders??{}).length?homeSoldiers(c,c.last):[]).flatMap(s=>{const o=c.homeOrders?.[s.id];return o?[{route:s.moving?o.route:[idx(Math.floor(s.x),Math.floor(s.y))]}]:[];}),...c.people.flatMap(p=>p.refuge?[p.refuge]:[])].some(e=>e.route?.some((tile,n,route)=>tile===i || n>0 && tile%W!==route[n-1]%W && Math.floor(tile/W)!==Math.floor(route[n-1]/W) && (i===idx(tile%W,Math.floor(route[n-1]/W)) || i===idx(route[n-1]%W,Math.floor(tile/W))))))return "Đoàn quân hoặc dân tránh địch đang dùng lối này. Chờ họ trở về hoặc chọn ô khác để không chặn đường.";
  if(c.industry?.seedlings[i])return "Ô đang ươm cây; chờ cây lớn rồi chặt trước khi xây.";
  if(k==="coalmine"){if(t!==COAL)return "Mỏ than phải đặt trên ô than.";}
  else if (k === "quarry") { if (t !== HL) return "Bãi đá phải đặt trên đồi."; }
  else if (isRock(t)) return "Đồi đá chỉ đặt được bãi đá.";
  else if (t === F) return "Rừng rậm: cho người chặt hết cây trước, hoặc chọn ô cỏ.";
  const near = (dirs: readonly (readonly [number, number])[], fn: (j: number) => boolean) =>
    dirs.some(([dx, dy]) => inb(x + dx, y + dy) && fn(idx(x + dx, y + dy)));
  if (d.need === "forest" && !near(N8, (j) => c.t[j] === F)) return "Trại đốn gỗ phải kề rừng.";
  if (d.need === "ore" && !near(N8, (j) => c.t[j] === O)) return "Lò đúc phải kề mỏ đồng (đốm cam trên đồi).";
  if(k==="reservoir"&&!hasWaterSource(c,D,i))return "Hồ chứa phải kề sông hoặc kênh đang có nước (không chéo).";
  if((k==="retention")&&!hasWaterSource(c,D,i))return "Hồ điều hòa cần kề sông/kênh có nước.";
  if (d.need === "water" && !near(N4, (j) => c.t[j] === R || c.b[j]?.k === "canal")) return "Kênh phải nối thẳng (không chéo) vào sông hoặc kênh khác.";
  if (d.need === "river" && !near(N4, (j) => c.t[j] === R)) return `${def(k).n} phải sát sông (không chéo).`;
  if (d.need === "bank" && D.rd[i] !== 1 && !near(N4,j=>c.b[j]?.k==="levee")) return "Đê phải sát bờ sông hoặc nối thẳng vào đoạn đê khác (không chéo).";
  const finalError=finalWonderError(c,k,c.last);if(finalError)return finalError;
  const limit=buildingLimit(c,k);
  // Relocation replaces an existing dock, even on legacy villages above the cap.
  const movingDock=k==="dock" && relocatingDockFrom!==undefined && c.b[relocatingDockFrom]?.k==="dock" && c.b[relocatingDockFrom].lvl>=1;
  if (!movingDock && limit!==undefined && count(c, k) >= limit) return k==='watchtower'?`Đã đủ giới hạn ${count(c,k)}/${limit} trụ ở thời đại này.`:`Đã đủ số lượng tối đa (${limit}).`;
  if (busyBuilders(c) >= builders(c)) return "Tất cả thợ đang bận.";
  return skipCost?null:missing(c, buildingCost(k, c.era));
}

export function reqMet(c: City, rules:EngineRules=RELEASE_RULES) {
  const r = ERA_REQ[c.era + 1];
  return c.era+1<=rules.maxEra && !!r && c.people.length >= r.pop && canAfford(c, r.cost) && hallLevel(c) >= (r.hall ?? 0) && (!r.wonder||Object.values(c.b).some(b=>b.k===r.wonder&&isBuildingActive(b)));
}

export function score(c: City) {
  let s = c.era * 1000 + c.people.length * 5 + (c.templeAt ? 5000 : 0);
  for (const b of Object.values(c.b)) s += b.lvl * 10;
  s += Math.floor(c.seen.reduce((a, v) => a + v, 0) / 20) + c.wins * 50 + Math.floor(troopPower(c.army) / 5);
  return s;
}

export const FARM_TEND_MS = 30_000;
export const farmCapacity = (b: Building) => 600 * Math.max(1,b.lvl)*(b.k==="estate"?4:1);
export const farmRemaining = (b: Building) => Math.max(0,b.fertility ?? farmCapacity(b));
export const farmTendCost = (b: Building, era = 1): Partial<Res> => eraCost({ food: 20*Math.max(1,b.lvl)*(b.k==="estate"?4:1), wood: 5*Math.max(1,b.lvl)*(b.k==="estate"?4:1) }, era, 2);

function beginFarmCare(c:City,b:Building,tile:number,cost:Partial<Res>,at:number){
  pay(c,cost);b.tendUntil=at+FARM_TEND_MS;
  // Only unfinished harvesting is canceled. Paid-for cargo still reaches storage.
  for(const p of c.people)if(p.task.t==='work'&&p.task.at===tile&&p.haul?.phase==='work')delete p.haul;
}
export function farmAutoStatus(c:City,b:Building){
  if(c.era<4)return null;
  if(b.tendUntil)return 'Đang tự cải tạo; chi phí đã thanh toán, hết tài nguyên vẫn hoàn tất.';
  if(!isBuildingActive(b)||b.doneAt)return 'Tự cải tạo chờ ruộng hoạt động trở lại.';
  if(farmRemaining(b)>0)return 'Tự cải tạo khi bạc màu: trừ đúng giá bên dưới, hoàn tất sau 30 giây.';
  const shortage=missing(c,farmTendCost(b,c.era));
  return shortage?`Chờ tự cải tạo: ${shortage} Có đủ sẽ tự làm lại; nông dân giữ công việc.`:'Đã đủ vật liệu, ruộng sẽ tự cải tạo ở nhịp xử lý tiếp theo.';
}

export type Action =
  | { type: "build"; k: BKey; x: number; y: number; confirmFinal?:boolean }
  | { type: "upgradeStorage"; resource: ResKey; x: number; y: number }
  | { type: "upgrade"; x: number; y: number }
  | { type: "repair"; x: number; y: number }
  | { type: "buildShip"; x: number; y: number }
  | { type: "relocateDock"; x: number; y: number; to: number }
  | { type: "speedBuild"; x: number; y: number }
  | { type: "tendFarm"; x: number; y: number }
  | { type: "demolish"; x: number; y: number }
  | { type: "moveSoldier"; id: string; x: number; y: number }
  | { type: "setGuardPosts"; posts: { x: number; y: number }[] }
  | { type:"setPowerPriority"; priority:PowerGroup[] }
  | { type: "plantTree"; x:number;y:number }
  | { type: "toggleBuilding"; x:number;y:number }
  | { type: "advance" }
  | { type: "assign"; ids: number[]; task: TaskInput; pos?: Record<string, number> }
  | { type: "assignN"; n: number; task: TaskInput; pos?: Record<string, number> } // pos: where each person stands on screen
  | { type: "setWorkforce"; counts: Res; scouts: number }
  | { type: "train"; u: UKey; n: number }
  | { type: "attack"; camp: number; units: Troops }
  | { type: "alarm" }
  | { type: "recall"; exp: number }
  | { type: "auto"; on: boolean; mix: Mix };

/** Validate and apply a player action at time `now`. Returns an error message or null. Mutates `c`. */
export function applyAction(c: City, a: Action, now: number, rules:EngineRules=RELEASE_RULES): string | null {
  if (!isActionInput(a)) return "Yêu cầu không hợp lệ.";
  settle(c, now);
  if(a.type==="setPowerPriority"){if(!c.modern||rules.maxEra<6)return "Điện mở ở Hiện đại.";c.modern.priority=[...a.priority];stepPower(c,now,now,B);return null;}
  if(a.type==="plantTree")return rules.maxEra>=5?plantTree(c,idx(a.x,a.y),now):"Sắp ra mắt.";
  if(a.type==="toggleBuilding"){const b=c.b[idx(a.x,a.y)];if(!b||def(b.k).era>rules.maxEra||!canToggle(def(b.k)))return "Chỉ bật/tắt cơ sở công nghiệp và dịch vụ mới.";b.off=!b.off;if(c.modern)stepPower(c,now,now,B);return null;}
  if(a.type==="relocateDock"){
    const from=idx(a.x,a.y),plan=dockRelocationPlan(c,from,a.to,rules);
    if(plan.error)return plan.error;
    const b=c.b[from];pay(c,plan.cost);
    delete c.b[from];c.b[a.to]=b;
    b.relocation={from,startedAt:now,duration:plan.duration};b.doneAt=now+plan.duration;b.stranded=true;
    for(const p of c.people)if(p.task.t==="work"&&p.task.at===from){p.task={t:"idle"};delete p.haul;}
    log(c,now,`Thợ chuyển bến cảng ${plan.distance} ô, đã trả ${costText(plan.cost)}; mất ${Math.ceil(plan.duration/1000)} giây, dùng 1 đội thợ xây.`,"good");return null;
  }
  if(a.type==="buildShip"){
    const b=c.b[idx(a.x,a.y)];if(b?.k!=="dock"||!isBuildingActive(b)||b.doneAt)return "Cần Bến cảng hoạt động, không mắc cạn, cháy/ngập hoặc đang chuyển bến.";
    const queued=buildings(c).reduce((n,[,b])=>n+(b.shipQueue?.length??0),0);
    if((c.transportShips??0)+queued>=shipCapacity(c))return "Đã đủ thuyền theo sức chứa cảng; xây hoặc nâng thêm Bến cảng.";
    const cost=shipCost(c.era),err=missing(c,cost);if(err)return err;
    pay(c,cost);const q=b.shipQueue??=[];q.push(Math.max(now,q[q.length-1]??now)+shipBuildMs(b));return null;
  }
  if (a.type === "speedBuild") {
    const b=c.b[idx(a.x,a.y)];
    if(!b?.doneAt||b.doneAt<=now)return "Công trình không còn đang xây.";
    const cost=speedBuildCost(b,now);
    if(c.res.diamond<cost)return `Cần ${cost} kim cương để hoàn tất.`;
    c.res.diamond-=cost;b.doneAt=now;
    // Use the normal construction completion path, including staffing and wonders.
    completeBuilding(c,b,now);autoStaff(c, now);
    log(c,now,`Dùng ${cost} kim cương hoàn tất ${def(b.k).n}.`,"good");return null;
  }
  if (a.type === "tendFarm") {
    const b=c.b[idx(a.x,a.y)];
    if (!b || !isField(b.k) || !isBuildingActive(b) || b.doneAt) return "Cần chọn ruộng đã xây xong, không bị cháy/ngập.";
    if(b.tendUntil) return "Ruộng đang được cải tạo và gieo lại.";
    if(farmRemaining(b)>=farmCapacity(b)) return "Ruộng còn đầy dinh dưỡng, chưa cần cải tạo.";
    const cost=farmTendCost(b,c.era),err=missing(c,cost);if(err)return err;
    beginFarmCare(c,b,idx(a.x,a.y),cost,now);
    log(c,now,"Đang cải tạo đất và gieo lại ruộng, hoàn tất sau 30 giây.");
    return null;
  }
  if (a.type === "moveSoldier") {
    if (c.battleId) return "Hãy điều quân trong màn trận đánh.";
    return orderHomeSoldier(c, a.id, idx(a.x,a.y), now) ? null : "Không có đường đã khám phá, thiếu thuyền qua sông hoặc lính đang trên thuyền/đã xuất chinh.";
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
    if(c.era+1>rules.maxEra)return "Thời đại tiếp theo sắp ra mắt.";
    if (!reqMet(c,rules)) return "Chưa đủ điều kiện lên thời đại mới.";
    pay(c, ERA_REQ[c.era + 1].cost);
    c.era++;
    initializeMedieval(c,now);
  initializeIndustry(c,now);
  initializeModern(c,now);
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
    if(u.era>rules.maxEra)return "Loại quân này sắp ra mắt.";
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
    log(c, now, "Kẻng báo động vang lên: quân chuẩn bị phòng thủ (+25% sức thủ). Dân tiếp tục làm việc và tự trú ẩn trong 60 giây cuối trước khi địch tới.", "warn");
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
    if (a.on && !RES.some(r => mix[r] > 0)) return "Chọn ít nhất một loại tài nguyên để tự động giao việc.";
    c.auto = { on: !!a.on, mix };
    if(a.on)c.manualWorkforce=false;
    autoAssign(c, now);
    return null;
  }
  if(a.type === "setWorkforce")return setWorkforce(c,{...a.counts,coal:a.counts.coal??0},a.scouts,now);
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
    const plan=expeditionPlan(c,camp.at,units);
    if(!plan)return "Không có đường hoặc thiếu thuyền qua sông. Mở lối trại lính; xây Bến cảng sát đoạn sông đã khám phá và đóng đủ thuyền cho đoàn quân.";
    const ms = plan.duration,suppliesFood=marchSupplies(units,ms,c.era).food;
    if(c.res.food<suppliesFood)return `Cần ${suppliesFood} lương thực dự trữ cho cả đi và về.`;
    c.res.food-=suppliesFood;
    for (const u of UKEYS) if (units[u]) c.army[u]! -= units[u]!;
    pruneHomeOrders(c);
    c.exps.push({ id: c.nextExp++, units, camp: camp.id, depart: now, arrive: now + ms, back: now + 2 * ms, resolved: false, route:plan.route, ships:plan.ships, suppliesFood, logisticsVersion:1, combatVersion:1 });
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
      const n = a.n;
      people = c.people.filter(availableForQuickAssign).slice(0, n);
      if (!people.length) return quickAssignBlockedReason(c);
    }
    if (!people.length) return "Chưa chọn người.";
    if(people.some(p=>p.refuge))return "Dân đang tránh địch hoặc quay lại chỗ làm. Chờ an toàn để giao việc mới.";
    const moving = tk.t === "work" ? people.filter((p) => !(p.task.t === "work" && p.task.at === tk.at)).length : 0;
    const err = taskError(c, tk, moving);
    if (err) return err;
    for (const p of people) {
      // Economy positions are authoritative; client animation hints cannot
      // teleport a worker or a load of resources to the destination.
      p.assignment=tk.t === "explore" || tk.t === "move" && isScout(p) ? "scout" : "manual";
      setTask(c, p, tk, now);
    }
    return null;
  }
  if (!Number.isInteger(a.x) || !Number.isInteger(a.y) || !inb(a.x, a.y)) return "Ô không hợp lệ.";
  const i = idx(a.x, a.y), b = c.b[i];
  if (a.type === "build") {
    if((a.k==='dam'||a.k==='green')&&a.confirmFinal!==true)return "Cần xác nhận lợi ích và đánh đổi của kỳ quan cuối trước khi xây.";
    if (!(a.k in B)) return "Công trình không hợp lệ.";
    const err = canPlace(c, derive(c), a.k, a.x, a.y,rules);
    if (err) return err;
    const cost = buildingCost(a.k, c.era);
    pay(c, cost);
    c.b[i] = { k: a.k, lvl: 0, doneAt: now + buildMs(a.k, 1), investment: {...cost} };
    return null;
  }
  if (!b) return "Ô này trống.";
  if (a.type === "demolish") {
    const quote = demolitionQuote(c, i, now);
    if (quote.error) return quote.error;
    pay(c, quote.refund, 1);
    delete c.b[i];
    for (const p of c.people) if (p.task.t === "work" && p.task.at === i) setTask(c, p, {t:"idle"}, now);
    if (b.k === "levee") replanProtectedCourse(c, now);
    log(c, now, `Đã phá ${buildingName(c,b.k)}, hoàn ${quote.percent}%: ${costText(quote.refund) || "0 tài nguyên"}.${Object.keys(quote.overflow).length ? ` Kho không đủ chỗ, mất ${costText(quote.overflow)}.` : ""}`, "warn");
    return null;
  }
  if (a.type === "repair") {
    if (!b.flooded && !b.burned) return "Công trình không cần sửa.";
    if (b.doneAt) return "Đang xây dở.";
    const cost = repairCost(b.k, b.lvl, !!b.burned, c.era);
    const err = missing(c, cost);
    if (err) return err;
    pay(c, cost);
    b.flooded = false;delete b.floodUntil;
    b.burned = false;
    delete b.damageCause;
    if(b.k==="levee"&&replanProtectedCourse(c,now))log(c,now,"Đê được sửa đã bảo vệ đất trên tuyến dự báo. Đã tính lại hướng dòng sông mới.","good");
    autoStaff(c, now);
    return null;
  }
  if (a.type === "upgradeStorage") {
    if(a.resource==='coal'&&c.era<5)return 'Ngăn than mở từ Công nghiệp.';
    if(!isStorage(b.k) || b.lvl<1)return "Chọn Kho đã xây xong.";
    if(b.doneAt)return "Kho đang được nâng cấp.";
    if(b.flooded||b.burned)return "Phải sửa Kho trước khi nâng cấp.";
    const lv=storageLevel(b,a.resource);
    if(lv>=MAX_LVL)return "Ngăn này đã cấp tối đa.";
    if(lv>=levelCap(c,b.k))return "Cần xây hoặc nâng Đình làng để nâng tiếp ngăn Kho.";
    if(busyBuilders(c)>=builders(c))return "Tất cả thợ đang bận.";
    const cost=levelCost(b.k,lv+1,c.era),err=missing(c,cost);if(err)return err;
    pay(c,cost);
    recordBuildingInvestment(b,cost);
    b.storageLevels=Object.fromEntries(RES.map(r=>[r,storageLevel(b,r)]));
    b.storageUpgrade=a.resource;b.doneAt=now+buildMs(b.k,lv+1);return null;
  }
  if (a.type === "upgrade") {
    if(isStorage(b.k))return "Chọn ngăn tài nguyên cần nâng trong Kho.";
    const d = def(b.k);
    if (!d.up) return "Công trình này không nâng cấp được.";
    if (b.doneAt) return "Đang xây dở.";
    if (b.stranded) return "Cảng mắc cạn: chuyển bến ra bờ sông trước khi nâng cấp.";
    if (b.flooded || b.burned) return "Phải sửa trước khi nâng cấp.";
    if (b.lvl >= (b.k==="hall"?Math.min(levelCap(c,b.k),Math.max(3,rules.maxEra)):MAX_LVL)) return "Đã cấp tối đa.";
    if (b.lvl >= levelCap(c, b.k)) return hallLevel(c) ? `Cần nâng Đình làng lên cấp ${b.lvl + 1} trước.` : "Cần xây Đình làng (mở ở Thời đồ đồng) để nâng cấp công trình.";
    if (busyBuilders(c) >= builders(c)) return "Tất cả thợ đang bận.";
    const cost = levelCost(b.k, b.lvl + 1, c.era);
    const err = missing(c, cost);
    if (err) return err;
    pay(c, cost);
    recordBuildingInvestment(b,cost);
    b.doneAt = now + buildMs(b.k, b.lvl + 1);
    return null;
  }
  return "Hành động không hợp lệ.";
}
