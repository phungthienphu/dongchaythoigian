"use client";

// World map: every nation is a fortress on a WORLD × WORLD board. Envoys travel between them.
import { useEffect, useRef, useState } from "react";
import { ENVOY_NAMES, ERA_NAMES, WORLD, canVisit, envoyCount, envoyMs, envoysAway, UKEYS, UNITS, troopCount, type Troops, type City } from "@/lib/engine";
import type { WarSummary } from "./useWars";
import type { Nation } from "@/lib/world";

type Props = {
  wars: WarSummary[];
  warEnabled: boolean;
  onAttack: (id: string, troops: Troops) => void;
  nations: Nation[];
  city: City;
  now: () => number;
  busy: boolean;
  onEnvoy: (id: string) => void;
  onVisit: (id: string) => void;
  onClose: () => void;
};

const fmtMin = (ms: number) => {
  const m = Math.max(1, Math.round(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)} giờ ${m % 60} phút` : `${m} phút`;
};
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.round(Math.hypot(a.x - b.x, a.y - b.y));

function hash(n: number) {
  let h = Math.imul(n | 0, 2654435761);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export default function WorldMap({ wars, warEnabled, onAttack, nations, city, now, busy, onEnvoy, onVisit, onClose }: Props) {
  const cv = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const me = nations.find((n) => n.me);
  const cam = useRef({ x: me?.x ?? WORLD / 2, y: me?.y ?? WORLD / 2, z: 7 }); // z = pixels per cell
  const [sel, setSel] = useState<Nation | null>(null);
  const [army, setArmy] = useState<Troops>({});
  useEffect(() => { setArmy({}); }, [sel?.id]);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const state = useRef({ nations, city, now, wars });
  state.current = { nations, city, now, wars };

  useEffect(() => {
    const c = cv.current, w = wrap.current;
    if (!c || !w) return;
    const ctx = c.getContext("2d")!;
    let raf = 0, dpr = 1;
    const resize = () => { dpr = Math.min(2, devicePixelRatio || 1); c.width = w.clientWidth * dpr; c.height = w.clientHeight * dpr; };
    const ro = new ResizeObserver(resize); ro.observe(w); resize();
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = c.getBoundingClientRect(), k = cam.current;
      const wx = k.x + (e.clientX - r.left - r.width / 2) / k.z, wy = k.y + (e.clientY - r.top - r.height / 2) / k.z;
      k.z = Math.max(2.5, Math.min(40, k.z * Math.exp(-e.deltaY * 0.0018)));
      k.x = wx - (e.clientX - r.left - r.width / 2) / k.z; k.y = wy - (e.clientY - r.top - r.height / 2) / k.z;
    };
    c.addEventListener("wheel", onWheel, { passive: false });
    const draw = (t: number) => {
      const W = c.width / dpr, H = c.height / dpr, k = cam.current, { nations: ns, city: my, now } = state.current;
      const S = (x: number, y: number) => [W / 2 + (x - k.x) * k.z, H / 2 + (y - k.y) * k.z] as const;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // sea and land
      ctx.fillStyle = "#1d3b4a"; ctx.fillRect(0, 0, W, H);
      const [x0, y0] = S(0, 0), [x1, y1] = S(WORLD, WORLD);
      ctx.fillStyle = "#5f7d48"; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      // terrain texture: forests and hills, coarse cells
      const cell = 8;
      for (let gy = 0; gy < WORLD; gy += cell) for (let gx = 0; gx < WORLD; gx += cell) {
        const [sx, sy] = S(gx, gy);
        if (sx > W || sy > H || sx + cell * k.z < 0 || sy + cell * k.z < 0) continue;
        const h = hash(gx * 977 + gy * 131);
        if (h < 0.3) { ctx.fillStyle = "rgba(40,80,40,.55)"; ctx.fillRect(sx, sy, cell * k.z, cell * k.z); }
        else if (h > 0.88) { ctx.fillStyle = "rgba(150,135,105,.45)"; ctx.fillRect(sx, sy, cell * k.z, cell * k.z); }
      }
      // grid
      ctx.strokeStyle = "rgba(255,255,255,.06)"; ctx.lineWidth = 1; ctx.beginPath();
      for (let g = 0; g <= WORLD; g += 10) { const [a] = S(g, 0); ctx.moveTo(a, y0); ctx.lineTo(a, y1); const [, b] = S(0, g); ctx.moveTo(x0, b); ctx.lineTo(x1, b); }
      ctx.stroke();
      const mine = ns.find((n) => n.me);
      // envoy routes
      for (const tr of my.trips ?? []) {
        const to = ns.find((n) => n.id === tr.target);
        if (!mine || !to) continue;
        const [ax, ay] = S(mine.x, mine.y), [bx, by] = S(to.x, to.y);
        ctx.setLineDash([6, 5]); ctx.strokeStyle = "rgba(127,224,255,.8)"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.setLineDash([]);
        const tn = now(), going = tn < tr.arrive;
        const p = going ? (tn - tr.depart) / (tr.arrive - tr.depart) : 1 - (tn - tr.arrive) / (tr.back - tr.arrive);
        const q = Math.max(0, Math.min(1, p)), ex = ax + (bx - ax) * q, ey = ay + (by - ay) * q;
        ctx.fillStyle = "#7fe0ff"; ctx.beginPath(); ctx.arc(ex, ey, 5 + Math.sin(t / 200) * 1, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#0b2a33"; ctx.font = "600 11px system-ui, sans-serif"; ctx.textAlign = "center";
        ctx.fillText(going ? "→" : "←", ex, ey + 4);
      }
      // Outgoing and incoming armies follow authoritative departure/return times.
      for (const march of state.current.wars) {
        if (!["marching", "returning", "fighting"].includes(march.status)) continue;
        const [ax, ay] = S(march.from.x, march.from.y), [bx, by] = S(march.to.x, march.to.y);
        ctx.strokeStyle = march.side === "attacker" ? "#f0c766" : "#ff8575"; ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.setLineDash([]);
        const tn = now();
        const progress = march.status === "marching" ? (tn - march.depart) / Math.max(1, march.arrive - march.depart)
          : march.status === "returning" ? 1 - (tn - (march.endedAt ?? (march.back! - march.duration))) / march.duration : 1;
        const p = Math.max(0, Math.min(1, progress));
        ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(ax + (bx - ax) * p, ay + (by - ay) * p, 7, 0, Math.PI * 2); ctx.fill();
      }
      // nations
      for (const n of ns) {
        const [sx, sy] = S(n.x, n.y);
        if (sx < -60 || sy < -60 || sx > W + 60 || sy > H + 60) continue;
        const r = Math.max(7, Math.min(18, k.z * 1.4));
        ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(sx, sy + r * 0.7, r, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
        // keep shape by era: hut, wooden hall, stone keep
        const body = n.era === 1 ? "#c79a63" : n.era === 2 ? "#a8743e" : "#c9c2b2";
        const roof = n.era === 1 ? "#e2bd5e" : n.era === 2 ? "#b0543a" : "#4f5a66";
        ctx.fillStyle = body; ctx.fillRect(sx - r * 0.7, sy - r * 0.6, r * 1.4, r * 1.1);
        ctx.fillStyle = roof; ctx.beginPath(); ctx.moveTo(sx - r, sy - r * 0.55); ctx.lineTo(sx, sy - r * 1.5); ctx.lineTo(sx + r, sy - r * 0.55); ctx.fill();
        if (n.era >= 3) { ctx.fillStyle = body; ctx.fillRect(sx - r * 0.95, sy - r * 1.1, r * 0.4, r * 1.6); ctx.fillRect(sx + r * 0.55, sy - r * 1.1, r * 0.4, r * 1.6); }
        if (n.me || n.friend) {
          ctx.strokeStyle = n.me ? "#f0c766" : "#7fe0ff"; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(sx, sy - r * 0.3, r * 1.7, 0, Math.PI * 2); ctx.stroke();
        }
        if (canVisit(my, n.id, now())) { ctx.fillStyle = "#9bcb74"; ctx.beginPath(); ctx.arc(sx + r * 1.2, sy - r * 1.4, 4, 0, Math.PI * 2); ctx.fill(); }
        if (k.z > 4 || n.me || n.friend) {
          ctx.font = `${n.me ? 700 : 600} 12px system-ui, sans-serif`; ctx.textAlign = "center";
          const label = (n.friend ? "★ " : "") + n.name;
          const w = ctx.measureText(label).width + 10;
          ctx.fillStyle = "rgba(12,20,18,.78)"; ctx.fillRect(sx - w / 2, sy + r * 0.75, w, 17);
          ctx.fillStyle = n.me ? "#f0c766" : n.friend ? "#bdefff" : "#ebe5d2"; ctx.fillText(label, sx, sy + r * 0.75 + 12.5);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); c.removeEventListener("wheel", onWheel); };
  }, []);

  const pick = (e: React.MouseEvent) => {
    const r = cv.current!.getBoundingClientRect(), k = cam.current;
    const wx = k.x + (e.clientX - r.left - r.width / 2) / k.z, wy = k.y + (e.clientY - r.top - r.height / 2) / k.z;
    let best: Nation | null = null, bd = Math.max(2.5, 18 / k.z);
    for (const n of nations) { const d = Math.hypot(n.x - wx, n.y - wy + 0.3); if (d < bd) { bd = d; best = n; } }
    setSel(best);
  };

  const t = now();
  const myEnvoys = envoyCount(city), away = envoysAway(city), en = ENVOY_NAMES[city.era];
  const d = sel && me ? dist(me, sel) : 0;
  const trip = sel ? (city.trips ?? []).find((x) => x.target === sel.id) : undefined;

  return (
    <div className="worldmap">
      <div className="wm-canvas" ref={wrap}>
        <canvas
          ref={cv}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, moved: false }; }}
          onPointerMove={(e) => {
            const dg = drag.current;
            if (!dg || !(e.buttons & 1)) return;
            const dx = e.clientX - dg.x, dy = e.clientY - dg.y;
            if (!dg.moved && Math.hypot(dx, dy) < 5) return;
            dg.moved = true; cam.current.x -= dx / cam.current.z; cam.current.y -= dy / cam.current.z; dg.x = e.clientX; dg.y = e.clientY;
          }}
          onClick={(e) => { if (drag.current?.moved) { drag.current = null; return; } drag.current = null; pick(e); }}
          aria-label="Bản đồ thế giới. Lăn chuột để phóng to, kéo để di chuyển, bấm vào một nước để xem."
        />
      </div>
      <header className="wm-top">
        <h2>Bản đồ thế giới</h2>
        <span className="muted small">{nations.length} nước · {en}: {myEnvoys ? `${myEnvoys - away}/${myEnvoys} ở nhà` : "chưa có"} · chấm xanh lá: đang được phép thăm</span>
        <button onClick={onClose}>Về làng</button>
      </header>
      {sel && (
        <div className="hud-card wm-card">
          <button className="x" onClick={() => setSel(null)} aria-label="Đóng">×</button>
          <h2>{sel.friend ? "★ " : ""}{sel.name}</h2>
          <p className="small">{sel.ownerName ? `Của ${sel.ownerName} · ` : ""}{ERA_NAMES[sel.era]} · {sel.pop} dân · {sel.score.toLocaleString("vi-VN")} điểm</p>
          {sel.me ? <p className="muted small">Đây là nước của bạn.</p> : (
            <>
              <p className="muted small">Cách {d} dặm · {en} đi {myEnvoys ? fmtMin(envoyMs(city, d)) : "?"} mỗi chiều.</p>
              {canVisit(city, sel.id, t) && <p className="ok small">Được phép thăm và xuất quân tới đây thêm {fmtMin((city.visits?.[sel.id] ?? t) - t)}.</p>}
              {trip && <p className="small">{en} {t < trip.arrive ? `đang tới, còn ${fmtMin(trip.arrive - t)}` : `đang về, còn ${fmtMin(trip.back - t)}`}.</p>}
              <div className="actions">
                {canVisit(city, sel.id, t) && <button className="primary" onClick={() => onVisit(sel.id)}>Xem làng của họ</button>}
                <button disabled={busy || !myEnvoys || away >= myEnvoys || !!trip} onClick={() => onEnvoy(sel.id)}>
                  {!myEnvoys ? "Cần xây nhà sứ giả" : trip ? `${en} đang đi` : away >= myEnvoys ? `Hết ${en.toLowerCase()} ở nhà` : `Cử ${en.toLowerCase()} tới đây`}
                </button>
              </div>
              {canVisit(city, sel.id, t) && (
                <div className="world-army">
                  <h3>Xuất quân</h3>
                  {wars.some((w) => w.status !== "completed" && w.status !== "cancelled") && <p className="muted small">Hoàn tất đoàn quân hoặc trận hiện tại trước khi xuất quân tiếp.</p>}
                  {sel.registered === false && <p className="muted small">Nước này cần đăng nhập Google để tham gia trận đánh.</p>}
                  {!warEnabled && <p className="muted small">Máy chủ trận đánh chưa được kết nối.</p>}
                  {(sel.shieldUntil ?? 0) > t && <p className="small">Đang có khiên bảo vệ: {fmtMin(sel.shieldUntil! - t)}.</p>}
                  {city.era - sel.era > 1 && <p className="small">Không đánh nước kém mình quá một thời đại.</p>}
                  {UKEYS.filter((u) => (city.army[u] ?? 0) > 0).map((u) => (
                    <label key={u} className="army-input">{UNITS[u].n} ({city.army[u]} ở nhà)
                      <input type="number" min={0} max={city.army[u] ?? 0} value={army[u] ?? 0} onChange={(e) => setArmy((a) => ({ ...a, [u]: Math.max(0, Math.min(city.army[u] ?? 0, Math.floor(Number(e.target.value) || 0))) }))} />
                    </label>
                  ))}
                  <button disabled={busy || !warEnabled || sel.registered === false || !troopCount(army) || city.era - sel.era > 1 || (sel.shieldUntil ?? 0) > t || wars.some((w) => w.status !== "completed" && w.status !== "cancelled")} onClick={() => onAttack(sel.id, army)}>Xuất {troopCount(army)} lính</button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
