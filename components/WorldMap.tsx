"use client";

// World map: every nation is a fortress on a WORLD × WORLD board. Envoys travel between them.
import {caravanMapPosition} from "@/lib/market-rules";
import type {CaravanView} from "@/lib/market-types";
import {drawCaravanActor,drawRaiderActor} from "./trade-actors";
import {caravanStatus} from "./MarketPanel";
import { envoyWorldRoutes } from "@/lib/envoy-world";
import { worldWarMessage, type WarLoadStatus } from "@/lib/world-service-status";
import FriendSearch, { addFriend } from "./FriendSearch";
import { drawEnvoyActor } from "./draw";
import { useEffect, useRef, useState } from "react";
import { ENVOY_NAMES, ERA_NAMES, WORLD, canVisit, envoyCount, envoyMs, envoysAway, UKEYS, UNITS, troopCount, type Troops, type City } from "@/lib/engine";
import type { WarSummary } from "./useWars";
import { marchSupplies, marchLogistics } from "@/lib/march-supplies";
import { MARCH_TILES_PER_MIN, MIN } from "@/lib/engine";
import type { Nation } from "@/lib/world";

type Props = {
  caravans?: CaravanView[];
  onMarket?:(id?:string)=>void;
  signedIn: boolean;
  onFriendsChanged: () => Promise<void>;
  wars: WarSummary[];
  warEnabled: boolean;
  warStatus?: WarLoadStatus;
  warError?: string | null;
  onRetryWar?: () => void;
  feedback?: {text:string;err?:boolean} | null;
  onAttack: (id: string, troops: Troops) => void;
  nations: Nation[];
  city: City;
  now: () => number;
  busy: boolean;
  onEnvoy: (id?: string) => void;
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

export default function WorldMap({ caravans=[], onMarket, signedIn, onFriendsChanged, wars, warEnabled, warStatus="ready", warError, onRetryWar, feedback, onAttack, nations, city, now, busy, onEnvoy, onVisit, onClose }: Props) {
  const cv = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const me = nations.find((n) => n.me);
  const cam = useRef({ x: me?.x ?? WORLD / 2, y: me?.y ?? WORLD / 2, z: 7 }); // z = pixels per cell
  const [sel, setSel] = useState<Nation | null>(null);
  const [selectedCaravan,setSelectedCaravan]=useState<string|null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [friendBusy, setFriendBusy] = useState(false);
  const [friendNote, setFriendNote] = useState("");
  useEffect(() => { setFriendNote(""); }, [sel?.id]);
  useEffect(() => { setSel(previous => previous ? nations.find(n => n.id === previous.id) ?? null : null); }, [nations]);
  const [army, setArmy] = useState<Troops>({});
  useEffect(() => { setArmy({}); }, [sel?.id]);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const state = useRef({ nations, city, now, wars, caravans });
  state.current = { nations, city, now, wars, caravans };

  useEffect(() => {
    const c = cv.current, w = wrap.current;
    if (!c || !w) return;
    const ctx = c.getContext("2d")!;
    let raf = 0, dpr = 1, fitted = false;
    const resize = () => { dpr = Math.min(2, devicePixelRatio || 1); c.width = w.clientWidth * dpr; c.height = w.clientHeight * dpr; };
    const ro = new ResizeObserver(resize); ro.observe(w); resize();
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = c.getBoundingClientRect(), k = cam.current;
      const wx = k.x + (e.clientX - r.left - r.width / 2) / k.z, wy = k.y + (e.clientY - r.top - r.height / 2) / k.z;
      k.z = Math.max(0.5, Math.min(40, k.z * Math.exp(-e.deltaY * 0.0018)));
      k.x = wx - (e.clientX - r.left - r.width / 2) / k.z; k.y = wy - (e.clientY - r.top - r.height / 2) / k.z;
    };
    c.addEventListener("wheel", onWheel, { passive: false });
    const draw = (t: number) => {
      const W = c.width / dpr, H = c.height / dpr, k = cam.current, { nations: ns, city: my, now } = state.current;
      if (!fitted && ns.length && W > 0 && H > 0) {
        const xs = ns.map(n => n.x), ys = ns.map(n => n.y);
        const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
        k.x = (left + right) / 2; k.y = (top + bottom) / 2;
        k.z = Math.max(0.5, Math.min(7, Math.max(1, W - 160) / Math.max(20, right-left), Math.max(1, H - 220) / Math.max(20, bottom-top)));
        fitted = true;
      }
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
      // Outgoing and incoming armies follow authoritative departure/return times.
      for (const march of state.current.wars) {
        if (!["marching", "returning", "fighting"].includes(march.status)) continue;
        if (!march.from || !march.to || march.depart === undefined || march.duration === undefined) continue;
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
      // Route overlays must sit above fortresses: close neighbours otherwise hide the entire line.
      for (const journey of envoyWorldRoutes(my,ns,now())) {
        const [ax,ay]=S(journey.from.x,journey.from.y),[bx,by]=S(journey.to.x,journey.to.y),[ex,ey]=S(journey.x,journey.y);
        ctx.setLineDash([6,5]);ctx.strokeStyle="rgba(127,224,255,.95)";ctx.lineWidth=2.5;
        ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.stroke();ctx.setLineDash([]);
        ctx.fillStyle="#7fe0ff";ctx.beginPath();ctx.arc(ex,ey,5+Math.sin(t/200),0,Math.PI*2);ctx.fill();
        drawEnvoyActor(ctx,my.era,ex,ey-3,.7,t,true,journey.returning?-1:1);
        const label=`Sứ giả của bạn · ${journey.returning?"đang về":"đang đi"}`;
        ctx.font="600 11px system-ui, sans-serif";ctx.textAlign="center";
        const width=ctx.measureText(label).width+10;
        ctx.fillStyle="rgba(12,20,18,.9)";ctx.fillRect(ex-width/2,ey-40,width,17);
        ctx.fillStyle="#bdefff";ctx.fillText(label,ex,ey-28);
      }
      for(const convoy of state.current.caravans){
        if(!convoy.from||!convoy.to||convoy.status==='completed')continue;
        const tn=now(),position=caravanMapPosition(convoy,tn),raid=convoy.raid;if(!position)continue;
        const [ax,ay]=S(convoy.from.x,convoy.from.y),[bx,by]=S(convoy.to.x,convoy.to.y),[cx,cy]=S(position.x,position.y);
        ctx.setLineDash([8,5]);ctx.strokeStyle=raid?'#ec985d':'#dfc46e';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.stroke();ctx.setLineDash([]);
        drawCaravanActor(ctx,cx,cy,.8,t,convoy.status!=='fighting'&&convoy.status!=='waiting',convoy.to.x>=convoy.from.x?1:-1);
        if(troopCount(convoy.escorts))drawRaiderActor(ctx,cx-22,cy+5,t,convoy.status==='fighting',troopCount(convoy.escorts),'#629ab1');
        ctx.font='600 11px system-ui';ctx.textAlign='center';const label=convoy.status==='fighting'?`Giao chiến · ${troopCount(convoy.escorts)} hộ tống`:convoy.robbed?'Đã bị cướp':`Xe: ${convoy.sellerName} → ${convoy.buyerName}`;ctx.fillStyle='#16251feb';ctx.fillRect(cx-100,cy-45,200,16);ctx.fillStyle='#ffe0a3';ctx.fillText(label,cx,cy-33);
        if(raid?.from&&raid.to&&!raid.returned){let f=Math.max(0,Math.min(1,(tn-raid.depart)/Math.max(1,raid.meetAt-raid.depart))),from=raid.from,to=raid.to;if(raid.backAt&&raid.fight?.finished){from=raid.to;to=raid.from;f=Math.max(0,Math.min(1,(tn-raid.fight.last)/Math.max(1,raid.backAt-raid.fight.last)));}const [rx,ry]=S(from.x+(to.x-from.x)*f,from.y+(to.y-from.y)*f),[ox,oy]=S(from.x,from.y),[tx,ty]=S(to.x,to.y);ctx.setLineDash([4,4]);ctx.strokeStyle='#e67565';ctx.beginPath();ctx.moveTo(ox,oy);ctx.lineTo(tx,ty);ctx.stroke();ctx.setLineDash([]);drawRaiderActor(ctx,rx,ry,t,convoy.status==='fighting',troopCount(raid.units));}
        if(convoy.status==='fighting'){ctx.strokeStyle='#fff1a1';ctx.lineWidth=2;const pulse=8+Math.sin(t/100)*4;ctx.beginPath();ctx.moveTo(cx-pulse,cy-pulse);ctx.lineTo(cx+pulse,cy+pulse);ctx.moveTo(cx+pulse,cy-pulse);ctx.lineTo(cx-pulse,cy+pulse);ctx.stroke();}
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); c.removeEventListener("wheel", onWheel); };
  }, []);

  const pick = (e: React.MouseEvent) => {
    const r = cv.current!.getBoundingClientRect(), k = cam.current;
    const wx = k.x + (e.clientX - r.left - r.width / 2) / k.z, wy = k.y + (e.clientY - r.top - r.height / 2) / k.z;
    const convoy=caravans.find(c=>{const p=caravanMapPosition(c,now());return p&&Math.hypot(p.x-wx,p.y-wy)<Math.max(2,22/k.z);});
    setSelectedCaravan(convoy?._id??null);if(convoy){setSel(null);return;}
    let best: Nation | null = null, bd = Math.max(2.5, 18 / k.z);
    for (const n of nations) { const d = Math.hypot(n.x - wx, n.y - wy + 0.3); if (d < bd) { bd = d; best = n; } }
    setSel(best);
  };

  const t = now();
  const myEnvoys = envoyCount(city), away = envoysAway(city), en = ENVOY_NAMES[city.era];
  const d = sel && me ? dist(me, sel) : 0;
  const marchDuration=Math.max(MIN,d/MARCH_TILES_PER_MIN*MIN);
  const supplies=marchSupplies(army,marchDuration);
  const logistics=marchLogistics(army,marchDuration);
  const [riskAccepted,setRiskAccepted]=useState(false);
  const riskKey=JSON.stringify([sel?.id,army,marchDuration]);
  useEffect(()=>setRiskAccepted(false),[riskKey]);
  const battleMessage=worldWarMessage(signedIn,warStatus,warEnabled,warError);
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
        <span className="muted small">Đã biết {nations.filter(n=>!n.me).length} nước · {en}: {myEnvoys ? `${myEnvoys - away}/${myEnvoys} ở nhà` : "chưa có"} · chấm xanh lá: đang được phép thăm</span>
        <button disabled={busy || !myEnvoys || away >= myEnvoys} onClick={() => onEnvoy()} title="Dò tìm một nước chưa biết: có tin sau 2 phút, trở về sau 4 phút.">
          {!myEnvoys ? "Cần xây Nhà sứ giả" : "Dò tìm nước mới · 2 phút"}
        </button>
        <select aria-label="Tìm nước trên bản đồ" value={sel?.id ?? ""} onChange={(e) => {
          const n = nations.find(n => n.id === e.target.value); if (!n) return;
          setSel(n); cam.current = { x: n.x, y: n.y, z: 7 };
        }}>
          <option value="" disabled>Tìm nước…</option>
          {nations.map(n => <option key={n.id} value={n.id}>{n.me ? "Bạn · " : n.friend ? "★ " : ""}{n.name}</option>)}
        </select>
        <button onClick={() => setSearchOpen(value => !value)} aria-expanded={searchOpen}>Tìm bạn bè</button>
        <button onClick={onClose}>Về làng</button>
      </header>
      {onMarket&&<aside className="wm-trade" aria-label="Đoàn xe trên thế giới"><button onClick={()=>onMarket()}>Mở Chợ / Chọn quân cướp xe</button>{caravans.filter(c=>c.status!=='completed').slice(0,8).map(c=><p key={c._id}><button aria-pressed={selectedCaravan===c._id} onClick={()=>setSelectedCaravan(c._id)}>{c.sellerName} → {c.buyerName}</button>{caravanStatus(c)}{!c.from?' · Chưa rõ tuyến':''}</p>)}{caravans.filter(c=>c._id===selectedCaravan).map(c=><p key={c._id}>{c.amount} hàng · {troopCount(c.escorts)} hộ tống <button onClick={()=>onMarket(c.canRaid?c._id:undefined)}>{c.canRaid?'Chọn quân chặn xe':'Xem giao dịch'}</button></p>)}</aside>}
      <aside className="wm-discovery" aria-label="Khám phá thế giới">
        <p>Nét đứt xanh và chấm di chuyển: sứ giả của bạn, đang đi hoặc đang về.</p>
        {feedback && <p role={feedback.err?"alert":"status"} className={feedback.err?"err":"ok"}>{feedback.text}</p>}
        <p>Chỉ hiện nước đã được sứ giả tìm thấy. Bạn bè có thể xem làng qua danh sách, nhưng vị trí vẫn giữ kín.</p>
        {(city.trips ?? []).map(tr=><p key={tr.id}>{!tr.target ? `Đang dò vùng chưa biết · có tin sau ${fmtMin(tr.arrive-t)}` : `${tr.targetName} · ${t<tr.arrive?`tới sau ${fmtMin(tr.arrive-t)}`:`đang trở về, còn ${fmtMin(tr.back-t)}`}`}</p>)}
      </aside>
      {searchOpen && <aside className="hud-card wm-friends">
        <button className="x" onClick={() => setSearchOpen(false)} aria-label="Đóng tìm bạn">×</button>
        <h2>Tìm bạn bè</h2>
        {signedIn ? <FriendSearch onChanged={onFriendsChanged} /> : <a className="google" href="/api/auth/login">Đăng nhập Google để kết bạn</a>}
      </aside>}
      {sel && !searchOpen && (
        <div className="hud-card wm-card">
          <button className="x" onClick={() => setSel(null)} aria-label="Đóng">×</button>
          <h2>{sel.friend ? "★ " : ""}{sel.name}</h2>
          <p className="small">{sel.ownerName ? `Của ${sel.ownerName} · ` : ""}{ERA_NAMES[sel.era]} · {sel.pop} dân · {sel.score.toLocaleString("vi-VN")} điểm</p>
          {sel.me ? <p className="muted small">Đây là nước của bạn.</p> : (
            <>
              <p className="muted small">Cách {d} dặm · {en} đi {myEnvoys ? fmtMin(envoyMs(city, d)) : "?"} mỗi chiều.</p>
              {canVisit(city, sel.id, t) && <p className="ok small">Được phép thăm và xuất quân tới đây thêm {fmtMin((city.visits?.[sel.id] ?? t) - t)}.</p>}
              {trip && <p className="small">{en} {t < trip.arrive ? `đang tới, còn ${fmtMin(trip.arrive - t)}` : `đang về, còn ${fmtMin(trip.back - t)}`}.</p>}
              {friendNote && <p className="small" role="status">{friendNote}</p>}
              <div className="actions">
                {sel.friend ? <span className="ok small">★ Đã là bạn bè</span> : signedIn ? <button disabled={friendBusy || sel.registered === false} onClick={async () => {
                  setFriendBusy(true); setFriendNote("");
                  try { const result = await addFriend({ cityId: sel.id }); setFriendNote(`Đã kết bạn với ${result.name}.`); await onFriendsChanged(); }
                  catch (error) { setFriendNote((error as Error).message); }
                  finally { setFriendBusy(false); }
                }}>{sel.registered === false ? "Chưa có tài khoản để kết bạn" : friendBusy ? "Đang kết bạn…" : "Kết bạn"}</button> : <a href="/api/auth/login">Đăng nhập để kết bạn</a>}
                {(sel.friend || canVisit(city, sel.id, t)) && <button className="primary" onClick={() => onVisit(sel.id)}>Xem làng của họ</button>}
                <button disabled={busy || !myEnvoys || away >= myEnvoys || !!trip} onClick={() => onEnvoy(sel.id)}>
                  {busy ? "Đang xử lý…" : !myEnvoys ? "Cần xây nhà sứ giả" : trip ? `${en} đang đi` : away >= myEnvoys ? `Hết ${en.toLowerCase()} ở nhà` : `Cử ${en.toLowerCase()} tới đây`}
                </button>
              </div>
              {canVisit(city, sel.id, t) && (
                <div className="world-army">
                  <h3>Xuất quân</h3>
                  {wars.some((w) => w.status !== "completed" && w.status !== "cancelled") && <p className="muted small">Hoàn tất đoàn quân hoặc trận hiện tại trước khi xuất quân tiếp.</p>}
                  {sel.registered === false && <p className="muted small">Nước này cần đăng nhập Google để tham gia trận đánh.</p>}
                  {battleMessage && <p className="muted small" role="status">{battleMessage}</p>}
                  {warStatus==="error" && onRetryWar && <button onClick={onRetryWar}>Thử kết nối lại</button>}
                  <p className="muted small">Đối phương không cần online; quân và công trình tự phòng thủ.</p>
                  {(sel.shieldUntil ?? 0) > t && <p className="small">Đang có khiên bảo vệ: {fmtMin(sel.shieldUntil! - t)}.</p>}
                  {city.era - sel.era > 1 && <p className="small">Không đánh nước kém mình quá một thời đại.</p>}
                  {UKEYS.filter((u) => (city.army[u] ?? 0) > 0).map((u) => (
                    <label key={u} className="army-input">{UNITS[u].n} ({city.army[u]} ở nhà)
                      <input type="number" min={0} max={city.army[u] ?? 0} value={army[u] ?? 0} onChange={(e) => setArmy((a) => ({ ...a, [u]: Math.max(0, Math.min(city.army[u] ?? 0, Math.floor(Number(e.target.value) || 0))) }))} />
                    </label>
                  ))}
                  {troopCount(army)>0 && <p className={city.res.food<supplies.food?"err small":"small"}>Dự trữ: <b>{supplies.food} lương thực</b> · {fmtMin(marchDuration)} mỗi chiều, gồm đường về và dự phòng chiến đấu. Trừ một lần khi xuất quân, không tính thêm khẩu phần ở kho cho đoàn đang đi.{city.res.food<supplies.food?` Còn thiếu ${Math.ceil(supplies.food-city.res.food)} lương thực.`:""}</p>}
                  {logistics.long && logistics.fighters>0 && <div className="small"><p className={logistics.losses?"err":""}>Đường xa, hiểm trở: vận tải đáp ứng {Math.round(logistics.transport*100)}%, quân y {Math.round(logistics.medical*100)}%. Dự kiến hao {logistics.losses}/{logistics.fighters} chiến binh trên toàn chuyến (tính khi tới nơi). Có thể xuất quân thiếu hỗ trợ.</p>{(logistics.transport<1||logistics.medical<1) && <label><input type="checkbox" checked={riskAccepted} onChange={e=>setRiskAccepted(e.target.checked)}/> Tôi hiểu nguy cơ và vẫn muốn đi</label>}</div>}
                  <button disabled={(logistics.long&&(logistics.transport<1||logistics.medical<1)&&!riskAccepted) || city.res.food<supplies.food || busy || !!battleMessage || !warEnabled || sel.registered === false || !logistics.fighters || city.era - sel.era > 1 || (sel.shieldUntil ?? 0) > t || wars.some((w) => w.status !== "completed" && w.status !== "cancelled")} onClick={() => onAttack(sel.id, army)}>Xuất {troopCount(army)} lính</button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
