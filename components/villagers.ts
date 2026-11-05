// Client-side animation of the people stored on the server. Positions are visual only;
// what each person does (their task) comes from the server.
import { B, H, R, W, buildings, cheb, explorerPos, herdById, idx, inb, type City, type Person, type ResKey } from "@/lib/engine";
import { herdAnimals } from "./draw";

export type Job = "wood" | "quarry" | "gather" | "farm" | "build" | "smith" | "trade" | "hunt" | "explore" | "idle" | "other";

export type Villager = {
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
};

/** Short-lived visual effects: thrown spears and flying chips. */
export type Fx = { kind: "spear" | "chip"; x0: number; y0: number; x1: number; y1: number; t0: number; dur: number; col?: string };

const HOMES = new Set(["hut", "house", "stonehouse"]);
const SKINS = ["#f1c9a0", "#d9a77a", "#b98057"];
const BANDS = ["#c9503e", "#e2b240", "#3f6fb0", "#5c9a8a"];
const JOB_OF: Record<string, Job> = { wood: "wood", quarry: "quarry", gather: "gather", farm: "farm", smelter: "smith", forge: "smith", market: "trade", wheel: "farm" };
const SHIRT: Record<Job, string> = { wood: "#3f6fb0", quarry: "#8a8f96", gather: "#c9503e", farm: "#6f9a3a", build: "#e2b240", smith: "#5a4a40", trade: "#b6869f", hunt: "#7a5530", explore: "#2f8f8a", idle: "#a9779a", other: "#5c9a8a" };
const WALK = 0.9, RUN = 1.9; // tiles per second

const center = (i: number): [number, number] => [(i % W) + 0.5, Math.floor(i / W) + 0.5];
const tileOf = (fx: number, fy: number) => idx(Math.max(0, Math.min(W - 1, Math.floor(fx))), Math.max(0, Math.min(H - 1, Math.floor(fy))));

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;

/** Can a villager stand on this tile? (`water` = allow swimming) */
function passable(city: City, j: number, to: number, water: boolean) {
  if (j === to) return true;
  if (!water && city.t[j] === R) return false;
  const b = city.b[j];
  return !b || b.k === "canal" || b.k === "farm" || b.k === "levee";
}

/** 8-direction BFS (no corner cutting), then straightened so people walk diagonally instead of in steps. */
function findPath(city: City, from: number, to: number, water: boolean): [number, number][] | null {
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
      if (seen[j] || !passable(city, j, to, water)) continue;
      if (dx && dy && (!passable(city, idx(x + dx, y), to, water) || !passable(city, idx(x, y + dy), to, water))) continue;
      seen[j] = 1; prev[j] = i; q.push(j);
    }
  }
  if (!seen[to]) return null;
  const tiles: number[] = [];
  for (let i = to; i !== -1; i = prev[i]) tiles.push(i);
  tiles.reverse();
  return smooth(city, tiles.map(center), to, water);
}

/** Drop waypoints while the straight line to a later one stays on passable ground. */
function smooth(city: City, pts: [number, number][], to: number, water: boolean) {
  const clear = (a: [number, number], b: [number, number]) => {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 4);
    for (let k = 1; k < n; k++) {
      const x = a[0] + ((b[0] - a[0]) * k) / n, y = a[1] + ((b[1] - a[1]) * k) / n;
      // keep a little clearance from blocked tiles
      for (const [ox, oy] of [[0, 0], [0.22, 0.22], [-0.22, 0.22], [0.22, -0.22], [-0.22, -0.22]]) {
        const tx = Math.floor(x + ox), ty = Math.floor(y + oy);
        if (!inb(tx, ty) || !passable(city, idx(tx, ty), to, water)) return false;
      }
    }
    return true;
  };
  const out: [number, number][] = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !clear(pts[i], pts[j])) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

/** Prefer land, but swim across when the river is in the way (or the land detour is much longer). */
function route(city: City, from: number, to: number) {
  const land = findPath(city, from, to, false);
  const any = findPath(city, from, to, true);
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
    case "mine": return { job: "quarry", work: tk.at, carry: city.t[tk.at] === 4 ? "copper" : "stone", sig: `m${tk.at}` };
    case "hunt": return { job: "hunt", work: herdById(city, tk.herd)?.at ?? city.camp, carry: "food", sig: `h${tk.herd}` };
    case "explore": return { job: "explore", work: tk.to, carry: null, sig: `e${tk.to}:${tk.start}` };
    default: return { job: "idle", work: tk.at ?? -1, carry: null, sig: `i${tk.at ?? ""}` };
  }
}

export class Crowd {
  list: Villager[] = [];
  fx: Fx[] = [];
  chopping = new Set<number>(); // tiles with an axe swinging right now
  private paths = new Map<string, [number, number][] | null>();
  private homes: number[] = [];

  private path(city: City, a: number, b: number) {
    const k = a + ">" + b;
    if (!this.paths.has(k)) this.paths.set(k, route(city, a, b));
    return this.paths.get(k)!;
  }

  private nearestHome(city: City, to: number) {
    let best = city.camp, bd = 1e9;
    for (const h of this.homes) { const d = cheb(h, to); if (d < bd) { bd = d; best = h; } }
    return best;
  }

  /** Match the visual crowd to the server's people and builders. */
  sync(city: City) {
    this.paths.clear();
    this.homes = buildings(city).filter(([, b]) => HOMES.has(b.k) && b.lvl >= 1 && !b.flooded).map(([i]) => i);
    const old = new Map(this.list.map((v) => [v.key, v]));
    const next: Villager[] = [];
    for (const p of city.people) {
      const d = describe(city, p);
      const key = `p${p.id}`, prev = old.get(key);
      const home = d.job === "idle" && d.work >= 0 ? d.work : this.nearestHome(city, d.work >= 0 ? d.work : city.camp);
      if (prev) {
        if (prev.sig !== d.sig) {
          Object.assign(prev, d, { home });
          this.start(prev, city, true);
        }
        prev.home = home;
        next.push(prev);
        continue;
      }
      const seed = ((p.id * 0.618) % 1 + 1) % 1;
      const [fx, fy] = center(home);
      const v: Villager = {
        key, id: p.id, name: p.name, ...d, home, state: "rest", path: [], pi: 0, fx: fx + (seed - 0.5) * 0.6, fy: fy + 0.3,
        t: seed * 3, carrying: false, shirt: SHIRT[d.job], skin: SKINS[p.id % 3], band: BANDS[p.id % 4], seed,
        visible: true, moving: false, run: false, tx: fx, ty: fy, face: seed < 0.5 ? 1 : -1, hits: 0, cool: 0, swing: 0,
      };
      this.start(v, city, false);
      next.push(v);
    }
    for (const [i, b] of buildings(city)) {
      if (!b.doneAt) continue;
      const key = `b${i}`, prev = old.get(key);
      if (prev) { next.push(prev); continue; }
      const seed = ((i * 0.618) % 1 + 1) % 1;
      const [fx, fy] = this.spot(i, seed, "build");
      next.push({
        key, id: null, name: "Thợ xây", job: "build", sig: key, home: i, work: i, state: "work", path: [], pi: 0, fx, fy, t: 1e9,
        carry: null, carrying: false, shirt: SHIRT.build, skin: SKINS[i % 3], band: BANDS[0], seed, visible: true, moving: false, run: false,
        tx: fx, ty: fy, face: -1, hits: 0, cool: 0, swing: 0,
      });
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
    for (const v of this.list) {
      v.visible = true;
      v.moving = false;
      v.swing = Math.max(0, v.swing - dt * 3);
      switch (v.state) {
        case "explore": {
          const p = city.people.find((q) => q.id === v.id);
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
            } else { v.state = "rest"; v.t = 2 + v.seed * 3; }
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
              if (inb(Math.floor(nx), Math.floor(ny)) && city.t[j] !== R && !city.b[j]) { v.tx = nx; v.ty = ny; break; }
            }
            v.t = 1 + Math.random() * 3;
          } else {
            const step = Math.min(d, WALK * 0.6 * dt * (city.t[tileOf(v.fx, v.fy)] === R ? 0.5 : 1));
            v.fx += (dx / d) * step; v.fy += (dy / d) * step; v.moving = true;
            const sdx = (dx - dy) / d; if (Math.abs(sdx) > 0.05) v.face = sdx > 0 ? 1 : -1;
          }
          break;
        }
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
    const swim = city.t[tileOf(v.fx, v.fy)] === R;
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
