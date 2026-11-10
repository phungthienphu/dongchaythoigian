import {defenseAxis,wallMask,wallOutline,wallFootprints,wallHeight,WALL_N,WALL_E,WALL_S,WALL_W,type DefenseOrientation,type DefensePreview} from '@/lib/fortifications';
import {bridgeDeck,bridgeGeometry,bridgeReady} from '@/lib/bridges';
import { drawVillagerArt } from "./villager-art";
import { drawAnimalArt, drawSoldierArt, drawFutureArt } from "./actor-art";
import type {EngineRules} from '@/lib/eras';
import { BoundedCache } from "@/lib/bounded-cache";
// Isometric 2.5D renderer. Tile (x, y) has float coords (fx, fy) in [x, x+1) × [y, y+1);
// screen = (ox + (fx - fy) * TW/2, oy + (fx + fy) * TH/2 - z).
import {drawCaravanActor} from "./trade-actors";
import { B, CAP, GOLD, DIAMOND, COAL, isRock, depositCapacity, F, G, H, HL, N4, N8, O, R, UKEYS, W, raidActors, returningFerries,shipsFree,wildlifePosition, homeSoldiers, armyStagingTiles, campDefenders, campStrength, expeditionPosition, farmCapacity, farmRemaining, envoyVillagePosition, envoyCount, envoysAway, buildings, campById, canPlace, idx, inb, riverSet, seasonAt, troopCount, type BKey, type Camp, type City, type Derived, type UKey } from "@/lib/engine";
import { placementTiles } from "@/lib/build-placement";
import {hungerSpeech,villagersHungry} from "@/lib/villager-mood";
import type { Fx, Villager } from "./villagers";

export type View = { TW: number; TH: number; ox: number; oy: number; width: number; height: number; s: number; rotation?: number };

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

export type Cam = { zoom: number; px: number; py: number; rotation?: number };
export const MIN_ZOOM = 1, MAX_ZOOM = 18;

/** The fitted view after zooming by cam.zoom and panning by (px, py). */
export function camView(f: View, cam: Cam): View {
  const z = cam.zoom, TW = f.TW * z;
  return { TW, TH: TW / 2, s: TW / 64, ox: cam.px + f.ox * z, oy: cam.py + f.oy * z, width: f.width, height: f.height, rotation: cam.rotation ?? 0 };
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

/** Quarter-turns are a camera preference; world/save coordinates never change. */
export function rotatePoint(fx:number,fy:number,rotation=0):Pt {
  switch(((rotation%4)+4)%4){
    case 1:return [H-fy,fx];
    case 2:return [W-fx,H-fy];
    case 3:return [fy,W-fx];
    default:return [fx,fy];
  }
}
export function screenToWorld(v:View,sx:number,sy:number):Pt {
  const a=(sx-v.ox)/(v.TW/2),b=(sy-v.oy)/(v.TH/2);
  return rotatePoint((a+b)/2,(b-a)/2,-(v.rotation??0));
}
export function focusOn(f: View, cam: Cam, fx: number, fy: number, z: number) {
  cam.zoom = z;
  const [x,y]=rotatePoint(fx,fy,cam.rotation);
  cam.px = f.width / 2 - z * (f.ox + ((x - y) * f.TW) / 2);
  cam.py = f.height / 2 - z * (f.oy + ((x + y) * f.TH) / 2);
  clampCam(f, cam);
}
/** Keep the exact world point under the viewport centre on a quarter-turn. */
export function rotateCam(f:View,cam:Cam,delta:number){
  const [x,y]=screenToWorld(camView(f,cam),f.width/2,f.height/2);
  cam.rotation=((cam.rotation??0)+delta+4)%4;
  focusOn(f,cam,x,y,cam.zoom);
}
export function screenToCell(v: View, sx: number, sy: number) {
  const [fx,fy]=screenToWorld(v,sx,sy),x=Math.floor(fx),y=Math.floor(fy);
  return inb(x, y) ? { x, y } : null;
}

/** Conservative inverse-projection bounds, including the existing tall-object margins. */
export function visibleTileBounds(v: View) {
  const corners = [[-v.TW, -v.TW * 0.5], [v.width + v.TW, -v.TW * 0.5], [-v.TW, v.height + v.TW * 2], [v.width + v.TW, v.height + v.TW * 2]];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [sx, sy] of corners) {
    const a = (sx - v.ox) / (v.TW / 2), b = (sy - v.oy) / (v.TH / 2);
    const [fx,fy]=rotatePoint((a+b)/2,(b-a)/2,-(v.rotation??0));
    const x=fx-.5,y=fy-.5;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return { x0: Math.max(0, Math.floor(x0)), y0: Math.max(0, Math.floor(y0)), x1: Math.min(W - 1, Math.ceil(x1)), y1: Math.min(H - 1, Math.ceil(y1)) };
}

/* ---------- colour helpers ---------- */
const mixCache = new BoundedCache<string, string>(2048, 2048);
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
type RC = { c: Ctx; v: View; city: City; D: Derived; anim: number; now: number; season: number; deck:ReadonlySet<number>; defensePreview?:DefensePreview; turn?:boolean; billboard?:boolean };
type Pt = [number, number];

export const projectWorld = (v: View, fx: number, fy: number, z = 0): Pt => {
  let x=fx,y=fy;
  switch(v.rotation??0){case 1:x=H-fy;y=fx;break;case 2:x=W-fx;y=H-fy;break;case 3:x=fy;y=W-fx;break;}
  return [v.ox+((x-y)*v.TW)/2,v.oy+((x+y)*v.TH)/2-z];
};
const P=projectWorld;
export const viewDepth=(v:View,x:number,y:number)=>{
  switch(v.rotation??0){case 1:return H-y+x;case 2:return W+H-x-y;case 3:return y+W-x;default:return x+y;}
};
/** Artwork has two facing directions; use the projected travel vector when known. */
export function travelFace(v:View,dx:number,dy:number,fallback:1|-1):1|-1 {
  const [a,b]=rotatePoint(0,0,v.rotation),[x,y]=rotatePoint(dx,dy,v.rotation);
  const horizontal=(x-a)-(y-b);
  return Math.abs(horizontal)<1e-6?fallback:horizontal>0?1:-1;
}
const cameraFace=(v:View,face:1|-1):1|-1=>travelFace(v,face,-face,face);
const fixedArt=(k:BKey)=>!['wall','gate','canal','levee','ironbridge'].includes(k);

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
  const [cx,cy]=P(r.v,x+.5,y+.5);
  return (u: number, v: number, z = 0): Pt => r.billboard
    ?[cx+((u-v)*r.v.TW)/2,cy+((u+v)*r.v.TH)/2-z*s]
    :P(r.v, x + 0.5 + (r.turn?v:u), y + 0.5 + (r.turn?u:v), z * s);
}

function box(r: RC, x: number, y: number, u0: number, v0: number, u1: number, v1: number, z0: number, z1: number, top: string, left: string, right: string) {
  const q = tp(r, x, y), c = r.c;
  if(r.turn)[left,right]=[right,left];
  if(!r.billboard&&(r.v.rotation??0)!==0){
    const corners:Pt[]=[[u0,v0],[u1,v0],[u1,v1],[u0,v1]];
    for(let j=0;j<4;j++){
      const a=corners[j],b=corners[(j+1)%4];
      if(q(b[0],b[1])[0]>=q(a[0],a[1])[0])continue;
      const shade=q(a[0],a[1])[1]>q(b[0],b[1])[1]?left:right;
      poly(c,[q(a[0],a[1],z0),q(b[0],b[1],z0),q(b[0],b[1],z1),q(a[0],a[1],z1)],shade);
    }
  }else{
    poly(c, [q(u0, v1, z0), q(u1, v1, z0), q(u1, v1, z1), q(u0, v1, z1)], left);
    poly(c, [q(u1, v0, z0), q(u1, v1, z0), q(u1, v1, z1), q(u1, v0, z1)], right);
  }
  poly(c, [q(u0, v0, z1), q(u1, v0, z1), q(u1, v1, z1), q(u0, v1, z1)], top);
}

/** Gable roof with the ridge running along u. */
function gable(r: RC, x: number, y: number, u0: number, v0: number, u1: number, v1: number, z: number, h: number, front: string, back: string, end: string) {
  const q = tp(r, x, y), c = r.c, vm = (v0 + v1) / 2;
  if(!r.billboard&&(r.v.rotation??0)!==0){
    const faces:{points:[number,number,number][];color:string}[]=[
      {points:[[u0,v0,z],[u1,v0,z],[u1,vm,z+h],[u0,vm,z+h]],color:back},
      {points:[[u1,v0,z],[u1,v1,z],[u1,vm,z+h]],color:end},
      {points:[[u0,vm,z+h],[u1,vm,z+h],[u1,v1,z],[u0,v1,z]],color:front},
      {points:[[u0,v0,z],[u0,v1,z],[u0,vm,z+h]],color:end},
    ];
    const depth=(f:typeof faces[number])=>f.points.reduce((d,[u,v])=>d+q(u,v)[1],0)/f.points.length;
    for(const f of faces.sort((a,b)=>depth(a)-depth(b)))poly(c,f.points.map(([u,v,z])=>q(u,v,z)),f.color);
  }else{
  poly(c, [q(u0, v0, z), q(u1, v0, z), q(u1, vm, z + h), q(u0, vm, z + h)], back);
  poly(c, [q(u1, v0, z), q(u1, v1, z), q(u1, vm, z + h)], end);
  poly(c, [q(u0, vm, z + h), q(u1, vm, z + h), q(u1, v1, z), q(u0, v1, z)], front);
  }
  c.strokeStyle = darken(front, 0.35); c.lineWidth = Math.max(1, r.v.s);
  c.beginPath(); const a = q(u0, vm, z + h), b = q(u1, vm, z + h); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
}

function pyramid(r: RC, x: number, y: number, u0: number, v0: number, u1: number, v1: number, z: number, h: number, left: string, right: string) {
  const q = tp(r, x, y), c = r.c, apex = q((u0 + u1) / 2, (v0 + v1) / 2, z + h);
  if(!r.billboard&&(r.v.rotation??0)!==0){
    const corners:Pt[]=[[u0,v0],[u1,v0],[u1,v1],[u0,v1]];
    const faces=corners.map((a,j)=>({a,b:corners[(j+1)%4]}));
    faces.sort((a,b)=>q(a.a[0],a.a[1])[1]+q(a.b[0],a.b[1])[1]-q(b.a[0],b.a[1])[1]-q(b.b[0],b.b[1])[1]);
    for(const {a,b}of faces)poly(c,[q(a[0],a[1],z),q(b[0],b[1],z),apex],q(a[0],a[1])[0]<q(b[0],b[1])[0]?right:left);
  }else{
  poly(c, [q(u0, v0, z), q(u0, v1, z), apex], darken(left, 0.15));
  poly(c, [q(u0, v0, z), q(u1, v0, z), apex], darken(right, 0.1));
  poly(c, [q(u0, v1, z), q(u1, v1, z), apex], left);
  poly(c, [q(u1, v0, z), q(u1, v1, z), apex], right);
  }
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

const BANK_EDGES=[
  {dx:0,dy:-1,a:[-.5,-.5],b:[.5,-.5]},
  {dx:1,dy:0,a:[.5,-.5],b:[.5,.5]},
  {dx:0,dy:1,a:[.5,.5],b:[-.5,.5]},
  {dx:-1,dy:0,a:[-.5,.5],b:[-.5,-.5]},
];
const FACING_BANKS=[[1,2],[0,1],[0,3],[2,3]].map(edges=>edges.map(i=>BANK_EDGES[i]));
function drawBankEdges(r:RC,x:number,y:number,z:number,water:boolean){
  const q=tp(r,x,y);
  for(const {dx,dy,a,b}of FACING_BANKS[r.v.rotation??0]){
    const inside=inb(x+dx,y+dy);
    if(water?inside:inside&&r.city.t[idx(x+dx,y+dy)]!==R)continue;
    const bottom=inside?-5:-16;
    poly(r.c,[q(a[0],a[1],z),q(b[0],b[1],z),q(b[0],b[1],bottom),q(a[0],a[1],bottom)],water?'#2b5f86':'#795735');
  }
}

function drawGroundTile(r: RC, x: number, y: number) {
  const { c, city, v } = r, i = idx(x, y), s = v.s, q = tp(r, x, y);
  const t = city.t[i];
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
    drawBankEdges(r,x,y,z,true);
    return;
  }
  const col = isRock(t) ? mix(grassColor(r, i), "#a39272", 0.55) : grassColor(r, i);
  poly(c, [q(-0.5, -0.5), q(0.5, -0.5), q(0.5, 0.5), q(-0.5, 0.5)], col);
  // banks and map edges: show the soil layer
  drawBankEdges(r,x,y,0,false);
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
  if ([O,GOLD,DIAMOND,COAL].includes(r.city.t[i])) {
    const q = tp(r, x, y);
    for (const [u, v, z] of [[-0.12, 0.3, 8], [0.25, 0.12, 6], [0.05, 0.25, 14]]) {
      const [sx, sy] = q(u, v, z);
      r.c.fillStyle = r.city.t[i]===COAL?"#313b41":r.city.t[i]===GOLD?"#edc238":r.city.t[i]===DIAMOND?"#6ce3ed":"#d9813a"; r.c.beginPath(); r.c.arc(sx, sy, 2.6 * r.v.s, 0, Math.PI * 2); r.c.fill();
      r.c.fillStyle = r.city.t[i]===COAL?"#82939a":r.city.t[i]===DIAMOND?"#efffff":r.city.t[i]===GOLD?"#fff3a0":"#ffc27a"; r.c.beginPath(); r.c.arc(sx - 0.8 * r.v.s, sy - 0.8 * r.v.s, 1 * r.v.s, 0, Math.PI * 2); r.c.fill();
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
  const [sx, sy] = tp(r, x, y)(u, v);
  drawAnimalArt(r.c, "buffalo", sx, sy, Math.max(r.v.s * .66, .35), { time: r.anim, graze: true });
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
  // Existing hand-authored building sprites remain upright; connected infrastructure
  // follows world axes so canals, walls, gates and bridges keep their topology.
  r={...r,billboard:fixedArt(k)};
  if(k==='wall'){drawConnectedWall(r,x,y,lvl);return;}
  if(k==='gate')r={...r,turn:defenseAxis(r.city,idx(x,y),r.defensePreview)==='y'};
  if (lvl >= 2) backExtras(r, k, x, y, lvl, i);
  if(!drawFutureDefense(r,k,x,y,lvl,i)&&!drawSupportBuilding(r,k,x,y,lvl,i))drawBase(r, k, x, y, lvl, i);
  if(r.city.era>=4&&B[k].era<4&&!['wall','gate','watchtower','farm','canal','levee','temple'].includes(k)){
    const q=tp(r,x,y),era=r.city.era;
    // Small additions keep old investments recognizable in a mixed-era town.
    if(era===4){box(r,x,y,-.45,.3,-.37,.4,0,14,'#c79067','#a97550','#835137');lantern(r,x,y,-.4,.36,13,i);}
    if(era===5){box(r,x,y,.31,-.28,.41,-.17,0,23,'#85928d','#657972','#4c6059');line(r,q(.36,-.23,23),q(.36,-.23,30),'#3c4947',2);}
    if(era>=6){poly(r.c,[q(-.3,-.35,20),q(.1,-.35,20),q(.1,-.13,25),q(-.3,-.13,25)],'#487b94');line(r,q(-.3,-.25,22),q(.1,-.25,22),'#b3d2d6',.8);}
  }
  if (lvl >= 2) frontExtras(r, k, x, y, lvl, i);
}

/** Connected outline shares its geometry with selection; no internal faces at corners. */
function drawConnectedWall(r:RC,x:number,y:number,lvl:number){
 const mask=wallMask(r.city,idx(x,y),r.defensePreview),era=r.city.era,h=wallHeight(era,lvl),q=tp(r,x,y),c=r.c;
 shadow(r,x,y,.42);
 const arms=[[0,-1,WALL_N],[1,0,WALL_E],[0,1,WALL_S],[-1,0,WALL_W]];
 if(era===1){
  const posts:[number,number][]=[[0,0]];
  for(const [dx,dy,bit]of arms)if(mask&bit){
   for(const d of [.15,.3,.45])posts.push([dx*d,dy*d]);
   for(const z of [5,10])line(r,q(0,0,z),q(dx*.5,dy*.5,z),'#63452b',2.5);
  }
  for(const [u,v]of posts.sort((a,b)=>q(a[0],a[1])[1]-q(b[0],b[1])[1])){
   box(r,x,y,u-.05,v-.05,u+.05,v+.05,0,h,'#b58a51','#87603a','#624329');
   pyramid(r,x,y,u-.05,v-.05,u+.05,v+.05,h,4,'#c69d60','#916c41');
   line(r,q(u-.05,v+.052,h-3),q(u+.05,v+.052,h-3),'#d2b17b',.7);
  }
  return;
 }
 const top=era===2?'#bc9561':era===3?'#b7b7a8':era===4?'#c1b5a0':era===5?'#acb4b0':'#b9cac3';
 const left=era===2?'#9d774c':era===3?'#93988f':era===4?'#9e907e':'#8fa69d';
 const right=era===2?'#795b3c':era===3?'#727d78':era===4?'#7f786e':'#6c887d';
 const outline=wallOutline(mask),edges=outline.map((a,n)=>({a,b:outline[(n+1)%outline.length]})).filter(({a,b})=>q(b[0],b[1])[0]<q(a[0],a[1])[0]).sort((a,b)=>q(a.a[0],a.a[1])[1]+q(a.b[0],a.b[1])[1]-q(b.a[0],b.a[1])[1]-q(b.b[0],b.b[1])[1]);
 for(const {a,b}of edges){
  poly(c,[q(...a,0),q(...b,0),q(...b,h),q(...a,h)],b[1]>a[1]?right:left);
  for(let row=1;row<4;row++){
   const z=row*h/4;line(r,q(...a,z),q(...b,z),'rgba(40,50,43,.3)',.7);
   const length=Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1]),count=Math.floor(length/.18);
   for(let n=1;n<=count;n++){const t=(n-(row%2)*.4)/(count+1),u=a[0]+(b[0]-a[0])*t,v=a[1]+(b[1]-a[1])*t;line(r,q(u,v,z),q(u,v,z-h/4),'rgba(40,50,43,.24)',.6);}
  }
 }
 poly(c,outline.map(([u,v])=>q(u,v,h)),top);
 // One corner pier and an end merlon on each arm; all share a continuous coping.
 const caps:[number,number][]=[[0,0]];
 for(const [dx,dy,bit]of arms)if(mask&bit)caps.push([dx*.4,dy*.4]);
 for(const [u,v]of caps.sort((a,b)=>q(a[0],a[1])[1]-q(b[0],b[1])[1])){
  const w=.12;box(r,x,y,u-w,v-w,u+w,v+w,h,h+4,top,left,right);
  if(era===4)box(r,x,y,u-w-.015,v-w-.015,u+w+.015,v+w+.015,h+4,h+5,'#ad6749','#8d4f39','#713e30');
 }
}

/** New fortifications retain their footprint; the opening under the gate stays visible. */
function drawFutureDefense(r:RC,k:BKey,x:number,y:number,lvl:number,i:number){
 if(r.city.era<4||!['gate','watchtower'].includes(k))return false;
 const era=r.city.era,q=tp(r,x,y),top=era===4?'#c1b5a0':'#b9cac3',left=era===4?'#9e907e':'#8fa69d',right=era===4?'#7f786e':'#6c887d';
 const masonry=(u0:number,v0:number,u1:number,v1:number,z:number,h:number)=>box(r,x,y,u0,v0,u1,v1,z,h,top,left,right);
 const h=(k==='gate'?25:30)+lvl*2;shadow(r,x,y,.48);
 if(k==='gate'){
  masonry(-.46,-.16,-.27,.16,0,h);masonry(.27,-.16,.46,.16,0,h);masonry(-.46,-.16,.46,.16,h-7,h);
  if(era===4)gable(r,x,y,-.49,-.22,.49,.22,h,8,'#b4583b','#95432d','#783725');
  else{for(const u of [-.2,0,.2])line(r,q(u,-.14,h-8),q(u,-.14,1),'#465a55',1.5);flag(r,x,y,.4,.1,h,h+10,'#c09e47',i);}
 }else{
  masonry(-.27,-.23,.27,.23,0,h-4);masonry(-.35,-.3,.35,.3,h-4,h);
  if(era===4){gable(r,x,y,-.41,-.36,.41,.36,h+6,9,'#b4583b','#95432d','#783725');line(r,q(-.2,0,h+2),q(.35,0,h+2),'#533d2b',2);line(r,q(.16,-.2,h+2),q(.16,.2,h+2),'#533d2b',2);}
  else{masonry(-.32,-.27,.32,.27,h,h+6);line(r,q(.05,.05,h+4),q(.4,.08,h+4),'#31423b',era===6?3:2);if(era>=6){line(r,q(-.2,-.1,h+5),q(-.2,-.1,h+18),'#7a9b97',1);const [sx,sy]=q(-.2,-.1,h+16);r.c.strokeStyle='#aacaca';r.c.lineWidth=r.v.s;r.c.beginPath();r.c.arc(sx,sy,4*r.v.s,Math.PI*.1,Math.PI*1.3);r.c.stroke();}}
 }
 return true;
}

function drawSupportBuilding(r:RC,k:BKey,x:number,y:number,lvl:number,i:number){
  if(k!=="logistics" && k!=="infirmary")return false;
  const q=tp(r,x,y),c=r.c,s=r.v.s,stone=r.city.era>=3,h=13+lvl*2;
  shadow(r,x,y,.46);
  box(r,x,y,-.4,-.34,.3,.18,0,3,"#b7ad96","#99917e","#7e7768");
  box(r,x,y,-.36,-.3,.26,.14,3,h,stone?"#c4c6b4":"#bc9161",stone?"#a4aea0":"#987047",stone?"#7f9287":"#795530");
  gable(r,x,y,-.4,-.34,.3,.18,h,9,stone?"#537f80":"#9e7251",stone?"#41696d":"#80573b",stone?"#315158":"#63422d");
  if(stone)tileRows(r,x,y,-.4,.3,-.34,.18,h,9,"rgba(25,40,40,.4)");
  box(r,x,y,-.1,.14,.08,.15,3,11,"#49382d","#49382d","#49382d");
  if(k==="logistics"){
    box(r,x,y,-.32,.26,.24,.43,4,8,"#9b6f3b","#80562d","#604020");
    for(const u of [-.24,.18]){const [wx,wy]=q(u,.43,3);c.fillStyle="#493624";c.beginPath();c.arc(wx,wy,3*s,0,Math.PI*2);c.fill();}
    for(const u of [-.2,.02,.18]){const [sx,sy]=q(u,.33,10);c.fillStyle="#d0bd84";c.beginPath();c.ellipse(sx,sy,3*s,4*s,0,0,Math.PI*2);c.fill();}
    flag(r,x,y,.32,-.25,0,h+16,"#d1ac4e",i);
  }else{
    flag(r,x,y,.32,-.25,0,h+16,"#d5dfca",i);
    const [sx,sy]=q(.31,-.25,h+10);c.strokeStyle="#4e8762";c.lineWidth=2*s;c.beginPath();c.moveTo(sx,sy-3*s);c.lineTo(sx,sy+3*s);c.moveTo(sx-3*s,sy);c.lineTo(sx+3*s,sy);c.stroke();
    for(const u of [-.3,-.08,.14]){const [px,py]=q(u,.35,2);c.fillStyle="#805c40";c.fillRect(px-3*s,py-3*s,6*s,3*s);c.strokeStyle="#72a05b";c.beginPath();c.moveTo(px,py-2*s);c.lineTo(px-2*s,py-9*s);c.moveTo(px,py-2*s);c.lineTo(px+2*s,py-7*s);c.stroke();}
  }
  return true;
}

/** Era changes the architecture; levels add size and equipment within that era. */
function drawEvolvingWorkshop(r: RC, k: BKey, x: number, y: number, lvl: number, i: number) {
  if (!["gather", "wood", "storehouse", "forge", "barracks"].includes(k)) return false;
  const era = r.city.era, q = tp(r,x,y), c = r.c, s = r.v.s, hs = 1 + .2 * Math.max(0,lvl-1);
  const military = k === "barracks", small = k === "wood" || k === "gather";
  const u0 = small ? -.32 : -.34, v0 = small ? -.32 : -.28;
  const u1 = small ? .02 : .32, v1 = small ? .08 : .26;
  const height = (small ? 9 : k === "forge" ? 16 : 13) * hs;
  const wall = era >=6 ? ["#d2e0d9","#a4beb4","#7c9d92"] : era===5 ? ["#b6927d","#9c7561","#765b50"] : era === 1 ? ["#bf9967","#a27b4c","#805b35"] : era === 2 ? ["#c18b51","#a77240","#83562f"] : ["#c6c8bc","#a3aea1","#788e85"];
  const roof = era===4 ? ["#b75c40","#94442e","#753827"] : era>=5 ? ["#879a96","#657d76","#4b655e"] : era === 1 ? ["#e1bf6a","#c8a44d","#ac873a"] : era === 2 ? ["#b65e42","#98472f","#7f3b29"] : ["#577d8d","#426371","#314e60"];
  shadow(r,x,y,.42);
  if (era > 1) box(r,x,y,u0-.04,v0-.04,u1+.04,v1+.04,0,3,"#c8bfa7","#a99f89","#88816f");
  if (era === 1 && military) {
    // Open training tent, distinct from the enclosed timber and stone barracks.
    for (const u of [u0,u1]) for (const v of [v0,v1]) line(r,q(u,v,0),q(u,v,height),"#77512e",1.5);
    poly(c,[q(u0,v1,0),q(u1,v1,0),q(u1,v1,height),q(u0,v1,height)],"#9b7850");
  } else box(r,x,y,u0,v0,u1,v1,era>1?3:0,height,...wall as [string,string,string]);
  if (era === 1 && military) pyramid(r,x,y,u0-.05,v0-.05,u1+.05,v1+.05,height,9,roof[0],roof[1]);
  else if(era>=5){
    box(r,x,y,u0-.05,v0-.05,u1+.05,v1+.05,height,height+3,...roof as [string,string,string]);
    if(era===5){for(const u of [u0+.08,u1-.1])box(r,x,y,u,v0+.04,u+.07,v0+.11,height+3,height+9,"#78857f","#526962","#3d534d");}
    else {poly(c,[q(u0+.03,v0+.02,height+5),q(u1-.02,v0+.02,height+5),q(u1-.02,v1-.05,height+8),q(u0+.03,v1-.05,height+8)],"#426c83");line(r,q(u0+.03,(v0+v1)/2,height+6),q(u1-.02,(v0+v1)/2,height+6),"#96bec7",.8);}
  }else gable(r,x,y,u0-.05,v0-.05,u1+.05,v1+.05,height,small?7:9,...roof as [string,string,string]);
  if (era > 1&&era<5) tileRows(r,x,y,u0-.05,u1+.05,v0-.05,v1+.05,height,small?7:9,"rgba(35,30,25,.35)");
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

/** Medieval buildings share materials, but keep distinct silhouettes and equipment. */
function drawMedieval(r:RC,k:BKey,x:number,y:number,lvl:number,i:number){
  if(!['grandstore','tilehouse','well','reservoir','school','artisan','academy'].includes(k))return false;
  const q=tp(r,x,y),c=r.c,hs=1+.15*Math.max(0,lvl-1);
  shadow(r,x,y,.46);
  const stone=(u0:number,v0:number,u1:number,v1:number,z:number,h:number)=>box(r,x,y,u0,v0,u1,v1,z,h,'#d9c8a4','#b6a27f','#91876f');
  const roof=(u0:number,v0:number,u1:number,v1:number,z:number,h=12)=>{
    gable(r,x,y,u0,v0,u1,v1,z,h,'#b9593c','#8e3c2b','#723129');
    // Tiled courses catch the light across the front slope.
    for(let n=1;n<5;n++){const v=v0+(v1-v0)*(.5+n*.1);line(r,q(u0,v,z+h*(1-(v-v0)/(v1-v0)*2+1)),q(u1,v,z+h*(1-(v-v0)/(v1-v0)*2+1)),'#d58056',.5);}
  };
  stone(-.46,-.44,.46,.44,0,3);
  if(k==='reservoir'){
    stone(-.46,-.44,.46,-.35,3,7);stone(-.46,-.44,-.36,.44,3,7);stone(.36,-.44,.46,.44,3,7);stone(-.46,.35,.46,.44,3,7);
    const fraction=i<0?.8:Math.min(1,(r.city.medieval?.water[i]??0)/(12*3600000));
    poly(c,[q(-.35,-.34,3),q(.35,-.34,3),q(.35,.34,3),q(-.35,.34,3)],'#8c8265');
    if(fraction>0){poly(c,[q(-.34,-.33,3+fraction*3),q(.34,-.33,3+fraction*3),q(.34,.33,3+fraction*3),q(-.34,.33,3+fraction*3)],'#4d9dae');line(r,q(-.2,.02,4),q(.17,.02,4),'#a3d9d3',1);}
    for(let n=0;n<3;n++)stone(-.16,.22+n*.06,.16,.28+n*.06,0,5-n);
    line(r,q(-.41,-.35,7),q(-.41,-.35,25),'#7b5334',1.5);flag(r,x,y,-.41,-.35,7,20,'#559ba4',i);
    return true;
  }
  if(k==='well'){
    stone(-.25,-.25,.25,.25,3,10);
    poly(c,[q(-.18,-.18,10),q(.18,-.18,10),q(.18,.18,10),q(-.18,.18,10)],'#407583');
    for(const u of [-.25,.25])line(r,q(u,0,10),q(u,0,26),'#755034',2);
    roof(-.33,-.28,.33,.28,26,10);line(r,q(0,0,26),q(0,0,12),'#d8bd75',1);
    box(r,x,y,.14,.28,.28,.4,0,7,'#b68b50','#926938','#68472d');return true;
  }
  if(k==='academy'||k==='school'){
    const grand=k==='academy',h=grand?23:17*hs;
    // A rear teaching hall and two side pavilions frame an open courtyard.
    stone(-.4,-.36,.4,-.06,3,h);roof(-.45,-.41,.45,-.01,h,grand?15:11);
    for(const u of [-.33,-.12,.12,.33])line(r,q(u,-.04,3),q(u,-.04,h-1),'#79482f',1.5);
    if(grand){stone(-.43,.02,-.27,.36,3,13);roof(-.46,-.02,-.24,.4,13,9);stone(.27,.02,.43,.36,3,13);roof(.24,-.02,.46,.4,13,9);}
    else {box(r,x,y,-.19,.12,.2,.28,3,7,'#b8864e','#8c6337','#6e4d2d');line(r,q(-.12,.16,8),q(.12,.16,8),'#f1dfb7',2);}
    stone(-.13,.32,.13,.43,3,8);stone(-.04,.32,.04,.4,8,21);
    if(grand){flag(r,x,y,-.34,.18,3,32,'#c5953e',i,true);flag(r,x,y,.34,.18,3,32,'#a74737',i,true);}
    return true;
  }
  const height=(k==='grandstore'?23:k==='artisan'?17:20)*hs;
  stone(-.38,-.34,.38,.27,3,height);roof(-.44,-.4,.44,.33,height,13);
  // Doors and shuttered windows read at the normal village zoom.
  poly(c,[q(-.07,.28,3),q(.08,.28,3),q(.08,.28,14),q(-.07,.28,14)],'#61432e');
  for(const u of [-.26,.23])poly(c,[q(u-.05,.28,8),q(u+.05,.28,8),q(u+.05,.28,14),q(u-.05,.28,14)],'#6c704f');
  if(k==='grandstore'){
    for(const u of [-.34,-.19,.2,.35])box(r,x,y,u-.05,.34,u+.05,.44,3,10,'#d9bc77','#b59453','#8a6a37');
    for(const u of [-.32,.31])line(r,q(u,.28,3),q(u,.28,height),'#716857',2);
    flag(r,x,y,-.32,-.3,height,18,'#d3ae56',i);
  }else if(k==='artisan'){
    box(r,x,y,.14,.32,.39,.43,3,9,'#b78b52','#87623c','#69472d');
    for(let n=0;n<3;n++)box(r,x,y,-.37+n*.1,.34,-.3+n*.1,.43,3,7,'#e0c879','#bb9851','#977135');
    line(r,q(.21,.36,10),q(.31,.36,16),'#5d4b38',2);
  }else {stone(-.43,.34,.43,.43,0,4);box(r,x,y,-.45,-.26,-.38,-.1,3,12,'#7c9253','#5d743d','#476031');}
  return true;
}

/** Era 5–6: concrete, steel and glass; machinery only animates while working. */
function drawFutureBuilding(r:RC,k:BKey,x:number,y:number,lvl:number,i:number){
  if(B[k].era<5)return false;
  if(k==='retention'){drawMedieval(r,'reservoir',x,y,lvl,i);return true;}
  const q=tp(r,x,y),c=r.c,hs=1+.15*Math.max(0,lvl-1),modern=B[k].era===6;
  const working=i<0||r.city.people.some(p=>!p.refuge&&p.task.t==='work'&&p.task.at===i&&p.haul?.phase==='work');
  const running=(k==='thermal'?(r.city.modern?.generation[i]??0)>0:working)&&!r.city.b[i]?.off&&!r.city.b[i]?.burned&&!r.city.b[i]?.flooded;
  const concrete=(u0:number,v0:number,u1:number,v1:number,z:number,h:number)=>box(r,x,y,u0,v0,u1,v1,z,h,modern?'#d4ded7':'#c5b7a0',modern?'#a7bbb5':'#9e8c78',modern?'#819c97':'#7c7267');
  const pane=(u:number,v:number,z:number,w=.09,h=5)=>poly(c,[q(u,v,z),q(u+w,v,z),q(u+w,v,z+h),q(u,v,z+h)],'#5d96a4');
  const roof=(z:number)=>gable(r,x,y,-.44,-.38,.44,.34,z,8,'#63777c','#4d6065','#354d55');
  shadow(r,x,y,.48);concrete(-.46,-.44,.46,.44,0,3);
  if(k==='solar'){
    for(const v of [-.25,.12])for(const u of [-.28,0,.28]){
      line(r,q(u,v,3),q(u,v,12),'#89978b',1.5);
      poly(c,[q(u-.12,v-.13,16),q(u+.12,v-.13,16),q(u+.12,v+.13,9),q(u-.12,v+.13,9)],'#2f6086');
      line(r,q(u,v-.13,16),q(u,v+.13,9),'#87b6ce',.6);
    }return true;
  }
  if(k==='park'||k==='nursery'){
    poly(c,[q(-.43,-.41,3),q(.43,-.41,3),q(.43,.41,3),q(-.43,.41,3)],k==='park'?'#76a05a':'#8e7950');
    for(const [u,v]of [[-.28,-.24],[.24,-.24],[-.24,.25],[.26,.24]]){
      const h=k==='park'?18:10;line(r,q(u,v,3),q(u,v,h),'#7c5d3b',2);
      for(const [du,dv,z]of [[0,0,h],[-.08,.02,h-3],[.08,-.02,h-2]]){const [a,b]=q(u+du,v+dv,z);c.fillStyle=k==='park'?'#3f8051':'#5a9c56';c.beginPath();c.ellipse(a,b,6*r.v.s,5*r.v.s,0,0,Math.PI*2);c.fill();}
    }
    if(k==='park'){concrete(-.08,-.4,.08,.4,3,4);box(r,x,y,.16,.14,.38,.2,4,7,'#b99a68','#806646','#654d35');}
    else {gable(r,x,y,-.2,-.18,.2,.16,10,8,'#8bb6a9','#68958c','#4b736e');line(r,q(-.2,-.18,10),q(-.2,-.18,3),'#9dbaa1',1);}
    return true;
  }
  if(k==='coalmine'){
    const [sx, sy] = q(0, 0);
    drawFutureArt(c, "coal", sx, sy, r.v.s * .85, { time: r.anim, active: running });
    return true;
  }
  if(k==='ironbridge'||k==='bridgehead'){
    const main=k==='ironbridge',span=main?r.city.b[i]?.bridge:Object.entries(r.city.b).find(([,b])=>b.k==='ironbridge'&&b.bridge?.to===i)?.[1].bridge;
    const alongX=span?Math.floor(span.to/W)===Math.floor(i/W):N4.some(([dx,dy])=>dx!==0&&inb(x+dx,y+dy)&&r.city.t[idx(x+dx,y+dy)]===R);
    const p=(u:number,v:number,z:number)=>alongX?q(u,v,z):q(v,u,z);
    concrete(-.47,-.46,.47,.46,0,3);
    for(const side of [-.38,.38]){
      const u0=alongX?-.16:side-.09,v0=alongX?side-.09:-.16,u1=alongX?.16:side+.09,v1=alongX?side+.09:.16;
      concrete(u0,v0,u1,v1,3,main?23:18);
      line(r,p(-.48,side,7),p(.48,side,7),'#61808a',2);
      line(r,p(0,side,main?23:18),p(.42,side,7),'#466673',1.5);
    }
    poly(c,[p(-.5,-.27,5),p(.5,-.27,5),p(.5,.27,5),p(-.5,.27,5)],'#bdad83');
    for(const u of [-.4,-.2,0,.2,.4])line(r,p(u,-.27,5),p(u,.27,5),'#8a8069',.7);
    flag(r,x,y,-.31,-.32,main?24:19,12,'#d7b34e',i);return true;
  }
  if(k==='dam'){
    const dam=k==='dam';concrete(-.43,-.33,.43,.33,3,dam?29:14);
    for(const u of [-.28,0,.28]){concrete(u-.04,-.36,u+.04,.36,3,dam?35:24);line(r,q(u-.12,.35,dam?26:14),q(u+.12,.35,dam?26:14),dam?'#5e9eb1':'#334e5d',3);}
    if(dam){for(const u of [-.14,.14])poly(c,[q(u-.05,.35,26),q(u+.05,.35,26),q(u+.05,.48,4),q(u-.05,.48,4)],'#75b8c7');concrete(-.16,-.2,.16,.13,29,42);pane(-.12,.14,32,.24,5);}
    else{for(const side of [-.32,.32]){line(r,q(-.42,side,14),q(.42,side,14),'#507282',2);for(let n=0;n<4;n++){const u=-.4+n*.2;line(r,q(u,side,14),q(u+.1,side,27),'#668894',2);line(r,q(u+.1,side,27),q(u+.2,side,14),'#668894',2);}}}
    flag(r,x,y,-.36,-.27,dam?30:15,20,'#d7b34e',i);return true;
  }
  if(k==='treatment'||k==='hydro'){
    for(const u of [-.21,.21]){concrete(u-.18,-.34,u+.18,.12,3,k==='hydro'?20:9);poly(c,[q(u-.14,-.3,10),q(u+.14,-.3,10),q(u+.14,.08,10),q(u-.14,.08,10)],'#599da9');line(r,q(u-.12,-.05,11),q(u+.12,-.05,11),'#b2dfd4',1);}
    box(r,x,y,-.34,.2,.34,.36,3,12,'#899d90','#617c73','#466157');
    for(const u of [-.2,.2]){const [a,b]=q(u,.37,10);c.strokeStyle='#c9d3bf';c.lineWidth=1.5;c.beginPath();c.arc(a,b,4*r.v.s,0,Math.PI*2);c.stroke();}
    if(k==='hydro')flag(r,x,y,-.3,-.2,20,16,'#69b2bb',i);return true;
  }
  if(k==='tenement'||k==='apartment'){
    const floors=(k==='apartment'?4:2)+lvl,h=8+floors*6;concrete(-.37,-.32,.37,.28,3,h);concrete(-.41,-.36,.41,.32,h,h+3);
    for(let n=0;n<floors;n++)for(const u of [-.28,-.08,.14]){pane(u,.29,8+n*6,.12,3);line(r,q(u,.29,7+n*6),q(u+.12,.29,7+n*6),'#d7ceac',1);}
    poly(c,[q(-.05,.3,3),q(.07,.3,3),q(.07,.3,11),q(-.05,.3,11)],'#526a67');
    if(k==='apartment'){concrete(.13,-.23,.34,-.05,h+3,h+9);pane(-.27,-.05,h+4,.22,2);}return true;
  }
  if(k==='hospital'||k==='university'||k==='green'){
    const green=k==='green',h=(green?30:22)*hs;concrete(-.4,-.32,.4,.27,3,h);concrete(-.44,-.36,.44,.31,h,h+3);
    for(const u of [-.3,-.1,.1,.27])for(const z of [9,17])pane(u,.28,z,.1,5);
    concrete(-.09,.18,.09,.41,3,9);poly(c,[q(-.08,.27,5),q(.08,.27,5),q(.08,.27,16),q(-.08,.27,16)],'#3f7585');
    if(k==='hospital'){const [a,b]=q(0,.29,h-3);c.strokeStyle='#4d997d';c.lineWidth=3*r.v.s;c.beginPath();c.moveTo(a-4*r.v.s,b);c.lineTo(a+4*r.v.s,b);c.moveTo(a,b-4*r.v.s);c.lineTo(a,b+4*r.v.s);c.stroke();}
    else if(green){for(const u of [-.32,.3]){line(r,q(u,-.1,h+3),q(u,-.1,h+15),'#846d47',2);const [a,b]=q(u,-.1,h+14);c.fillStyle='#5d9a61';c.beginPath();c.arc(a,b,8*r.v.s,0,Math.PI*2);c.fill();}flag(r,x,y,.34,-.27,h,20,'#62b68b',i);}
    else{gable(r,x,y,-.18,-.24,.18,.14,h+3,12,'#50868f','#386b77','#325766');flag(r,x,y,-.35,-.27,h,20,'#d4b65a',i);}
    return true;
  }
  const h=(k==='thermal'?23:k==='transport'?15:k==='charcoal'?13:20)*hs;
  concrete(-.37,-.32,.37,.24,3,h);roof(h);
  for(const u of [-.25,-.05,.17])pane(u,.25,8,.12,5);
  if(k==='transport'){
    for(const u of [-.32,.32])line(r,q(u,.44,3),q(u,.44,17),'#687a73',2);
    gable(r,x,y,-.39,.23,.39,.48,17,5,'#a58650','#7f653c','#6b5534');
    for(const u of [-.22,0,.22])box(r,x,y,u-.07,.31,u+.07,.44,3,9,'#c5a46c','#9d7a4c','#7e5d3a');
  }else{
    const tower=k==='thermal'?44:k==='charcoal'?29:35;
    for(const u of (k==='factory'||k==='thermal'?[-.2,.2]:[-.24])){
      concrete(u-.06,-.25,u+.06,-.12,h,tower);concrete(u-.08,-.27,u+.08,-.1,tower,tower+2);
      if(running&&(k!=='thermal'||(r.city.modern?.generation[i]??0)>0))smoke(r,x,y,u,-.18,tower+5,i);
    }
    const [a,b]=q(.18,.27,13),angle=running?r.anim/600:0;c.strokeStyle='#cad1bc';c.lineWidth=1.4*r.v.s;c.beginPath();c.arc(a,b,5*r.v.s,0,Math.PI*2);c.stroke();
    for(let n=0;n<6;n++){const ph=angle+n*Math.PI/3;line(r,[a,b],[a+Math.cos(ph)*6*r.v.s,b+Math.sin(ph)*4*r.v.s],'#d5c7a6',1);}
    if(k==='charcoal')for(const u of [-.3,-.15,0])box(r,x,y,u,.32,u+.1,.43,3,7,'#927456','#6c5138','#4a392b');
  }
  return true;
}

function drawBase(r: RC, k: BKey, x: number, y: number, lvl: number, i: number) {
  if(drawFutureBuilding(r,k,x,y,lvl,i)||drawMedieval(r,k,x,y,lvl,i))return;
  if (k === "hut" && r.city.era > 1) { drawBase(r,r.city.era === 2 ? "house" : "stonehouse",x,y,lvl,i); return; }
  if (k === "house" && r.city.era >= 3) { drawBase(r,"stonehouse",x,y,lvl,i); return; }
  if(k==="dock"){
    const q=tp(r,x,y),stone=r.city.era>=3;
    shadow(r,x,y,.46);
    box(r,x,y,-.4,-.38,.3,.2,0,stone?17:12,stone?"#c9c8b5":"#b58958",stone?"#a1ac9d":"#976d42",stone?"#819080":"#755131");
    gable(r,x,y,-.44,-.42,.34,.24,stone?17:12,10,stone?"#557e8e":"#a97442",stone?"#416572":"#8f6034",stone?"#32515e":"#744b29");
    const direction=N4.find(([dx,dy])=>inb(x+dx,y+dy)&&r.city.t[idx(x+dx,y+dy)]===R)??[1,0];
    const [dx,dy]=direction;
    for(let n=0;n<7;n++){const u=dx*(.25+n*.12),v=dy*(.25+n*.12);box(r,x,y,u-.18,v-.18,u+.18,v+.18,0,3,"#c29c62","#88633c","#6e4a2e");}
    for(const side of [-1,1]){const u=dx*.9+dy*.17*side,v=dy*.9+dx*.17*side;box(r,x,y,u-.03,v-.03,u+.03,v+.03,-3,8,"#c5ac79","#8e714b","#745936");}
    flag(r,x,y,-.31,-.28,0,35,"#568aab",i);
    if(shipsFree(r.city)>0){const [sx,sy]=q(dx*1.05,dy*1.05,0);drawTransportBoat(r.c,sx,sy,r.v.s*.65,r.anim,1,0);}
    return;
  }
  if (drawEvolvingWorkshop(r,k,x,y,lvl,i)) return;
  const c = r.c, s = r.v.s, q = tp(r, x, y), hs = 1 + 0.2 * Math.max(0, lvl - 1);
  const night = false;
  switch (k) {
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
        const stone=r.city.era>=3;
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
      if(r.city.era>1){const stone=r.city.era>=3;box(r,x,y,-.28,-.22,.28,.22,0,4,stone?"#c6c8bb":"#b59266",stone?"#9baa9c":"#98764f",stone?"#758d80":"#775a3a");}
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
    case "estate":
    case "farm": {
      if(r.city.era>=3){
        poly(c,[q(-.49,.39,1),q(.49,.39,1),q(.49,.49,1),q(-.49,.49,1)],"#579dc5");
        for(const u of [-.48,.44])box(r,x,y,u,-.48,u+.04,.49,0,2,"#c1c2ab","#9da991","#7b907a");
      }
      const soil = r.season === 3 ? "#8a7158" : "#7a5634";
      poly(c, [q(-0.46, -0.46, 1), q(0.46, -0.46, 1), q(0.46, 0.46, 1), q(-0.46, 0.46, 1)], soil);
      const field=r.city.b[i],remaining=field?farmRemaining(field)/farmCapacity(field):1;
      const crop = remaining<=0 || field?.tendUntil ? "#80664c" : ["#8fd05a", "#a9c24a", "#e2b84a", "#9c8466"][r.season];
      c.strokeStyle = crop; c.lineWidth = Math.max(1.5, 3 * s); c.lineCap = "round";
      for (let row = 0; row < 5; row++) {
        const v = -0.38 + row * 0.19;
        const a = q(-0.38, v, (remaining<=0 || field?.tendUntil ? .3 : 3) * hs), b = q(0.38, v, (remaining<=0 || field?.tendUntil ? .3 : 3) * hs);
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
      const rect = (u0: number, v0: number, u1: number, v1: number) => {
        poly(c, [q(u0, v0, 1), q(u1, v0, 1), q(u1, v1, 1), q(u0, v1, 1)], r.city.era>=3 ? "#b3c0b6" : "#a28a62");
        poly(c, [q(u0 + 0.05, v0 + 0.05, z), q(u1 - 0.05, v0 + 0.05, z), q(u1 - 0.05, v1 - 0.05, z), q(u0 + 0.05, v1 - 0.05, z)], water);
      };
      for(const bounds of canalFootprints(r.city,x,y))rect(...bounds);
      break;
    }
    case "levee": {
      if(r.city.era>=3)for(let n=0;n<6;n++)box(r,x,y,-.48+n*.16,.35,-.33+n*.16,.49,0,8,"#bcc6b8","#98aa98","#758e7e");
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
      if(r.city.era>=3){box(r,x,y,-.39,-.38,.37,.36,0,4,"#bdc4b4","#96aa99","#738d7d");box(r,x,y,-.26,-.22,-.13,-.09,0,30,"#a6b6a8","#889e8c","#637f70");}
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
    case "builderhouse": {
      const era = r.city.era, height = (era === 1 ? 9 : era === 2 ? 14 : 19) * hs;
      shadow(r, x, y, .43);
      box(r,x,y,-.36,-.34,.25,.16,0,height,era===3?"#c6c1ad":"#b28b58",era===3?"#a7a591":"#947044",era===3?"#858977":"#745334");
      gable(r,x,y,-.4,-.38,.29,.2,height,era===1?8:11,era===1?"#c5a15e":era===2?"#89613b":"#a95238",era===1?"#a98b4d":era===2?"#704c30":"#89412d",era===1?"#b79855":era===2?"#7d5634":"#974830");
      // Open workbench with a mallet, spare planks and stone blocks.
      box(r,x,y,-.25,.26,.3,.4,0,7,"#bc955b","#987443","#745435");
      line(r,q(.03,.32,7),q(.14,.32,13),"#5e4029",1.8);
      box(r,x,y,.07,.28,.22,.37,12,15,"#b3b8b1","#8c938e","#676f6b");
      for(let n=0;n<3;n++)box(r,x,y,.29,-.26+n*.1,.45,-.2+n*.1,0,3+n,"#c5a06b","#a68452","#84683e");
      if(era===3)box(r,x,y,-.43,.1,-.3,.23,0,5,"#c5c4b8","#a6aa9a","#858d7e");
      break;
    }
    case "market": {
      if(r.city.era>=3){box(r,x,y,-.4,-.3,.4,.3,0,4,"#bcc5b5","#99ac98","#768f7b");for(const u of [-.35,.3])box(r,x,y,u,-.23,u+.05,.23,4,17,"#c6d0c3","#a3b6a4","#7c9a86");}
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
      box(r, x, y, -0.4, -0.34, 0.4, 0.3, 4, 16, r.city.era>=3?"#c6c8bc":"#a8743e", r.city.era>=3?"#a3aea1":"#955f30", r.city.era>=3?"#788e85":"#7a4c26");
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
        gable(r, x, y, -0.48, -0.42, 0.48, 0.4, 17, 16 * hs, r.city.era>=3?"#577d8d":"#b0543a", r.city.era>=3?"#426371":"#994632", r.city.era>=3?"#314e60":"#8c3f2c");
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
  r={...r,billboard:true};
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
  const arm = Math.sin(ph), face=travelFace(r.v,vl.headingX??0,vl.headingY??0,cameraFace(r.v,vl.face)), ax = sx + face * (arm > 0 ? 4 : -1) * s, ay = wy - Math.max(0, arm) * 4 * s;
  c.strokeStyle = vl.skin; c.lineWidth = Math.max(1, 1.4 * s); c.lineCap = "round";
  c.beginPath(); c.moveTo(sx + vl.face * 1.5 * s, wy); c.quadraticCurveTo(sx + vl.face * 3 * s, ay - 2 * s, ax, ay); c.stroke(); c.lineCap = "butt";
  c.fillStyle = vl.skin; c.beginPath(); c.arc(sx + vl.face * 0.8 * s, wy - 2.4 * s, 2.3 * s, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#2b1e14"; c.beginPath(); c.arc(sx + vl.face * 0.8 * s, wy - 3.1 * s, 2.3 * s, Math.PI, 0); c.fill();
  if (vl.carrying && vl.carry === "wood") { c.fillStyle = "#8a5a2b"; c.fillRect(sx - 5 * s, wy - 1 * s, 10 * s, 2 * s); }
}

function drawVillager(r: RC, vl: Villager) {
  if (inWater(r, vl.fx, vl.fy)) { drawSwimmer(r, vl); return; }
  const [x,y] = P(r.v, vl.fx, vl.fy,deckHeight(r,vl.fx,vl.fy));
  drawVillagerArt(r.c,x,y,Math.max(r.v.s*1.12,.54),{
    time:r.anim,seed:vl.seed,face:vl.moving?travelFace(r.v,vl.headingX??0,vl.headingY??0,cameraFace(r.v,vl.face)):cameraFace(r.v,vl.face),era:r.city.era,job:vl.job,
    walking:vl.moving,running:vl.run&&vl.moving,working:vl.state==='work',
    swing:vl.swing,carrying:vl.carrying,resource:vl.carry,
    skin:vl.skin,shirt:vl.shirt,band:vl.band,
  });
}

function drawAnimal(r: RC, kind: "deer" | "boar", fx: number, fy: number, face: 1 | -1, graze: boolean, buck: boolean, seed: number, heading?:Pt) {
  const [sx, sy] = P(r.v, fx, fy);
  drawAnimalArt(r.c, kind, sx, sy, Math.max(r.v.s * .8, .38), { time: r.anim, face:heading?travelFace(r.v,...heading,cameraFace(r.v,face)):cameraFace(r.v,face), walking: !graze, graze, antlers: buck, seed });
}

/** Envoy identity: blue-green cloak, travel staff, scroll and era-specific headwear. */
export function drawEnvoyActor(c: CanvasRenderingContext2D, era: number, x: number, y: number, scale: number, anim: number, walking: boolean, face: 1|-1=1) {
  const s=Math.max(.65,Math.min(1.7,scale)),step=walking?Math.sin(anim/130)*2*s:0,bob=walking?Math.abs(Math.sin(anim/130))*s:0;
  c.save();c.translate(x,y-bob);c.scale(face,1);
  c.fillStyle="rgba(10,25,25,.25)";c.beginPath();c.ellipse(0,0,5*s,2*s,0,0,Math.PI*2);c.fill();
  c.strokeStyle="#4e3528";c.lineWidth=2*s;c.beginPath();c.moveTo(-2*s,-5*s);c.lineTo(-2*s+step,0);c.moveTo(2*s,-5*s);c.lineTo(2*s-step,0);c.stroke();
  c.fillStyle=era>=6?"#354a62":era===5?"#4a6471":era>=3?"#216d78":era===2?"#2d898b":"#3a9388";c.beginPath();c.moveTo(-3*s,-13*s);c.lineTo(3*s,-13*s);c.lineTo(5*s,-4*s);c.lineTo(-5*s,-4*s);c.closePath();c.fill();
  c.fillStyle="#dbb28c";c.beginPath();c.arc(0,-16*s,2.5*s,0,Math.PI*2);c.fill();
  c.fillStyle=era>=5?"#263f53":era>=3?"#deb856":"#426660";c.fillRect(-3*s,-20*s,6*s,2*s);
  if(era>=2&&era<5){c.strokeStyle="#e4c774";c.lineWidth=s;c.beginPath();c.moveTo(0,-20*s);c.lineTo(3*s,-24*s);c.stroke();}
  c.fillStyle="#efe0b3";c.fillRect(-5*s,-12*s,3*s,6*s);
  c.strokeStyle="#956d41";c.lineWidth=s;c.beginPath();c.moveTo(6*s,0);c.lineTo(6*s,-29*s);c.stroke();
  c.fillStyle="#5cbed0";c.beginPath();c.moveTo(6*s,-28*s);c.lineTo(15*s,-26*s+Math.sin(anim/220)*s);c.lineTo(11*s,-23*s);c.lineTo(6*s,-23*s);c.closePath();c.fill();c.restore();
}

/** A transport has a deep hull, blue canopy, oars and a wake; never a walking soldier on water. */
export function drawTransportBoat(c:CanvasRenderingContext2D,x:number,y:number,s:number,time:number,face:1|-1=1,passengers=0){
  c.save();c.translate(x,y+Math.sin(time/500)*1.2*s);c.scale(s*face,s);
  c.strokeStyle="rgba(200,238,239,.65)";c.lineWidth=1.5;
  for(const k of [0,1]){c.beginPath();c.ellipse(-7-k*5,5+k*2,20+k*5,4,0,.15,Math.PI-.15);c.stroke();}
  c.fillStyle="#583926";c.strokeStyle="#bc9461";c.beginPath();c.moveTo(-23,-4);c.quadraticCurveTo(-16,12,14,6);c.lineTo(28,-8);c.quadraticCurveTo(4,1,-23,-4);c.fill();c.stroke();
  c.fillStyle="#a77d4c";c.beginPath();c.ellipse(0,-4,19,5,0,0,Math.PI*2);c.fill();
  c.strokeStyle="#d4bc87";c.lineWidth=2;
  for(const k of [-1,1]){c.beginPath();c.moveTo(k*10,-4);c.lineTo(k*10-9+Math.sin(time/210)*3,9);c.stroke();}
  c.fillStyle="#527f91";c.beginPath();c.moveTo(-11,-7);c.lineTo(-9,-19);c.lineTo(10,-19);c.lineTo(14,-8);c.closePath();c.fill();c.strokeStyle="#d8c598";c.stroke();
  if(passengers){c.fillStyle="#ebcf99";for(const k of [-1,1]){c.beginPath();c.arc(k*15,-8,2.5,0,Math.PI*2);c.fill();}}
  c.restore();
}

export function drawSoldier(r: Pick<RC, "c" | "v" | "anim"> & {deck?:ReadonlySet<number>}, u: UKey, fx: number, fy: number, face: 1 | -1, walking: boolean, seed: number, fighting = false, barbarian = false, heading?:Pt) {
  const [sx, sy] = P(r.v, fx, fy, r.deck?.has(idx(Math.floor(fx),Math.floor(fy)))?5*r.v.s:0);
  drawSoldierArt(r.c, u, sx, sy, Math.max(r.v.s * 1.08, .52), { time: r.anim, face:heading?travelFace(r.v,...heading,cameraFace(r.v,face)):cameraFace(r.v,face), walking, seed, fighting, hostile: barbarian });
}

function drawCampSite(r: RC, k: Camp) {
  r={...r,billboard:true};
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
  const label = `⚔ ${campStrength(k)}`;
  c.font = `700 ${Math.max(11, Math.round(9 * s))}px system-ui, sans-serif`; c.textAlign = "center"; c.textBaseline = "middle";
  const w = c.measureText(label).width + 10;
  c.fillStyle = "rgba(60,15,15,.85)"; c.fillRect(tx - w / 2, ty - 9, w, 18);
  c.fillStyle = "#ffd9c9"; c.fillText(label, tx, ty + 0.5);
}

/** Draw a figure standing in the river: sunk to the waist with ripples around it. */
function deckHeight(r:RC,fx:number,fy:number){return r.deck.has(idx(Math.floor(fx),Math.floor(fy)))?5*r.v.s:0;}
function inWater(r: RC, fx: number, fy: number, boat=false) {
  const tx = Math.floor(fx), ty = Math.floor(fy);
  return inb(tx, ty) && r.city.t[idx(tx, ty)] === R && (boat||!r.deck.has(idx(tx,ty)));
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

/** Share canal geometry between painting and picking, including disconnected dry branches. */
function canalFootprints(city:City,x:number,y:number):[number,number,number,number][]{
  const rects:[number,number,number,number][]=[[-.25,-.25,.25,.25]];
  for(const [dx,dy]of N4){
    if(!inb(x+dx,y+dy))continue;const tile=idx(x+dx,y+dy);
    if(city.t[tile]!==R&&city.b[tile]?.k!=="canal")continue;
    rects.push(dx?[dx>0?0:-.5,-.25,dx>0?.5:0,.25]:[-.25,dy>0?0:-.5,.25,dy>0?.5:0]);
  }
  return rects;
}

/** Match the main solid silhouettes; ignore smoke, shadows and thin waving flags. */
function buildingHitShapes(k: BKey, lvl: number, era: number): HitShape[] {
  const hs = 1 + .2 * Math.max(0, lvl - 1);
  const shape = (u0: number, v0: number, u1: number, v1: number, wall: number, roof = 0, pyramid = false): HitShape => ({ u0, v0, u1, v1, wall, roof, pyramid });
  if (k === "hut" && era > 1) return buildingHitShapes(era === 2 ? "house" : "stonehouse",lvl,era);
  if (k === "house" && era === 3) return buildingHitShapes("stonehouse",lvl,era);
  switch (k) {
    case "apartment": return [shape(-.41,-.36,.41,.32,11+(4+lvl)*6+9)];
    case "tenement": return [shape(-.41,-.36,.41,.32,11+(2+lvl)*6)];
    case "thermal": case "factory": case "machine": case "complex": case "charcoal": return [shape(-.44,-.38,.44,.34,23*hs,8),shape(-.29,-.25,.29,-.1,46)];
    case "dam": case "green": return [shape(-.44,-.36,.44,.35,44,8)];
    case "retention": case "solar": case "park": case "nursery": return [shape(-.46,-.44,.46,.44,18)];
    case "hut": return [lvl >= 3 ? shape(-.4, -.36, .4, .36, 22, 14) : lvl === 2 ? shape(-.36, -.32, .36, .32, 11, 12) : shape(-.32, -.32, .32, .32, 9, 16, true)];
    case "house": return [shape(-.38, -.34, .38, .34, 15 * hs, 12), { ...shape(.15, -.2, .25, -.1, 14), z: 15 * hs }];
    case "stonehouse": return [shape(-.4, -.36, .4, .36, 20 * hs, 13), ...(lvl >= 3 ? [shape(-.45, -.45, -.13, -.13, 20 * hs + 34, 12, true)] : [])];
    case "gather": return [shape(-.37, -.37, .07, .13, 9*hs, 7), shape(-.2, -.1, .38, .4, 3)];
    case "wood": return [shape(-.36, -.36, .06, .04, 9 * hs, 7), shape(.05, .15, .38, .35, 5)];
    case "quarry": return [shape(-.34, -.32, .34, .34, 15), ...(era>1?[shape(-.34,-.25,.34,-.18,24)]:[])];
    case "grandstore": case "tilehouse": case "school": case "artisan": case "academy": return [shape(-.44,-.4,.44,.4,24,13)];
    case "well": return [shape(-.3,-.3,.3,.3,18,10)];
    case "reservoir": return [shape(-.46,-.46,.46,.46,5)];
    case "storehouse": return [shape(-.4, -.36, .4, .36, 13 * hs, 10)];
    case "fire": return [shape(-.22, -.22, .22, .22, 1, 20, true)];
    case "logistics": case "infirmary": return [shape(-.4,-.34,.3,.18,25),shape(-.32,.26,.24,.43,10)];
    case "estate":
    case "farm": return [shape(-.46, -.46, .46, .46, 3 * hs)];
    case "canal": return [{...shape(-.25, -.25, .25, .25, 4),z:-3}];
    case "levee": return [shape(-.48, -.48, .48, .48, 6)];
    case "smelter": return [shape(-.3, -.3, .3, .3, 12, 8, true), shape(.05, -.15, .2, 0, 34)];
    case "builderhouse": return [shape(-.4,-.38,.29,.2,(era===1?9:era===2?14:19)*hs,era===1?8:11),shape(-.25,.26,.3,.4,7)];
    case "dock": return [shape(-.42,-.4,.36,.3,16,10)];
    case "market": return [shape(-.38, -.26, .38, .31, 18, 6)];
    case "forge": return [shape(-.39, -.33, .37, .31, 16*hs, 9)];
    case "wheel": return [shape(-.34, -.34, .16, .24, 13 * hs, 9), shape(.14, -.2, .46, .12, 22)];
    case "envoy": return [era <= 1 ? shape(-.32, -.3, .28, .26, 10 * hs, 14 * hs, true) : era === 2 ? shape(-.38, -.34, .36, .32, 14 * hs, 11) : shape(-.42, -.38, .42, .36, 20 * hs, 13)];
    case "hall": return [shape(-.48, -.44, .48, .44, 4), shape(-.48, -.42, .48, .4, 17, lvl >= 3 ? 8 : 16 * hs), ...(lvl >= 3 ? [{ ...shape(-.4, -.3, .4, .26, 6, 13), z: 21 }] : [])];
    case "barracks": return [shape(-.4, -.32, .36, .26, 13 * hs, 9), shape(-.44, .4, .47, .46, 13)];
    case "temple": return [shape(-.46, -.46, .46, .46, 8), shape(-.36, -.36, .36, .36, 18), shape(-.3, -.3, .3, .3, 34, 22, true)];
    case "gate": return [shape(-.46, -.16, .46, .16, era>=4?25+lvl*2:22*hs, era===4||era===2||era===3?8:0)];
    case "watchtower": return [shape(-.4, -.4, .4, .4, (era === 1 ? 25 : 32) * hs, 10, era === 1)];
  }
  return [shape(-.44,-.38,.44,.38,24*hs,8)];
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
  const candidates = buildings(city).filter(([tile]) => city.seen[tile]).sort(([a], [b]) => viewDepth(v,b%W,Math.floor(b/W))-viewDepth(v,a%W,Math.floor(a/W)) || b-a);
  for (const [tile, building] of candidates) {
    const x = tile % W, y = Math.floor(tile / W);
    const shapes:HitShape[]=building.k==='canal'
      ?canalFootprints(city,x,y).map(([u0,v0,u1,v1])=>({u0,v0,u1,v1,wall:4,z:-3}))
      :building.k==='wall'?wallFootprints(wallMask(city,tile)).map(([u0,v0,u1,v1])=>({u0,v0,u1,v1,wall:wallHeight(city.era,Math.max(1,building.lvl))+4}))
      :buildingHitShapes(building.k, Math.max(1, building.lvl), city.era);
    const turn=building.k==='gate'&&defenseAxis(city,tile)==='y';
    for (const h of shapes) {
      const [cx,cy]=P(v,x+.5,y+.5);
      const q = (u: number, w: number, z: number): Pt => fixedArt(building.k)
        ?[cx+(u-w)*v.TW/2,cy+(u+w)*v.TH/2-z*v.s]
        :P(v, x + .5 + (turn?w:u), y + .5 + (turn?u:w), z * v.s);
      const z = h.z ?? 0, top = z + h.wall;
      const a = q(h.u0, h.v0, z), b = q(h.u1, h.v0, z), c = q(h.u1, h.v1, z), d = q(h.u0, h.v1, z);
      const A = q(h.u0, h.v0, top), B = q(h.u1, h.v0, top), C = q(h.u1, h.v1, top), D = q(h.u0, h.v1, top);
      const faces: Pt[][] = [[a,b,B,A],[a,d,D,A],[d, c, C, D], [b, c, C, B], [A, B, C, D]];
      if (h.roof) {
        if (h.pyramid) { const apex = q((h.u0 + h.u1) / 2, (h.v0 + h.v1) / 2, top + h.roof); faces.push([A, B, apex], [B, C, apex], [C, D, apex], [D, A, apex]); }
        else { const left = q(h.u0, (h.v0 + h.v1) / 2, top + h.roof), right = q(h.u1, (h.v0 + h.v1) / 2, top + h.roof); faces.push([A, B, right, left], [left, right, C, D], [B, C, right],[A,D,left]); }
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
export function pickVillager(v: View, list: Villager[], sx: number, sy: number,deck:ReadonlySet<number>=new Set()) {
  const s = Math.max(v.s * 1.45, 0.7);
  let best: Villager | null = null, bd = 1e9;
  for (const vl of list) {
    if (!vl.visible || vl.id === null) continue;
    const [x, y] = P(v, vl.fx, vl.fy,deck.has(idx(Math.floor(vl.fx),Math.floor(vl.fy)))?5*v.s:0);
    const d = Math.hypot(sx - x, sy - (y - 8 * s));
    if (d < Math.max(18, 14 * s) && d < bd) { bd = d; best = vl; }
  }
  return best;
}

/** A building remains clickable beneath an actor's generous touch hit area.
 * Shift/Ctrl/Meta explicitly picks a person when targets overlap. */
export function pickHomeSoldier(v:View,city:City,now:number,sx:number,sy:number) {
  const deck=bridgeDeck(city);
  return homeSoldiers(city,now).map(s=>{const [x,y]=P(v,s.x,s.y,deck.has(idx(Math.floor(s.x),Math.floor(s.y)))?5*v.s:0);return {s,d:Math.hypot((sx-x)/Math.max(10,10*v.s),(sy-y+10*v.s)/Math.max(14,18*v.s))};}).filter(p=>p.d<=1).sort((a,b)=>a.d-b.d)[0]?.s ?? null;
}
export function pickVillageTarget(v:View,city:City,list:Villager[],anim:number,sx:number,sy:number,preferPerson=false) {
  const building=pickBuilding(v,city,sx,sy);
  const person=(!building || preferPerson)?pickVillager(v,list,sx,sy,bridgeDeck(city)):null;
  if(person)return {type:"person" as const,person};
  if(building)return {type:"building" as const,cell:building};
  const herd=pickHerd(v,city,anim,sx,sy);
  if(herd!==null)return {type:"herd" as const,id:herd};
  const cell=screenToCell(v,sx,sy);
  return cell?{type:"cell" as const,cell}:null;
}

export type DrawOpts = {
  bridgePreview?:{from:number;to:number|null};
  rules?: EngineRules;
  v: View;
  now: number;
  anim: number;
  hover: { x: number; y: number } | null;
  selected: { x: number; y: number } | null;
  tool: BKey | null;
  defenseOrientation?:DefenseOrientation;
  villagers: Villager[];
  picked: Set<number>;
  pickedSoldier?: string | null;
  pickedSoldiers?: ReadonlySet<string>;
  fx: Fx[];
  chopping: Set<number>;
};

const stagingCache=new WeakMap<City,{at:number;tiles:number[]}>();
export function drawCity(c: Ctx, city: City, D: Derived, o: DrawOpts) {
  const v = o.v;
  const defensePreview:DefensePreview|undefined=o.hover&&(o.tool==='wall'||o.tool==='gate')&&!city.b[idx(o.hover.x,o.hover.y)]
    ?{tile:idx(o.hover.x,o.hover.y),building:{k:o.tool,lvl:1,doneAt:null,...(o.defenseOrientation&&o.defenseOrientation!=='auto'?{orientation:o.defenseOrientation}:{})}}:undefined;
  const r: RC = { c, v, city, D, defensePreview, anim: o.anim, now: o.now, season: seasonAt(city, o.now),deck:bridgeDeck(city) };
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
  visible.sort((a,b)=>viewDepth(v,a%W,Math.floor(a/W))-viewDepth(v,b%W,Math.floor(b/W)) || a-b);
  for (const i of visible) {
    const x=i%W,y=Math.floor(i/W);
    if (seen[i]) { drawGroundTile(r, x, y); continue; }
    const q = tp(r, x, y), edge = nearSeen(x, y);
    if (edge) drawGroundTile(r, x, y);
    poly(c, [q(-0.5, -0.5), q(0.5, -0.5), q(0.5, 0.5), q(-0.5, 0.5)], edge ? "rgba(22,33,30,.72)" : "#18241f");
    if(!edge)drawBankEdges(r,x,y,0,true);
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
  if (r.season === 1 || r.season === 2 || city.disaster?.kind==='flood'&&city.disaster.warned) {
    for (const i of visible) {
      if (!seen[i] || D.rd[i] !== 1 || D.prot[i] || city.t[i] === R) continue;
      poly(c, diamond(i % W, (i / W) | 0), "rgba(90,165,225,.22)");
    }
  }
  if(city.disaster?.kind==='earthquake'&&city.disaster.warned){
    const center=city.disaster.center;c.strokeStyle='rgba(245,142,80,.9)';c.lineWidth=1.5*v.s;
    for(const i of visible)if(seen[i]&&Math.max(Math.abs(i%W-center%W),Math.abs(Math.floor(i/W)-Math.floor(center/W)))<=3){const pts=diamond(i%W,Math.floor(i/W),.06);poly(c,pts,'rgba(210,104,48,.2)');c.beginPath();pts.forEach(([x,y],n)=>n?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.stroke();}
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
  if (o.tool) {
    const allowed = placementTiles(city,D,o.tool,o.rules);
    for (const i of visible) if (seen[i] && allowed(i)) {
      outline({x:i%W,y:Math.floor(i/W)}, "rgba(170,245,130,.75)", "rgba(120,220,90,.25)");
    }
  }
  const serviceCell=o.tool?o.hover:o.selected,serviceKey=o.tool??(o.selected?city.b[idx(o.selected.x,o.selected.y)]?.k:undefined);
  const radius=serviceKey==='well'?4:serviceKey==='reservoir'||serviceKey==='retention'||serviceKey==='nursery'?6:serviceKey==='transport'?8:0;
  if(radius&&serviceCell){
    const range=radius;
    for(const i of visible)if(seen[i]&&Math.max(Math.abs(i%W-serviceCell.x),Math.abs(Math.floor(i/W)-serviceCell.y))<=range){
      poly(c,diamond(i%W,Math.floor(i/W),.04),serviceKey==='transport'?'rgba(238,198,105,.15)':'rgba(87,203,213,.18)');
      if(Math.max(Math.abs(i%W-serviceCell.x),Math.abs(Math.floor(i/W)-serviceCell.y))===range)outline({x:i%W,y:Math.floor(i/W)},'rgba(119,217,221,.65)');
    }
  }
  let ghostOk = false;
  if (o.selected) outline(o.selected, "#f0c766", "rgba(240,199,102,.18)");
  if (o.hover) {
    if (o.tool) {
      ghostOk = !canPlace(city, D, o.tool, o.hover.x, o.hover.y,o.rules);
      outline(o.hover, ghostOk ? "#b4f08a" : "#ff8a6a", ghostOk ? "rgba(160,240,120,.25)" : "rgba(255,120,90,.25)");
    } else outline(o.hover, o.picked.size ? "#7fe0ff" : "rgba(255,250,235,.85)", o.picked.size ? "rgba(127,224,255,.15)" : undefined);
  }
  // explorers' destinations
  for (const p of city.people) {
    if (p.task.t !== "explore") continue;
    const to = p.task.to;
    outline({ x: to % W, y: Math.floor(to / W) }, "rgba(127,224,255,.8)");
  }

  for(const [tile,seedling]of Object.entries(city.industry?.seedlings??{}))if(vis[+tile]&&seen[+tile]){
    const q=tp(r,+tile%W,Math.floor(+tile/W)),growth=Math.max(.15,1-(seedling.readyAt-o.now)/(30*60000));
    line(r,q(0,0,0),q(0,0,4+growth*7),'#6a7744',1.5);poly(c,[q(0,0,3),q(-.15,0,6+growth*5),q(0,0,7+growth*6),q(.15,0,6+growth*5)],'#7fba56');
  }
  if(o.bridgePreview){
    const {from,to}=o.bridgePreview;
    for(const i of visible)if(seen[i]&&city.t[i]===G&&!bridgeGeometry(city,from,i).error)outline({x:i%W,y:Math.floor(i/W)},'#8fd8bf','rgba(80,220,165,.24)');
    if(to!==null){
      const plan=bridgeGeometry(city,from,to),col=plan.error?'#f18f73':'#edcc7c';
      outline({x:to%W,y:Math.floor(to/W)},col);
      c.strokeStyle=col;c.lineWidth=2;c.setLineDash([7,5]);c.beginPath();
      const a=P(v,from%W+.5,Math.floor(from/W)+.5),b=P(v,to%W+.5,Math.floor(to/W)+.5);c.moveTo(...a);c.lineTo(...b);c.stroke();c.setLineDash([]);
    }
  }
  // 3. objects sorted by depth
  type Item = { d: number; f: () => void };
  const items: Item[] = [];
  for(const [from,b]of buildings(city))if(b.k==='ironbridge'&&b.bridge){
    const span=b.bridge,alongX=Math.floor(from/W)===Math.floor(span.to/W),ready=bridgeReady(city,from);
    for(const tile of span.tiles){
      if(!vis[tile]||!seen[tile]||city.t[tile]!==R)continue;
      const x=tile%W,y=Math.floor(tile/W),q=tp(r,x,y),p=(u:number,v:number,z:number)=>alongX?q(u,v,z):q(v,u,z);
      items.push({d:viewDepth(v,x+.5,y+.5)-.1,f:()=>{
        c.save();if(!ready)c.globalAlpha=b.doneAt ? .65 : .35;
        box(r,x,y,alongX?-.5:-.3,alongX?-.3:-.5,alongX?.5:.3,alongX?.3:.5,1,5,ready?'#bdad83':'#9b8c71','#435e64','#374e58');
        for(const u of [-.4,-.2,0,.2,.4])line(r,p(u,-.3,5),p(u,.3,5),'#827761',.7);
        for(const side of [-.34,.34].sort((a,b)=>p(0,a,0)[1]-p(0,b,0)[1])){
          line(r,p(-.5,side,5),p(.5,side,5),'#3a5660',2);
          line(r,p(-.5,side,14),p(.5,side,14),'#72949b',1.6);
          for(const u of [-.5,0]){line(r,p(u,side,5),p(u+.25,side,14),'#547783',1.5);line(r,p(u+.25,side,14),p(u+.5,side,5),'#547783',1.5);}
        }
        if(tile===span.tiles[Math.floor(span.tiles.length/2)]){line(r,p(0,-.27,-7),p(0,-.27,5),'#87978e',4);line(r,p(0,.27,-7),p(0,.27,5),'#70827b',4);}
        if(!ready){line(r,p(-.4,-.3,17),p(.4,.3,17),'#d7a551',2);line(r,p(.4,-.3,17),p(-.4,.3,17),'#d7a551',2);}
        c.restore();
      }});
    }
  }
  for (const i of visible) {
    const x = i % W, y = Math.floor(i / W);
    if (!seen[i]) continue;
    const t = city.t[i], b = city.b[i];
    const d = viewDepth(v,x+.5,y+.5);
    if (b) {
      items.push({
        d, f: () => {
          const artR={...r,billboard:fixedArt(b.k)};
          if (b.lvl === 0 || b.burned) c.globalAlpha = 0.5;
          drawBuilding(r, b.k, x, y, Math.max(1, b.lvl), i);
          c.globalAlpha = 1;
          if(b.burned&&b.damageCause==='earthquake'){
            const q=tp(artR,x,y);const [sx,sy]=q(0,0,15);
            c.strokeStyle='#342b24';c.lineWidth=2*v.s;c.beginPath();c.moveTo(sx-8*v.s,sy-12*v.s);c.lineTo(sx+2*v.s,sy-4*v.s);c.lineTo(sx-3*v.s,sy+2*v.s);c.lineTo(sx+9*v.s,sy+10*v.s);c.stroke();
            for(let k=0;k<3;k++)box(artR,x,y,-.36+k*.22,.28,-.23+k*.22,.4,0,3,'#b0a28d','#807565','#6e6253');
          }else if (b.burned) {
            const q = tp(artR, x, y);
            for (let f = 0; f < 3; f++) {
              const h = 12 + 6 * Math.sin(o.anim / 140 + i + f), u = (f - 1) * 0.2;
              poly(c, [q(u - 0.1, 0.18, 3), q(u + 0.1, 0.18, 3), q(u + 0.025, 0.18, h + 8)], "#ed6327");
              poly(c, [q(u - 0.05, 0.19, 3), q(u + 0.05, 0.19, 3), q(u, 0.19, h)], "#ffd66b");
            }
            smoke(artR, x, y, 0, 0, 24, i);
          }
          if (b.stranded && !b.relocation) {
            const [sx,sy]=tp(artR,x,y)(0,0,48);
            c.fillStyle='#a76b33';c.beginPath();c.arc(sx,sy,8*v.s,0,Math.PI*2);c.fill();
            c.fillStyle='#fff2ce';c.font=`bold ${Math.max(10,Math.round(11*v.s))}px sans-serif`;c.textAlign='center';c.textBaseline='middle';c.fillText('!',sx,sy);
          }
          if (b.flooded) {
            const q = tp(artR, x, y);
            poly(c, [q(-0.48, -0.48, 2), q(0.48, -0.48, 2), q(0.48, 0.48, 2), q(-0.48, 0.48, 2)], "rgba(70,150,210,.55)");
            const [wx, wy] = q(0, 0, 40);
            c.fillStyle = "#e85d4a"; c.beginPath(); c.arc(wx, wy, 7 * v.s, 0, Math.PI * 2); c.fill();
            c.fillStyle = "#fff"; c.font = `bold ${Math.round(10 * v.s)}px sans-serif`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("!", wx, wy + 0.5);
          }
          if(B[b.k].demand&&b.lvl>0&&!b.burned&&!b.flooded&&(b.off||(city.modern?.allocation[i]??0)<1)){
            const [px,py]=tp(artR,x,y)(0,0,48);c.fillStyle='#263f45';c.beginPath();c.arc(px,py,7*v.s,0,Math.PI*2);c.fill();c.fillStyle='#ffe18b';c.font=`bold ${Math.max(10,Math.round(12*v.s))}px sans-serif`;c.textAlign='center';c.fillText(b.off?'⏸':'ϟ',px,py+4*v.s);
          }
          if (b.doneAt) {
            const total = b.relocation?.duration ?? (b.k==='ironbridge'&&b.bridge&&!b.bridge.ready?b.bridge.tiles.length*120000:B[b.k].sec * 1000 * 3 ** b.lvl);
            drawScaffold(r, x, y, Math.max(0, Math.min(1, 1 - (b.doneAt - o.now) / total)));
          }
          if (b.lvl >= 2) {
            const [lx, ly] = tp(artR, x, y)(-0.3, 0.3, 4);
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
        d: viewDepth(v,x+.5+tr.u,y+.5+tr.v),
        f: () => {
          if (!tr.stump) { drawTree(r, x, y, tr.u, tr.v, tr.size, tr.pine, o.chopping.has(i) ? Math.sin(o.anim / 45) * 1.6 : 0); return; }
          const [sx, sy] = tp(r, x, y)(tr.u, tr.v);
          c.fillStyle = "#7a5230"; c.beginPath(); c.ellipse(sx, sy - 1.5 * v.s, 3 * v.s, 1.6 * v.s, 0, 0, Math.PI * 2); c.fill();
          c.fillStyle = "#d9b07a"; c.beginPath(); c.ellipse(sx, sy - 2.5 * v.s, 2.4 * v.s, 1.2 * v.s, 0, 0, Math.PI * 2); c.fill();
        },
      });
    } else if (isRock(t)) {
      const worn = used / depositCapacity(t);
      items.push({ d, f: () => drawRock(r, x, y, worn > 0.55) });
    }
  }
  for (const k of city.camps) {
    if (!seen[k.at] || !vis[k.at] || city.b[k.at]) continue;
    items.push({ d: viewDepth(v,k.at%W+.5,Math.floor(k.at/W)+.5), f: () => drawCampSite(r, k) });
    if(!lod && !k.cleared && !city.exps.some(e=>e.camp===k.id && !e.recalled && !e.resolved && o.now>=e.arrive)){
      const defenders=k.garrison??campDefenders(k.power);let n=0;
      for(const u of UKEYS)for(let j=0;j<Math.min(defenders[u]??0,2)&&n<4;j++,n++){
        const fx=k.at%W+.18+n*.18,fy=Math.floor(k.at/W)+.85,seed=k.id+n*.5;
        items.push({d:viewDepth(v,fx,fy),f:()=>drawSoldier(r,u,fx,fy,-1,false,seed,false,true)});
      }
    }
  }
  if (!lod) {
    const embassy=buildings(city).find(([,b])=>b.k==="envoy"&&b.lvl>=1&&!b.burned&&!b.flooded);
    if(embassy){
      const count=Math.min(4,Math.max(0,envoyCount(city)-envoysAway(city)));
      for(let n=0;n<count;n++){const fx=embassy[0]%W+1.1+n*.3,fy=Math.floor(embassy[0]/W)+.8;
        if(onScreen(fx-.5,fy-.5))items.push({d:viewDepth(v,fx,fy),f:()=>{const [sx,sy]=P(r.v,fx,fy);drawEnvoyActor(r.c,city.era,sx,sy,r.v.s,r.anim,false);}});
      }
    }
    for (const tr of city.trips??[]) {
      const actor=envoyVillagePosition(tr,o.now);if(!actor)continue;
      const {x:fx,y:fy}=actor,ti=idx(Math.floor(fx),Math.floor(fy));
      if(!seen[ti]||!onScreen(fx-.5,fy-.5))continue;
      items.push({d:viewDepth(v,fx,fy),f:()=>{const [sx,sy]=P(r.v,fx,fy);drawEnvoyActor(r.c,city.era,sx,sy,r.v.s,r.anim,true,cameraFace(v,actor.face));}});
    }
    for(const tr of city.merchantJourneys??[]){
      const actor=envoyVillagePosition(tr,o.now);if(!actor||(tr.incoming&&!actor.returning))continue;
      const {x:fx,y:fy}=actor,ti=idx(Math.floor(fx),Math.floor(fy));if(!seen[ti]||!onScreen(fx-.5,fy-.5))continue;
      items.push({d:viewDepth(v,fx,fy),f:()=>{if(tr.raider)drawSoldier(r,"spear",fx,fy,actor.face,true,.3);else{const [sx,sy]=P(r.v,fx,fy);drawCaravanActor(r.c,sx,sy,r.v.s*.7,r.anim,true,cameraFace(v,actor.face));}}});
    }
    if (troopCount(city.army)) {
      let staging=stagingCache.get(city);
      if(!staging || staging.at!==city.last){staging={at:city.last,tiles:armyStagingTiles(city)};stagingCache.set(city,staging);}
      const futureSoldiers=(v.rotation??0)&&city.homeOrders?new Map(homeSoldiers(city,o.now+50,staging.tiles).map(s=>[s.id,s])):null;
      for (const [n, soldier] of homeSoldiers(city,o.now,staging.tiles).entries()) {
        const {x:fx,y:fy}=soldier;
        const next=futureSoldiers?.get(soldier.id),heading:Pt|undefined=next?[next.x-fx,next.y-fy]:undefined;
        if (!onScreen(fx-.5,fy-.5)) continue;
        items.push({d:viewDepth(v,fx,fy),f:()=>{
          if(o.pickedSoldier===soldier.id||o.pickedSoldiers?.has(soldier.id)){const [sx,sy]=P(v,fx,fy,deckHeight(r,fx,fy));c.strokeStyle="#f0c766";c.lineWidth=2;c.beginPath();c.ellipse(sx,sy,10*v.s,5*v.s,0,0,Math.PI*2);c.stroke();}
          if(inWater(r,fx,fy)){const [sx,sy]=P(v,fx,fy);drawTransportBoat(c,sx,sy,v.s*.65,r.anim,cameraFace(v,soldier.face),1);}else drawSoldier(r,soldier.u,fx,fy,soldier.face,soldier.moving,n*.37,false,false,heading);
        }});
      }
    }
    for(const ferry of returningFerries(city,o.now))if(inWater(r,ferry.x,ferry.y,true)&&seen[idx(Math.floor(ferry.x),Math.floor(ferry.y))]&&onScreen(ferry.x-.5,ferry.y-.5))items.push({d:viewDepth(v,ferry.x,ferry.y),f:()=>{const [sx,sy]=P(v,ferry.x,ferry.y);drawTransportBoat(c,sx,sy,v.s*.65,r.anim,cameraFace(v,ferry.face));}});
    const beast=wildlifePosition(city,o.now);
    if(beast){const [fx,fy]=beast,ti=idx(Math.floor(fx),Math.floor(fy));if(seen[ti]&&onScreen(fx-.5,fy-.5))items.push({d:viewDepth(v,fx,fy),f:()=>drawAnimal(r,"boar",fx,fy,1,false,false,.73)});}
    // Barbarians appear only after the warning, on a persisted land route.
    for(const actor of raidActors(city,o.now)){
      const {x:fx,y:fy}=actor,ti=idx(Math.max(0,Math.min(W-1,Math.floor(fx))),Math.max(0,Math.min(H-1,Math.floor(fy))));
      if(!vis[ti]||!seen[ti]||!onScreen(fx-.5,fy-.5))continue;
      items.push({d:viewDepth(v,fx,fy),f:()=>drawSoldier(r,"club",fx,fy,actor.face,actor.moving,actor.seed,actor.fighting,true)});
    }
    // marching expeditions
    for (const e of city.exps) {
      const camp = campById(city, e.camp);
      if (!camp) continue;
      const hx = (city.camp % W) + 0.5, hy = Math.floor(city.camp / W) + 0.5, tx = (camp.at % W) + 0.5, ty = Math.floor(camp.at / W) + 0.5;
      const going = o.now < e.arrive, fighting = !e.recalled && (e.combatVersion ? !e.resolved && o.now>=e.arrive : e.resolved && o.now>=e.arrive && o.now-e.arrive<3000);
      const p = going ? (o.now - e.depart) / Math.max(1, e.arrive - e.depart) : 1 - (o.now - e.arrive) / Math.max(1, e.back - e.arrive);
      const pc = Math.max(0, Math.min(1, p));
      const cx = hx + (tx - hx) * pc, cy = hy + (ty - hy) * pc;
      const len = Math.hypot(tx - hx, ty - hy) || 1, nx = -(ty - hy) / len, ny = (tx - hx) / len;
      const face: 1 | -1 = ((going ? 1 : -1) * ((tx - hx) - (ty - hy))) >= 0 ? 1 : -1;
      let n = 0;
      for (const u of UKEYS) for (let k = 0; k < Math.min(e.units[u] ?? 0, 6) && n < 18; k++, n++) {
        const row = Math.floor(n / 3), col = (n % 3) - 1;
        const back = (going ? -1 : 1) * row * 0.35;
        const routed=expeditionPosition(e,o.now,row*.35),nextRouted=(v.rotation??0)?expeditionPosition(e,o.now+50,row*.35):null;
        const fx = fighting && e.combatVersion ? tx-.3+(n%2)*.12 : routed ? Math.max(Math.floor(routed.x)+.08,Math.min(Math.floor(routed.x)+.92,routed.x+col*.12)) : cx + ((tx - hx) / len) * back + nx * col * 0.35;
        const fy = fighting && e.combatVersion ? ty-.22+Math.floor(n/2)*.06 : routed ? routed.y : cy + ((ty - hy) / len) * back + ny * col * 0.35;
        const ti = idx(Math.max(0, Math.min(W - 1, Math.floor(fx))), Math.max(0, Math.min(H - 1, Math.floor(fy))));
        if (!vis[ti]) continue;
        if(e.ships && inWater(r,fx,fy) && n>=e.ships)continue;
        const nn = n;
        items.push({ d: viewDepth(v,fx,fy), f: () => {
          const fn = () => drawSoldier(r, u, fx, fy, (fighting&&e.combatVersion?1:routed?.face??face), !fighting, nn * 0.41, fighting,false,nextRouted&&routed?[nextRouted.x-routed.x,nextRouted.y-routed.y]:undefined);
          if (inWater(r, fx, fy) && e.ships){const [sx,sy]=P(v,fx,fy);drawTransportBoat(c,sx,sy,v.s*.7,r.anim,routed?.face??face,1);}else fn();
        } });
      }
      if (fighting && e.combat) {
        let defender=0;
        for(const u of UKEYS)for(let k=0;k<Math.min(e.combat.defenders[u]??0,6)&&defender<12;k++,defender++){
          const dx=tx+.18+(defender%2)*.12,dy=ty-.12+Math.floor(defender/2)*.06,seed=defender*.61;
          if(vis[camp.at])items.push({d:viewDepth(v,dx,dy),f:()=>drawSoldier(r,u,dx,dy,-1,false,seed,true,true)});
        }
        if(vis[camp.at])items.push({d:viewDepth(v,tx,ty)+2,f:()=>{
          const [sx,sy]=P(r.v,tx,ty),scale=r.v.s;
          r.c.font=`bold ${Math.max(10,11*scale)}px sans-serif`;r.c.textAlign="center";
          r.c.fillStyle="#ffe2b0";r.c.fillText(`⚔ ${troopCount(e.units)} / ${troopCount(e.combat!.defenders)}`,sx,sy-40*scale);
          // Ranged projectiles travel between the two engaged lines.
          for(const [units,from,to] of [[e.units,tx-.25,tx+.25],[e.combat!.defenders,tx+.25,tx-.25]] as const){
            for(const u of ["bow","sling"] as const){if(!units[u])continue;
              const p=((o.now-e.arrive)%1000)/1000,[ax,ay]=P(r.v,from+(to-from)*p,ty-.05);
              r.c.strokeStyle="#e9d2a0";r.c.lineWidth=Math.max(1,scale);
              if(u==="bow"){r.c.beginPath();r.c.moveTo(ax-4*scale,ay-12*scale);r.c.lineTo(ax+4*scale,ay-12*scale);r.c.stroke();}
              else{r.c.fillStyle="#d6d2c2";r.c.beginPath();r.c.arc(ax,ay-12*scale-Math.sin(p*Math.PI)*8*scale,Math.max(1.5,2*scale),0,Math.PI*2);r.c.fill();}
            }
          }
        }});
      }
      if (troopCount(e.units) === 0 && going) continue;
    }
    for (const h of city.herds) {
      if (!seen[h.at] || !vis[h.at]) continue;
      const future=(v.rotation??0)?herdAnimals(city,h,(o.anim||1)+40):null;
      herdAnimals(city, h, o.anim || 1).forEach((a, k) => {
        items.push({ d: viewDepth(v,a.fx,a.fy), f: () => drawAnimal(r, h.kind, a.fx, a.fy, a.face, a.graze, h.kind === "deer" && k === 0, hr(city.seed, h.id * 7 + k),future?.[k]?[future[k].fx-a.fx,future[k].fy-a.fy]:undefined) });
      });
    }
    for (const vl of o.villagers) {
      if (!vl.visible) continue;
      const ti = idx(Math.max(0, Math.min(W - 1, Math.floor(vl.fx))), Math.max(0, Math.min(H - 1, Math.floor(vl.fy))));
      if (!vis[ti]) continue;
      const isPicked = vl.id !== null && o.picked.has(vl.id);
      items.push({
        d: viewDepth(v,vl.fx,vl.fy),
        f: () => {
          if (isPicked) {
            const [sx, sy] = P(v, vl.fx, vl.fy,deckHeight(r,vl.fx,vl.fy)), s2 = Math.max(v.s * 1.45, 0.7);
            c.strokeStyle = "#7fe0ff"; c.lineWidth = 2; c.beginPath(); c.ellipse(sx, sy, 6 * s2, 3 * s2, 0, 0, Math.PI * 2); c.stroke();
          }
          drawVillager(r, vl);
          if (isPicked) {
            const [sx, sy] = P(v, vl.fx, vl.fy,deckHeight(r,vl.fx,vl.fy)), s2 = Math.max(v.s * 1.45, 0.7);
            c.font = `600 ${Math.max(11, Math.round(8 * s2))}px system-ui, sans-serif`; c.textAlign = "center"; c.textBaseline = "bottom";
            const label=vl.name+(villagersHungry(city)?" · Đói":"");
            const w = c.measureText(label).width + 8;
            c.fillStyle = "rgba(15,25,22,.8)"; c.fillRect(sx - w / 2, sy - 30 * s2 - 14, w, 15);
            c.fillStyle = "#e9fbff"; c.fillText(label, sx, sy - 30 * s2);
          }
        },
      });
    }
  }
  if (o.hover && o.tool && !city.b[idx(o.hover.x, o.hover.y)]) {
    const { x, y } = o.hover, tool = o.tool;
    items.push({ d: viewDepth(v,x+.5,y+.5)+.01, f: () => { c.globalAlpha = ghostOk ? 0.75 : 0.4; drawBuilding(r, tool, x, y, 1, idx(x, y)); c.globalAlpha = 1; } });
  }
  items.sort((a, b) => a.d - b.d);
  for (const it of items) it.f();

  // Hunger overlays use existing actor positions; a single speaker avoids a wall of bubbles.
  if(!lod&&villagersHungry(city)){
    const hungry=o.villagers.filter(vl=>vl.id!==null&&vl.visible&&(()=>{const [x,y]=P(v,vl.fx,vl.fy);return x>=0&&x<=v.width&&y>=30&&y<=v.height;})());
    c.save();c.font='bold 11px system-ui, sans-serif';c.textAlign='center';c.textBaseline='middle';
    for(const vl of hungry){if(o.picked.has(vl.id!))continue;const [x,y]=P(v,vl.fx,vl.fy),dy=30*Math.max(v.s*1.45,.7);c.fillStyle='#6e2d20';c.fillRect(x-14,y-dy-14,28,14);c.fillStyle='#ffe6af';c.fillText('Đói',x,y-dy-7);}
    const speakers=hungry.filter(vl=>!vl.fleeing);
    const speaker=speakers.find(vl=>o.picked.has(vl.id!))??speakers[Math.floor(o.now/12000)%Math.max(1,speakers.length)];
    if(speaker&&(o.picked.has(speaker.id!)||o.now%12000<7000)){
      const mood=hungerSpeech(city.era,speaker.id!),[sx,sy]=P(v,speaker.fx,speaker.fy);
      c.font='12px system-ui, sans-serif';const width=Math.min(v.width-12,Math.max(c.measureText(mood.complaint).width,c.measureText(mood.cry).width)+20),height=44;
      const left=Math.max(6,Math.min(v.width-width-6,sx-width/2)),top=Math.max(6,sy-30*Math.max(v.s*1.45,.7)-height-22);
      c.fillStyle='#fff0cc';c.fillRect(left,top,width,height);c.strokeStyle='#a65b37';c.lineWidth=1;c.strokeRect(left,top,width,height);
      c.fillStyle='#73341e';c.font='bold 12px system-ui, sans-serif';c.fillText(mood.cry,left+width/2,top+12);c.font='12px system-ui, sans-serif';c.fillText(mood.complaint,left+width/2,top+30,width-12);
    }
    c.restore();
  }

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
  const r: RC = { c, v, city, D, anim, now: 0, season, deck:new Set() };
  const q = tp(r, 0, 0);
  poly(c, [q(-0.5, -0.5), q(0.5, -0.5), q(0.5, 0.5), q(-0.5, 0.5)], k === "quarry" ? "#a39272" : "#7fae4c");
  poly(c, [q(0.5, -0.5), q(0.5, 0.5), q(0.5, 0.5, -5), q(0.5, -0.5, -5)], "#6b4a2b");
  poly(c, [q(-0.5, 0.5), q(0.5, 0.5), q(0.5, 0.5, -5), q(-0.5, 0.5, -5)], "#87613a");
  drawBuilding(r, k, 0, 0, lvl, -1);
}
