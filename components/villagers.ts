import {bridgeDeck} from '@/lib/bridges';
import { BoundedCache } from "@/lib/bounded-cache";
// Client-side animation of the people stored on the server. Positions are visual only;
// what each person does (their task) comes from the server.
import { B, H, isRock, mineralResource, HL, O, R, W, buildings, refugePosition, cheb, explorerPos, haulPosition, herdById, idx, inb, type City, type Haul, type Person, type ResKey } from "@/lib/engine";
import { herdAnimals } from "./draw";

export type Job = "wood" | "quarry" | "gather" | "farm" | "build" | "smith" | "trade" | "hunt" | "explore" | "idle" | "other";

export type Villager = {
  fleeing?: boolean;
  health?:{hp:number;infected:boolean;down:boolean};
  headingX?:number; headingY?:number; previousX?:number; previousY?:number;
  key: string;
  id: number | null; // person id; null for builders (not people)
  name: string;
  job: Job;
  sig: string; // task signature, to notice reassignment
  home: number;
  work: number;
  state: "toWork" | "work" | "toHome" | "rest" | "wander" | "explore";
  path: [number, number][];
  pi: number;
  fx: number;
  fy: number;
  t: number;
  carry: ResKey | null;
  carrying: boolean;
  cargo?: number; // exact authoritative load; never increments in the renderer
  haulPhase?: Haul["phase"];
  shirt: string;
  skin: string;
  band: string;
  seed: number;
  visible: boolean;
  moving: boolean;
  run: boolean; // running pose and speed
  tx: number;
  ty: number;
  face: 1 | -1;
  hits: number; // spear throws / axe strikes this trip
  cool: number; // seconds until next strike or throw
  swing: number; // 0..1 strike animation, 1 = just struck
  authoritativeIdle?:boolean;
};

/** Short-lived visual effects: thrown spears and flying chips. */
export type Fx = { kind: "spear" | "chip"; x0: number; y0: number; x1: number; y1: number; t0: number; dur: number; col?: string };

const HOMES = new Set(["hut", "house", "stonehouse", "tilehouse", "tenement", "apartment"]);
const SKINS = ["#f1c9a0", "#d9a77a", "#b98057"];
const BANDS = ["#c9503e", "#e2b240", "#3f6fb0", "#5c9a8a"];
const JOB_OF: Record<string, Job> = { wood: "wood", quarry: "quarry", gather: "gather", farm: "farm", estate:"farm",coalmine:"quarry",charcoal:"smith",machine:"smith",factory:"smith",complex:"smith",nursery:"farm",thermal:"smith",hydro:"other",transport:"trade",hospital:"other",university:"other",treatment:"other",retention:"other", artisan:"smith", school:"other", reservoir:"other", smelter: "smith", forge: "smith", market: "trade", wheel: "farm" };
const SHIRT: Record<Job, string> = { wood: "#3f6fb0", quarry: "#8a8f96", gather: "#c9503e", farm: "#6f9a3a", build: "#e2b240", smith: "#5a4a40", trade: "#b6869f", hunt: "#7a5530", explore: "#2f8f8a", idle: "#a9779a", other: "#5c9a8a" };
const WALK = 0.9, RUN = 1.9; // tiles per second

const center = (i: number): [number, number] => [(i % W) + 0.5, Math.floor(i / W) + 0.5];
const tileOf = (fx: number, fy: number) => idx(Math.max(0, Math.min(W - 1, Math.floor(fx))), Math.max(0, Math.min(H - 1, Math.floor(fy))));

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;

/** Can a villager stand on this tile? (`water` = allow swimming) */
function passable(city: City, j: number, to: number, water: boolean, deck: ReadonlySet<number>) {
  if (isRock(city.t[j])) return false;
  if (j === to) return true;
  if (!water && city.t[j] === R && !deck.has(j)) return false;
  const b = city.b[j];
  return !b || b.k === "canal" || (b.k === "farm" || b.k === "estate") || b.k === "levee" || b.k === "gate" || (b.k === "ironbridge" || b.k === "bridgehead") && b.lvl>0;
}

/** 8-direction BFS (no corner cutting), then straightened so people walk diagonally instead of in steps. */
function findPath(city: City, from: number, to: number, water: boolean, deck:ReadonlySet<number>,exploredOnly=false): [number, number][] | null {
  if (isRock(city.t[to])) {
    const x = to % W, y = Math.floor(to / W);
    const paths = DIRS.filter(([dx,dy]) => inb(x+dx,y+dy) && passable(city,idx(x+dx,y+dy),-1,water,deck))
      .map(([dx,dy]) => findPath(city,from,idx(x+dx,y+dy),water,deck,exploredOnly)).filter((p): p is [number,number][] => p !== null);
    return paths.sort((a,b) => a.length-b.length)[0] ?? null;
  }
  if (from === to) return [center(to)];
  const prev = new Int32Array(W * H).fill(-1);
  const seen = new Uint8Array(W * H);
  const q = [from];
  seen[from] = 1;
  for (let h = 0; h < q.length && h < 9000; h++) {
    const i = q[h];
    if (i === to) break;
    const x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of DIRS) {
      if (!inb(x + dx, y + dy)) continue;
      const j = idx(x + dx, y + dy);
      if (seen[j] || exploredOnly&&!city.seen[j] || !passable(city, j, to, water, deck)) continue;
      if (dx && dy && (!passable(city, idx(x + dx, y), to, water, deck) || !passable(city, idx(x, y + dy), to, water, deck))) continue;
      seen[j] = 1; prev[j] = i; q.push(j);
    }
  }
  if (!seen[to]) return null;
  const tiles: number[] = [];
  for (let i = to; i !== -1; i = prev[i]) tiles.push(i);
  tiles.reverse();
  return smooth(city, tiles.map(center), to, water, deck,exploredOnly);
}

function clearSegment(city: City, a: [number, number], b: [number, number], to: number, water: boolean, deck: ReadonlySet<number>,exploredOnly=false) {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 4);
    for (let k = 1; k < n; k++) {
      const x = a[0] + ((b[0] - a[0]) * k) / n, y = a[1] + ((b[1] - a[1]) * k) / n;
      // keep a little clearance from blocked tiles
      for (const [ox, oy] of [[0, 0], [0.22, 0.22], [-0.22, 0.22], [0.22, -0.22], [-0.22, -0.22]]) {
        const tx = Math.floor(x + ox), ty = Math.floor(y + oy);
        if (!inb(tx, ty) || exploredOnly&&!city.seen[idx(tx,ty)] || !passable(city, idx(tx, ty), to, water, deck)) return false;
      }
    }
    return true;
}

/** Drop waypoints while the straight line to a later one stays on passable ground. */
function smooth(city: City, pts: [number, number][], to: number, water: boolean, deck: ReadonlySet<number>,exploredOnly=false) {
  const out: [number, number][] = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !clearSegment(city, pts[i], pts[j], to, water, deck,exploredOnly)) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

/** Prefer land, but swim across when the river is in the way (or the land detour is much longer). */
function route(city: City, from: number, to: number, deck:ReadonlySet<number>) {
  if (from === to) return [center(to)];
  if (clearSegment(city, center(from), center(to), to, false, deck)) return [center(from), center(to)];
  const land = findPath(city, from, to, false, deck);
  const any = findPath(city, from, to, true, deck);
  const len = (p: [number, number][] | null) => {
    if (!p) return Infinity;
    let d = 0;
    for (let k = 1; k < p.length; k++) d += Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]);
    return d;
  };
  return len(land) <= len(any) * 1.6 ? land : any;
}

function describe(city: City, p: Person): { job: Job; work: number; carry: ResKey | null; sig: string } {
  const tk = p.task;
  switch (tk.t) {
    case "work": {
      const k = city.b[tk.at]?.k ?? "hut";
      const res = (Object.keys(B[k].prod ?? {})[0] as ResKey | undefined) ?? null;
      return { job: JOB_OF[k] ?? "other", work: tk.at, carry: res, sig: `w${tk.at}` };
    }
    case "chop": return { job: "wood", work: tk.at, carry: "wood", sig: `c${tk.at}` };
    case "mine": return { job: "quarry", work: tk.at, carry: mineralResource(city.t[tk.at]), sig: `m${tk.at}` };
    case "hunt": return { job: "hunt", work: herdById(city, tk.herd)?.at ?? city.camp, carry: "food", sig: `h${tk.herd}` };
    case "explore": return { job: "explore", work: tk.to, carry: null, sig: `e${tk.to}:${tk.start}` };
    default: return { job: "idle", work: tk.at ?? -1, carry: null, sig: `i${tk.at ?? ""}` };
  }
}

const CARDINAL_DIRS=DIRS.slice(0,4);

export class Crowd {
  list: Villager[] = [];
  fx: Fx[] = [];
  chopping = new Set<number>(); // tiles with an axe swinging right now
  private paths = new BoundedCache<string, [number, number][] | null>(128, 16384, path=>path?.length??1);
  private homes: number[] = [];
  private idleChoices = new Map<number,{tile:number;capacity:number}[]>();
  private idleRegions = new Uint16Array(W*H);
  private idleTotals = new Map<number,number>();

  private indexIdleHomes(city:City) {
    const regions=this.idleRegions;regions.fill(0);let region=0;
    for(let start=0;start<W*H;start++)if(city.seen[start]&&!regions[start]&&passable(city,start,-1,false,this.deck)){
      const queue=[start];regions[start]=++region;
      for(let head=0;head<queue.length;head++){
        const i=queue[head],x=i%W,y=Math.floor(i/W);
        for(const [dx,dy]of CARDINAL_DIRS)if(inb(x+dx,y+dy)){
          const j=idx(x+dx,y+dy);
          if(city.seen[j]&&!regions[j]&&passable(city,j,-1,false,this.deck)){regions[j]=region;queue.push(j);}
        }
      }
    }
    this.idleChoices.clear();
    for(const home of this.homes){
      const b=city.b[home],seen=new Set<number>();
      for(const [dx,dy]of CARDINAL_DIRS){
        const x=home%W+dx,y=Math.floor(home/W)+dy;if(!inb(x,y))continue;
        const tile=idx(x,y),key=regions[tile];if(!key||seen.has(key)||!city.seen[tile])continue;seen.add(key);
        const choices=this.idleChoices.get(key)??[];
        choices.push({tile,capacity:Math.max(1,(B[b.k].house??1)*b.lvl)});this.idleChoices.set(key,choices);
      }
    }
    this.idleTotals.clear();
    for(const [key,choices]of this.idleChoices){let total=0;for(const h of choices){total+=h.capacity;h.capacity=total;}this.idleTotals.set(key,total);}
  }

  private idleHome(city:City,p:Person) {
    const origin=p.pos??city.camp,x=origin%W,y=Math.floor(origin/W);
    let region=this.idleRegions[origin];
    if(!region)for(const [dx,dy]of CARDINAL_DIRS)if(inb(x+dx,y+dy)&&this.idleRegions[idx(x+dx,y+dy)]){region=this.idleRegions[idx(x+dx,y+dy)];break;}
    const choices=this.idleChoices.get(region);if(!choices?.length)return origin;
    const slot=(Math.imul(p.id,2654435761)>>>0)%this.idleTotals.get(region)!;
    let low=0,high=choices.length-1;
    while(low<high){const mid=(low+high)>>>1;if(slot<choices[mid].capacity)high=mid;else low=mid+1;}
    return choices[low].tile;
  }

  private goIdle(v:Villager,city:City) {
    const from=tileOf(v.fx,v.fy),key=`idle:${from}>${v.home}`;
    let path=this.paths.get(key);
    if(path===undefined){path=findPath(city,from,v.home,false,this.deck,true);this.paths.set(key,path);}
    if(!path){v.state='rest';v.t=3;return;}
    v.path=path.length>1?path.slice(1):path.slice();v.pi=0;v.state='toHome';v.run=false;
  }
  private people = new Map<number,Person>();
  private peopleSource?: City['people'];
  private peopleCount = 0;
  private farmSlots = new Map<number,number>();

  private indexFarmSlots(city:City) {
    this.farmSlots.clear();
    const groups=new Map<number,number[]>();
    for(const p of city.people)if(p.task.t==='work'&&['farm','estate'].includes(city.b[p.task.at]?.k)){
      const ids=groups.get(p.task.at);if(ids)ids.push(p.id);else groups.set(p.task.at,[p.id]);
    }
    for(const ids of groups.values()){
      ids.sort((a,b)=>a-b);
      ids.forEach((id,slot)=>this.farmSlots.set(id,slot%4));
    }
  }
  private waterMask = new Uint8Array(W * H);
  private obstacles = "";
  private exploredMask = new Uint8Array(W*H);
  private hasTopology = false;
  private deck:ReadonlySet<number>=new Set();

  /** Routes depend only on water and blocking tiles, never on resource ticks or task sync. */
  private syncTopology(city: City) {
    let changed = !this.hasTopology;
    this.deck=bridgeDeck(city);
    for (let i = 0; i < W * H; i++) {
      const explored=Number(!!city.seen[i]);
      if(this.exploredMask[i]!==explored){this.exploredMask[i]=explored;changed=true;}
      const water = city.t[i] === R && !this.deck.has(i) ? 1 : isRock(city.t[i]) ? 2 : 0;
      if (this.waterMask[i] !== water) { this.waterMask[i] = water; changed = true; }
    }
    const obstacles = Object.keys(city.b).filter((i) => !passable(city, Number(i), -1, true,this.deck)).join(",");
    if (obstacles !== this.obstacles) { this.obstacles = obstacles; changed = true; }
    this.hasTopology = true;
    if (changed) this.paths.clear();
    return changed;
  }

  private path(city: City, a: number, b: number) {
    const k = a + ">" + b;
    const cached=this.paths.get(k);
    if(cached!==undefined)return cached;
    const path=route(city,a,b,this.deck);this.paths.set(k,path);return path;
  }

  private nearestHome(city: City, to: number) {
    let best = city.camp, bd = 1e9;
    for (const h of this.homes) { const d = cheb(h, to); if (d < bd) { bd = d; best = h; } }
    return best;
  }

  private syncPeople(city: City) {
    this.people.clear();
    for (const p of city.people) this.people.set(p.id,p);
    this.peopleSource = city.people;
    this.peopleCount = city.people.length;
  }

  /** Match the visual crowd to the server's people and builders. */
  sync(city: City) {
    // Each new snapshot replaces Person references even when IDs are unchanged.
    this.syncPeople(city);
    this.indexFarmSlots(city);
    const topologyChanged = this.syncTopology(city);
    const entries = buildings(city);
    this.homes = entries.filter(([, b]) => HOMES.has(b.k) && b.lvl >= 1 && !b.flooded && !b.burned).map(([i]) => i);
    this.indexIdleHomes(city);
    const danger=!!(city.raid||city.raidEncounter||city.battleId||city.zombies?.actors.some(z=>z.hp>0&&z.until>city.last));
    const homeByTarget = new Map<number,number>();
    let offices: number[] | undefined;
    const old = new Map(this.list.map((v) => [v.key, v]));
    const next: Villager[] = [];
    for (const p of city.people) {
      const d = describe(city, p);
      const key = `p${p.id}`, prev = old.get(key);
      const target = d.work >= 0 ? d.work : city.camp;
      let home = d.job === "idle" && d.work >= 0 ? d.work : homeByTarget.get(target);
      if (home === undefined) { home = this.nearestHome(city,target); homeByTarget.set(target,home); }
      const freeIdle=p.task.t==='idle'&&p.task.at===undefined&&!p.haul&&!p.refuge&&!p.vital?.paused&&p.vital?.infectedAt===undefined&&(p.vital?.hp??100)>=100;
      if(freeIdle)home=danger?(p.pos??city.camp):this.idleHome(city,p);
      if (prev) {
        const homeChanged=prev.home!==home;
        if (prev.sig !== d.sig) {
          Object.assign(prev, d, { home });
          if (!p.haul && (p.task.t === "idle" || p.task.t === "explore")) this.start(prev, city, true);
        }
        prev.home = home;
        if(freeIdle&&!danger&&(homeChanged||topologyChanged))this.goIdle(prev,city);
        if (!freeIdle && !p.haul && (p.task.t === "idle" || p.task.t === "explore") && topologyChanged && (prev.state === "toHome" || prev.state === "toWork")) {
          this.go(prev, city, tileOf(prev.fx, prev.fy), prev.state === "toHome" ? home : prev.work, prev.state, prev.run);
        }
        next.push(prev);
        continue;
      }
      const seed = ((p.id * 0.618) % 1 + 1) % 1;
      const [fx, fy] = center(p.haul?.tile ?? p.pos ?? home);
      const v: Villager = {
        key, id: p.id, name: p.name, ...d, home, state: "rest", path: [], pi: 0, fx: fx + (seed - 0.5) * 0.6, fy: fy + 0.3,
        t: seed * 3, carrying: false, shirt: SHIRT[d.job], skin: SKINS[p.id % 3], band: BANDS[p.id % 4], seed,
        visible: true, moving: false, run: false, tx: fx, ty: fy, face: seed < 0.5 ? 1 : -1, hits: 0, cool: 0, swing: 0,
      };
      if (p.haul) this.haulVisual(v, city, p, 0, city.last, performance.now());
      else if (p.task.t === "idle" || p.task.t === "explore") this.start(v, city, false);
      else { v.state = "rest"; v.carrying = false; v.cargo = 0; }
      next.push(v);
    }
    for (const [i, b] of entries) {
      if (!b.doneAt) continue;
      const key = `b${i}`, prev = old.get(key);
      if (prev) {
        if (topologyChanged && (prev.state === "toWork" || prev.state === "rest")) this.go(prev, city, tileOf(prev.fx,prev.fy), i, "toWork", false);
        next.push(prev); continue;
      }
      const seed = ((i * 0.618) % 1 + 1) % 1;
      offices ??= entries.filter(([,office])=>office.k==="builderhouse"&&office.lvl>=1&&!office.burned&&!office.flooded).map(([tile])=>tile);
      let origin = city.camp, distance = Infinity;
      for (const tile of offices) { const d = cheb(tile,i); if (d < distance) { origin = tile; distance = d; } }
      const [fx, fy] = center(origin);
      const actor: Villager = {
        key, id: null, name: "Thợ xây", job: "build", sig: key, home: origin, work: i, state: "rest", path: [], pi: 0, fx, fy, t: 1e9,
        carry: null, carrying: false, shirt: SHIRT.build, skin: SKINS[i % 3], band: BANDS[0], seed, visible: true, moving: false, run: false,
        tx: fx, ty: fy, face: -1, hits: 0, cool: 0, swing: 0,
      };
      this.go(actor, city, origin, i, "toWork", false);
      next.push(actor);
    }
    this.list = next;
  }

  /** (Re)start a villager's routine. `ordered` = the player just gave the order, so they run. */
  private start(v: Villager, city: City, ordered: boolean) {
    v.shirt = SHIRT[v.job];
    v.carrying = false; v.hits = 0;
    const here = tileOf(v.fx, v.fy);
    if (v.job === "explore") { v.state = "explore"; v.run = false; return; }
    if (v.job === "idle") {
      if (v.work >= 0 && ordered) { this.go(v, city, here, v.work, "toWork", true); return; }
      if(v.work<0&&here!==v.home){this.goIdle(v,city);return;}
      v.state = "wander"; v.tx = v.fx; v.ty = v.fy; return;
    }
    this.go(v, city, here, v.work, "toWork", ordered);
  }

  /** A standing spot on the near side of a tile so the worker isn't hidden behind it. */
  private spot(i: number, seed: number, job: Job): [number, number] {
    const [cx, cy] = center(i);
    if (job === "wood" || job === "quarry") return [cx + 0.18 + seed * 0.2, cy + 0.44];
    if (job === "idle") return [cx + (seed - 0.5) * 0.5, cy + (seed - 0.5) * 0.3];
    return seed < 0.5 ? [cx + 0.45, cy + (seed - 0.25) * 0.8] : [cx + (seed - 0.75) * 0.8, cy + 0.45];
  }

  private go(v: Villager, city: City, from: number, to: number, next: Villager["state"], run: boolean) {
    const p = this.path(city, from, to);
    v.run = run;
    if (!p && v.job === "build") { v.state = "rest"; v.path = []; v.moving = false; v.swing = 0; return; }
    if (!p) { v.state = next === "toWork" ? "work" : "rest"; v.t = 6; [v.fx, v.fy] = this.spot(to, v.seed, v.job); return; }
    v.path = p.length > 1 ? p.slice(1) : p.slice(); // start from where they stand, not the tile centre
    v.path[v.path.length - 1] = next === "toWork" ? this.spot(to, v.seed, v.job) : center(to);
    v.pi = 0;
    v.state = next;
  }

  private emit(f: Omit<Fx, "t0">) { this.fx.push({ ...f, t0: performance.now() }); }

  update(city: City, dt: number, now: number) {
    const tnow = performance.now();
    this.fx = this.fx.filter((f) => tnow - f.t0 < f.dur * 1000);
    this.chopping.clear();
    // State may mutate in place between snapshots; rebuild once, never per actor.
    this.indexFarmSlots(city);

    // Normal frames reuse the index. Array replacement or population changes
    // also work for callers advancing a mutable city between explicit syncs.
    if (this.peopleSource !== city.people || this.peopleCount !== city.people.length) this.syncPeople(city);
    const people = this.people;
    const danger=!!(city.raid||city.raidEncounter||city.battleId||city.zombies?.actors.some(z=>z.hp>0&&z.until>now));
    for (const v of this.list) {
      v.visible = true;
      v.moving = false;
      v.swing = Math.max(0, v.swing - dt * 3);
      const person = v.id === null ? undefined : people.get(v.id);
      const health=person?.vital;v.health=health?{hp:health.hp,infected:health.infectedAt!==undefined,down:health.downAt!==undefined}:undefined;
      const refuge=person?refugePosition(person,now):null;
      if(refuge){
        v.fleeing=true;
        const dx=refuge.x-v.fx,dy=refuge.y-v.fy;
        if(Math.abs(dx-dy)>1e-4)v.face=dx-dy>=0?1:-1;
        v.fx=refuge.x;v.fy=refuge.y;v.visible=!refuge.hidden || !city.b[person!.refuge!.building!]?.lvl || !!city.b[person!.refuge!.building!]?.burned || !!city.b[person!.refuge!.building!]?.flooded;v.moving=refuge.moving;v.run=refuge.moving;
        v.state=refuge.moving?(refuge.returning?"toWork":"toHome"):"rest";
        v.cargo=person?.haul?.carried??0;v.carrying=v.cargo>0;v.carry=person?.haul?.resource??null;v.swing=0;
        continue;
      }
      if(v.fleeing){delete v.fleeing;v.run=false;if(person && !person.haul)this.start(v,city,false);}
      if(v.id===null && (city.battleId || city.raid || city.raidEncounter)){v.visible=false;continue;}
      if(person?.vital?.ambulance!==undefined){v.visible=false;v.moving=false;v.swing=0;v.fx=person.vital.x??v.fx;v.fy=person.vital.y??v.fy;continue;}
      if(person?.vital?.paused){const vital=person.vital;const dx=(vital.x??v.fx)-v.fx,dy=(vital.y??v.fy)-v.fy;v.fx=vital.x??v.fx;v.fy=vital.y??v.fy;v.moving=Math.hypot(dx,dy)>.001;v.run=v.moving;v.state='rest';v.swing=0;v.visible=vital.shelter===undefined&&!(vital.care&&now>=vital.care.arrive);if(Math.abs(dx-dy)>.001)v.face=dx-dy>=0?1:-1;continue;}
      if (person?.haul) { this.haulVisual(v, city, person, dt, now, tnow); continue; }
      if(person?.task.t==='idle'&&person.task.at===undefined){
        if(danger||person.vital?.infectedAt!==undefined||(person.vital?.hp??100)<100){
          [v.fx,v.fy]=center(person.pos??city.camp);v.state='rest';v.moving=false;v.swing=0;v.authoritativeIdle=true;continue;
        }
        if(v.authoritativeIdle){delete v.authoritativeIdle;this.start(v,city,false);}
      }
      if (person && person.task.t !== "idle" && person.task.t !== "explore") {
        // A newly assigned worker waits for the engine's first haul tick; no decorative income cycle.
        v.state = "rest"; v.moving = false; v.run = false; v.swing = 0;
        v.carrying = false; v.cargo = 0; v.haulPhase = undefined;
        continue;
      }
      if (v.haulPhase && person) this.start(v, city, person.task.t === "idle" && person.task.at !== undefined);
      v.haulPhase = undefined; v.cargo = 0;
      switch (v.state) {
        case "explore": {
          const p = person;
          if (p && p.task.t === "explore") {
            const tk = p.task;
            const [sx, sy, prog] = explorerPos(tk, now);
            const ddx = (tk.to % W) - (tk.from % W), ddy = Math.floor(tk.to / W) - Math.floor(tk.from / W);
            const len = Math.hypot(ddx, ddy) || 1, side = ((p.id % 5) - 2) * 0.28;
            const x = sx + (-ddy / len) * side, y = sy + (ddx / len) * side;
            v.face = ddx - ddy >= 0 ? 1 : -1;
            const gx = x - v.fx, gy = y - v.fy, gap = Math.hypot(gx, gy);
            if (gap > 0.6) {
              const st = Math.min(gap, RUN * 1.2 * dt);
              v.fx += (gx / gap) * st; v.fy += (gy / gap) * st;
              v.face = gx - gy >= 0 ? 1 : -1;
              v.run = true;
            } else { v.fx = x; v.fy = y; v.run = false; }
            v.moving = prog < 1;
          }
          break;
        }
        case "rest":
          if (v.job === "build") break; // A blocked builder waits for topology to change.
          v.visible = v.job === "idle" || v.id === null;
          v.t -= dt;
          if (v.t <= 0) {
            if (v.job === "idle") v.state = "wander";
            else { [v.fx, v.fy] = center(v.home); v.carrying = false; v.hits = 0; this.go(v, city, v.home, v.work, "toWork", false); }
          }
          break;
        case "work":
          this.work(v, city, dt, tnow);
          break;
        case "toWork":
        case "toHome": {
          const x0 = v.fx, y0 = v.fy;
          const done = this.walk(v, city, dt);
          const sdx = v.fx - x0 - (v.fy - y0);
          if (Math.abs(sdx) > 1e-4) v.face = sdx > 0 ? 1 : -1;
          v.moving = true;
          if (done) {
            if (v.state === "toWork") {
              v.run = false;
              if (v.job === "idle") { v.state = "wander"; v.tx = v.fx; v.ty = v.fy; v.t = 1; }
              else { v.state = "work"; v.t = 7 + v.seed * 5; v.hits = 0; v.cool = 0.5; }
            } else { v.state = "rest"; v.t = 2 + v.seed * 3; if(v.job==="idle"){v.tx=v.fx;v.ty=v.fy;} }
          }
          break;
        }
        case "wander": {
          if (v.t > 0) { v.t -= dt; break; }
          const dx = v.tx - v.fx, dy = v.ty - v.fy, d = Math.hypot(dx, dy);
          if (d < 0.05) {
            const [hx, hy] = v.home >= 0 ? center(v.home) : center(city.camp);
            const rad = v.job === "idle" && v.work >= 0 ? 1.4 : 3.5;
            for (let k = 0; k < 6; k++) {
              const nx = hx + (Math.random() - 0.5) * rad, ny = hy + (Math.random() - 0.5) * rad;
              const j = tileOf(nx, ny);
              if (inb(Math.floor(nx), Math.floor(ny)) && city.seen[j] && passable(city,j,-1,false,this.deck) && !city.b[j] && clearSegment(city,[v.fx,v.fy],[nx,ny],-1,false,this.deck,true)) { v.tx = nx; v.ty = ny; break; }
            }
            v.t = 1 + Math.random() * 3;
          } else {
            const step = Math.min(d, WALK * 0.6 * dt * (city.t[tileOf(v.fx, v.fy)] === R && !this.deck.has(tileOf(v.fx,v.fy)) ? 0.5 : 1));
            v.fx += (dx / d) * step; v.fy += (dy / d) * step; v.moving = true;
            const sdx = (dx - dy) / d; if (Math.abs(sdx) > 0.05) v.face = sdx > 0 ? 1 : -1;
          }
          break;
        }
      }
    }
    // Retain the actual world-space heading for every path (hauling, fleeing,
    // swimming and wandering), including paths that returned early above.
    for(const v of this.list){
      const dx=v.fx-(v.previousX??v.fx),dy=v.fy-(v.previousY??v.fy);
      if(Math.hypot(dx,dy)>1e-6){v.headingX=dx;v.headingY=dy;}
      v.previousX=v.fx;v.previousY=v.fy;
    }
  }

  /** Render the same timestamped movement and cargo as the deterministic economy. */
  private haulVisual(v: Villager, city: City, p: Person, dt: number, now: number, tnow: number) {
    const h = p.haul;
    if (!h) return;
    const position = haulPosition(p, now);
    if (!position) return;
    const dx = position.x - v.fx, dy = position.y - v.fy;
    if (Math.abs(dx - dy) > 1e-5) v.face = dx - dy >= 0 ? 1 : -1;
    v.fx = position.x; v.fy = position.y;
    // A farming assignment alone does not mean the worker has reached the field.
    const farming = h.phase === "work" && !h.resting && (h.workRate ?? 0) > 0
      && p.task.t === "work" && ["farm","estate"].includes(city.b[p.task.at]?.k) && h.tile === p.task.at;
    // Distinct places in the front crop rows, only while actually farming.
    if (farming && p.task.t === "work") {
      const tile=p.task.at;
      const slot=this.farmSlots.get(p.id)??0;
      const offsets=[[-.14,.32],[.32,-.14],[-.3,.05],[.05,-.3]];
      v.fx += offsets[slot][0]; v.fy += offsets[slot][1];
    }
    v.shirt = SHIRT[v.job];
    v.haulPhase = h.phase; v.cargo = h.carried;
    v.carry = h.resource ?? null; v.carrying = h.carried > 0;
    v.moving = (h.phase === "travel" || h.phase === "return") && now < h.nextAt;
    v.run = false; v.visible = true;
    v.state = h.resting && h.phase !== "travel" ? "rest" : h.phase === "travel" ? "toWork" : h.phase === "work" ? "work" : "toHome";
    if (v.job === "farm" && v.state === "work" && !farming) v.state = "rest";
    if (h.drop !== undefined) v.home = h.drop;
    if (h.source) v.work = h.source.kind === "herd" ? herdById(city, h.source.key)?.at ?? h.tile : h.source.key;
    if (h.phase !== "work" || !(h.workRate && h.workRate > 0)) { v.swing = 0; return; }
    v.cool -= dt;
    if (v.job === "wood") this.chopping.add(v.work);
    if (v.cool > 0) return;
    if (v.job === "hunt") {
      const herd = h.source?.kind === "herd" ? herdById(city, h.source.key) : city.herds.find((herd) => herd.at === v.work);
      const animal = herd ? herdAnimals(city, herd, tnow)[0] : undefined;
      if (animal) { v.swing = 1; v.cool = 2.2 + v.seed; this.emit({ kind: "spear", x0: v.fx, y0: v.fy, x1: animal.fx, y1: animal.fy, dur: .55 }); }
    } else if (v.job === "wood" || v.job === "quarry" || v.job === "smith") {
      v.swing = 1; v.cool = .9 + v.seed * .3;
      const col = v.job === "wood" ? "#d9b07a" : v.job === "smith" ? "#ffcf5a" : "#d8d2c4";
      for (let k = 0; k < 3; k++) {
        const angle = Math.random() * Math.PI * 2;
        this.emit({ kind: "chip", x0: v.fx, y0: v.fy, x1: v.fx + Math.cos(angle) * .4, y1: v.fy + Math.sin(angle) * .4, dur: .5, col });
      }
    }
  }

  /** What a villager does once they reach their job. */
  private work(v: Villager, city: City, dt: number, tnow: number) {
    v.t -= dt;
    v.cool -= dt;
    if (v.job === "hunt") {
      const herd = city.herds.find((h) => h.at === v.work);
      const animals = herd ? herdAnimals(city, herd, tnow) : [];
      if (!animals.length) { if (v.t <= 0) this.goHome(v, city); return; }
      // chase the nearest animal, keep a throwing distance
      let a = animals[0], bd = 1e9;
      for (const an of animals) { const d = Math.hypot(an.fx - v.fx, an.fy - v.fy); if (d < bd) { bd = d; a = an; } }
      const dx = a.fx - v.fx, dy = a.fy - v.fy, d = Math.hypot(dx, dy) || 1;
      v.face = dx - dy >= 0 ? 1 : -1;
      if (d > 1.4) {
        const st = Math.min(d - 1.2, RUN * dt);
        v.fx += (dx / d) * st; v.fy += (dy / d) * st; v.moving = true; v.run = true;
      } else {
        v.run = false;
        if (v.cool <= 0) {
          v.swing = 1; v.cool = 2.2 + v.seed; v.hits++;
          this.emit({ kind: "spear", x0: v.fx, y0: v.fy, x1: a.fx, y1: a.fy, dur: 0.55 });
        }
        if (v.hits >= 3 && v.cool > 1.5) { v.carrying = true; this.goHome(v, city); }
      }
      return;
    }
    if (v.job === "wood" || v.job === "quarry" || v.job === "build" || v.job === "smith") {
      if (v.job === "wood") this.chopping.add(v.work);
      if (v.cool <= 0) {
        v.swing = 1; v.cool = 0.9 + v.seed * 0.3; v.hits++;
        const [cx, cy] = center(v.work);
        const col = v.job === "wood" ? "#d9b07a" : v.job === "smith" ? "#ffcf5a" : "#d8d2c4";
        for (let k = 0; k < 3; k++) {
          const ang = Math.random() * Math.PI * 2;
          this.emit({ kind: "chip", x0: cx + 0.15, y0: cy + 0.3, x1: cx + 0.15 + Math.cos(ang) * 0.4, y1: cy + 0.3 + Math.sin(ang) * 0.4, dur: 0.5, col });
        }
      }
    }
    if (v.t <= 0 && v.id !== null) { v.carrying = true; this.goHome(v, city); }
  }

  private goHome(v: Villager, city: City) {
    this.go(v, city, tileOf(v.fx, v.fy), v.home, "toHome", false);
  }

  private walk(v: Villager, city: City, dt: number) {
    const swim = city.t[tileOf(v.fx, v.fy)] === R && !this.deck.has(tileOf(v.fx,v.fy));
    let left = (v.run ? RUN : WALK) * (swim ? 0.45 : 1) * (v.carrying ? 0.85 : 1) * dt;
    while (left > 0 && v.pi < v.path.length) {
      const [tx, ty] = v.path[v.pi];
      const dx = tx - v.fx, dy = ty - v.fy, d = Math.hypot(dx, dy);
      if (d <= left) { v.fx = tx; v.fy = ty; v.pi++; left -= d; }
      else { v.fx += (dx / d) * left; v.fy += (dy / d) * left; left = 0; }
    }
    return v.pi >= v.path.length;
  }
}
