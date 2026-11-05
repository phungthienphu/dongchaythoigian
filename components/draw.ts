// Isometric 2.5D renderer. Tile (x, y) has float coords (fx, fy) in [x, x+1) × [y, y+1);
// screen = (ox + (fx - fy) * TW/2, oy + (fx + fy) * TH/2 - z).
import { B, CAP, F, G, H, HL, N4, N8, O, R, UKEYS, W, buildings, campById, canPlace, idx, inb, riverSet, seasonAt, troopCount, type BKey, type Camp, type City, type Derived, type UKey } from "@/lib/engine";
import type { Fx, Villager } from "./villagers";

export type View = { TW: number; TH: number; ox: number; oy: number; width: number; height: number; s: number };

export function makeView(width: number): View {
  let TW = Math.max(24, Math.min(160, Math.floor(width / ((W + H) / 2))));
  TW -= TW % 2;
  const TH = TW / 2, s = TW / 64, ox = (H * TW) / 2, oy = Math.round(TW * 1.3);
  return { TW, TH, ox, oy, s, width: ((W + H) * TW) / 2, height: oy + ((W + H) * TH) / 2 + Math.round(16 * s) + 4 };
}

/** Base view that fits the whole map inside a w × h canvas. */
export function fitView(w: number, h: number): View {
  let TW = Math.floor(Math.min(w / ((W + H) / 2), h / ((W + H) / 4 + 1.7)));
  TW = Math.max(16, TW - (TW % 2));
  const TH = TW / 2, mapW = ((W + H) * TW) / 2, mapH = ((W + H) * TH) / 2 + TW * 1.3;
  const ox = (w - mapW) / 2 + (H * TW) / 2, oy = (h - mapH) / 2 + TW * 1.3;
  return { TW, TH, ox, oy, s: TW / 64, width: w, height: h };
}

export type Cam = { zoom: number; px: number; py: number };
export const MIN_ZOOM = 1, MAX_ZOOM = 18;

/** The fitted view after zooming by cam.zoom and panning by (px, py). */
export function camView(f: View, cam: Cam): View {
  const z = cam.zoom, TW = f.TW * z;
  return { TW, TH: TW / 2, s: TW / 64, ox: cam.px + f.ox * z, oy: cam.py + f.oy * z, width: f.width, height: f.height };
}

/** Keep the map under the canvas centre so it can't be dragged away. */
export function clampCam(f: View, cam: Cam) {
  const z = cam.zoom;
  const x0 = f.ox - (H * f.TW) / 2, x1 = f.ox + (W * f.TW) / 2, y0 = f.oy - f.TW * 1.3, y1 = f.oy + ((W + H) * f.TH) / 2;
  cam.px = Math.min(f.width / 2 - z * x0, Math.max(f.width / 2 - z * x1, cam.px));
  cam.py = Math.min(f.height / 2 - z * y0, Math.max(f.height / 2 - z * y1, cam.py));
}

/** Zoom to `z2` keeping screen point (sx, sy) fixed. */
export function zoomAt(f: View, cam: Cam, z2: number, sx: number, sy: number) {
  z2 = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z2));
  const k = z2 / cam.zoom;
  cam.px = sx - (sx - cam.px) * k;
  cam.py = sy - (sy - cam.py) * k;
  cam.zoom = z2;
  if (z2 === MIN_ZOOM) { cam.px = 0; cam.py = 0; }
  clampCam(f, cam);
}

/** Centre the camera on tile coords (fx, fy) at zoom z. */
export function focusOn(f: View, cam: Cam, fx: number, fy: number, z: number) {
  cam.zoom = z;
  cam.px = f.width / 2 - z * (f.ox + ((fx - fy) * f.TW) / 2);
  cam.py = f.height / 2 - z * (f.oy + ((fx + fy) * f.TH) / 2);
  clampCam(f, cam);
}

export function screenToCell(v: View, sx: number, sy: number) {
  const a = (sx - v.ox) / (v.TW / 2), b = (sy - v.oy) / (v.TH / 2);
  const x = Math.floor((a + b) / 2), y = Math.floor((b - a) / 2);
  return inb(x, y) ? { x, y } : null;
}

/** Conservative inverse-projection bounds, including the existing tall-object margins. */
export function visibleTileBounds(v: View) {
  const corners = [[-v.TW, -v.TW * 0.5], [v.width + v.TW, -v.TW * 0.5], [-v.TW, v.height + v.TW * 2], [v.width + v.TW, v.height + v.TW * 2]];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [sx, sy] of corners) {
    const a = (sx - v.ox) / (v.TW / 2), b = (sy - v.oy) / (v.TH / 2);
    const x = (a + b) / 2 - 0.5, y = (b - a) / 2 - 0.5;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return { x0: Math.max(0, Math.floor(x0)), y0: Math.max(0, Math.floor(y0)), x1: Math.min(W - 1, Math.ceil(x1)), y1: Math.min(H - 1, Math.ceil(y1)) };
}

/* ---------- colour helpers ---------- */
const mixCache = new Map<string, string>();
function mix(a: string, b: string, t: number) {
  const key = a + b + t.toFixed(2);
  let out = mixCache.get(key);
  if (!out) {
    const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
    const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
    out = "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("");
    mixCache.set(key, out);
  }
  return out;
}
const darken = (c: string, t: number) => mix(c, "#000000", t);
const lighten = (c: string, t: number) => mix(c, "#ffffff", t);

function hr(seed: number, n: number) {
  let h = Math.imul((n + 1) | 0, 2654435761) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/* ---------- render context ---------- */
type Ctx = CanvasRenderingContext2D;
type RC = { c: Ctx; v: View; city: City; D: Derived; anim: number; now: number; season: number };
type Pt = [number, number];

const P = (v: View, fx: number, fy: number, z = 0): Pt => [v.ox + ((fx - fy) * v.TW) / 2, v.oy + ((fx + fy) * v.TH) / 2 - z];

function poly(c: Ctx, pts: Pt[], fill: string) {
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let k = 1; k < pts.length; k++) c.lineTo(pts[k][0], pts[k][1]);
  c.closePath();
  c.fillStyle = fill;
  c.fill();
}

/** Tile-local projector: u, v in [-0.5, 0.5] around the tile centre; z in design units (scaled by s). */
function tp(r: RC, x: number, y: number) {
  const s = r.v.s;
  return (u: number, v: number, z = 0): Pt => P(r.v, x + 0.5 + u, y + 0.5 + v, z * s);
}

function box(r: RC, x: number, y: number, u0: number, v0: number, u1: number, v1: number, z0: number, z1: number, top: string, left: string, right: string) {
  const q = tp(r, x, y), c = r.c;
  poly(c, [q(u0, v1, z0), q(u1, v1, z0), q(u1, v1, z1), q(u0, v1, z1)], left);
  poly(c, [q(u1, v0, z0), q(u1, v1, z0), q(u1, v1, z1), q(u1, v0, z1)], right);
  poly(c, [q(u0, v0, z1), q(u1, v0, z1), q(u1, v1, z1), q(u0, v1, z1)], top);
}

/** Gable roof with the ridge running along u. */
function gable(r: RC, x: number, y: number, u0: number, v0: number, u1: number, v1: number, z: number, h: number, front: string, back: string, end: string) {
  const q = tp(r, x, y), c = r.c, vm = (v0 + v1) / 2;
  poly(c, [q(u0, v0, z), q(u1, v0, z), q(u1, vm, z + h), q(u0, vm, z + h)], back);
  poly(c, [q(u1, v0, z), q(u1, v1, z), q(u1, vm, z + h)], end);
  poly(c, [q(u0, vm, z + h), q(u1, vm, z + h), q(u1, v1, z), q(u0, v1, z)], front);
  c.strokeStyle = darken(front, 0.35); c.lineWidth = Math.max(1, r.v.s);
  c.beginPath(); const a = q(u0, vm, z + h), b = q(u1, vm, z + h); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
}

function pyramid(r: RC, x: number, y: number, u0: number, v0: number, u1: number, v1: number, z: number, h: number, left: string, right: string) {
  const q = tp(r, x, y), c = r.c, apex = q((u0 + u1) / 2, (v0 + v1) / 2, z + h);
  poly(c, [q(u0, v0, z), q(u0, v1, z), apex], darken(left, 0.15));
  poly(c, [q(u0, v0, z), q(u1, v0, z), apex], darken(right, 0.1));
  poly(c, [q(u0, v1, z), q(u1, v1, z), apex], left);
  poly(c, [q(u1, v0, z), q(u1, v1, z), apex], right);
}

function shadow(r: RC, x: number, y: number, rad: number, u = 0, v = 0) {
  const [sx, sy] = tp(r, x, y)(u + 0.06, v + 0.06);
  r.c.fillStyle = "rgba(20,30,10,.28)";
  r.c.beginPath(); r.c.ellipse(sx, sy, rad * r.v.TW, rad * r.v.TH, 0, 0, Math.PI * 2); r.c.fill();
}

function windowOn(r: RC, x: number, y: number, u: number, v: number, z: number, side: "left" | "right", lit: boolean) {
  const q = tp(r, x, y), w = 0.07, hgt = 5;
  const pts: Pt[] = side === "left"
    ? [q(u - w, v, z), q(u + w, v, z), q(u + w, v, z + hgt), q(u - w, v, z + hgt)]
    : [q(u, v - w, z), q(u, v + w, z), q(u, v + w, z + hgt), q(u, v - w, z + hgt)];
  poly(r.c, pts, lit ? "#f6cf6a" : "#3a2a1c");
}

function smoke(r: RC, x: number, y: number, u: number, v: number, z: number, seed: number) {
  const q = tp(r, x, y), s = r.v.s;
  for (let k = 0; k < 3; k++) {
    const p = (r.anim / 2600 + k / 3 + hr(r.city.seed, seed)) % 1;
    const [sx, sy] = q(u, v, z + p * 34);
    r.c.fillStyle = `rgba(225,225,220,${(1 - p) * 0.45})`;
    r.c.beginPath(); r.c.arc(sx + p * 10 * s, sy, (3 + p * 6) * s, 0, Math.PI * 2); r.c.fill();
  }
}

/* ---------- terrain ---------- */
const GRASS = ["#86b552", "#7fae4c", "#8bba58"];
const FERT = ["#5f9a3c", "#5a9438", "#64a040"];

function grassColor(r: RC, i: number) {
  const k = Math.floor(hr(r.city.seed, i * 3) * 3);
  let col = r.D.fert[i] ? FERT[k] : GRASS[k];
  if (r.D.fert[i] && r.city.oldbed.includes(i)) col = mix(col, "#7a6a3e", 0.25);
  if (r.season === 2) col = mix(col, "#b8a046", 0.22);
  if (r.season === 3) col = mix(col, "#dfe8e6", 0.62);
  return col;
}

function drawGroundTile(r: RC, x: number, y: number) {
  const { c, city, v } = r, i = idx(x, y), s = v.s, q = tp(r, x, y);
  const t = city.t[i];
  const water = (xx: number, yy: number) => !inb(xx, yy) || city.t[idx(xx, yy)] === R;
  if (t === R) {
    const z = -4;
    const deep = r.season === 3 ? "#5d93b8" : "#3d8bc2";
    poly(c, [q(-0.5, -0.5, z), q(0.5, -0.5, z), q(0.5, 0.5, z), q(-0.5, 0.5, z)], mix(deep, "#2f78ad", hr(city.seed, i) * 0.5));
    // ripples
    c.strokeStyle = "rgba(220,240,255,.45)"; c.lineWidth = Math.max(1, s * 1.2);
    for (let k = 0; k < 2; k++) {
      const ph = (r.anim / 2200 + hr(city.seed, i * 7 + k)) % 1;
      const u = -0.35 + ph * 0.7, vv = -0.25 + hr(city.seed, i * 5 + k) * 0.5;
      const a = q(u - 0.12, vv, z), b = q(u + 0.12, vv, z);
      c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
    }
    // foam where the bank meets the water
    c.strokeStyle = "rgba(235,248,255,.7)"; c.lineWidth = Math.max(1, s * 1.6);
    const edges: [number, number, Pt, Pt][] = [
      [-1, 0, q(-0.5, -0.5, z), q(-0.5, 0.5, z)], [0, -1, q(-0.5, -0.5, z), q(0.5, -0.5, z)],
      [1, 0, q(0.5, -0.5, z), q(0.5, 0.5, z)], [0, 1, q(-0.5, 0.5, z), q(0.5, 0.5, z)],
    ];
    for (const [dx, dy, a, b] of edges) {
      if (!inb(x + dx, y + dy) || city.t[idx(x + dx, y + dy)] === R) continue;
      c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
    }
    if (x === W - 1) poly(c, [q(0.5, -0.5, z), q(0.5, 0.5, z), q(0.5, 0.5, -16), q(0.5, -0.5, -16)], "#2b5f86");
    if (y === H - 1) poly(c, [q(-0.5, 0.5, z), q(0.5, 0.5, z), q(0.5, 0.5, -16), q(-0.5, 0.5, -16)], "#336d96");
    return;
  }
  const col = t === HL || t === O ? mix(grassColor(r, i), "#a39272", 0.55) : grassColor(r, i);
  poly(c, [q(-0.5, -0.5), q(0.5, -0.5), q(0.5, 0.5), q(-0.5, 0.5)], col);
  // banks and map edges: show the soil layer
  if (water(x + 1, y)) poly(c, [q(0.5, -0.5), q(0.5, 0.5), q(0.5, 0.5, inb(x + 1, y) ? -5 : -16), q(0.5, -0.5, inb(x + 1, y) ? -5 : -16)], "#6b4a2b");
  if (water(x, y + 1)) poly(c, [q(-0.5, 0.5), q(0.5, 0.5), q(0.5, 0.5, inb(x, y + 1) ? -5 : -16), q(-0.5, 0.5, inb(x, y + 1) ? -5 : -16)], "#87613a");
  // surface detail
  if (t === G || t === F) {
    const n = r.D.fert[i] ? 4 : 3;
    for (let k = 0; k < n; k++) {
      const u = hr(city.seed, i * 11 + k) - 0.5, vv = hr(city.seed, i * 13 + k) - 0.5;
      const [sx, sy] = q(u * 0.8, vv * 0.8);
      if (r.season === 0 && hr(city.seed, i * 17 + k) < 0.35) {
        c.fillStyle = ["#f3e27a", "#f5a8c0", "#ffffff"][k % 3];
        c.beginPath(); c.arc(sx, sy, Math.max(1, 1.4 * s), 0, Math.PI * 2); c.fill();
      } else {
        c.strokeStyle = r.season === 3 ? "rgba(150,170,165,.6)" : darken(col, 0.18);
        c.lineWidth = Math.max(1, s);
        c.beginPath(); c.moveTo(sx - 2 * s, sy); c.lineTo(sx - 1 * s, sy - 3 * s); c.moveTo(sx, sy); c.lineTo(sx + 1 * s, sy - 3.5 * s); c.stroke();
      }
    }
  }
}

/* ---------- objects ---------- */
function drawTree(r: RC, x: number, y: number, u: number, v: number, size: number, pine: boolean, shake = 0) {
  const q = tp(r, x, y), c = r.c, s = r.v.s * size;
  shadow(r, x, y, 0.13 * size, u, v);
  const [bx0, by] = q(u, v), bx = bx0 + shake * s;
  c.fillStyle = "#6b4526"; c.fillRect(bx - 1.5 * s, by - 9 * s, 3 * s, 9 * s);
  const snow = r.season === 3;
  if (pine) {
    const greens = ["#2f6b3a", "#3a7c44", "#45894d"];
    for (let k = 0; k < 3; k++) {
      const w = (11 - k * 3) * s, top = by - (14 + k * 7) * s, bot = by - (5 + k * 7) * s;
      c.fillStyle = greens[k]; c.beginPath(); c.moveTo(bx, top - 6 * s); c.lineTo(bx - w, bot); c.lineTo(bx + w, bot); c.closePath(); c.fill();
      c.fillStyle = "rgba(0,0,0,.18)"; c.beginPath(); c.moveTo(bx, top - 6 * s); c.lineTo(bx, bot); c.lineTo(bx + w, bot); c.closePath(); c.fill();
      if (snow) { c.fillStyle = "#f4f7f6"; c.beginPath(); c.moveTo(bx, top - 6 * s); c.lineTo(bx - w * 0.45, top + 1 * s); c.lineTo(bx + w * 0.45, top + 1 * s); c.closePath(); c.fill(); }
    }
    return;
  }
  const leaf = [["#5aa845", "#78c25a"], ["#3f8e3a", "#5aa84a"], ["#cf7a2c", "#e6a446"], ["#556b4f", "#6c8467"]][r.season];
  c.fillStyle = leaf[0];
  c.beginPath(); c.arc(bx - 4 * s, by - 13 * s, 7 * s, 0, Math.PI * 2); c.arc(bx + 4 * s, by - 13 * s, 7 * s, 0, Math.PI * 2); c.arc(bx, by - 19 * s, 8 * s, 0, Math.PI * 2); c.fill();
  c.fillStyle = leaf[1];
  c.beginPath(); c.arc(bx - 2.5 * s, by - 21 * s, 4.5 * s, 0, Math.PI * 2); c.arc(bx - 5 * s, by - 15 * s, 3 * s, 0, Math.PI * 2); c.fill();
  if (snow) { c.fillStyle = "#f4f7f6"; c.beginPath(); c.ellipse(bx, by - 25 * s, 6 * s, 2.4 * s, 0, 0, Math.PI * 2); c.fill(); }
}

function drawRock(r: RC, x: number, y: number, low: boolean) {
  const i = idx(x, y), h = low ? 6 : 10 + hr(r.city.seed, i * 19) * 9, snow = r.season === 3;
  shadow(r, x, y, 0.44);
  box(r, x, y, -0.46, -0.46, 0.46, 0.46, 0, 5, "#b8a888", "#a39373", "#867659");
  box(r, x, y, -0.36, -0.36, 0.36, 0.36, 5, 5 + h * 0.5, snow ? "#eef1f0" : "#c2b294", snow ? "#d5dcda" : "#a99979", snow ? "#bcc5c3" : "#8c7c60");
  pyramid(r, x, y, -0.36, -0.36, 0.36, 0.36, 5 + h * 0.5, h * 0.6, snow ? "#e8ecea" : "#b8a789", snow ? "#c9d1cf" : "#94846a");
  if (!low && hr(r.city.seed, i * 23) < 0.45) {
    box(r, x, y, 0.08, 0.08, 0.4, 0.4, 5, 9, "#cbbb9c", "#b0a083", "#938366");
    pyramid(r, x, y, 0.08, 0.08, 0.4, 0.4, 9, 5, "#c0af90", "#9d8d71");
  }
  if (r.city.t[i] === O) {
    const q = tp(r, x, y);
    for (const [u, v, z] of [[-0.12, 0.3, 8], [0.25, 0.12, 6], [0.05, 0.25, 14]]) {
      const [sx, sy] = q(u, v, z);
      r.c.fillStyle = "#d9813a"; r.c.beginPath(); r.c.arc(sx, sy, 2.6 * r.v.s, 0, Math.PI * 2); r.c.fill();
      r.c.fillStyle = "#ffc27a"; r.c.beginPath(); r.c.arc(sx - 0.8 * r.v.s, sy - 0.8 * r.v.s, 1 * r.v.s, 0, Math.PI * 2); r.c.fill();
    }
  }
}

/* ---------- level details ---------- */
function line(r: RC, a: Pt, b: Pt, col: string, w = 1) {
  r.c.strokeStyle = col; r.c.lineWidth = Math.max(1, w * r.v.s);
  r.c.beginPath(); r.c.moveTo(a[0], a[1]); r.c.lineTo(b[0], b[1]); r.c.stroke();
}
/** Roof tile rows on the front slope of a gable roof. */
function tileRows(r: RC, x: number, y: number, u0: number, u1: number, v0: number, v1: number, z: number, h: number, col: string) {
  const q = tp(r, x, y), vm = (v0 + v1) / 2;
  for (let k = 1; k < 7; k++) { const u = u0 + ((u1 - u0) * k) / 7; line(r, q(u, vm, z + h), q(u, v1, z), col, 0.8); }
  for (const f of [0.35, 0.7]) line(r, q(u0, vm + (v1 - vm) * f, z + h * (1 - f)), q(u1, vm + (v1 - vm) * f, z + h * (1 - f)), col, 0.8);
}
/** Upturned ridge ends, as on a traditional tiled roof. */
function upturn(r: RC, x: number, y: number, u0: number, u1: number, v0: number, v1: number, z: number, h: number, col: string) {
  const q = tp(r, x, y), vm = (v0 + v1) / 2, c = r.c, s = r.v.s;
  c.strokeStyle = col; c.lineWidth = Math.max(1.5, 2.2 * s); c.lineCap = "round";
  for (const [u, dir] of [[u0, -1], [u1, 1]] as const) {
    const [ax, ay] = q(u, vm, z + h);
    c.beginPath(); c.moveTo(ax, ay); c.quadraticCurveTo(ax + dir * 2.5 * s, ay + 0.5 * s, ax + dir * 3.5 * s, ay - 2.5 * s); c.stroke();
  }
  for (const [u, v] of [[u1, v1], [u0, v1], [u1, v0]] as const) {
    const [ax, ay] = q(u, v, z);
    c.beginPath(); c.moveTo(ax, ay); c.quadraticCurveTo(ax + (u > 0 ? 2 : -2) * s, ay, ax + (u > 0 ? 2.5 : -2.5) * s, ay - 2.2 * s); c.stroke();
  }
  c.lineCap = "butt";
}
function lantern(r: RC, x: number, y: number, u: number, v: number, z: number, i: number) {
  const [lx, ly] = tp(r, x, y)(u, v, z), s = r.v.s, c = r.c, sw = Math.sin(r.anim / 600 + i) * 1.2 * s;
  line(r, [lx, ly], [lx + sw, ly + 4 * s], "#3b2a1e", 0.7);
  const g = c.createRadialGradient(lx + sw, ly + 8 * s, 0, lx + sw, ly + 8 * s, 10 * s);
  g.addColorStop(0, "rgba(255,170,90,.45)"); g.addColorStop(1, "rgba(255,170,90,0)");
  c.fillStyle = g; c.beginPath(); c.arc(lx + sw, ly + 8 * s, 10 * s, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#d8322c"; c.beginPath(); c.ellipse(lx + sw, ly + 8 * s, 2.6 * s, 3.4 * s, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#f0c766"; c.fillRect(lx + sw - 1.4 * s, ly + 4.2 * s, 2.8 * s, 1 * s); c.fillRect(lx + sw - 1.4 * s, ly + 11.2 * s, 2.8 * s, 1 * s);
}
function flag(r: RC, x: number, y: number, u: number, v: number, z: number, h: number, col: string, i: number, pennant = false) {
  const q = tp(r, x, y), s = r.v.s, c = r.c, [bx, by] = q(u, v, z);
  line(r, [bx, by], [bx, by - h * s], "#4b301a", 1.3);
  const wv = Math.sin(r.anim / 280 + i) * 1.6 * s;
  c.fillStyle = col; c.beginPath(); c.moveTo(bx, by - h * s); c.quadraticCurveTo(bx + 6 * s, by - h * s - 2 * s + wv, bx + 12 * s, by - h * s + 2 * s + wv); if (pennant) {
    c.lineTo(bx + 8 * s, by - h * s + 4 * s + wv);
    c.lineTo(bx + 12 * s, by - h * s + 8 * s + wv);
  }
  c.lineTo(bx, by - h * s + 7 * s); c.fill();
}
/** Low wooden fence along the two front edges, with a gap for a gate. */
function fence(r: RC, x: number, y: number) {
  const q = tp(r, x, y);
  const posts: [number, number][] = [[-0.46, 0.46], [-0.26, 0.46], [-0.06, 0.46], [0.3, 0.46], [0.46, 0.46], [0.46, 0.26], [0.46, 0.06], [0.46, -0.14], [0.46, -0.34]];
  const rail = (a: [number, number], b: [number, number], z: number) => line(r, q(a[0], a[1], z), q(b[0], b[1], z), "#a07648", 1.1);
  rail(posts[0], posts[2], 5); rail(posts[0], posts[2], 2.5);
  rail(posts[3], posts[8], 5); rail(posts[3], posts[8], 2.5);
  for (const [u, v] of posts) line(r, q(u, v, 0), q(u, v, 7), "#7a5530", 1.4);
}
function stilts(r: RC, x: number, y: number, u0: number, v0: number, u1: number, v1: number, h: number) {
  for (const [u, v] of [[u0, v1], [u1, v1], [u1, v0], [(u0 + u1) / 2, v1]] as const) box(r, x, y, u - 0.025, v - 0.025, u + 0.025, v + 0.025, 0, h, "#6b4526", "#5c3b20", "#4b301a");
}
function buffalo(r: RC, x: number, y: number, u: number, v: number) {
  const [sx, sy] = tp(r, x, y)(u, v), c = r.c, s = Math.max(r.v.s * 1.3, 0.6), step = Math.sin(r.anim / 700) * 0.8 * s;
  c.fillStyle = "rgba(20,30,10,.28)"; c.beginPath(); c.ellipse(sx, sy, 8 * s, 2.4 * s, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#3d3a3a";
  for (const lx of [-5, -2.5, 2.5, 5]) c.fillRect(sx + lx * s - 0.9 * s + (lx > 0 ? step : -step), sy - 5 * s, 1.8 * s, 5 * s);
  c.beginPath(); c.ellipse(sx, sy - 7.5 * s, 7 * s, 3.6 * s, 0, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(sx + 7.5 * s, sy - 7 * s, 2.6 * s, 2.2 * s, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = "#d8cdb6"; c.lineWidth = Math.max(1, 1.2 * s);
  c.beginPath(); c.arc(sx + 7.5 * s, sy - 9 * s, 3.4 * s, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
}

/** Extras that sit behind the main building (drawn first). */
function backExtras(r: RC, k: BKey, x: number, y: number, lvl: number, i: number) {
  const q = tp(r, x, y);
  switch (k) {
    case "house":
      if (lvl >= 3) {
        box(r, x, y, -0.48, -0.48, 0.05, -0.22, 0, 12, "#d9b98a", "#cfa874", "#b08a5a");
        gable(r, x, y, -0.5, -0.52, 0.08, -0.18, 12, 8, "#b0543a", "#994632", "#8c3f2c");
      }
      break;
    case "storehouse":
      if (lvl >= 3) {
        stilts(r, x, y, 0.18, -0.48, 0.46, -0.2, 8);
        box(r, x, y, 0.18, -0.48, 0.46, -0.2, 8, 16, "#c49866", "#ae8456", "#8f6b45");
        pyramid(r, x, y, 0.14, -0.52, 0.5, -0.16, 16, 10, "#e2bd5e", "#c49a3f");
      }
      break;
    case "quarry": {
      const a = q(-0.3, -0.3, 6), b = q(-0.3, -0.3, 44), tip = q(0.1, -0.1, 40);
      line(r, a, b, "#6b4526", 2); line(r, b, tip, "#6b4526", 1.6);
      line(r, tip, q(0.1, -0.1, 18), "#3b2a1e", 0.7);
      box(r, x, y, 0.04, -0.16, 0.16, -0.04, 12, 18, "#ddd6c6", "#c3bba9", "#a49c8b");
      break;
    }
    case "barracks":
      box(r, x, y, -0.48, -0.48, -0.3, -0.3, 0, 30, "#8a6440", "#7a5636", "#5f432a");
      box(r, x, y, -0.5, -0.5, -0.28, -0.28, 30, 34, "#a07648", "#8a6440", "#6f5032");
      pyramid(r, x, y, -0.52, -0.52, -0.26, -0.26, 34, 9, "#6f4a2c", "#5f3f25");
      break;
    case "gather":
      if (lvl >= 3) drawTree(r, x, y, -0.32, -0.36, 0.85, false);
      break;
    case "wood":
      if (lvl >= 3) {
        box(r, x, y, 0.12, -0.48, 0.46, -0.2, 0, 10, "#9e7448", "#8b6440", "#714f31");
        gable(r, x, y, 0.08, -0.52, 0.5, -0.16, 10, 6, "#7b5a3c", "#6a4c31", "#5f442c");
      }
      break;
  }
  void i;
}

/** Extras in front of the main building (drawn last). */
function frontExtras(r: RC, k: BKey, x: number, y: number, lvl: number, i: number) {
  const q = tp(r, x, y), c = r.c, s = r.v.s;
  switch (k) {
    case "hut":
    case "gather":
      fence(r, x, y);
      if (k === "gather") {
        const a = q(-0.36, 0.3, 0), b = q(-0.36, 0.3, 10), a2 = q(-0.06, 0.38, 0), b2 = q(-0.06, 0.38, 10);
        line(r, a, b, "#6b4526", 1.2); line(r, a2, b2, "#6b4526", 1.2); line(r, b, b2, "#6b4526", 1);
        for (let h = 0; h < 4; h++) { const [hx, hy] = q(-0.33 + h * 0.08, 0.32 + h * 0.02, 8); c.fillStyle = h % 2 ? "#7fae47" : "#c6384a"; c.fillRect(hx - 1 * s, hy, 2 * s, 4 * s); }
      }
      break;
    case "house":
      fence(r, x, y);
      if (lvl >= 3) { lantern(r, x, y, -0.2, 0.36, 22, i); lantern(r, x, y, 0.36, 0.1, 22, i + 3); }
      break;
    case "stonehouse":
      if (lvl >= 3) { flag(r, x, y, -0.29, -0.29, 20 * 1.4 + 46, 14, "#c9503e", i); lantern(r, x, y, 0.1, 0.34, 26, i); }
      break;
    case "wood": {
      const a = q(0.3, 0.12, 0), b = q(0.3, 0.12, 7);
      line(r, a, b, "#6b4526", 1.4); line(r, q(0.24, 0.12, 7), q(0.36, 0.12, 7), "#8a5a2b", 3);
      for (let k2 = 0; k2 < 3; k2++) { const [lx, ly] = q(-0.3 + k2 * 0.08, 0.38, 2); c.fillStyle = "#7b4e25"; c.beginPath(); c.ellipse(lx, ly, 5 * s, 2.2 * s, -0.46, 0, Math.PI * 2); c.fill(); }
      break;
    }
    case "quarry":
      if (lvl >= 3) {
        box(r, x, y, 0.22, 0.26, 0.46, 0.44, 3, 7, "#8a5a2b", "#7a4e25", "#62401f");
        for (const [u, v] of [[0.3, 0.33], [0.38, 0.36]]) { const [wx, wy] = q(u, v + 0.1, 3); c.fillStyle = "#4b301a"; c.beginPath(); c.arc(wx, wy, 2.2 * s, 0, Math.PI * 2); c.fill(); }
        box(r, x, y, 0.26, 0.29, 0.42, 0.41, 7, 10, "#ddd6c6", "#c3bba9", "#a49c8b");
      }
      break;
    case "storehouse":
      for (const [u, v] of [[-0.36, 0.38], [-0.24, 0.42]]) { const [bx, by] = q(u, v); c.fillStyle = "#d8c49a"; c.beginPath(); c.ellipse(bx, by - 3 * s, 3.2 * s, 4 * s, 0, 0, Math.PI * 2); c.fill(); }
      box(r, x, y, 0.32, 0.3, 0.44, 0.42, 0, 8, "#8a5a2b", "#7a4e25", "#62401f");
      break;
    case "farm":
      if (lvl >= 3) {
        poly(c, [q(-0.5, 0.42, 1), q(0.5, 0.42, 1), q(0.5, 0.5, 1), q(-0.5, 0.5, 1)], r.season === 3 ? "#7aa3be" : "#4796cc");
        buffalo(r, x, y, -0.15, 0.2);
      }
      break;
    case "smelter":
      box(r, x, y, -0.44, 0.1, -0.28, 0.3, 0, 6, "#7a4e25", "#6a4320", "#55361a");
      if (lvl >= 3) {
        box(r, x, y, 0.28, 0.28, 0.46, 0.44, 3, 7, "#5c3b20", "#4b301a", "#3b2614");
        for (const [u, v] of [[0.33, 0.33], [0.4, 0.38]]) { const [ox, oy] = q(u, v, 9); c.fillStyle = "#d9813a"; c.beginPath(); c.arc(ox, oy, 2 * s, 0, Math.PI * 2); c.fill(); }
      }
      break;
    case "barracks":
      if (lvl >= 3) { flag(r, x, y, 0.42, 0.42, 0, 40, "#c9503e", i); flag(r, x, y, -0.42, 0.42, 0, 40, "#e2b240", i + 2); }
      break;
  }
}

export function drawBuilding(r: RC, k: BKey, x: number, y: number, lvl: number, i: number) {
  if (lvl >= 2) backExtras(r, k, x, y, lvl, i);
  drawBase(r, k, x, y, lvl, i);
  if (lvl >= 2) frontExtras(r, k, x, y, lvl, i);
}

/** Era changes the architecture; levels add size and equipment within that era. */
function drawEvolvingWorkshop(r: RC, k: BKey, x: number, y: number, lvl: number, i: number) {
  if (!["gather", "wood", "storehouse", "forge", "barracks"].includes(k)) return false;
  const era = r.city.era, q = tp(r,x,y), c = r.c, s = r.v.s, hs = 1 + .2 * Math.max(0,lvl-1);
  const military = k === "barracks", small = k === "wood" || k === "gather";
  const u0 = small ? -.32 : -.34, v0 = small ? -.32 : -.28;
  const u1 = small ? .02 : .32, v1 = small ? .08 : .26;
  const height = (small ? 9 : k === "forge" ? 16 : 13) * hs;
  const wall = era === 1 ? ["#bf9967","#a27b4c","#805b35"] : era === 2 ? ["#c18b51","#a77240","#83562f"] : ["#c6c8bc","#a3aea1","#788e85"];
  const roof = era === 1 ? ["#e1bf6a","#c8a44d","#ac873a"] : era === 2 ? ["#b65e42","#98472f","#7f3b29"] : ["#577d8d","#426371","#314e60"];
  shadow(r,x,y,.42);
  if (era > 1) box(r,x,y,u0-.04,v0-.04,u1+.04,v1+.04,0,3,"#c8bfa7","#a99f89","#88816f");
  if (era === 1 && military) {
    // Open training tent, distinct from the enclosed timber and stone barracks.
    for (const u of [u0,u1]) for (const v of [v0,v1]) line(r,q(u,v,0),q(u,v,height),"#77512e",1.5);
    poly(c,[q(u0,v1,0),q(u1,v1,0),q(u1,v1,height),q(u0,v1,height)],"#9b7850");
  } else box(r,x,y,u0,v0,u1,v1,era>1?3:0,height,...wall as [string,string,string]);
  if (era === 1 && military) pyramid(r,x,y,u0-.05,v0-.05,u1+.05,v1+.05,height,9,roof[0],roof[1]);
  else gable(r,x,y,u0-.05,v0-.05,u1+.05,v1+.05,height,small?7:9,...roof as [string,string,string]);
  if (era > 1) tileRows(r,x,y,u0-.05,u1+.05,v0-.05,v1+.05,height,small?7:9,"rgba(35,30,25,.35)");
  if (era === 3) {
    for(let row=1;row<4;row++)line(r,q(u0,v1,row*height/4),q(u1,v1,row*height/4),"#6e8075",.8);
    for(const u of [u0,u1-.06])box(r,x,y,u,v0,u+.06,v0+.07,height,height+4,"#bdc4b5","#9ca995","#768a7d");
  } else if (era === 2) {
    for(const u of [u0,u1])line(r,q(u,v1,3),q(u,v1,height),"#654025",1.5);
    line(r,q(u0,v1,height*.45),q(u1,v1,height*.45),"#654025",1);
  }
  if (!small) poly(c,[q(-.09,v1,0),q(.09,v1,0),q(.09,v1,8),q(-.09,v1,8)],"#423226");
  if (k === "gather") {
    for(const u of [.16,.31]) { const [bx,by]=q(u,.25,2);c.fillStyle="#af8150";c.beginPath();c.ellipse(bx,by,4*s,3*s,0,0,Math.PI*2);c.fill();c.fillStyle="#d45849";c.beginPath();c.arc(bx,by-3*s,2.5*s,0,Math.PI*2);c.fill(); }
  } else if (k === "wood") {
    for(let n=0;n<3;n++)box(r,x,y,.1,.18+n*.07,.4,.23+n*.07,n===2?3:0,n===2?6:3,"#b68a51","#8a5b32","#674125");
    if(era>1){line(r,q(.15,-.16,0),q(.15,-.16,14),"#865e3b",2);line(r,q(.15,-.16,14),q(.4,-.16,14),"#b7bdb2",2);}
  } else if (k === "storehouse") {
    for(const u of [.18,.33])box(r,x,y,u-.055,.31,u+.055,.43,0,6,"#d4b273","#b48e53","#8f6d3b");
    if(era===3)for(const u of [-.28,.25])line(r,q(u,v1,2),q(u,v1,height-2),"#566d73",2);
  } else if (k === "forge") {
    box(r,x,y,.12,.29,.3,.4,0,5,era===1?"#a4a08b":"#677473","#59615b","#414e49");
    line(r,q(.2,.34,5),q(.31,.37,10),era===1?"#b0a992":"#d1d1b3",2);
    if(era>1){box(r,x,y,-.25,-.21,-.12,-.09,height,height+7,"#b5b8a7","#949d8c","#718073");smoke(r,x,y,-.18,-.15,height+9,i);}
  } else if (military) {
    const tip=era===1?"#aaa28b":era===2?"#d4a654":"#d8e1df";
    for(let n=0;n<3;n++){const u=.34+n*.045;line(r,q(u,-.15,0),q(u,-.15,23),"#765231",1.3);poly(c,[q(u,-.15,27),q(u-.025,-.15,22),q(u+.025,-.15,22)],tip);}
    for(let n=0;n<5;n++){const u=-.4+n*.18;box(r,x,y,u,.4,u+.06,.46,0,era===3?10:9,wall[0],wall[1],wall[2]);}
    flag(r,x,y,-.3,-.22,height,18,era===3?"#b84138":"#d19d43",i,true);
  }
  return true;
}

function drawBase(r: RC, k: BKey, x: number, y: number, lvl: number, i: number) {
  if (k === "hut" && r.city.era > 1) { drawBase(r,r.city.era === 2 ? "house" : "stonehouse",x,y,lvl,i); return; }
  if (k === "house" && r.city.era === 3) { drawBase(r,"stonehouse",x,y,lvl,i); return; }
  if (drawEvolvingWorkshop(r,k,x,y,lvl,i)) return;
  const c = r.c, s = r.v.s, q = tp(r, x, y), hs = 1 + 0.2 * Math.max(0, lvl - 1);
  const night = false;
  switch (k) {
    case "wall": {
      const era = r.city.era, h = (era === 1 ? 14 : 18) * hs;
      shadow(r, x, y, 0.44);
      if (era === 1) {
        for (let n = 0; n < 7; n++) {
          const u = -0.43 + n * 0.14;
          box(r, x, y, u, -0.08, u + 0.09, 0.08, 0, h, "#b58a51", "#87603a", "#624329");
          pyramid(r, x, y, u, -0.08, u + 0.09, 0.08, h, 4, "#c69d60", "#916c41");
        }
        line(r, q(-0.45, 0.09, 5), q(0.5, 0.09, 5), "#503b28", 2);
      } else {
        const top = era === 2 ? "#bc9561" : "#b7b7a8", left = era === 2 ? "#9d774c" : "#93988f", right = era === 2 ? "#795b3c" : "#727d78";
        box(r, x, y, -0.5, -0.12, 0.5, 0.12, 0, h, top, left, right);
        for (const u of [-0.47, -0.12, 0.23]) box(r, x, y, u, -0.12, u + 0.22, 0.12, h, h + 4, top, left, right);
        for (let row = 1; row < 4; row++) line(r, q(-0.5, 0.125, row * h / 4), q(0.5, 0.125, row * h / 4), "rgba(45,45,35,.35)", 0.8);
      }
      break;
    }
    case "gate": {
      const era = r.city.era, h = 22 * hs, stone = era === 3;
      shadow(r, x, y, 0.46);
      for (const u of [-0.46, 0.27]) box(r, x, y, u, -0.16, u + 0.19, 0.16, 0, h, stone ? "#b9b7a8" : "#ba8c50", stone ? "#92988c" : "#8a633c", stone ? "#6d7a73" : "#65492e");
      box(r, x, y, -0.46, -0.16, 0.46, 0.16, h - 5, h, stone ? "#c8c2ae" : "#b88b50", stone ? "#a2a48f" : "#8a633c", stone ? "#7c887a" : "#65492e");
      box(r, x, y, -0.27, 0.05, 0.27, 0.1, 0, h - 5, "#805b38", "#63472d", "#493723");
      for (const u of [-0.18, 0, 0.18]) line(r, q(u, 0.11, 0), q(u, 0.11, h - 5), era > 1 ? "#b6a36f" : "#986e41", 1);
      if (era > 1) gable(r, x, y, -0.5, -0.22, 0.5, 0.22, h, 8, era === 3 ? "#4d7181" : "#ab573c", "#5f6153", "#555842");
      flag(r, x, y, -0.38, 0, h, 14, "#d4ae4e", i, true);
      break;
    }
    case "watchtower": {
      const era = r.city.era, h = (era === 1 ? 25 : 32) * hs;
      shadow(r, x, y, 0.4);
      if (era < 3) stilts(r, x, y, -0.22, -0.22, 0.22, 0.22, h - 8);
      else box(r, x, y, -0.23, -0.23, 0.23, 0.23, 0, h - 8, "#c4c0af", "#a0a393", "#7e8b80");
      box(r, x, y, -0.33, -0.33, 0.33, 0.33, h - 8, h - 3, "#baa16e", "#947647", "#6e5938");
      if (era === 1) pyramid(r, x, y, -0.4, -0.4, 0.4, 0.4, h - 2, 12, "#d9b460", "#a88642");
      else gable(r, x, y, -0.4, -0.4, 0.4, 0.4, h, 10, era === 3 ? "#4b7184" : "#ad5b40", "#665b46", "#6c5a3d");
      for (let n = 0; n < 6; n++) line(r, q(0.25, 0.34, n * 3.5), q(0.38, 0.34, n * 3.5), "#886439", 1);
      flag(r, x, y, -0.26, 0, h + 2, 17, "#d4ae4e", i, true);
      break;
    }
    case "hut": {
      if (lvl >= 3) {
        // stilt house
        shadow(r, x, y, 0.4);
        stilts(r, x, y, -0.32, -0.28, 0.32, 0.28, 10);
        box(r, x, y, -0.36, -0.32, 0.36, 0.32, 10, 12, "#8a6440", "#7a5636", "#5f432a");
        box(r, x, y, -0.3, -0.26, 0.3, 0.26, 12, 22, "#c9a06a", "#b88f5c", "#977148");
        gable(r, x, y, -0.4, -0.36, 0.4, 0.36, 22, 14, "#e2bd5e", "#c9a248", "#b48d3e");
        tileRows(r, x, y, -0.4, 0.4, -0.36, 0.36, 22, 14, "rgba(120,85,30,.45)");
        const a = q(0.05, 0.26, 12), b = q(0.17, 0.26, 12), cc = q(0.17, 0.26, 19), d = q(0.05, 0.26, 19);
        poly(c, [a, b, cc, d], "#4a3020");
        for (let k2 = 0; k2 < 4; k2++) line(r, q(0.06, 0.32 + k2 * 0.05, 12 - k2 * 3), q(0.16, 0.32 + k2 * 0.05, 12 - k2 * 3), "#7a5530", 1.2);
        line(r, q(0.06, 0.3, 12), q(0.06, 0.5, 0), "#6b4526", 1.2); line(r, q(0.16, 0.3, 12), q(0.16, 0.5, 0), "#6b4526", 1.2);
        lantern(r, x, y, 0.36, 0.05, 24, i);
        break;
      }
      if (lvl === 2) {
        shadow(r, x, y, 0.38);
        box(r, x, y, -0.3, -0.26, 0.3, 0.26, 0, 11, "#c79a63", "#b88a55", "#9a7044");
        line(r, q(-0.3, 0.26, 0), q(-0.3, 0.26, 11), "#6b4526", 1.4); line(r, q(0.3, 0.26, 0), q(0.3, 0.26, 11), "#6b4526", 1.4);
        line(r, q(-0.3, 0.26, 6), q(0.3, 0.26, 6), "#7a5530", 1);
        gable(r, x, y, -0.36, -0.32, 0.36, 0.32, 11, 12, "#e2bd5e", "#c9a248", "#b48d3e");
        tileRows(r, x, y, -0.36, 0.36, -0.32, 0.32, 11, 12, "rgba(120,85,30,.45)");
        const a = q(0.05, 0.26, 0), b = q(0.16, 0.26, 0), cc = q(0.16, 0.26, 7), d = q(0.05, 0.26, 7);
        poly(c, [a, b, cc, d], "#4a3020");
        windowOn(r, x, y, 0.3, -0.05, 4, "right", false);
        break;
      }
      shadow(r, x, y, 0.3);
      box(r, x, y, -0.24, -0.24, 0.24, 0.24, 0, 9 * hs, "#c79a63", "#b88a55", "#9a7044");
      pyramid(r, x, y, -0.32, -0.32, 0.32, 0.32, 9 * hs, 16 * hs, "#e2bd5e", "#c49a3f");
      const d = q(0.05, 0.24, 0), d2 = q(0.15, 0.24, 0), d3 = q(0.15, 0.24, 6), d4 = q(0.05, 0.24, 6);
      poly(c, [d, d2, d3, d4], "#4a3020");
      break;
    }
    case "gather": {
      shadow(r, x, y, 0.32);
      box(r, x, y, -0.3, -0.3, 0.05, 0.1, 0, 7, "#a37a4a", "#8e6a3f", "#7a5a34");
      gable(r, x, y, -0.34, -0.34, 0.09, 0.14, 7, 7, "#d8b25a", "#c09a46", "#b48d3e");
      for (const [u, v] of [[0.22, 0.25], [0.3, -0.1], [-0.1, 0.32]]) {
        const [bx, by] = q(u, v);
        c.fillStyle = "#9b6f3d"; c.beginPath(); c.ellipse(bx, by - 2 * s, 5 * s, 3 * s, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = "#c6384a"; c.beginPath(); c.arc(bx - 1.5 * s, by - 4.5 * s, 1.8 * s, 0, Math.PI * 2); c.arc(bx + 1.6 * s, by - 4 * s, 1.8 * s, 0, Math.PI * 2); c.fill();
      }
      break;
    }
    case "wood": {
      shadow(r, x, y, 0.32);
      box(r, x, y, -0.32, -0.32, 0.02, 0.0, 0, 9 * hs, "#9e7448", "#8b6440", "#714f31");
      gable(r, x, y, -0.36, -0.36, 0.06, 0.04, 9 * hs, 7, "#7b5a3c", "#6a4c31", "#5f442c");
      for (let k2 = 0; k2 < 3; k2++) {
        const [lx, ly] = q(0.15 + k2 * 0.06, 0.28 - k2 * 0.02, 2 + (k2 === 2 ? 4 : 0));
        c.fillStyle = "#7b4e25"; c.beginPath(); c.ellipse(lx, ly, 6 * s, 2.6 * s, -0.46, 0, Math.PI * 2); c.fill();
        c.fillStyle = "#e0b27a"; c.beginPath(); c.ellipse(lx + 5 * s, ly + 2.5 * s, 1.8 * s, 2.2 * s, 0, 0, Math.PI * 2); c.fill();
      }
      const [sx, sy] = q(0.3, -0.15);
      c.fillStyle = "#8a5d33"; c.beginPath(); c.ellipse(sx, sy - 2 * s, 3.5 * s, 2 * s, 0, 0, Math.PI * 2); c.fill();
      break;
    }
    case "quarry": {
      if(r.city.era>1){
        const stone=r.city.era===3;
        for(const u of [-.3,.3])box(r,x,y,u-.035,-.25,u+.035,-.18,0,24,stone?"#adb8ad":"#ae8350",stone?"#889d90":"#865e36",stone?"#637e73":"#644528");
        line(r,q(-.3,-.22,24),q(.3,-.22,24),stone?"#768d87":"#765130",3);
        line(r,q(.05,-.22,24),q(.05,-.22,8),"#d8c59c",1);
      }
      drawRock(r, x, y, true);
      box(r, x, y, -0.3, 0.05, -0.05, 0.3, 4, 10, "#ddd6c6", "#c3bba9", "#a49c8b");
      box(r, x, y, 0.05, 0.08, 0.3, 0.32, 4, 8, "#d3ccbb", "#b9b19f", "#9a9281");
      box(r, x, y, -0.18, 0.1, 0.12, 0.28, 10, 15, "#e6e0d1", "#ccc4b2", "#ada593");
      break;
    }
    case "storehouse": {
      shadow(r, x, y, 0.4);
      box(r, x, y, -0.34, -0.3, 0.34, 0.3, 0, 13 * hs, "#a87b4b", "#956a3e", "#7b5631");
      gable(r, x, y, -0.4, -0.36, 0.4, 0.36, 13 * hs, 10, "#8c3f2e", "#7a3528", "#6e3023");
      const a = q(-0.1, 0.3, 0), b = q(0.12, 0.3, 0), cc = q(0.12, 0.3, 9), d = q(-0.1, 0.3, 9);
      poly(c, [a, b, cc, d], "#4c3220");
      for (const [u, v] of [[0.2, 0.36], [0.33, 0.36]]) box(r, x, y, u - 0.06, v - 0.06, u + 0.06, v + 0.06, 0, 5, "#c7955a", "#b07f48", "#946a3a");
      break;
    }
    case "fire": {
      if(r.city.era>1){const stone=r.city.era===3;box(r,x,y,-.28,-.22,.28,.22,0,4,stone?"#c6c8bb":"#b59266",stone?"#9baa9c":"#98764f",stone?"#758d80":"#775a3a");}
      const [fx, fy] = q(0, 0);
      for (let a = 0; a < 8; a++) {
        const [sx, sy] = q(Math.cos((a / 8) * Math.PI * 2) * 0.22, Math.sin((a / 8) * Math.PI * 2) * 0.22);
        c.fillStyle = "#8c8478"; c.beginPath(); c.ellipse(sx, sy - 1.5 * s, 3 * s, 2 * s, 0, 0, Math.PI * 2); c.fill();
      }
      const f = 1 + 0.15 * Math.sin(r.anim / 110 + i);
      const glow = c.createRadialGradient(fx, fy - 6 * s, 1, fx, fy - 6 * s, 26 * s);
      glow.addColorStop(0, "rgba(255,180,80,.45)"); glow.addColorStop(1, "rgba(255,180,80,0)");
      c.fillStyle = glow; c.beginPath(); c.arc(fx, fy - 6 * s, 26 * s, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#ef7d22"; c.beginPath(); c.moveTo(fx, fy - 20 * s * f); c.quadraticCurveTo(fx + 8 * s, fy - 6 * s, fx, fy); c.quadraticCurveTo(fx - 8 * s, fy - 6 * s, fx, fy - 20 * s * f); c.fill();
      c.fillStyle = "#ffd36a"; c.beginPath(); c.moveTo(fx, fy - 12 * s * f); c.quadraticCurveTo(fx + 4 * s, fy - 4 * s, fx, fy); c.quadraticCurveTo(fx - 4 * s, fy - 4 * s, fx, fy - 12 * s * f); c.fill();
      smoke(r, x, y, 0, 0, 24, i);
      break;
    }
    case "farm": {
      if(r.city.era===3){
        poly(c,[q(-.49,.39,1),q(.49,.39,1),q(.49,.49,1),q(-.49,.49,1)],"#579dc5");
        for(const u of [-.48,.44])box(r,x,y,u,-.48,u+.04,.49,0,2,"#c1c2ab","#9da991","#7b907a");
      }
      const soil = r.season === 3 ? "#8a7158" : "#7a5634";
      poly(c, [q(-0.46, -0.46, 1), q(0.46, -0.46, 1), q(0.46, 0.46, 1), q(-0.46, 0.46, 1)], soil);
      const crop = ["#8fd05a", "#a9c24a", "#e2b84a", "#9c8466"][r.season];
      c.strokeStyle = crop; c.lineWidth = Math.max(1.5, 3 * s); c.lineCap = "round";
      for (let row = 0; row < 5; row++) {
        const v = -0.38 + row * 0.19;
        const a = q(-0.38, v, 3 * hs), b = q(0.38, v, 3 * hs);
        c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
      }
      c.lineCap = "butt";
      if (lvl >= 2) {
        const [sx, sy] = q(0.3, 0.3);
        c.fillStyle = "#6b4526"; c.fillRect(sx - 1 * s, sy - 16 * s, 2 * s, 16 * s); c.fillRect(sx - 6 * s, sy - 12 * s, 12 * s, 2 * s);
        c.fillStyle = "#d9b25a"; c.beginPath(); c.arc(sx, sy - 18 * s, 3 * s, 0, Math.PI * 2); c.fill();
      }
      break;
    }
    case "canal": {
      const wet = r.D.wet[i], z = -3;
      const water = wet ? (r.season === 3 ? "#6a9fc2" : "#4796cc") : "#86704f";
      const w = 0.2, links: [number, number][] = [];
      for (const [dx, dy] of N4) {
        if (!inb(x + dx, y + dy)) continue;
        const j = idx(x + dx, y + dy);
        if (r.city.t[j] === R || r.city.b[j]?.k === "canal") links.push([dx, dy]);
      }
      const rect = (u0: number, v0: number, u1: number, v1: number) => {
        poly(c, [q(u0, v0, 1), q(u1, v0, 1), q(u1, v1, 1), q(u0, v1, 1)], r.city.era===3 ? "#b3c0b6" : "#a28a62");
        poly(c, [q(u0 + 0.05, v0 + 0.05, z), q(u1 - 0.05, v0 + 0.05, z), q(u1 - 0.05, v1 - 0.05, z), q(u0 + 0.05, v1 - 0.05, z)], water);
      };
      rect(-w - 0.05, -w - 0.05, w + 0.05, w + 0.05);
      for (const [dx, dy] of links) {
        if (dx) rect(dx > 0 ? 0 : -0.5, -w - 0.05, dx > 0 ? 0.5 : 0, w + 0.05);
        else rect(-w - 0.05, dy > 0 ? 0 : -0.5, w + 0.05, dy > 0 ? 0.5 : 0);
      }
      break;
    }
    case "levee": {
      if(r.city.era===3)for(let n=0;n<6;n++)box(r,x,y,-.48+n*.16,.35,-.33+n*.16,.49,0,8,"#bcc6b8","#98aa98","#758e7e");
      box(r, x, y, -0.48, -0.48, 0.48, 0.48, 0, 6, r.season === 3 ? "#d8e0dc" : "#7aa64a", "#8a6a42", "#6f5434");
      for (let k2 = 0; k2 < 5; k2++) {
        const [sx, sy] = q(-0.35 + k2 * 0.17, 0.48, 3);
        c.fillStyle = "#8f8a7e"; c.beginPath(); c.ellipse(sx, sy, 3 * s, 2 * s, 0, 0, Math.PI * 2); c.fill();
      }
      break;
    }
    case "house": {
      shadow(r, x, y, 0.4);
      box(r, x, y, -0.32, -0.28, 0.32, 0.28, 0, 15 * hs, "#d9b98a", "#cfa874", "#b08a5a");
      if (lvl === 1) gable(r, x, y, -0.38, -0.34, 0.38, 0.34, 15 * hs, 12, "#7b5a3c", "#6a4c31", "#5f442c");
      else {
        gable(r, x, y, -0.38, -0.34, 0.38, 0.34, 15 * hs, 12, "#b0543a", "#994632", "#8c3f2c");
        tileRows(r, x, y, -0.38, 0.38, -0.34, 0.34, 15 * hs, 12, "rgba(90,30,20,.5)");
        if (lvl >= 3) upturn(r, x, y, -0.38, 0.38, -0.34, 0.34, 15 * hs, 12, "#8c3f2c");
        // veranda posts
        for (const u of [-0.3, 0, 0.3]) line(r, q(u, 0.4, 0), q(u, 0.4, 15 * hs - 2), "#6b4526", 1.3);
        poly(c, [q(-0.38, 0.28, 15 * hs - 1), q(0.38, 0.28, 15 * hs - 1), q(0.38, 0.44, 15 * hs - 4), q(-0.38, 0.44, 15 * hs - 4)], "#994632");
      }
      windowOn(r, x, y, -0.15, 0.28, 6 * hs, "left", night);
      windowOn(r, x, y, 0.32, -0.05, 6 * hs, "right", night);
      const a = q(0.08, 0.28, 0), b = q(0.2, 0.28, 0), cc = q(0.2, 0.28, 9), d = q(0.08, 0.28, 9);
      poly(c, [a, b, cc, d], "#5a3a22");
      box(r, x, y, 0.15, -0.2, 0.25, -0.1, 15 * hs, 15 * hs + 14, "#8a8378", "#7a7368", "#5f594f");
      smoke(r, x, y, 0.2, -0.15, 15 * hs + 16, i);
      break;
    }
    case "smelter": {
      if(r.city.era===3){box(r,x,y,-.39,-.38,.37,.36,0,4,"#bdc4b4","#96aa99","#738d7d");box(r,x,y,-.26,-.22,-.13,-.09,0,30,"#a6b6a8","#889e8c","#637f70");}
      shadow(r, x, y, 0.4);
      box(r, x, y, -0.3, -0.3, 0.3, 0.3, 0, 12, "#8d8173", "#7c7064", "#62584e");
      pyramid(r, x, y, -0.3, -0.3, 0.3, 0.3, 12, 8, "#6d6257", "#564d44");
      box(r, x, y, 0.05, -0.15, 0.2, 0, 12, 34, "#7e7266", "#6c6156", "#554c43");
      const gl = 0.6 + 0.3 * Math.sin(r.anim / 180 + i);
      const a = q(-0.12, 0.3, 0), b = q(0.12, 0.3, 0), cc = q(0.12, 0.3, 7), d = q(-0.12, 0.3, 7);
      poly(c, [a, b, cc, d], `rgba(255,${Math.round(120 + 60 * gl)},40,1)`);
      smoke(r, x, y, 0.12, -0.08, 36, i);
      break;
    }
    case "market": {
      if(r.city.era===3){box(r,x,y,-.4,-.3,.4,.3,0,4,"#bcc5b5","#99ac98","#768f7b");for(const u of [-.35,.3])box(r,x,y,u,-.23,u+.05,.23,4,17,"#c6d0c3","#a3b6a4","#7c9a86");}
      shadow(r, x, y, 0.42);
      box(r, x, y, -0.34, -0.2, 0.34, 0.25, 0, 6, "#8a6038", "#7a5430", "#634426");
      for (const u of [-0.32, 0.32]) for (const v of [-0.18, 0.23]) box(r, x, y, u - 0.02, v - 0.02, u + 0.02, v + 0.02, 6, 18, "#6b4526", "#5c3b20", "#4b301a");
      for (let k2 = 0; k2 < 4; k2++) {
        const u0 = -0.38 + k2 * 0.19;
        gable(r, x, y, u0, -0.26, u0 + 0.19, 0.31, 18, 6, k2 % 2 ? "#f1e4c6" : "#c94c38", k2 % 2 ? "#ddd0b2" : "#b04130", k2 % 2 ? "#e6d8b8" : "#b84434");
      }
      for (const [u, col] of [[-0.2, "#e1a43a"], [0, "#7fae47"], [0.2, "#c6384a"]] as const) {
        const [sx, sy] = q(u, 0.05, 7);
        c.fillStyle = col; c.beginPath(); c.arc(sx, sy, 2.5 * s, 0, Math.PI * 2); c.fill();
      }
      break;
    }
    case "stonehouse": {
      shadow(r, x, y, 0.42);
      box(r, x, y, -0.34, -0.3, 0.34, 0.3, 0, 20 * hs, "#d6d0c2", "#c4bdae", "#a39c8e");
      c.strokeStyle = "rgba(90,85,75,.35)"; c.lineWidth = Math.max(1, s * 0.8);
      for (let row = 1; row < 4; row++) { const a = q(-0.34, 0.3, row * 5 * hs), b = q(0.34, 0.3, row * 5 * hs); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); }
      if (lvl >= 3) {
        box(r, x, y, -0.42, -0.42, -0.16, -0.16, 0, 20 * hs + 34, "#d6d0c2", "#c4bdae", "#a39c8e");
        windowOn(r, x, y, -0.29, -0.16, 20 * hs + 22, "left", night);
        pyramid(r, x, y, -0.45, -0.45, -0.13, -0.13, 20 * hs + 34, 12, "#4f5a66", "#3b444e");
      }
      gable(r, x, y, -0.4, -0.36, 0.4, 0.36, 20 * hs, 13, "#4f5a66", "#45505b", "#3b444e");
      if (lvl >= 2) tileRows(r, x, y, -0.4, 0.4, -0.36, 0.36, 20 * hs, 13, "rgba(20,25,30,.45)");
      if (lvl >= 2) windowOn(r, x, y, -0.05, 0.3, 17 * hs, "left", night);
      windowOn(r, x, y, -0.18, 0.3, 10 * hs, "left", night);
      windowOn(r, x, y, 0.15, 0.3, 10 * hs, "left", night);
      windowOn(r, x, y, 0.34, 0, 10 * hs, "right", night);
      break;
    }
    case "forge": {
      shadow(r, x, y, 0.4);
      box(r, x, y, -0.34, -0.34, 0.1, 0.1, 0, 14, "#7d7368", "#6b6258", "#544c44");
      for (const [u, v] of [[0.3, -0.3], [0.3, 0.3], [-0.3, 0.3]]) box(r, x, y, u - 0.03, v - 0.03, u + 0.03, v + 0.03, 0, 16, "#6b4526", "#5c3b20", "#4b301a");
      gable(r, x, y, -0.38, -0.38, 0.36, 0.36, 16, 8, "#5d4a3a", "#4f3e31", "#46372b");
      box(r, x, y, 0.08, 0.1, 0.24, 0.2, 0, 6, "#3d3a38", "#33302e", "#282624");
      const p = (r.anim / 260 + i) % 1, [ax, ay] = q(0.16, 0.15, 8);
      c.fillStyle = `rgba(255,${180 + Math.round(60 * (1 - p))},80,${1 - p})`;
      for (let k2 = 0; k2 < 3; k2++) { c.beginPath(); c.arc(ax + (k2 - 1) * 5 * s * p, ay - 10 * s * p, 1.4 * s, 0, Math.PI * 2); c.fill(); }
      smoke(r, x, y, -0.15, -0.15, 20, i);
      break;
    }
    case "wheel": {
      shadow(r, x, y, 0.36);
      box(r, x, y, -0.3, -0.3, 0.12, 0.2, 0, 13 * hs, "#b88d5b", "#a57b4c", "#88643c");
      gable(r, x, y, -0.34, -0.34, 0.16, 0.24, 13 * hs, 9, "#7b5a3c", "#6a4c31", "#5f442c");
      const [wx, wy] = q(0.3, -0.05, 12), rad = 13 * s, a0 = r.anim / 900;
      c.strokeStyle = "#6b4526"; c.lineWidth = Math.max(1.5, 2.4 * s);
      c.beginPath(); c.ellipse(wx, wy, rad * 0.55, rad, -0.5, 0, Math.PI * 2); c.stroke();
      for (let k2 = 0; k2 < 6; k2++) {
        const a = a0 + (k2 * Math.PI) / 3, ex = Math.cos(a) * rad * 0.55, ey = Math.sin(a) * rad;
        c.beginPath(); c.moveTo(wx, wy); c.lineTo(wx + ex * Math.cos(-0.5) - ey * Math.sin(-0.5), wy + ex * Math.sin(-0.5) + ey * Math.cos(-0.5)); c.stroke();
      }
      break;
    }
    case "envoy": {
      const era = r.city.era;
      shadow(r, x, y, 0.4);
      if (era <= 1) {
        // messenger's hut: thatch, tall pole with a blue pennant, signal drum
        box(r, x, y, -0.26, -0.24, 0.22, 0.2, 0, 10 * hs, "#c79a63", "#b88a55", "#9a7044");
        pyramid(r, x, y, -0.32, -0.3, 0.28, 0.26, 10 * hs, 14 * hs, "#e2bd5e", "#c49a3f");
        flag(r, x, y, 0.36, 0.3, 0, 34, "#3f7fc4", i, true);
        const [dx, dy] = q(-0.3, 0.38, 0);
        c.fillStyle = "#8a5a2b"; c.fillRect(dx - 4 * s, dy - 7 * s, 8 * s, 7 * s);
        c.fillStyle = "#e8d8b0"; c.beginPath(); c.ellipse(dx, dy - 7 * s, 4 * s, 1.6 * s, 0, 0, Math.PI * 2); c.fill();
      } else if (era === 2) {
        // envoy's house: timber, red tiles, blue banner, hitching post
        box(r, x, y, -0.32, -0.28, 0.3, 0.26, 0, 14 * hs, "#c9a06a", "#b88f5c", "#977148");
        gable(r, x, y, -0.38, -0.34, 0.36, 0.32, 14 * hs, 11, "#b0543a", "#994632", "#8c3f2c");
        tileRows(r, x, y, -0.38, 0.36, -0.34, 0.32, 14 * hs, 11, "rgba(90,30,20,.5)");
        const a2 = q(-0.05, 0.26, 0), b2 = q(0.08, 0.26, 0), c2 = q(0.08, 0.26, 9), d2 = q(-0.05, 0.26, 9);
        poly(c, [a2, b2, c2, d2], "#4a2a18");
        poly(c, [q(0.3, -0.12, 12), q(0.3, 0.06, 12), q(0.3, 0.06, 3), q(0.3, -0.12, 3)], "#3f7fc4");
        line(r, q(0.4, 0.4, 0), q(0.4, 0.4, 8), "#6b4526", 1.4); line(r, q(0.32, 0.4, 7), q(0.46, 0.4, 7), "#6b4526", 1.2);
        lantern(r, x, y, -0.32, 0.3, 13 * hs, i);
      } else {
        // embassy: stone, blue tiled roof with upturned eaves, twin flags
        box(r, x, y, -0.42, -0.38, 0.42, 0.36, 0, 4, "#cfc6b4", "#b9b09c", "#9a917e");
        box(r, x, y, -0.34, -0.3, 0.34, 0.28, 4, 20 * hs, "#d6d0c2", "#c4bdae", "#a39c8e");
        gable(r, x, y, -0.42, -0.38, 0.42, 0.36, 20 * hs, 13, "#3f6fa8", "#355f91", "#2d527d");
        tileRows(r, x, y, -0.42, 0.42, -0.38, 0.36, 20 * hs, 13, "rgba(15,30,55,.5)");
        upturn(r, x, y, -0.42, 0.42, -0.38, 0.36, 20 * hs, 13, "#2d527d");
        windowOn(r, x, y, -0.15, 0.28, 10 * hs, "left", false); windowOn(r, x, y, 0.15, 0.28, 10 * hs, "left", false);
        flag(r, x, y, -0.44, 0.42, 0, 42, "#3f7fc4", i); flag(r, x, y, 0.44, 0.42, 0, 42, "#e2b240", i + 2);
      }
      break;
    }
    case "hall": {
      // village communal house: stone platform, red pillars, sweeping tiled roof
      shadow(r, x, y, 0.5);
      box(r, x, y, -0.48, -0.44, 0.48, 0.44, 0, 4, "#cfc6b4", "#b9b09c", "#9a917e");
      box(r, x, y, -0.4, -0.34, 0.4, 0.3, 4, 16, r.city.era===3?"#c6c8bc":"#a8743e", r.city.era===3?"#a3aea1":"#955f30", r.city.era===3?"#788e85":"#7a4c26");
      for (const u of [-0.36, -0.18, 0, 0.18, 0.36]) box(r, x, y, u - 0.025, 0.33, u + 0.025, 0.38, 4, 17, "#b8322a", "#a32a23", "#87221c");
      for (const v of [-0.22, 0, 0.2]) box(r, x, y, 0.42, v - 0.025, 0.47, v + 0.025, 4, 17, "#b8322a", "#a32a23", "#87221c");
      if (lvl >= 3) {
        // lower roof tier, then a raised upper tier
        gable(r, x, y, -0.5, -0.46, 0.5, 0.44, 17, 8, "#9c4a32", "#86402b", "#7a3a27");
        tileRows(r, x, y, -0.5, 0.5, -0.46, 0.44, 17, 8, "rgba(70,25,15,.5)");
        box(r, x, y, -0.3, -0.2, 0.3, 0.16, 21, 27, "#a8743e", "#955f30", "#7a4c26");
        gable(r, x, y, -0.4, -0.3, 0.4, 0.26, 27, 13, "#b0543a", "#994632", "#8c3f2c");
        tileRows(r, x, y, -0.4, 0.4, -0.3, 0.26, 27, 13, "rgba(90,30,20,.5)");
        upturn(r, x, y, -0.4, 0.4, -0.3, 0.26, 27, 13, "#7a3a27");
        const [mx, my] = q(0, -0.02, 40);
        c.fillStyle = "#f0c766"; c.beginPath(); c.arc(mx, my - 3 * s, 3 * s, 0, Math.PI * 2); c.fill();
      } else {
        gable(r, x, y, -0.48, -0.42, 0.48, 0.4, 17, 16 * hs, r.city.era===3?"#577d8d":"#b0543a", r.city.era===3?"#426371":"#994632", r.city.era===3?"#314e60":"#8c3f2c");
        tileRows(r, x, y, -0.48, 0.48, -0.42, 0.4, 17, 16 * hs, "rgba(90,30,20,.5)");
        upturn(r, x, y, -0.48, 0.48, -0.42, 0.4, 17, 16 * hs, "#7a3a27");
      }
      const a = q(-0.1, 0.3, 4), b2 = q(0.1, 0.3, 4), cc = q(0.1, 0.3, 13), d = q(-0.1, 0.3, 13);
      poly(c, [a, b2, cc, d], "#4a2a18");
      if (lvl >= 2) {
        // ceremonial drum on a stand by the steps
        const [dx, dy] = q(0.3, 0.46, 0);
        line(r, [dx - 3 * s, dy], [dx - 3 * s, dy - 7 * s], "#5c3b20", 1.2); line(r, [dx + 3 * s, dy], [dx + 3 * s, dy - 7 * s], "#5c3b20", 1.2);
        c.fillStyle = "#9b2c22"; c.beginPath(); c.ellipse(dx, dy - 10 * s, 4.5 * s, 4 * s, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = "#e8d8b0"; c.beginPath(); c.ellipse(dx + 1.5 * s, dy - 10 * s, 2 * s, 3.4 * s, 0, 0, Math.PI * 2); c.fill();
        lantern(r, x, y, -0.3, 0.38, 16, i); lantern(r, x, y, 0.3, 0.38, 16, i + 2);
      }
      if (lvl >= 3) { flag(r, x, y, -0.48, 0.46, 0, 44, "#e2b240", i); flag(r, x, y, 0.48, -0.44, 0, 44, "#c9503e", i + 3); }
      break;
    }
    case "barracks": {
      shadow(r, x, y, 0.44);
      box(r, x, y, -0.34, -0.26, 0.3, 0.2, 0, 13 * hs, "#9a7046", "#87613c", "#6d4e30");
      gable(r, x, y, -0.4, -0.32, 0.36, 0.26, 13 * hs, 9, "#6f4a2c", "#5f3f25", "#563820");
      // palisade along the front edges
      for (let k2 = 0; k2 < 6; k2++) {
        const u = -0.44 + k2 * 0.17;
        box(r, x, y, u, 0.4, u + 0.06, 0.46, 0, 12, "#a07648", "#8a6440", "#6f5032");
        poly(c, [q(u, 0.46, 12), q(u + 0.06, 0.46, 12), q(u + 0.03, 0.43, 16)], "#c49866");
      }
      // spear rack and banner
      for (let k2 = 0; k2 < 3; k2++) {
        const a = q(0.36 + k2 * 0.03, -0.3 + k2 * 0.08, 0), b2 = q(0.36 + k2 * 0.03, -0.3 + k2 * 0.08, 24);
        c.strokeStyle = "#6b4526"; c.lineWidth = Math.max(1, 1.2 * s); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b2[0], b2[1]); c.stroke();
        c.fillStyle = "#c9ccd1"; c.beginPath(); c.moveTo(b2[0], b2[1] - 4 * s); c.lineTo(b2[0] - 1.5 * s, b2[1]); c.lineTo(b2[0] + 1.5 * s, b2[1]); c.fill();
      }
      const [px0, py0] = q(-0.3, -0.24, 13 * hs + 9);
      c.strokeStyle = "#4b301a"; c.lineWidth = Math.max(1, 1.4 * s); c.beginPath(); c.moveTo(px0, py0); c.lineTo(px0, py0 - 16 * s); c.stroke();
      const wv = Math.sin(r.anim / 300 + i) * 1.5 * s;
      c.fillStyle = "#c9503e"; c.beginPath(); c.moveTo(px0, py0 - 16 * s); c.lineTo(px0 + 10 * s, py0 - 13 * s + wv); c.lineTo(px0, py0 - 9 * s); c.fill();
      break;
    }
    case "temple": {
      shadow(r, x, y, 0.5);
      box(r, x, y, -0.46, -0.46, 0.46, 0.46, 0, 8, "#e6d3a6", "#d2bd8c", "#b39f72");
      box(r, x, y, -0.36, -0.36, 0.36, 0.36, 8, 18, "#ecdcb4", "#d9c597", "#baa67a");
      box(r, x, y, -0.26, -0.26, 0.26, 0.26, 18, 34, "#f2e4c0", "#e0cfa3", "#c2b085");
      for (const u of [-0.2, -0.07, 0.07, 0.2]) box(r, x, y, u - 0.025, 0.24, u + 0.025, 0.28, 18, 34, "#fff6dc", "#f4e8c8", "#d8caa6");
      pyramid(r, x, y, -0.3, -0.3, 0.3, 0.3, 34, 22, "#e0a83a", "#b88424");
      const [tx, ty] = q(0, 0, 58);
      c.fillStyle = "#ffe08a"; c.beginPath(); c.arc(tx, ty, 3 * s, 0, Math.PI * 2); c.fill();
      break;
    }
  }
}

function drawScaffold(r: RC, x: number, y: number, p: number) {
  const q = tp(r, x, y), c = r.c, s = r.v.s, h = 22;
  c.strokeStyle = "#a07848"; c.lineWidth = Math.max(1, 1.6 * s);
  const posts: [number, number][] = [[-0.34, -0.34], [0.34, -0.34], [0.34, 0.34], [-0.34, 0.34]];
  for (const [u, v] of posts) { const a = q(u, v), b = q(u, v, h); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); }
  for (const z of [8, 16]) {
    c.beginPath();
    posts.forEach(([u, v], k) => { const pt = q(u, v, z); if (k) c.lineTo(pt[0], pt[1]); else c.moveTo(pt[0], pt[1]); });
    c.closePath(); c.stroke();
  }
  const [bx, by] = q(0, 0, h + 14);
  const w = 30 * s;
  c.fillStyle = "rgba(0,0,0,.6)"; c.fillRect(bx - w / 2, by, w, 4 * s + 1);
  c.fillStyle = "#f0c766"; c.fillRect(bx - w / 2, by, w * p, 4 * s + 1);
}

function drawSwimmer(r: RC, vl: Villager) {
  const c = r.c, s = Math.max(r.v.s * 1.45, 0.7);
  const [sx, sy] = P(r.v, vl.fx, vl.fy);
  const ph = r.anim / 260 + vl.seed * 10, wy = sy - 3 * s;
  // ripples and wake
  c.strokeStyle = "rgba(230,248,255,.7)"; c.lineWidth = Math.max(1, s);
  for (let k = 0; k < 2; k++) {
    const g = (r.anim / 900 + k * 0.5 + vl.seed) % 1;
    c.globalAlpha = 1 - g; c.beginPath(); c.ellipse(sx, wy + 1 * s, (4 + g * 7) * s, (1.6 + g * 2.4) * s, 0, 0, Math.PI * 2); c.stroke();
  }
  c.globalAlpha = 1;
  // shoulders just under the surface, head above
  c.fillStyle = vl.shirt; c.globalAlpha = 0.55; c.beginPath(); c.ellipse(sx, wy + 0.5 * s, 3.4 * s, 1.4 * s, 0, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
  // crawl stroke: one arm out of the water at a time
  const arm = Math.sin(ph), ax = sx + vl.face * (arm > 0 ? 4 : -1) * s, ay = wy - Math.max(0, arm) * 4 * s;
  c.strokeStyle = vl.skin; c.lineWidth = Math.max(1, 1.4 * s); c.lineCap = "round";
  c.beginPath(); c.moveTo(sx + vl.face * 1.5 * s, wy); c.quadraticCurveTo(sx + vl.face * 3 * s, ay - 2 * s, ax, ay); c.stroke(); c.lineCap = "butt";
  c.fillStyle = vl.skin; c.beginPath(); c.arc(sx + vl.face * 0.8 * s, wy - 2.4 * s, 2.3 * s, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#2b1e14"; c.beginPath(); c.arc(sx + vl.face * 0.8 * s, wy - 3.1 * s, 2.3 * s, Math.PI, 0); c.fill();
  if (vl.carrying && vl.carry === "wood") { c.fillStyle = "#8a5a2b"; c.fillRect(sx - 5 * s, wy - 1 * s, 10 * s, 2 * s); }
}

function drawVillager(r: RC, vl: Villager) {
  if (inWater(r, vl.fx, vl.fy)) { drawSwimmer(r, vl); return; }
  const c = r.c, s = Math.max(r.v.s * 1.45, 0.7);
  const [sx, sy] = P(r.v, vl.fx, vl.fy);
  const walking = vl.moving;
  const working = vl.state === "work" && !vl.moving;
  const run = vl.run && walking;
  const ph = r.anim / (run ? 75 : 140) + vl.seed * 10;
  const bob = walking ? Math.abs(Math.sin(ph)) * (run ? 2 : 1.2) * s : 0;
  const bend = working && (vl.job === "gather" || vl.job === "farm") ? (Math.sin(r.anim / 420 + vl.seed * 9) * 0.5 + 0.5) * 3 * s : 0;
  const face = vl.face;
  const lean = run ? 2.2 * s : vl.carrying ? 0.8 * s : 0; // lean forward when running or loaded
  const hipY = sy - 5 * s - bob, neckY = sy - 11 * s - bob + bend * 0.6;
  const headX = sx + face * (bend * 0.6 + lean), headY = sy - 13.5 * s - bob + bend;

  c.fillStyle = "rgba(20,30,10,.3)"; c.beginPath(); c.ellipse(sx, sy, 4 * s, 1.8 * s, 0, 0, Math.PI * 2); c.fill();
  // legs
  c.strokeStyle = "#3b2a1e"; c.lineWidth = Math.max(1.2, 1.6 * s); c.lineCap = "round";
  const leg = walking ? Math.sin(ph) * (run ? 3.4 : 2.2) * s : 0;
  c.beginPath(); c.moveTo(sx - 1 * s, hipY); c.lineTo(sx - 1 * s + leg, sy - (run && leg > 0 ? 1.2 * s : 0)); c.moveTo(sx + 1 * s, hipY); c.lineTo(sx + 1 * s - leg, sy - (run && leg < 0 ? 1.2 * s : 0)); c.stroke();
  // explorer's pack behind the back
  if (vl.job === "explore") { c.fillStyle = "#8a6a42"; c.beginPath(); c.ellipse(sx - face * 3 * s + face * lean * 0.5, neckY + 3.5 * s, 2.4 * s, 3.2 * s, 0, 0, Math.PI * 2); c.fill(); }
  // body
  c.fillStyle = vl.shirt;
  c.beginPath(); c.moveTo(sx - 2.8 * s, hipY + 0.5 * s); c.lineTo(sx + 2.8 * s, hipY + 0.5 * s); c.lineTo(headX + 2.2 * s, neckY); c.lineTo(headX - 2.2 * s, neckY); c.closePath(); c.fill();
  c.fillStyle = darken(vl.shirt, 0.25); c.fillRect(sx - 2.8 * s, hipY - 0.6 * s, 5.6 * s, 1.2 * s);
  // arm + tool
  const shX = headX + face * 1.6 * s, shY = neckY + 1 * s;
  c.strokeStyle = vl.skin; c.lineWidth = Math.max(1, 1.3 * s);
  const striker = vl.job === "wood" || vl.job === "quarry" || vl.job === "build" || vl.job === "smith";
  if (working && striker) {
    // raise slowly, strike fast: swing 1 = just hit (arm down), decays back to raised
    const a = 1.0 - 1.9 * vl.swing;
    const hx = shX + face * Math.cos(a) * 4 * s, hy = shY - Math.sin(a) * 4 * s;
    c.beginPath(); c.moveTo(shX, shY); c.lineTo(hx, hy); c.stroke();
    const tx = hx + face * Math.cos(a) * 5 * s, ty = hy - Math.sin(a) * 5 * s;
    c.strokeStyle = "#6b4526"; c.lineWidth = Math.max(1, 1.2 * s);
    c.beginPath(); c.moveTo(hx, hy); c.lineTo(tx, ty); c.stroke();
    if (vl.job === "quarry") { c.strokeStyle = "#c9ccd1"; c.beginPath(); c.moveTo(tx - 2.5 * s, ty + 1 * s); c.quadraticCurveTo(tx, ty - 1.5 * s, tx + 2.5 * s, ty + 1 * s); c.stroke(); }
    else if (vl.job === "wood") { c.fillStyle = "#c9ccd1"; c.beginPath(); c.moveTo(tx, ty - 1.8 * s); c.lineTo(tx + face * 2.6 * s, ty - 0.4 * s); c.lineTo(tx, ty + 1.8 * s); c.fill(); }
    else { c.fillStyle = "#8a8f96"; c.fillRect(tx - 1.6 * s, ty - 1.6 * s, 3.2 * s, 3.2 * s); }
  } else if (vl.job === "hunt" && !vl.carrying) {
    // spear held high; thrown arm flicks forward right after a throw
    const thrown = vl.swing > 0.4;
    const hx = shX + face * (thrown ? 4.5 : 1.5) * s, hy = shY - (thrown ? 1 : 3.5) * s;
    c.beginPath(); c.moveTo(shX, shY); c.lineTo(hx, hy); c.stroke();
    if (!thrown) {
      c.strokeStyle = "#6b4526"; c.beginPath(); c.moveTo(hx - face * 5 * s, hy + 1.5 * s); c.lineTo(hx + face * 6 * s, hy - 2 * s); c.stroke();
      c.fillStyle = "#cfc6b4"; c.beginPath(); c.moveTo(hx + face * 8 * s, hy - 2.6 * s); c.lineTo(hx + face * 5.5 * s, hy - 3 * s); c.lineTo(hx + face * 5.8 * s, hy - 1.2 * s); c.fill();
    }
  } else if (working && vl.job === "farm") {
    const a = 0.3 + Math.sin(r.anim / 170 + vl.seed * 20) * 0.5, hx = shX + face * 4 * s, hy = shY + 3 * s;
    c.beginPath(); c.moveTo(shX, shY); c.lineTo(hx, hy); c.stroke();
    c.strokeStyle = "#6b4526"; c.beginPath(); c.moveTo(hx - face * 3 * s, hy - 5 * s * Math.cos(a)); c.lineTo(hx + face * 2 * s, sy - 0.5 * s); c.stroke();
  } else if (working && vl.job === "gather") {
    c.beginPath(); c.moveTo(shX, shY); c.lineTo(shX + face * 3 * s, sy - 3 * s + bend * 0.2); c.stroke();
    c.fillStyle = "#9b6f3d"; c.beginPath(); c.ellipse(sx - face * 3.5 * s, sy - 1.5 * s, 2.6 * s, 1.6 * s, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#c6384a"; c.beginPath(); c.arc(sx - face * 3.5 * s, sy - 2.6 * s, 1 * s, 0, Math.PI * 2); c.fill();
  } else if (vl.job === "explore") {
    // walking stick
    const st = walking ? Math.sin(ph) * 1.5 * s : 0;
    c.beginPath(); c.moveTo(shX, shY); c.lineTo(shX + face * 2.5 * s, shY + 3 * s); c.stroke();
    c.strokeStyle = "#7a5530"; c.beginPath(); c.moveTo(shX + face * 2.5 * s, shY - 2 * s); c.lineTo(shX + face * 3.5 * s + st, sy); c.stroke();
  } else if (working && vl.job === "trade") {
    c.beginPath(); c.moveTo(shX, shY); c.lineTo(shX + face * 2.5 * s, shY - 3 * s - Math.abs(Math.sin(r.anim / 300)) * 2 * s); c.stroke();
  } else if (vl.carrying && vl.state === "toHome") {
    c.beginPath(); c.moveTo(shX, shY); c.lineTo(shX - face * 1 * s, shY - 2.5 * s); c.stroke(); // steadying the load
  } else {
    const aw = walking ? -Math.sin(ph) * (run ? 3 : 1.8) * s : 0;
    c.beginPath(); c.moveTo(shX, shY); c.lineTo(shX + aw + face * (run ? 1.5 : 0) * s, hipY + (run ? -2 : 0) * s); c.stroke();
  }
  c.lineCap = "butt";
  // head + hat
  c.fillStyle = vl.skin; c.beginPath(); c.arc(headX, headY, 2.3 * s, 0, Math.PI * 2); c.fill();
  if (vl.job === "farm" || vl.job === "gather" || vl.job === "explore") {
    c.fillStyle = "#e8d39a"; c.beginPath(); c.moveTo(headX, headY - 5 * s); c.lineTo(headX - 4.6 * s, headY - 0.6 * s); c.lineTo(headX + 4.6 * s, headY - 0.6 * s); c.closePath(); c.fill();
    c.fillStyle = "#c9b278"; c.beginPath(); c.moveTo(headX, headY - 5 * s); c.lineTo(headX + 4.6 * s, headY - 0.6 * s); c.lineTo(headX + 1 * s, headY - 0.6 * s); c.closePath(); c.fill();
  } else if (vl.job === "build") {
    c.fillStyle = "#e2b240"; c.beginPath(); c.arc(headX, headY - 0.6 * s, 2.6 * s, Math.PI, 0); c.fill(); c.fillRect(headX - 3.2 * s, headY - 0.8 * s, 6.4 * s, 0.9 * s);
  } else {
    c.fillStyle = "#2b1e14"; c.beginPath(); c.arc(headX, headY - 0.7 * s, 2.3 * s, Math.PI, 0); c.fill();
    c.fillStyle = vl.band; c.fillRect(headX - 2.3 * s, headY - 1.2 * s, 4.6 * s, 0.9 * s);
  }
  // loads
  if (vl.carrying && vl.state === "toHome" && vl.carry) {
    const shoulder = headY + 1.5 * s;
    if (vl.carry === "wood") {
      // log over the shoulder
      c.save(); c.translate(headX - face * 1 * s, shoulder); c.rotate(-face * 0.35);
      c.fillStyle = "#8a5a2b"; c.fillRect(-6 * s, -1.4 * s, 12 * s, 2.8 * s);
      c.fillStyle = "#e0b27a"; c.beginPath(); c.ellipse(face * 6 * s, 0, 0.9 * s, 1.4 * s, 0, 0, Math.PI * 2); c.fill();
      c.restore();
    } else if (vl.job === "hunt") {
      // haunch of meat on the shoulder
      c.fillStyle = "#b5523e"; c.beginPath(); c.ellipse(headX - face * 2.5 * s, shoulder - 1 * s, 3.4 * s, 2.2 * s, -face * 0.4, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#f2ead8"; c.fillRect(headX - face * 6 * s - 0.6 * s, shoulder - 2.4 * s, 1.6 * s, 1.2 * s);
    } else {
      const by = headY - 4.2 * s;
      if (vl.carry === "stone") { c.fillStyle = "#c9c2b2"; c.beginPath(); c.ellipse(headX, by, 3 * s, 2 * s, 0, 0, Math.PI * 2); c.fill(); }
      else if (vl.carry === "copper") { c.fillStyle = "#d9813a"; c.fillRect(headX - 2.5 * s, by - 1.2 * s, 5 * s, 2.4 * s); }
      else { c.fillStyle = "#9b6f3d"; c.beginPath(); c.ellipse(headX, by + 0.5 * s, 3.2 * s, 1.8 * s, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = "#d9443f"; c.beginPath(); c.arc(headX - 1 * s, by - 0.8 * s, 1.1 * s, 0, Math.PI * 2); c.arc(headX + 1.2 * s, by - 0.6 * s, 1.1 * s, 0, Math.PI * 2); c.fill(); }
    }
  }
}

function drawAnimal(r: RC, kind: "deer" | "boar", fx: number, fy: number, face: 1 | -1, graze: boolean, buck: boolean, seed: number) {
  const c = r.c, s = Math.max(r.v.s * 1.3, 0.6);
  const [sx, sy] = P(r.v, fx, fy);
  const body = kind === "deer" ? "#a8693a" : "#4d3d33", belly = kind === "deer" ? "#e8cfa8" : "#6b574a";
  c.fillStyle = "rgba(20,30,10,.28)"; c.beginPath(); c.ellipse(sx, sy, 6 * s, 2 * s, 0, 0, Math.PI * 2); c.fill();
  const legH = kind === "deer" ? 6 : 3.5, step = Math.sin(r.anim / 300 + seed * 9) * (graze ? 0 : 1.2) * s;
  c.strokeStyle = darken(body, 0.3); c.lineWidth = Math.max(1, 1.2 * s);
  c.beginPath();
  for (const lx of [-3.5, -2, 2.5, 4]) { c.moveTo(sx + lx * s * face, sy - legH * s); c.lineTo(sx + lx * s * face + (lx > 0 ? step : -step), sy); }
  c.stroke();
  const by = sy - legH * s - 2.5 * s;
  c.fillStyle = body; c.beginPath(); c.ellipse(sx, by, 5.5 * s, kind === "deer" ? 3 * s : 3.6 * s, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = belly; c.beginPath(); c.ellipse(sx, by + 1.2 * s, 3.8 * s, 1.4 * s, 0, 0, Math.PI); c.fill();
  const hx = sx + face * 5.5 * s, hy = graze ? by + 3.5 * s : by - (kind === "deer" ? 4 : 1) * s;
  c.strokeStyle = body; c.lineWidth = Math.max(1.5, 2.2 * s);
  c.beginPath(); c.moveTo(sx + face * 3.5 * s, by - 1 * s); c.lineTo(hx, hy); c.stroke();
  c.fillStyle = body; c.beginPath(); c.ellipse(hx + face * 1.2 * s, hy, 2.4 * s, 1.6 * s, 0, 0, Math.PI * 2); c.fill();
  if (kind === "deer") {
    c.fillStyle = "#fff"; c.beginPath(); c.arc(sx - face * 5.2 * s, by - 1 * s, 1 * s, 0, Math.PI * 2); c.fill();
    if (buck) {
      c.strokeStyle = "#e8d8b0"; c.lineWidth = Math.max(1, 0.9 * s); c.beginPath();
      c.moveTo(hx, hy - 1 * s); c.lineTo(hx - face * 1 * s, hy - 5 * s); c.lineTo(hx - face * 2.5 * s, hy - 6 * s);
      c.moveTo(hx - face * 0.6 * s, hy - 3.5 * s); c.lineTo(hx + face * 1 * s, hy - 5 * s); c.stroke();
    }
  } else {
    c.fillStyle = "#f2ead8"; c.beginPath(); c.arc(hx + face * 2.6 * s, hy + 0.8 * s, 0.8 * s, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#2f241e"; c.fillRect(sx - 3 * s, by - 3.6 * s, 6 * s, 1 * s);
  }
}

const UNIT_LOOK: Record<UKey, { shirt: string; weapon: "club" | "sling" | "spear" | "bow" | "sword" }> = {
  club: { shirt: "#8a5a2b", weapon: "club" }, sling: { shirt: "#a37a4a", weapon: "sling" },
  spear: { shirt: "#b07a2e", weapon: "spear" }, bow: { shirt: "#4f7a3a", weapon: "bow" },
  sword: { shirt: "#5a6672", weapon: "sword" }, elephant: { shirt: "#8f8f8f", weapon: "spear" },
};

export function drawSoldier(r: RC, u: UKey, fx: number, fy: number, face: 1 | -1, walking: boolean, seed: number, fighting = false, barbarian = false) {
  const c = r.c, s = Math.max(r.v.s * 1.45, 0.7);
  const [sx, sy] = P(r.v, fx, fy);
  const ph = r.anim / 140 + seed * 10;
  if (u === "elephant") {
    const e = s * 1.6, step = walking ? Math.sin(ph * 0.6) * 1.5 * e : 0;
    c.fillStyle = "rgba(20,30,10,.3)"; c.beginPath(); c.ellipse(sx, sy, 9 * e, 3 * e, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#7d7f80";
    for (const lx of [-5, -2, 3, 6]) c.fillRect(sx + lx * e * face - 1.2 * e + (lx > 0 ? step : -step), sy - 7 * e, 2.4 * e, 7 * e);
    c.fillStyle = "#8f9192"; c.beginPath(); c.ellipse(sx, sy - 10 * e, 8 * e, 5 * e, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(sx + face * 7 * e, sy - 12 * e, 3.6 * e, 0, Math.PI * 2); c.fill();
    c.strokeStyle = "#8f9192"; c.lineWidth = 2 * e; c.beginPath(); c.moveTo(sx + face * 9.5 * e, sy - 11 * e); c.quadraticCurveTo(sx + face * 12 * e, sy - 6 * e, sx + face * 10 * e, sy - 3 * e); c.stroke();
    c.fillStyle = "#f2ead8"; c.beginPath(); c.moveTo(sx + face * 9 * e, sy - 10 * e); c.lineTo(sx + face * 12.5 * e, sy - 9 * e); c.lineTo(sx + face * 9 * e, sy - 9 * e); c.fill();
    c.fillStyle = "#c9503e"; c.fillRect(sx - 4 * e, sy - 15.5 * e, 8 * e, 2 * e);
    c.fillStyle = "#e2b240"; c.beginPath(); c.arc(sx - 1 * e, sy - 18 * e, 2 * e, 0, Math.PI * 2); c.fill();
    return;
  }
  const look = barbarian ? { shirt: "#4a1f1a", weapon: "club" as const } : UNIT_LOOK[u];
  const bob = walking ? Math.abs(Math.sin(ph)) * 1.2 * s : 0;
  c.fillStyle = "rgba(20,30,10,.3)"; c.beginPath(); c.ellipse(sx, sy, 4 * s, 1.8 * s, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = "#3b2a1e"; c.lineWidth = Math.max(1.2, 1.6 * s); c.lineCap = "round";
  const leg = walking ? Math.sin(ph) * 2.2 * s : 0, hipY = sy - 5 * s - bob;
  c.beginPath(); c.moveTo(sx - 1 * s, hipY); c.lineTo(sx - 1 * s + leg, sy); c.moveTo(sx + 1 * s, hipY); c.lineTo(sx + 1 * s - leg, sy); c.stroke();
  c.fillStyle = look.shirt; c.beginPath(); c.moveTo(sx - 3 * s, hipY + 0.5 * s); c.lineTo(sx + 3 * s, hipY + 0.5 * s); c.lineTo(sx + 2.3 * s, sy - 11 * s - bob); c.lineTo(sx - 2.3 * s, sy - 11 * s - bob); c.closePath(); c.fill();
  const hy = sy - 13.5 * s - bob;
  c.fillStyle = "#e0b48a"; c.beginPath(); c.arc(sx, hy, 2.3 * s, 0, Math.PI * 2); c.fill();
  // helmet by era
  c.fillStyle = u === "sword" ? "#9aa3ad" : u === "spear" || u === "bow" ? "#c08a3a" : "#5a3a22";
  c.beginPath(); c.arc(sx, hy - 0.5 * s, 2.5 * s, Math.PI, 0); c.fill();
  const swing = fighting ? Math.sin(r.anim / 120 + seed * 20) : 0;
  const shX = sx + face * 2 * s, shY = sy - 10 * s - bob;
  c.lineWidth = Math.max(1, 1.2 * s);
  if (look.weapon === "spear") {
    c.strokeStyle = "#6b4526"; const tx = shX + face * (3 + swing * 3) * s;
    c.beginPath(); c.moveTo(shX - face * 2 * s, shY + 6 * s); c.lineTo(tx, shY - 10 * s); c.stroke();
    c.fillStyle = "#d9a050"; c.beginPath(); c.moveTo(tx, shY - 13 * s); c.lineTo(tx - 1.3 * s, shY - 9.5 * s); c.lineTo(tx + 1.3 * s, shY - 9.5 * s); c.fill();
  } else if (look.weapon === "bow") {
    c.strokeStyle = "#7a5230"; c.beginPath(); c.arc(shX + face * 2 * s, shY - 1 * s, 4.5 * s, face > 0 ? -1.3 : Math.PI - 1.8, face > 0 ? 1.3 : Math.PI + 1.8); c.stroke();
  } else if (look.weapon === "sword") {
    c.fillStyle = "#6f7a85"; c.beginPath(); c.ellipse(sx - face * 2.5 * s, sy - 8 * s - bob, 2.2 * s, 3.4 * s, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = "#dfe4ea"; const a = -0.9 + swing * 1.2;
    c.beginPath(); c.moveTo(shX, shY); c.lineTo(shX + face * Math.cos(a) * 8 * s, shY - Math.sin(a) * 8 * s); c.stroke();
  } else {
    c.strokeStyle = look.weapon === "club" ? "#6b4526" : "#a07648"; const a = -0.5 + swing * 1.1;
    c.beginPath(); c.moveTo(shX, shY); c.lineTo(shX + face * Math.cos(a) * 6 * s, shY - Math.sin(a) * 6 * s); c.stroke();
    if (look.weapon === "club") { c.fillStyle = "#6b4526"; c.beginPath(); c.arc(shX + face * Math.cos(a) * 6 * s, shY - Math.sin(a) * 6 * s, 1.6 * s, 0, Math.PI * 2); c.fill(); }
  }
  c.lineCap = "butt";
}

function drawCampSite(r: RC, k: Camp) {
  const x = k.at % W, y = Math.floor(k.at / W), c = r.c, s = r.v.s, q = tp(r, x, y);
  if (k.cleared) {
    for (const [u, v] of [[-0.2, 0.1], [0.15, -0.15], [0.1, 0.25]]) {
      const [sx, sy] = q(u, v);
      c.fillStyle = "#3a332c"; c.beginPath(); c.ellipse(sx, sy, 7 * s, 3.5 * s, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#5c5046"; c.fillRect(sx - 4 * s, sy - 2 * s, 8 * s, 1.5 * s);
    }
    smoke(r, x, y, 0, 0, 4, k.id);
    return;
  }
  shadow(r, x, y, 0.48);
  for (const [u, v, col] of [[-0.22, -0.18, "#8c6e4a"], [0.18, -0.2, "#7a5f3e"], [-0.05, 0.12, "#96774f"]] as const) {
    pyramid(r, x, y, u - 0.14, v - 0.14, u + 0.14, v + 0.14, 0, 16, col, darken(col, 0.25));
  }
  // sharpened stakes ring
  for (let a = 0; a < 12; a++) {
    const ang = (a / 12) * Math.PI * 2, u = Math.cos(ang) * 0.44, v = Math.sin(ang) * 0.44;
    const b0 = q(u, v), b1 = q(u * 1.08, v * 1.08, 11);
    c.strokeStyle = "#5c3d22"; c.lineWidth = Math.max(1.2, 2 * s); c.beginPath(); c.moveTo(b0[0], b0[1]); c.lineTo(b1[0], b1[1]); c.stroke();
  }
  const [fx, fy] = q(0.15, 0.2);
  c.fillStyle = "#ef7d22"; c.beginPath(); c.arc(fx, fy - 3 * s, 3 * s * (1 + 0.15 * Math.sin(r.anim / 100)), 0, Math.PI * 2); c.fill();
  smoke(r, x, y, 0.15, 0.2, 8, k.id);
  const [bx, by] = q(-0.3, 0.3, 0);
  c.strokeStyle = "#2b1e14"; c.lineWidth = Math.max(1, 1.4 * s); c.beginPath(); c.moveTo(bx, by); c.lineTo(bx, by - 28 * s); c.stroke();
  c.fillStyle = "#3a1a1a"; c.beginPath(); c.moveTo(bx, by - 28 * s); c.lineTo(bx + 11 * s, by - 24 * s + Math.sin(r.anim / 250) * 1.5 * s); c.lineTo(bx, by - 19 * s); c.fill();
  c.fillStyle = "#e8e0d0"; c.beginPath(); c.arc(bx + 4 * s, by - 24 * s, 1.6 * s, 0, Math.PI * 2); c.fill();
  // power badge
  const [tx, ty] = q(0, 0, 34);
  const label = `⚔ ${k.power}`;
  c.font = `700 ${Math.max(11, Math.round(9 * s))}px system-ui, sans-serif`; c.textAlign = "center"; c.textBaseline = "middle";
  const w = c.measureText(label).width + 10;
  c.fillStyle = "rgba(60,15,15,.85)"; c.fillRect(tx - w / 2, ty - 9, w, 18);
  c.fillStyle = "#ffd9c9"; c.fillText(label, tx, ty + 0.5);
}

/** Draw a figure standing in the river: sunk to the waist with ripples around it. */
function inWater(r: RC, fx: number, fy: number) {
  const tx = Math.floor(fx), ty = Math.floor(fy);
  return inb(tx, ty) && r.city.t[idx(tx, ty)] === R;
}
function wade(r: RC, fx: number, fy: number, draw: () => void) {
  const c = r.c, s = Math.max(r.v.s * 1.45, 0.7);
  const [sx, sy] = P(r.v, fx, fy);
  const sink = 6 * s, line = sy - 4 * s * 0.6; // water surface sits a bit above the feet
  c.save();
  c.beginPath(); c.rect(sx - 60 * s, sy - 80 * s, 120 * s, 80 * s - (sy - line)); c.clip();
  c.translate(0, sink);
  draw();
  c.restore();
  const ph = r.anim / 400;
  c.strokeStyle = "rgba(225,245,255,.75)"; c.lineWidth = Math.max(1, s);
  for (let k = 0; k < 2; k++) {
    const g = (ph + k * 0.5) % 1;
    c.globalAlpha = 1 - g;
    c.beginPath(); c.ellipse(sx, line + 1 * s, (4 + g * 6) * s, (1.6 + g * 2) * s, 0, 0, Math.PI * 2); c.stroke();
  }
  c.globalAlpha = 1;
}

/** Animated positions of a herd's animals (deterministic from time). */
export function herdAnimals(city: City, h: { id: number; at: number; n: number }, anim: number) {
  const n = Math.ceil(h.n - 0.05), out: { fx: number; fy: number; face: 1 | -1; graze: boolean }[] = [];
  const cx = (h.at % W) + 0.5, cy = Math.floor(h.at / W) + 0.5;
  for (let k = 0; k < n; k++) {
    const sd = hr(city.seed, h.id * 31 + k), a = anim / (9000 + sd * 6000) + sd * 6.28;
    const rad = 0.6 + sd * 1.4;
    let ox = Math.cos(a) * rad, oy = Math.sin(a * 0.8) * rad;
    const wet = (dx: number, dy: number) => {
      const tx = Math.floor(cx + dx), ty = Math.floor(cy + dy);
      return !inb(tx, ty) || city.t[idx(tx, ty)] === R;
    };
    if (wet(ox, oy)) { ox = -ox; oy = -oy; }
    if (wet(ox, oy)) { ox *= 0.2; oy *= 0.2; }
    if (wet(ox, oy)) { ox = 0; oy = 0; }
    const fx = cx + ox, fy = cy + oy;
    const da = -Math.sin(a) * rad - Math.cos(a * 0.8) * rad * 0.8; // screen-x direction of motion
    out.push({ fx, fy, face: da >= 0 ? 1 : -1, graze: Math.sin(anim / 2500 + sd * 20) > 0.3 });
  }
  return out;
}

type HitShape = { u0: number; v0: number; u1: number; v1: number; wall: number; roof?: number; pyramid?: boolean; z?: number };

/** Match the main solid silhouettes; ignore smoke, shadows and thin waving flags. */
function buildingHitShapes(k: BKey, lvl: number, era: number): HitShape[] {
  const hs = 1 + .2 * Math.max(0, lvl - 1);
  const shape = (u0: number, v0: number, u1: number, v1: number, wall: number, roof = 0, pyramid = false): HitShape => ({ u0, v0, u1, v1, wall, roof, pyramid });
  if (k === "hut" && era > 1) return buildingHitShapes(era === 2 ? "house" : "stonehouse",lvl,era);
  if (k === "house" && era === 3) return buildingHitShapes("stonehouse",lvl,era);
  switch (k) {
    case "hut": return [lvl >= 3 ? shape(-.4, -.36, .4, .36, 22, 14) : lvl === 2 ? shape(-.36, -.32, .36, .32, 11, 12) : shape(-.32, -.32, .32, .32, 9, 16, true)];
    case "house": return [shape(-.38, -.34, .38, .34, 15 * hs, 12), { ...shape(.15, -.2, .25, -.1, 14), z: 15 * hs }];
    case "stonehouse": return [shape(-.4, -.36, .4, .36, 20 * hs, 13), ...(lvl >= 3 ? [shape(-.45, -.45, -.13, -.13, 20 * hs + 34, 12, true)] : [])];
    case "gather": return [shape(-.37, -.37, .07, .13, 9*hs, 7), shape(-.2, -.1, .38, .4, 3)];
    case "wood": return [shape(-.36, -.36, .06, .04, 9 * hs, 7), shape(.05, .15, .38, .35, 5)];
    case "quarry": return [shape(-.34, -.32, .34, .34, 15), ...(era>1?[shape(-.34,-.25,.34,-.18,24)]:[])];
    case "storehouse": return [shape(-.4, -.36, .4, .36, 13 * hs, 10)];
    case "fire": return [shape(-.22, -.22, .22, .22, 1, 20, true)];
    case "farm": return [shape(-.46, -.46, .46, .46, 3 * hs)];
    case "canal": return [shape(-.25, -.25, .25, .25, 1)];
    case "levee": return [shape(-.48, -.48, .48, .48, 6)];
    case "smelter": return [shape(-.3, -.3, .3, .3, 12, 8, true), shape(.05, -.15, .2, 0, 34)];
    case "market": return [shape(-.38, -.26, .38, .31, 18, 6)];
    case "forge": return [shape(-.39, -.33, .37, .31, 16*hs, 9)];
    case "wheel": return [shape(-.34, -.34, .16, .24, 13 * hs, 9), shape(.14, -.2, .46, .12, 22)];
    case "envoy": return [era <= 1 ? shape(-.32, -.3, .28, .26, 10 * hs, 14 * hs, true) : era === 2 ? shape(-.38, -.34, .36, .32, 14 * hs, 11) : shape(-.42, -.38, .42, .36, 20 * hs, 13)];
    case "hall": return [shape(-.48, -.44, .48, .44, 4), shape(-.48, -.42, .48, .4, 17, lvl >= 3 ? 8 : 16 * hs), ...(lvl >= 3 ? [{ ...shape(-.4, -.3, .4, .26, 6, 13), z: 21 }] : [])];
    case "barracks": return [shape(-.4, -.32, .36, .26, 13 * hs, 9), shape(-.44, .4, .47, .46, 13)];
    case "temple": return [shape(-.46, -.46, .46, .46, 8), shape(-.36, -.36, .36, .36, 18), shape(-.3, -.3, .3, .3, 34, 22, true)];
    case "wall": return [shape(-.5, -.12, .5, .12, (era === 1 ? 14 : 18) * hs, 4)];
    case "gate": return [shape(-.46, -.16, .46, .16, 22 * hs, era > 1 ? 8 : 0)];
    case "watchtower": return [shape(-.4, -.4, .4, .4, (era === 1 ? 25 : 32) * hs, 10, era === 1)];
  }
}

function pointInPolygon(x: number, y: number, points: Pt[]) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [ax, ay] = points[j], [bx, by] = points[i];
    const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax);
    if (Math.abs(cross) < .01 && x >= Math.min(ax, bx) - .01 && x <= Math.max(ax, bx) + .01 && y >= Math.min(ay, by) - .01 && y <= Math.max(ay, by) + .01) return true;
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

/** Pick solid building faces in reverse painter order, including roofs above their ground tile. */
export function pickBuilding(v: View, city: City, sx: number, sy: number): { x: number; y: number } | null {
  const candidates = buildings(city).filter(([tile]) => city.seen[tile]).sort(([a], [b]) => (b % W + Math.floor(b / W)) - (a % W + Math.floor(a / W)) || Math.floor(b / W) - Math.floor(a / W));
  for (const [tile, building] of candidates) {
    const x = tile % W, y = Math.floor(tile / W);
    for (const h of buildingHitShapes(building.k, Math.max(1, building.lvl), city.era)) {
      const q = (u: number, w: number, z: number): Pt => P(v, x + .5 + u, y + .5 + w, z * v.s);
      const z = h.z ?? 0, top = z + h.wall;
      const a = q(h.u0, h.v0, z), b = q(h.u1, h.v0, z), c = q(h.u1, h.v1, z), d = q(h.u0, h.v1, z);
      const A = q(h.u0, h.v0, top), B = q(h.u1, h.v0, top), C = q(h.u1, h.v1, top), D = q(h.u0, h.v1, top);
      const faces: Pt[][] = [[d, c, C, D], [b, c, C, B], [A, B, C, D]];
      if (h.roof) {
        if (h.pyramid) { const apex = q((h.u0 + h.u1) / 2, (h.v0 + h.v1) / 2, top + h.roof); faces.push([A, B, apex], [B, C, apex], [C, D, apex], [D, A, apex]); }
        else { const left = q(h.u0, (h.v0 + h.v1) / 2, top + h.roof), right = q(h.u1, (h.v0 + h.v1) / 2, top + h.roof); faces.push([A, B, right, left], [left, right, C, D], [B, C, right]); }
      }
      if (faces.some((face) => pointInPolygon(sx, sy, face))) return { x, y };
    }
  }
  return null;
}

/** Herd whose animal is under a screen point, if any. */
export function pickHerd(v: View, city: City, anim: number, sx: number, sy: number) {
  const s = Math.max(v.s * 1.3, 0.6);
  let best: number | null = null, bd = 1e9;
  for (const h of city.herds) {
    if (!city.seen[h.at] || h.n < 1) continue;
    for (const a of herdAnimals(city, h, anim || 1)) {
      const [x, y] = P(v, a.fx, a.fy);
      const d = Math.hypot(sx - x, sy - (y - 8 * s));
      if (d < Math.max(12, 12 * s) && d < bd) { bd = d; best = h.id; }
    }
  }
  return best;
}

/** Topmost villager under a screen point, if any. */
export function pickVillager(v: View, list: Villager[], sx: number, sy: number) {
  const s = Math.max(v.s * 1.45, 0.7);
  let best: Villager | null = null, bd = 1e9;
  for (const vl of list) {
    if (!vl.visible || vl.id === null) continue;
    const [x, y] = P(v, vl.fx, vl.fy);
    const d = Math.hypot(sx - x, sy - (y - 8 * s));
    if (d < Math.max(18, 14 * s) && d < bd) { bd = d; best = vl; }
  }
  return best;
}

export type DrawOpts = {
  v: View;
  now: number;
  anim: number;
  hover: { x: number; y: number } | null;
  selected: { x: number; y: number } | null;
  tool: BKey | null;
  villagers: Villager[];
  picked: Set<number>;
  fx: Fx[];
  chopping: Set<number>;
};

export function drawCity(c: Ctx, city: City, D: Derived, o: DrawOpts) {
  const v = o.v;
  const r: RC = { c, v, city, D, anim: o.anim, now: o.now, season: seasonAt(city, o.now) };
  c.clearRect(0, 0, v.width, v.height);
  const lod = v.TW < 26;

  // visible tile window (with margin for tall objects)
  const onScreen = (x: number, y: number) => {
    const [sx, sy] = P(v, x + 0.5, y + 0.5);
    return sx > -v.TW && sx < v.width + v.TW && sy > -v.TW * 0.5 && sy < v.height + v.TW * 2;
  };
  const vis = new Uint8Array(W * H);
  const bounds = visibleTileBounds(v), visible: number[] = [];
  for (let y = bounds.y0; y <= bounds.y1; y++) for (let x = bounds.x0; x <= bounds.x1; x++) if (onScreen(x, y)) {
    const i = idx(x, y); vis[i] = 1; visible.push(i);
  }
  const seen = city.seen;
  const nearSeen = (x: number, y: number) => {
    for (const [dx, dy] of N8) if (inb(x + dx, y + dy) && seen[idx(x + dx, y + dy)]) return true;
    return false;
  };

  // 1. ground, back to front
  for (let d = bounds.x0 + bounds.y0; d <= bounds.x1 + bounds.y1; d++) for (let x = Math.max(bounds.x0, d - bounds.y1); x <= Math.min(bounds.x1, d - bounds.y0); x++) {
    const y = d - x, i = idx(x, y);
    if (!vis[i]) continue;
    if (seen[i]) { drawGroundTile(r, x, y); continue; }
    const q = tp(r, x, y), edge = nearSeen(x, y);
    if (edge) drawGroundTile(r, x, y);
    poly(c, [q(-0.5, -0.5), q(0.5, -0.5), q(0.5, 0.5), q(-0.5, 0.5)], edge ? "rgba(22,33,30,.72)" : "#18241f");
    if (x === W - 1) poly(c, [q(0.5, -0.5), q(0.5, 0.5), q(0.5, 0.5, -16), q(0.5, -0.5, -16)], "#101814");
    if (y === H - 1) poly(c, [q(-0.5, 0.5), q(0.5, 0.5), q(0.5, 0.5, -16), q(-0.5, 0.5, -16)], "#131c18");
    if (!lod) {
      const [sx, sy] = q(hr(city.seed, i) - 0.5, hr(city.seed, i * 3) - 0.5, 0);
      c.fillStyle = "rgba(200,215,205,.05)"; c.beginPath(); c.ellipse(sx, sy, v.TW * 0.45, v.TH * 0.45, 0, 0, Math.PI * 2); c.fill();
    }
  }

  // 2. flat overlays
  const diamond = (x: number, y: number, inset = 0) => {
    const q = tp(r, x, y), e = 0.5 - inset;
    return [q(-e, -e), q(e, -e), q(e, e), q(-e, e)] as Pt[];
  };
  if (r.season === 1 || r.season === 2) {
    for (const i of visible) {
      if (!seen[i] || D.rd[i] !== 1 || D.prot[i] || city.t[i] === R) continue;
      poly(c, diamond(i % W, (i / W) | 0), "rgba(90,165,225,.22)");
    }
  }
  const s = city.shift;
  if (s && s.xs && !s.done) {
    c.setLineDash([5, 4]); c.strokeStyle = "rgba(170,220,255,.95)"; c.lineWidth = 2;
    for (const i of riverSet(s.xs)) {
      if (city.t[i] === R || !vis[i]) continue;
      const pts = diamond(i % W, (i / W) | 0, 0.08);
      c.beginPath(); pts.forEach((p, k) => (k ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); c.stroke();
    }
    c.setLineDash([]);
  }
  const outline = (cell: { x: number; y: number }, col: string, fill?: string) => {
    const pts = diamond(cell.x, cell.y, 0.02);
    if (fill) poly(c, pts, fill);
    c.strokeStyle = col; c.lineWidth = 2;
    c.beginPath(); pts.forEach((p, k) => (k ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); c.stroke();
  };
  let ghostOk = false;
  if (o.selected) outline(o.selected, "#f0c766", "rgba(240,199,102,.18)");
  if (o.hover) {
    if (o.tool) {
      ghostOk = !canPlace(city, D, o.tool, o.hover.x, o.hover.y);
      outline(o.hover, ghostOk ? "#b4f08a" : "#ff8a6a", ghostOk ? "rgba(160,240,120,.25)" : "rgba(255,120,90,.25)");
    } else outline(o.hover, o.picked.size ? "#7fe0ff" : "rgba(255,250,235,.85)", o.picked.size ? "rgba(127,224,255,.15)" : undefined);
  }
  // explorers' destinations
  for (const p of city.people) {
    if (p.task.t !== "explore") continue;
    const to = p.task.to;
    outline({ x: to % W, y: Math.floor(to / W) }, "rgba(127,224,255,.8)");
  }

  // 3. objects sorted by depth
  type Item = { d: number; f: () => void };
  const items: Item[] = [];
  for (const i of visible) {
    const x = i % W, y = Math.floor(i / W);
    if (!seen[i]) continue;
    const t = city.t[i], b = city.b[i];
    const d = x + y + 1;
    if (b) {
      items.push({
        d, f: () => {
          if (b.lvl === 0 || b.burned) c.globalAlpha = 0.5;
          drawBuilding(r, b.k, x, y, Math.max(1, b.lvl), i);
          c.globalAlpha = 1;
          if (b.burned) {
            const q = tp(r, x, y);
            for (let f = 0; f < 3; f++) {
              const h = 12 + 6 * Math.sin(o.anim / 140 + i + f), u = (f - 1) * 0.2;
              poly(c, [q(u - 0.1, 0.18, 3), q(u + 0.1, 0.18, 3), q(u + 0.025, 0.18, h + 8)], "#ed6327");
              poly(c, [q(u - 0.05, 0.19, 3), q(u + 0.05, 0.19, 3), q(u, 0.19, h)], "#ffd66b");
            }
            smoke(r, x, y, 0, 0, 24, i);
          }
          if (b.flooded) {
            const q = tp(r, x, y);
            poly(c, [q(-0.48, -0.48, 2), q(0.48, -0.48, 2), q(0.48, 0.48, 2), q(-0.48, 0.48, 2)], "rgba(70,150,210,.55)");
            const [wx, wy] = q(0, 0, 40);
            c.fillStyle = "#e85d4a"; c.beginPath(); c.arc(wx, wy, 7 * v.s, 0, Math.PI * 2); c.fill();
            c.fillStyle = "#fff"; c.font = `bold ${Math.round(10 * v.s)}px sans-serif`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("!", wx, wy + 0.5);
          }
          if (b.doneAt) {
            const total = B[b.k].sec * 1000 * 3 ** b.lvl;
            drawScaffold(r, x, y, Math.max(0, Math.min(1, 1 - (b.doneAt - o.now) / total)));
          }
          if (b.lvl >= 2) {
            const [lx, ly] = tp(r, x, y)(-0.3, 0.3, 4);
            for (let l = 0; l < b.lvl; l++) poly(c, [[lx - 3 * v.s, ly - l * 4 * v.s], [lx, ly - 3 * v.s - l * 4 * v.s], [lx + 3 * v.s, ly - l * 4 * v.s], [lx, ly - 1.5 * v.s - l * 4 * v.s]], "#f0c766");
          }
        },
      });
      continue;
    }
    const used = city.dep[i] ?? 0;
    if (t === F) {
      const left = 1 - used / CAP.forest;
      const full = 2 + Math.floor(hr(city.seed, i * 29) * 2), n = Math.max(1, Math.ceil(full * left));
      if (lod) { items.push({ d, f: () => { const [sx, sy] = tp(r, x, y)(0, 0); c.fillStyle = r.season === 2 ? "#c7782e" : "#3f8a36"; c.beginPath(); c.arc(sx, sy - v.TH * 0.4, v.TW * 0.32, 0, Math.PI * 2); c.fill(); } }); continue; }
      const trees = Array.from({ length: full }, (_, k) => ({
        u: (hr(city.seed, i * 31 + k) - 0.5) * 0.6, v: (hr(city.seed, i * 37 + k) - 0.5) * 0.6,
        size: 0.8 + hr(city.seed, i * 41 + k) * 0.45, pine: hr(city.seed, i * 43 + k) < 0.4, stump: k >= n,
      })).sort((a, b2) => a.u + a.v - (b2.u + b2.v));
      for (const tr of trees) items.push({
        d: x + y + 1 + (tr.u + tr.v) * 0.5,
        f: () => {
          if (!tr.stump) { drawTree(r, x, y, tr.u, tr.v, tr.size, tr.pine, o.chopping.has(i) ? Math.sin(o.anim / 45) * 1.6 : 0); return; }
          const [sx, sy] = tp(r, x, y)(tr.u, tr.v);
          c.fillStyle = "#7a5230"; c.beginPath(); c.ellipse(sx, sy - 1.5 * v.s, 3 * v.s, 1.6 * v.s, 0, 0, Math.PI * 2); c.fill();
          c.fillStyle = "#d9b07a"; c.beginPath(); c.ellipse(sx, sy - 2.5 * v.s, 2.4 * v.s, 1.2 * v.s, 0, 0, Math.PI * 2); c.fill();
        },
      });
    } else if (t === HL || t === O) {
      const worn = used / (t === O ? CAP.ore : CAP.hill);
      items.push({ d, f: () => drawRock(r, x, y, worn > 0.55) });
    }
  }
  for (const k of city.camps) {
    if (!seen[k.at] || !vis[k.at] || city.b[k.at]) continue;
    items.push({ d: (k.at % W) + Math.floor(k.at / W) + 1, f: () => drawCampSite(r, k) });
  }
  if (!lod) {
    // soldiers at home stand in rows beside the first barracks
    const bar = buildings(city).find(([, b]) => b.k === "barracks" && b.lvl >= 1 && !b.burned && !b.flooded);
    const guards = city.guardPosts ?? [];
    if (bar || guards.length) {
      const home = bar?.[0] ?? city.camp;
      const bx = (home % W) + 0.5, by = Math.floor(home / W) + 0.5;
      let n = 0;
      for (const u of UKEYS) for (let k = 0; k < Math.min(city.army[u] ?? 0, 8) && n < 24; k++, n++) {
        const guard = guards[n % guards.length], row = Math.floor(n / Math.max(1, guards.length));
        const fx = guard ? guard.x + 0.4 + (row % 3) * 0.15 : bx + 0.75 + (n % 4) * 0.32;
        const fy = guard ? guard.y + 0.4 + Math.floor(row / 3) * 0.15 : by - 0.6 + Math.floor(n / 4) * 0.32;
        if (!onScreen(fx - 0.5, fy - 0.5)) continue;
        const seed = n * 0.37;
        items.push({ d: fx + fy, f: () => drawSoldier(r, u, fx, fy, -1, false, seed) });
      }
    }
    // incoming barbarian raid
    if (city.raid) {
      const rd = city.raid, p = Math.max(0, Math.min(1, (o.now - rd.warn) / Math.max(1, rd.at - rd.warn)));
      const hx = (rd.from % W) + 0.5, hy = Math.floor(rd.from / W) + 0.5, tx = (city.camp % W) + 0.5, ty = Math.floor(city.camp / W) + 0.5;
      const cx = hx + (tx - hx) * p, cy = hy + (ty - hy) * p, len = Math.hypot(tx - hx, ty - hy) || 1;
      const face: 1 | -1 = (tx - hx) - (ty - hy) >= 0 ? 1 : -1;
      for (let n = 0; n < 7; n++) {
        const row = Math.floor(n / 3), col = (n % 3) - 1;
        const fx = cx - ((tx - hx) / len) * row * 0.35 + (-(ty - hy) / len) * col * 0.35, fy = cy - ((ty - hy) / len) * row * 0.35 + ((tx - hx) / len) * col * 0.35;
        const ti = idx(Math.max(0, Math.min(W - 1, Math.floor(fx))), Math.max(0, Math.min(H - 1, Math.floor(fy))));
        if (!vis[ti] || !seen[ti]) continue;
        items.push({ d: fx + fy, f: () => { const fn = () => drawSoldier(r, "club", fx, fy, face, true, n * 0.53, false, true); if (inWater(r, fx, fy)) wade(r, fx, fy, fn); else fn(); } });
      }
    }
    // marching expeditions
    for (const e of city.exps) {
      const camp = campById(city, e.camp);
      if (!camp) continue;
      const hx = (city.camp % W) + 0.5, hy = Math.floor(city.camp / W) + 0.5, tx = (camp.at % W) + 0.5, ty = Math.floor(camp.at / W) + 0.5;
      const going = o.now < e.arrive, fighting = Math.abs(o.now - e.arrive) < 8000;
      const p = going ? (o.now - e.depart) / Math.max(1, e.arrive - e.depart) : 1 - (o.now - e.arrive) / Math.max(1, e.back - e.arrive);
      const pc = Math.max(0, Math.min(1, p));
      const cx = hx + (tx - hx) * pc, cy = hy + (ty - hy) * pc;
      const len = Math.hypot(tx - hx, ty - hy) || 1, nx = -(ty - hy) / len, ny = (tx - hx) / len;
      const face: 1 | -1 = ((going ? 1 : -1) * ((tx - hx) - (ty - hy))) >= 0 ? 1 : -1;
      let n = 0;
      for (const u of UKEYS) for (let k = 0; k < Math.min(e.units[u] ?? 0, 6) && n < 18; k++, n++) {
        const row = Math.floor(n / 3), col = (n % 3) - 1;
        const back = (going ? -1 : 1) * row * 0.35;
        const fx = cx + ((tx - hx) / len) * back + nx * col * 0.35, fy = cy + ((ty - hy) / len) * back + ny * col * 0.35;
        const ti = idx(Math.max(0, Math.min(W - 1, Math.floor(fx))), Math.max(0, Math.min(H - 1, Math.floor(fy))));
        if (!vis[ti]) continue;
        const nn = n;
        items.push({ d: fx + fy, f: () => {
          const fn = () => drawSoldier(r, u, fx, fy, face, !fighting, nn * 0.41, fighting);
          if (inWater(r, fx, fy)) wade(r, fx, fy, fn); else fn();
        } });
      }
      if (troopCount(e.units) === 0 && going) continue;
    }
    for (const h of city.herds) {
      if (!seen[h.at] || !vis[h.at]) continue;
      herdAnimals(city, h, o.anim || 1).forEach((a, k) => {
        items.push({ d: a.fx + a.fy, f: () => drawAnimal(r, h.kind, a.fx, a.fy, a.face, a.graze, h.kind === "deer" && k === 0, hr(city.seed, h.id * 7 + k)) });
      });
    }
    for (const vl of o.villagers) {
      if (!vl.visible) continue;
      const ti = idx(Math.max(0, Math.min(W - 1, Math.floor(vl.fx))), Math.max(0, Math.min(H - 1, Math.floor(vl.fy))));
      if (!vis[ti]) continue;
      const isPicked = vl.id !== null && o.picked.has(vl.id);
      items.push({
        d: vl.fx + vl.fy,
        f: () => {
          if (isPicked) {
            const [sx, sy] = P(v, vl.fx, vl.fy), s2 = Math.max(v.s * 1.45, 0.7);
            c.strokeStyle = "#7fe0ff"; c.lineWidth = 2; c.beginPath(); c.ellipse(sx, sy, 6 * s2, 3 * s2, 0, 0, Math.PI * 2); c.stroke();
          }
          drawVillager(r, vl);
          if (isPicked) {
            const [sx, sy] = P(v, vl.fx, vl.fy), s2 = Math.max(v.s * 1.45, 0.7);
            c.font = `600 ${Math.max(11, Math.round(8 * s2))}px system-ui, sans-serif`; c.textAlign = "center"; c.textBaseline = "bottom";
            const w = c.measureText(vl.name).width + 8;
            c.fillStyle = "rgba(15,25,22,.8)"; c.fillRect(sx - w / 2, sy - 30 * s2 - 14, w, 15);
            c.fillStyle = "#e9fbff"; c.fillText(vl.name, sx, sy - 30 * s2);
          }
        },
      });
    }
  }
  if (o.hover && o.tool && !city.b[idx(o.hover.x, o.hover.y)]) {
    const { x, y } = o.hover, tool = o.tool;
    items.push({ d: x + y + 1.01, f: () => { c.globalAlpha = ghostOk ? 0.75 : 0.4; drawBuilding(r, tool, x, y, 1, idx(x, y)); c.globalAlpha = 1; } });
  }
  items.sort((a, b) => a.d - b.d);
  for (const it of items) it.f();

  // flying spears and chips
  const tnow = performance.now();
  for (const f of o.fx) {
    const p = Math.min(1, (tnow - f.t0) / (f.dur * 1000));
    const fx = f.x0 + (f.x1 - f.x0) * p, fy = f.y0 + (f.y1 - f.y0) * p;
    const s2 = Math.max(v.s * 1.45, 0.7);
    if (f.kind === "spear") {
      const z = Math.sin(Math.PI * p) * 14 + 9 * (1 - p);
      const [ax, ay] = P(v, fx, fy, z * s2);
      const [bx, by] = P(v, f.x1, f.y1);
      const [ox, oy] = P(v, f.x0, f.y0);
      const ang = Math.atan2(by - oy - (Math.cos(Math.PI * p) * -14 * s2), bx - ox);
      c.save(); c.translate(ax, ay); c.rotate(ang);
      c.strokeStyle = "#6b4526"; c.lineWidth = Math.max(1, 1.2 * s2); c.beginPath(); c.moveTo(-6 * s2, 0); c.lineTo(5 * s2, 0); c.stroke();
      c.fillStyle = "#cfc6b4"; c.beginPath(); c.moveTo(8 * s2, 0); c.lineTo(5 * s2, -1.3 * s2); c.lineTo(5 * s2, 1.3 * s2); c.fill();
      c.restore();
    } else {
      const z = Math.sin(Math.PI * p) * 10;
      const [ax, ay] = P(v, fx, fy, z * s2);
      c.globalAlpha = 1 - p * 0.6; c.fillStyle = f.col ?? "#d9b07a";
      c.fillRect(ax - 1 * s2, ay - 1 * s2, 2 * s2, 1.4 * s2); c.globalAlpha = 1;
    }
  }

  // 4. drifting cloud shadows
  if (o.anim) {
    for (let k = 0; k < 4; k++) {
      const p = ((o.anim / 90000 + k / 4) % 1) * 1.6 - 0.3;
      const cx = p * v.width, cy = v.height * (0.2 + 0.2 * k);
      c.fillStyle = "rgba(10,25,20,.06)";
      c.beginPath(); c.ellipse(cx, cy, 180, 60, 0, 0, Math.PI * 2); c.ellipse(cx + 110, cy + 18, 110, 45, 0, 0, Math.PI * 2); c.fill();
    }
  }
  if (r.season === 3 && o.anim) {
    c.fillStyle = "rgba(255,255,255,.75)";
    for (let k = 0; k < 90; k++) {
      const px = (hr(city.seed, k * 3) * v.width + Math.sin(o.anim / 1500 + k) * 10) % v.width;
      const py = (hr(city.seed, k * 5) * v.height + o.anim / (25 + (k % 7) * 4)) % v.height;
      c.beginPath(); c.arc(px, py, 1.2 + (k % 3) * 0.4, 0, Math.PI * 2); c.fill();
    }
  }
}

/** Small preview of a building for the build menu. */
export function drawThumb(cv: HTMLCanvasElement, city: City, D: Derived, k: BKey, season = 0, lvl = 1, anim = 0) {
  const dpr = window.devicePixelRatio || 1, w = cv.clientWidth || 56, h = cv.clientHeight || 48;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const c = cv.getContext("2d")!;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  const TW = w * 0.78, TH = TW / 2;
  const v: View = { TW, TH, s: TW / 64, ox: w / 2, oy: h * 0.72 - TH / 2, width: w, height: h };
  const r: RC = { c, v, city, D, anim, now: 0, season };
  const q = tp(r, 0, 0);
  poly(c, [q(-0.5, -0.5), q(0.5, -0.5), q(0.5, 0.5), q(-0.5, 0.5)], k === "quarry" ? "#a39272" : "#7fae4c");
  poly(c, [q(0.5, -0.5), q(0.5, 0.5), q(0.5, 0.5, -5), q(0.5, -0.5, -5)], "#6b4a2b");
  poly(c, [q(-0.5, 0.5), q(0.5, 0.5), q(0.5, 0.5, -5), q(-0.5, 0.5, -5)], "#87613a");
  drawBuilding(r, k, 0, 0, lvl, -1);
}
