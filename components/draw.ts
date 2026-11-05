import { B, F, H, HL, N4, O, R, W, G, canPlace, idx, inb, riverSet, seasonAt, type BKey, type City, type Derived } from "@/lib/engine";

type Ctx = CanvasRenderingContext2D;

function hr(seed: number, n: number) {
  let h = Math.imul((n + 1) | 0, 2654435761) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function drawBuilding(c: Ctx, city: City, D: Derived, k: BKey, px: number, py: number, s: number, now: number, i: number) {
  const mx = px + s / 2, my = py + s / 2;
  const tri = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => {
    c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.lineTo(cx, cy); c.closePath(); c.fill();
  };
  const circ = (x: number, y: number, r: number) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); };
  c.fillStyle = "rgba(0,0,0,.25)"; c.beginPath(); c.ellipse(mx, py + s * 0.86, s * 0.36, s * 0.09, 0, 0, Math.PI * 2); c.fill();
  switch (k) {
    case "hut":
      c.fillStyle = "#8a5a31"; tri(mx, py + s * 0.14, px + s * 0.14, py + s * 0.86, px + s * 0.86, py + s * 0.86);
      c.fillStyle = "#a9733f"; tri(mx, py + s * 0.14, mx, py + s * 0.86, px + s * 0.86, py + s * 0.86);
      c.fillStyle = "#2a1a0e"; tri(mx, py + s * 0.52, mx - s * 0.1, py + s * 0.86, mx + s * 0.1, py + s * 0.86); break;
    case "gather":
      c.fillStyle = "#b4884b"; c.beginPath(); c.ellipse(mx, py + s * 0.64, s * 0.3, s * 0.18, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#8e6633"; c.fillRect(px + s * 0.2, py + s * 0.6, s * 0.6, s * 0.05);
      c.fillStyle = "#c6384a"; circ(mx - s * 0.12, py + s * 0.48, s * 0.08); circ(mx + s * 0.06, py + s * 0.44, s * 0.08); circ(mx + s * 0.16, py + s * 0.52, s * 0.07); break;
    case "wood":
      for (const [ox, oy] of [[-0.15, 0.12], [0.15, 0.12], [0, -0.12]]) {
        c.fillStyle = "#7b4e25"; circ(mx + ox * s, my + oy * s + s * 0.05, s * 0.15);
        c.fillStyle = "#d3a067"; circ(mx + ox * s, my + oy * s + s * 0.05, s * 0.08);
      } break;
    case "quarry":
      c.fillStyle = "#c9c2b2"; c.fillRect(px + s * 0.16, py + s * 0.5, s * 0.32, s * 0.3);
      c.fillStyle = "#a49d8e"; c.fillRect(px + s * 0.5, py + s * 0.42, s * 0.34, s * 0.38);
      c.fillStyle = "#ddd7c8"; c.fillRect(px + s * 0.3, py + s * 0.24, s * 0.3, s * 0.24); break;
    case "storehouse":
      c.fillStyle = "#8d6a43"; c.fillRect(px + s * 0.14, py + s * 0.42, s * 0.72, s * 0.42);
      c.fillStyle = "#6b4c2c"; c.fillRect(px + s * 0.1, py + s * 0.3, s * 0.8, s * 0.14);
      c.fillStyle = "#c9a26a"; c.fillRect(px + s * 0.22, py + s * 0.52, s * 0.18, s * 0.18); c.fillRect(px + s * 0.6, py + s * 0.52, s * 0.18, s * 0.18); break;
    case "fire": {
      const f = 1 + 0.14 * Math.sin(now / 110 + i);
      c.fillStyle = "#7d7466"; for (let a = 0; a < 6; a++) circ(mx + Math.cos(a) * s * 0.26, py + s * 0.7 + Math.sin(a) * s * 0.08, s * 0.07);
      c.fillStyle = "#ef8d2c"; tri(mx, py + s * (0.68 - 0.46 * f), mx - s * 0.17, py + s * 0.72, mx + s * 0.17, py + s * 0.72);
      c.fillStyle = "#ffd36a"; tri(mx, py + s * (0.68 - 0.26 * f), mx - s * 0.08, py + s * 0.72, mx + s * 0.08, py + s * 0.72); break;
    }
    case "farm":
      c.fillStyle = "#5e7d2d"; c.fillRect(px + s * 0.1, py + s * 0.12, s * 0.8, s * 0.76);
      c.fillStyle = "#d4b44e"; for (let r = 0; r < 4; r++) c.fillRect(px + s * 0.14, py + s * (0.17 + r * 0.18), s * 0.72, s * 0.09); break;
    case "canal": {
      c.fillStyle = D.wet[i] ? "#4b8db6" : "#7c6a4c";
      const w = s * 0.32, x = i % W, y = (i / W) | 0;
      c.fillRect(mx - w / 2, my - w / 2, w, w);
      for (const [dx, dy] of N4) {
        if (!inb(x + dx, y + dy)) continue;
        const j = idx(x + dx, y + dy);
        if (city.t[j] === R || city.b[j]?.k === "canal") {
          if (dx) c.fillRect(dx > 0 ? mx : px, my - w / 2, s / 2, w);
          else c.fillRect(mx - w / 2, dy > 0 ? my : py, w, s / 2);
        }
      } break;
    }
    case "levee":
      c.fillStyle = "#7d6240"; c.beginPath(); c.ellipse(mx, my + s * 0.06, s * 0.44, s * 0.2, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#9c7d50"; c.beginPath(); c.ellipse(mx, my, s * 0.38, s * 0.1, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#6f8f45"; c.fillRect(mx - s * 0.3, my - s * 0.04, s * 0.6, s * 0.03); break;
    case "house":
      c.fillStyle = "#a6743f"; c.fillRect(px + s * 0.2, py + s * 0.45, s * 0.6, s * 0.4);
      c.fillStyle = "#5c361f"; tri(mx, py + s * 0.12, px + s * 0.1, py + s * 0.48, px + s * 0.9, py + s * 0.48);
      c.fillStyle = "#2c1a0d"; c.fillRect(mx - s * 0.07, py + s * 0.62, s * 0.14, s * 0.23); break;
    case "smelter": {
      const gl = 0.55 + 0.3 * Math.sin(now / 180 + i);
      c.fillStyle = "#5a4a40"; c.beginPath(); c.arc(mx, py + s * 0.8, s * 0.32, Math.PI, 0); c.fill();
      c.fillStyle = "#4a3d35"; c.fillRect(mx + s * 0.08, py + s * 0.18, s * 0.1, s * 0.32);
      c.fillStyle = `rgba(255,140,40,${gl})`; c.beginPath(); c.arc(mx, py + s * 0.8, s * 0.13, Math.PI, 0); c.fill(); break;
    }
    case "market":
      c.fillStyle = "#7b5634"; c.fillRect(px + s * 0.2, py + s * 0.5, s * 0.6, s * 0.32);
      for (let k2 = 0; k2 < 4; k2++) { c.fillStyle = k2 % 2 ? "#efe2c4" : "#c4553d"; c.fillRect(px + s * (0.14 + k2 * 0.18), py + s * 0.3, s * 0.18, s * 0.2); }
      c.fillStyle = "#e1a43a"; circ(mx - s * 0.12, py + s * 0.62, s * 0.06); c.fillStyle = "#7fae47"; circ(mx + s * 0.1, py + s * 0.62, s * 0.06); break;
    case "stonehouse":
      c.fillStyle = "#c3bcab"; c.fillRect(px + s * 0.16, py + s * 0.4, s * 0.68, s * 0.46);
      c.fillStyle = "#6c675c"; c.fillRect(px + s * 0.1, py + s * 0.26, s * 0.8, s * 0.16);
      c.fillStyle = "#3b3833"; c.fillRect(mx - s * 0.08, py + s * 0.6, s * 0.16, s * 0.26); break;
    case "forge": {
      c.fillStyle = "#3c3936"; c.fillRect(px + s * 0.2, py + s * 0.42, s * 0.6, s * 0.14); c.fillRect(mx - s * 0.1, py + s * 0.56, s * 0.2, s * 0.18); c.fillRect(px + s * 0.26, py + s * 0.74, s * 0.48, s * 0.08);
      c.fillStyle = "#ffcf5a"; const p = (now / 300 + i) % 1; circ(mx + s * 0.2 * p, py + s * 0.38 - s * 0.2 * p, s * 0.035); break;
    }
    case "wheel": {
      const a0 = now / 900; c.strokeStyle = "#7a5230"; c.lineWidth = Math.max(1.5, s * 0.06);
      c.beginPath(); c.arc(mx, my, s * 0.32, 0, Math.PI * 2); c.stroke();
      for (let k2 = 0; k2 < 4; k2++) {
        const a = a0 + (k2 * Math.PI) / 4;
        c.beginPath(); c.moveTo(mx - Math.cos(a) * s * 0.32, my - Math.sin(a) * s * 0.32); c.lineTo(mx + Math.cos(a) * s * 0.32, my + Math.sin(a) * s * 0.32); c.stroke();
      }
      c.fillStyle = "#5a3a1f"; circ(mx, my, s * 0.07); break;
    }
    case "temple":
      c.fillStyle = "#8e6a24"; c.fillRect(px + s * 0.06, py + s * 0.72, s * 0.88, s * 0.14);
      c.fillStyle = "#b4852c"; c.fillRect(px + s * 0.16, py + s * 0.54, s * 0.68, s * 0.18);
      c.fillStyle = "#d6a03f"; c.fillRect(px + s * 0.28, py + s * 0.36, s * 0.44, s * 0.18);
      c.fillStyle = "#f0c766"; tri(mx, py + s * 0.08, px + s * 0.3, py + s * 0.36, px + s * 0.7, py + s * 0.36); break;
  }
}

export type DrawOpts = {
  ts: number;
  now: number; // game time (server-synced), for timers
  anim: number; // animation clock, 0 when reduced motion
  hover: { x: number; y: number } | null;
  selected: { x: number; y: number } | null;
  tool: BKey | null;
};

export function drawCity(c: Ctx, city: City, D: Derived, o: DrawOpts) {
  const { ts, anim } = o;
  const season = seasonAt(city, o.now);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y), px = x * ts, py = y * ts, tt = city.t[i];
    if (tt === R) {
      c.fillStyle = "#3a76a0"; c.fillRect(px, py, ts, ts);
      c.strokeStyle = "rgba(205,232,250,.35)"; c.lineWidth = 1;
      const ph = (anim / 1400 + hr(city.seed, i)) % 1;
      for (let k = 0; k < 2; k++) {
        const yy = py + ((ph + k * 0.5) % 1) * ts, xx = px + hr(city.seed, i * 3 + k) * ts * 0.5;
        c.beginPath(); c.moveTo(xx, yy); c.lineTo(xx + ts * 0.35, yy); c.stroke();
      }
      continue;
    }
    let base = tt === HL || tt === O ? "#8b7d63" : D.fert[i] ? "#58783b" : "#738c4f";
    if (tt === G && city.oldbed[i]) base = "#5f7a3a";
    c.fillStyle = base; c.fillRect(px, py, ts, ts);
    if (tt === G) {
      c.fillStyle = D.fert[i] ? "rgba(25,45,15,.35)" : "rgba(40,60,25,.22)";
      for (let k = 0; k < 3; k++) c.fillRect(px + hr(city.seed, i * 5 + k) * ts * 0.85, py + hr(city.seed, i * 7 + k) * ts * 0.85, Math.max(1, ts * 0.06), Math.max(1, ts * 0.06));
    }
    if (tt === F) {
      for (let k = 0; k < 3; k++) {
        const ox = 0.25 + hr(city.seed, i * 11 + k) * 0.5, oy = 0.3 + hr(city.seed, i * 13 + k) * 0.45;
        c.fillStyle = "#2f5530"; c.beginPath(); c.arc(px + ox * ts, py + oy * ts, ts * 0.2, 0, Math.PI * 2); c.fill();
        c.fillStyle = "#3f6c38"; c.beginPath(); c.arc(px + ox * ts - ts * 0.05, py + oy * ts - ts * 0.05, ts * 0.11, 0, Math.PI * 2); c.fill();
      }
    }
    if (tt === HL || tt === O) {
      c.fillStyle = "#a99a7c"; c.beginPath(); c.moveTo(px + ts * 0.5, py + ts * 0.18); c.lineTo(px + ts * 0.12, py + ts * 0.82); c.lineTo(px + ts * 0.88, py + ts * 0.82); c.fill();
      c.fillStyle = "#9a8b6e"; c.beginPath(); c.moveTo(px + ts * 0.5, py + ts * 0.18); c.lineTo(px + ts * 0.5, py + ts * 0.82); c.lineTo(px + ts * 0.88, py + ts * 0.82); c.fill();
      if (tt === O) {
        c.fillStyle = "#d0843f";
        for (const [ox, oy, r] of [[0.4, 0.6, 0.07], [0.58, 0.5, 0.06], [0.62, 0.7, 0.07]]) { c.beginPath(); c.arc(px + ts * ox, py + ts * oy, ts * r, 0, Math.PI * 2); c.fill(); }
      }
    }
  }
  if (season === 1 || season === 2) {
    c.fillStyle = "rgba(110,175,225,.22)";
    for (let i = 0; i < W * H; i++) if (D.rd[i] === 1 && !D.prot[i]) c.fillRect((i % W) * ts, ((i / W) | 0) * ts, ts, ts);
  }
  c.strokeStyle = "rgba(0,0,0,.08)"; c.lineWidth = 1; c.beginPath();
  for (let x = 1; x < W; x++) { c.moveTo(x * ts + 0.5, 0); c.lineTo(x * ts + 0.5, H * ts); }
  for (let y = 1; y < H; y++) { c.moveTo(0, y * ts + 0.5); c.lineTo(W * ts, y * ts + 0.5); }
  c.stroke();

  city.b.forEach((b, i) => {
    if (!b) return;
    const px = (i % W) * ts, py = ((i / W) | 0) * ts;
    if (b.lvl === 0) c.globalAlpha = 0.45;
    drawBuilding(c, city, D, b.k, px, py, ts, anim, i);
    c.globalAlpha = 1;
    if (b.flooded) {
      c.fillStyle = "rgba(70,140,200,.55)"; c.fillRect(px, py, ts, ts);
      c.strokeStyle = "#d8eefc"; c.lineWidth = 1.5;
      for (let k = 0; k < 2; k++) {
        const yy = py + ts * (0.4 + k * 0.22);
        c.beginPath(); c.moveTo(px + ts * 0.2, yy);
        c.quadraticCurveTo(px + ts * 0.35, yy - ts * 0.08, px + ts * 0.5, yy);
        c.quadraticCurveTo(px + ts * 0.65, yy + ts * 0.08, px + ts * 0.8, yy); c.stroke();
      }
    }
    for (let l = 0; l < b.lvl && b.lvl > 1; l++) { c.fillStyle = "#f0c766"; c.fillRect(px + 2 + l * Math.max(3, ts * 0.14), py + 2, Math.max(2, ts * 0.1), Math.max(2, ts * 0.1)); }
    if (b.doneAt) {
      const total = B[b.k].sec * 1000 * 3 ** b.lvl;
      const p = Math.max(0, Math.min(1, 1 - (b.doneAt - o.now) / total));
      c.fillStyle = "rgba(0,0,0,.55)"; c.fillRect(px + 2, py + ts - 6, ts - 4, 4);
      c.fillStyle = "#d6a03f"; c.fillRect(px + 2, py + ts - 6, (ts - 4) * p, 4);
    }
  });

  const s = city.shift;
  if (s && s.xs && !s.done) {
    c.setLineDash([4, 3]); c.strokeStyle = "rgba(160,215,255,.95)"; c.lineWidth = 2;
    for (const i of riverSet(s.xs)) if (city.t[i] !== R) c.strokeRect((i % W) * ts + 3, ((i / W) | 0) * ts + 3, ts - 6, ts - 6);
    c.setLineDash([]);
  }
  if (o.selected) {
    c.strokeStyle = "#f0c766"; c.lineWidth = 2;
    c.strokeRect(o.selected.x * ts + 1, o.selected.y * ts + 1, ts - 2, ts - 2);
  }
  if (o.hover) {
    const { x, y } = o.hover, px = x * ts, py = y * ts;
    let col = "rgba(235,229,210,.8)";
    if (o.tool) {
      const bad = canPlace(city, D, o.tool, x, y);
      col = bad ? "#e88468" : "#9bcb74";
      if (!city.b[idx(x, y)]) { c.globalAlpha = 0.55; drawBuilding(c, city, D, o.tool, px, py, ts, anim, idx(x, y)); c.globalAlpha = 1; }
    }
    c.strokeStyle = col; c.lineWidth = 2; c.strokeRect(px + 1, py + 1, ts - 2, ts - 2);
  }
}
