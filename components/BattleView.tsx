"use client";
import { sessionEnded } from '@/lib/session-client';

import { useCallback, useEffect, useRef, useState } from "react";
import { advanceBattle, battleBridgeTiles, battleCommandError, commandBattle, type BattleCommand, type BattleSide, type BattleState } from "@/lib/battle";
import type { WarView } from "@/lib/war-view";
import { derive, UNITS, W, R, type City, type Derived, type UKey, type Troops } from "@/lib/engine";
import { camView, clampCam, drawCity, fitView, focusOn, screenToCell, zoomAt, type Cam, type View } from "./draw";
import { Crowd } from "./villagers";
import {drawTransportBoat} from "./draw";
import { drawBattleStrikes, drawSoldier } from "./battle-actors";
import styles from "./BattleView.module.css";
import {drawSelectionBox,inSelection,selectionMoved,type SelectionDrag} from "./map-selection";

import TroopTypePicker from './TroopTypePicker';

type Packet = { war: WarView; battle: BattleState | null; village: City | null; side: BattleSide; socket: string | null };
const MERCY = "Thí chủ hãy giữ cho mình chút nhân tánh, hãy cho những người lương thiện một con đường sống…";
const EMPTY_PICKED = new Set<number>(), EMPTY_CHOPPING = new Set<number>();

export default function BattleView({ id, onClose, onSettled, preview }: { id: string; onClose: () => void; onSettled?: () => void; preview?: Packet }) {
  const [packet, setPacket] = useState<Packet | null>(null);
  const [battle, setBattle] = useState<BattleState | null>(null);
  const [connection, setConnection] = useState("Đang mở phòng trận…");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selecting,setSelecting]=useState(false);
  const [unitType,setUnitType]=useState<UKey|null>(null);
  const selectionBox=useRef<SelectionDrag|null>(null);
  const [retry, setRetry] = useState(0);
  const [connected, setConnected] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const socket = useRef<WebSocket | null>(null);
  const latest = useRef({ packet, battle, selected });
  latest.current = { packet, battle, selected };
  const settled = useRef<string | null>(null), onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;
  const camera = useRef<Cam>({ zoom: 1, px: 0, py: 0 });
  const baseView = useRef<View | null>(null);
  const focused = useRef(false);
  const pointers = useRef(new Map<number, { x: number; y: number; startX: number; startY: number; moved: boolean }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);

  const send = useCallback((command: BattleCommand) => {
    const current=latest.current;
    if(preview&&current.battle){
      const next=structuredClone(current.battle),error=battleCommandError(next,preview.side,command);
      if(error||!commandBattle(next,preview.side,command)){setError(error??"Lệnh không hợp lệ.");return;}
      setBattle(next);setError("");return;
    }
    if(current.battle?.status === "finished" || current.packet?.war.result || ["completed","cancelled"].includes(current.packet?.war.status??"")){setError("Trận đã kết thúc, không thể điều quân.");return;}
    const ws = socket.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) { setError("Đang nối lại. Chờ kết nối để ra lệnh."); return; }
    ws.send(JSON.stringify({ type: "command", command }));
    setError("");
  }, [preview]);

  useEffect(() => {
    if(preview){
      setPacket(preview);setBattle(structuredClone(preview.battle));setConnected(true);setConnection("Bản thử local");setSelected(new Set());setUnitType(null);focused.current=false;
      let previous=performance.now();
      const timer=setInterval(()=>{const current=performance.now(),elapsed=current-previous;previous=current;setBattle(b=>{if(!b)return b;const next=structuredClone(b);advanceBattle(next,next.lastTick+Math.floor(elapsed/100)*100);return next;});},100);
      return ()=>clearInterval(timer);
    }
    let disposed = false, generation = 0, attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    focused.current = false;
    setPacket(null); setBattle(null); setSelected(new Set());setUnitType(null);
    const finish = (state: BattleState | null, war?: WarView) => {
      if ((state?.status === "finished" || war?.result || war?.status === "completed" || war?.status === "cancelled") && settled.current !== id) {
        settled.current = id; onSettledRef.current?.();
      }
    };
    const disconnect = () => {
      const ws = socket.current;
      if (!ws) return;
      if (ws.readyState === WebSocket.OPEN && latest.current.packet?.side === "defender") ws.send(JSON.stringify({ type: "command", command: { type: "presence", online: false } }));
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
      ws.close(); socket.current = null;
    };
    const schedule = () => {
      if (disposed) return;
      setConnected(false); setConnection("Mất kết nối, đang nối lại…");
      clearTimeout(timer);
      timer = setTimeout(connect, Math.min(30_000, 1000 * 2 ** Math.min(attempt++, 5)));
    };
    async function connect() {
      if (disposed) return;
      const token = ++generation;
      clearTimeout(timer); controller?.abort(); disconnect();
      controller = new AbortController();
      setConnected(false); setConnection(attempt ? "Đang nối lại phòng trận…" : "Đang mở phòng trận…");
      try {
        const res = await fetch(`/api/battles/${encodeURIComponent(id)}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]) });
        const data = await res.json();
        if (disposed || token !== generation) return;
        if (!res.ok) throw new Error(data.error || "Không mở được phòng trận.");
        const p = data as Packet;
        setPacket(p); setBattle(p.battle); finish(p.battle, p.war); setError("");
        if (!p.socket || p.battle?.status === "finished") {
          setConnection(p.war.status === "marching" ? "Quân đang hành quân" : p.war.status === "returning" ? "Quân đang trở về" : "Trận đã kết thúc");
          // One wake-up at the march/return deadline; no polling during a live socket.
          const deadline = p.war.status === "marching" ? p.war.arrive : p.war.status === "returning" ? p.war.back : undefined;
          if (deadline) timer = setTimeout(connect, Math.min(2_147_000_000, Math.max(1500, deadline - Date.now() + 1000)));
          return;
        }
        const ws = new WebSocket(p.socket); socket.current = ws;
        ws.onopen = () => {
          if (disposed || token !== generation) return;
          attempt = 0; setConnected(true); setConnection("Trực tiếp"); setError("");
          if (p.side === "defender") ws.send(JSON.stringify({ type: "command", command: { type: "presence", online: true } }));
        };
        ws.onmessage = (event) => {
          if (disposed || token !== generation) return;
          try {
            const frame = JSON.parse(event.data);
            if (frame.type === 'session-ended') { sessionEnded(); return; }
            if (frame.type === "state" && frame.battle) {
              setBattle((previous) => {
                const next = { ...previous, ...frame.battle, terrain: frame.battle.terrain ?? previous?.terrain ?? p.village?.t ?? [] } as BattleState;
                return next;
              });
              if (frame.battle.status === "finished") finish(frame.battle);
            } else if (frame.type === "error") setError(frame.error || "Lệnh chưa được chấp nhận.");
            else if (frame.type === "ack" && frame.accepted === false) setError(frame.error || "Lệnh không còn hợp lệ. Hãy chọn lại nhóm quân.");
            else if (frame.type === "update") { clearTimeout(timer); timer = setTimeout(connect, 500); }
          } catch { setError("Dữ liệu phòng trận không hợp lệ. Đang chờ bản cập nhật tiếp theo."); }
        };
        ws.onerror = () => { if (!disposed && token === generation) setConnection("Kết nối phòng trận bị gián đoạn…"); };
        ws.onclose = () => { if (!disposed && token === generation && settled.current !== id) schedule(); else setConnected(false); };
      } catch (e) {
        if (disposed || token !== generation || (e instanceof Error && e.name === "AbortError")) return;
        setError(e instanceof Error ? e.message : "Không mở được phòng trận."); schedule();
      }
    }
    const foreground = () => { if (document.visibilityState === "visible") { attempt = 0; void connect(); } else leave(); };
    const leave = () => {
      if (socket.current?.readyState === WebSocket.OPEN && latest.current.packet?.side === "defender") socket.current.send(JSON.stringify({ type: "command", command: { type: "presence", online: false } }));
    };
    document.addEventListener("visibilitychange", foreground);
    window.addEventListener("pagehide", leave);
    void connect();
    return () => { disposed = true; generation++; clearTimeout(timer); controller?.abort(); disconnect(); document.removeEventListener("visibilitychange", foreground); window.removeEventListener("pagehide", leave); };
  }, [id, retry, preview]);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    let frame = 0, previousPaint = 0, snapshotTime = 0;
    const crowd = new Crowd();
    let crowdAt=0;
    let snapshot: BattleState | null = null;
    let original: City | null = null, burnedKey = "", rendered: City | null = null, derived: Derived | null = null;
    const resize = () => {
      const rect = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(rect.width * dpr); cv.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      baseView.current = fitView(rect.width, rect.height);
      focused.current = false;
    };
    const observer = new ResizeObserver(resize); observer.observe(cv); resize();
    const paint = (time: number) => {
      frame = requestAnimationFrame(paint);
      if (time - previousPaint < 32 || document.hidden) return;
      previousPaint = time;
      const { packet: p, battle: b, selected: chosen } = latest.current;
      const f = baseView.current;
      if (!p?.village || !f) return;
      const key = b?.buildings.filter((x) => x.burned).map((x) => x.tile).join(",") ?? "";
      if (original !== p.village || key !== burnedKey) {
        original = p.village; burnedKey = key;
        rendered = { ...p.village, b: { ...p.village.b }, army: {}, exps: [], raid: null, guardPosts: [], seen: new Array(W * W).fill(1) };
        for (const building of b?.buildings ?? []) if (rendered.b[building.tile]) rendered.b[building.tile] = { ...rendered.b[building.tile], burned: building.burned };
        derived = derive(rendered);
        crowd.sync(rendered);
      }
      if (!rendered || !derived) return;
      if (!focused.current) {
        const group = b?.groups.find((g) => g.side === p.side && g.count > 0);
        focusOn(f, camera.current, group?.x ?? rendered.camp % W, group?.y ?? Math.floor(rendered.camp / W), 5);
        focused.current = true;
      }
      const v = camView(f, camera.current);
      crowd.update(rendered,Math.min(.1,Math.max(0,(time-crowdAt)/1000)),Date.now());crowdAt=time;
      drawCity(ctx, rendered, derived, { v, now: Date.now(), anim: time, hover: null, selected: null, tool: null, villagers: crowd.list, picked: EMPTY_PICKED, fx: [], chopping: EMPTY_CHOPPING });
      const deck=b?battleBridgeTiles(b):new Set<number>();
      const project = (x: number, y: number) => ({ x: v.ox + (x - y) * v.TW / 2, y: v.oy + (x + y) * v.TH / 2 });
      for (const building of b?.buildings ?? []) {
        if (building.k === "watchtower" && !building.burned && !building.inactive) {
          const at = project(building.tile % W + .5, Math.floor(building.tile / W) + .5);
          drawSoldier(ctx, { id: building.id, side: 'defender', u: 'bow', count: 1, initial: 1, hp: 1, x: 0, y: 0, order: {type:'guard',x:0,y:0} },at.x,at.y-32*v.s,v.s*.65,time,(b?.strikes??[]).some(e=>e.source===building.id&&b!.lastTick-e.at<650));
        }
        if (building.burned || building.hp >= building.maxHp) continue;
        const at = project(building.tile % W + .5, Math.floor(building.tile / W) + .5);
        ctx.fillStyle = "#302c25"; ctx.fillRect(at.x - 16, at.y - 35 * v.s, 32, 4);
        ctx.fillStyle = "#eda95d"; ctx.fillRect(at.x - 16, at.y - 35 * v.s, 32 * building.hp / building.maxHp, 4);
      }
      if (b !== snapshot) { snapshot = b; snapshotTime = time; }
      if(b) drawBattleStrikes(ctx,b,project,v.s,b.lastTick+time-snapshotTime);
      for (const g of [...(b?.groups ?? [])].sort((a, z) => a.x + a.y - z.x - z.y)) {
        if (!g.count || g.escaped) continue;
        const at = project(g.x, g.y), onBridge=deck.has(Math.floor(g.y)*W+Math.floor(g.x)), own = g.side === p.side;
        if (at.x < -40 || at.x > v.width + 40 || at.y < -40 || at.y > v.height + 40) continue;
        if(onBridge)at.y-=5*v.s;
        const radius = Math.max(10, Math.min(19, v.s * 7));
        ctx.fillStyle = own ? "#398aa6" : "#ba5547";
        ctx.beginPath(); ctx.ellipse(at.x, at.y, radius, radius * .68, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = chosen.has(g.id) ? "#ffe08a" : "#f1e4bf"; ctx.lineWidth = chosen.has(g.id) ? 3 : 1; ctx.stroke();
        if(g.naval&&!onBridge&&b?.terrain[Math.floor(g.y)*W+Math.floor(g.x)]===R)drawTransportBoat(ctx,at.x,at.y,v.s*.8,time,g.side==="attacker"?1:-1,g.count);
        else drawSoldier(ctx,g,at.x,at.y-6,v.s,time,(b?.strikes??[]).some(e=>e.source===g.id&&b!.lastTick-e.at<650));
        ctx.font = "bold 12px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#fff"; ctx.fillText(String(g.count), at.x, at.y+9);
        ctx.fillStyle = "#302c25"; ctx.fillRect(at.x - 15, at.y - 44, 30, 4);
        ctx.fillStyle = own ? "#80d8b3" : "#f4987e"; ctx.fillRect(at.x - 15, at.y - 44, 30 * Math.max(0, Math.min(1, g.hp / (g.initial * UNITS[g.u].hp))), 4);
        if (b?.status!=="finished" && !p.war.result && !["completed","cancelled"].includes(p.war.status) && chosen.has(g.id) && g.order.type === "move" && !g.blocked && g.moving) {
          const to = project(g.order.x, g.order.y);
          ctx.strokeStyle = "#ffe08a"; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(at.x, at.y); ctx.lineTo(to.x, to.y); ctx.stroke(); ctx.setLineDash([]);
        }
      }
      drawSelectionBox(ctx,selectionBox.current);
    };
    frame = requestAnimationFrame(paint);
    const wheel = (event: WheelEvent) => {
      event.preventDefault(); const f = baseView.current; if (!f) return;
      const rect = cv.getBoundingClientRect(); zoomAt(f, camera.current, camera.current.zoom * Math.exp(-event.deltaY * .0015), event.clientX - rect.left, event.clientY - rect.top);
    };
    cv.addEventListener("wheel", wheel, { passive: false });
    return () => { cancelAnimationFrame(frame); observer.disconnect(); cv.removeEventListener("wheel", wheel); };
  }, []);

  const chooseGroup=(id:string,additive:boolean)=>setSelected(old=>{const next=new Set(additive?old:[]);if(additive&&next.has(id))next.delete(id);else next.add(id);return next;});
  const clickMap = (x: number, y: number, additive=false, forceMove=false) => {
    const { packet: p, battle: b, selected: chosen } = latest.current, f = baseView.current;
    if (!p || !b || !f || b.status === "finished" || p.war.result || ["completed","cancelled"].includes(p.war.status)) return;
    const v = camView(f, camera.current),groupIds=b.groups.filter(g=>chosen.has(g.id)&&g.side===p.side&&g.count>0&&!g.escaped).map(g=>g.id);
    const target = b.groups.filter((g) => g.count > 0 && !g.escaped).map((g) => ({ g, distance: Math.hypot(x - (v.ox + (g.x - g.y) * v.TW / 2), y - (v.oy + (g.x + g.y) * v.TH / 2)) })).sort((a, z) => a.distance - z.distance)[0];
    if (!forceMove&&target && target.distance < 24) {
      if (target.g.side === p.side) {if(!unitType||target.g.u===unitType)chooseGroup(target.g.id,additive);}
      else if (groupIds.length) send({ type: "attack", groupIds, targetId: target.g.id });
      return;
    }
    const cell = screenToCell(v, x, y);
    if (!groupIds.length || !cell) return;
    const building = b.buildings.find((entry) => entry.tile === cell.y * W + cell.x && !entry.burned);
    if (!forceMove&&p.side === "attacker" && building) send({ type: "attack", groupIds, targetId: building.id });
    else send({ type: "move", groupIds, x: cell.x + .5, y: cell.y + .5 });
  };

  const finished = battle?.status === "finished" || !!packet?.war.result || packet?.war.status === "completed" || packet?.war.status === "cancelled";
  const winner = battle?.winner ?? packet?.war.result?.winner;
  const groups = battle?.groups.filter((g) => g.side === packet?.side && g.count > 0 && !g.escaped) ?? [];
  const typeCounts=groups.reduce<Troops>((counts,g)=>{counts[g.u]=(counts[g.u]??0)+g.count;return counts;},{});
  const active = connected && !!battle && !finished;
  return <section className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="battle-title" onKeyDown={(e) => {
    if (e.key === "Escape") { if(selected.size||selecting){setSelected(new Set());setSelecting(false);selectionBox.current=null;}else onClose(); }
    if (e.key === "Tab") {
      const controls = [...e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), select:not([disabled]), input:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')].filter(el=>el.getClientRects().length>0);
      const first = controls[0], last = controls[controls.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  }}>
    <header className={styles.header}>
      <div><h2 id="battle-title">{packet ? `${packet.war.attackerName} → ${packet.war.defenderName}` : "Trận đánh"}</h2><p role="status">{finished ? "Trận đã kết thúc" : connection}{battle && !finished ? ` · Tàn phá ${Math.round(battle.devastation * 100)}%` : ""}</p></div>
      <button type="button" onClick={onClose} aria-label="Đóng phòng trận" autoFocus>Đóng</button>
    </header>
    {!finished && <details className={styles.hint}><summary>Dân làng đang trú ẩn</summary><p>Dân tạm ngừng làm việc và không tham chiến. Trú ẩn không bảo đảm an toàn nếu làng bị tàn phá.</p></details>}
    {error && <div className={styles.error} role="alert">{error} {!connected && <button type="button" onClick={() => setRetry((n) => n + 1)}>Kết nối lại</button>}</div>}
    {preview && <div className={styles.result}><p>Bản thử local: chọn nhiều nhóm rồi bấm đất để đổi vị trí; chuột phải để rời mục tiêu đang đánh. Không tác động tài khoản thật.</p><button onClick={()=>setBattle(b=>b?{...b,status:"finished",winner:"defender"}:b)}>Kết thúc trận thử</button><output aria-live="off">{battle?.groups.filter(g=>g.side===preview.side).map(g=>`${UNITS[g.u].n}: (${g.x.toFixed(1)}, ${g.y.toFixed(1)})`).join(" · ")}</output></div>}
    {finished && <div className={styles.result} role="status"><strong>{packet?.war.status === "cancelled" ? "Đoàn quân đã quay về." : winner === packet?.side ? "Bạn đã thắng trận." : winner ? "Bạn đã thua trận." : "Trận đánh đã kết thúc."}</strong>{winner === "attacker" && <p>{MERCY}</p>}<p>Dân mất: {battle?.populationLoss ?? packet?.war.result?.populationLoss ?? 0} · Nhà cháy: {battle?.buildings.filter((b) => b.burned && !b.initiallyBurned).length ?? packet?.war.result?.burnedTiles.length ?? 0}</p></div>}
    <div className={styles.map}>
      <canvas ref={canvas} tabIndex={0} onKeyDown={(e) => {
        const f = baseView.current; if (!f) return;
        const direction: Record<string, [number, number]> = { ArrowUp: [0, -2], ArrowDown: [0, 2], ArrowLeft: [-2, 0], ArrowRight: [2, 0] };
        const delta = direction[e.key]; if (!delta) return;
        e.preventDefault();
        const current = latest.current, chosen=current.battle?.groups.filter(g=>current.selected.has(g.id)&&g.side===current.packet?.side&&g.count>0&&!g.escaped)??[],group=chosen[0];
        if (group && active) send({ type: "move", groupIds: chosen.map(g=>g.id), x: Math.max(.5, Math.min(W - .5, group.x + delta[0])), y: Math.max(.5, Math.min(W - .5, group.y + delta[1])) });
        else { camera.current.px -= delta[0] * 25; camera.current.py -= delta[1] * 25; clampCam(f, camera.current); }
      }} style={selecting?{cursor:"crosshair"}:undefined} aria-label="Bản đồ trận đánh. Bật Chọn vùng hoặc giữ Shift rồi kéo khung để chọn nhiều nhóm quân. Bấm đất để di chuyển, bấm địch để tấn công; chuột phải để di chuyển. Tắt Chọn vùng để kéo bản đồ." onContextMenu={e=>{e.preventDefault();const rect=e.currentTarget.getBoundingClientRect();clickMap(e.clientX-rect.left,e.clientY-rect.top,false,true);}} onPointerDown={(e) => {
        if(e.button!==0)return;
        e.currentTarget.setPointerCapture(e.pointerId);
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, moved: false });
        if (pointers.current.size > 1) { selectionBox.current=null;for (const p of pointers.current.values()) p.moved = true; const [a, b] = [...pointers.current.values()]; pinch.current = { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), zoom: camera.current.zoom }; }
        else if(active&&(selecting||e.shiftKey)){const rect=e.currentTarget.getBoundingClientRect(),p={x:e.clientX-rect.left,y:e.clientY-rect.top};selectionBox.current={pointerId:e.pointerId,start:p,end:p,additive:e.shiftKey||e.ctrlKey||e.metaKey};}
      }} onPointerMove={(e) => {
        const point = pointers.current.get(e.pointerId), f = baseView.current; if (!point || !f) return;
        const dx = e.clientX - point.x, dy = e.clientY - point.y; point.x = e.clientX; point.y = e.clientY;
        if (Math.hypot(e.clientX - point.startX, e.clientY - point.startY) > 6) point.moved = true;
        const box=selectionBox.current;if(box?.pointerId===e.pointerId){const rect=e.currentTarget.getBoundingClientRect();box.end={x:e.clientX-rect.left,y:e.clientY-rect.top};return;}
        if (pointers.current.size > 1 && pinch.current) {
          const [a, b] = [...pointers.current.values()], rect = e.currentTarget.getBoundingClientRect();
          zoomAt(f, camera.current, pinch.current.zoom * Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.distance, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top);
        } else if (point.moved) { camera.current.px += dx; camera.current.py += dy; clampCam(f, camera.current); }
      }} onPointerUp={(e) => {
        const point = pointers.current.get(e.pointerId); pointers.current.delete(e.pointerId); pinch.current = null;
        const box=selectionBox.current;selectionBox.current=null;
        const rect=e.currentTarget.getBoundingClientRect();
        if(box&&selectionMoved(box)){
          const {packet:p,battle:b}=latest.current,f=baseView.current;
          if(p&&b&&f){const v=camView(f,camera.current),deck=battleBridgeTiles(b),ids=b.groups.filter(g=>{if(g.side!==p.side||g.count<=0||g.escaped||unitType&&g.u!==unitType)return false;return inSelection(box,{x:v.ox+(g.x-g.y)*v.TW/2,y:v.oy+(g.x+g.y)*v.TH/2-(deck.has(Math.floor(g.y)*W+Math.floor(g.x))?5*v.s:0)});}).map(g=>g.id);setSelected(old=>new Set([...(box.additive?old:[]),...ids]));}
        }else if (point && !point.moved) clickMap(e.clientX-rect.left,e.clientY-rect.top,e.shiftKey||e.ctrlKey||e.metaKey);
      }} onPointerCancel={(e) => { selectionBox.current=null;pointers.current.delete(e.pointerId);for(const p of pointers.current.values())p.moved=true;pinch.current = null; }} />
      {!battle && <div className={styles.waiting}>{packet?.war.status === "marching" ? `Quân tới nơi lúc ${new Date(packet.war.arrive).toLocaleTimeString("vi-VN")}.` : packet?.war.status === "returning" ? "Quân đang mang chiến lợi phẩm trở về." : packet ? "Chưa có trận trực tiếp." : "Đang tải…"}</div>}
      <div className={styles.zoom}><button type="button" aria-label="Phóng to" onClick={() => { const f = baseView.current; if (f) zoomAt(f, camera.current, camera.current.zoom * 1.3, f.width / 2, f.height / 2); }}>+</button><button type="button" aria-label="Thu nhỏ" onClick={() => { const f = baseView.current; if (f) zoomAt(f, camera.current, camera.current.zoom / 1.3, f.width / 2, f.height / 2); }}>−</button></div>
    </div>
    <footer className={styles.footer}>
      <div className={styles.selectionControls} role="group" aria-label="Chọn nhiều quân">
        <button type="button" aria-pressed={selecting} disabled={!active} onClick={()=>{selectionBox.current=null;setSelecting(v=>!v);}}>Chọn vùng</button>
        <button type="button" disabled={!selected.size} onClick={()=>setSelected(new Set())}>Bỏ chọn</button>
        <select aria-label="Chọn nhanh loại quân" disabled={!active} value={unitType??''} onChange={e=>{const type=e.target.value as UKey|'';setUnitType(type||null);setSelected(new Set(groups.filter(g=>!type||g.u===type).map(g=>g.id)));}}><option value="">Tất cả loại quân</option>{Object.entries(typeCounts).filter(([,n])=>n>0).map(([u,n])=><option key={u} value={u}>{UNITS[u as UKey].n} · {n}</option>)}</select>
        <span role="status">{groups.filter(g=>selected.has(g.id)).length} nhóm · {groups.filter(g=>selected.has(g.id)).reduce((n,g)=>n+g.count,0)} quân đã chọn</span>
      </div>
      <details className={styles.moreCommands}><summary>Chọn theo loại / nhóm quân</summary>
      <TroopTypePicker counts={typeCounts} filter={unitType} disabled={!active} onChoose={(type,additive)=>{setUnitType(type);const ids=groups.filter(g=>!type||g.u===type).map(g=>g.id);setSelected(old=>new Set([...(additive?old:[]),...ids]));}}/>
      <div className={styles.groups} aria-label="Nhóm quân của bạn">{groups.map((g) => <button type="button" key={g.id} aria-pressed={selected.has(g.id)} onClick={e => {setUnitType(null);chooseGroup(g.id,e.shiftKey||e.ctrlKey||e.metaKey);}} disabled={!active}>{UNITS[g.u].n} × {g.count}{groups.some(other=>other.id!==g.id&&other.u===g.u)?` · ${Math.floor(g.x)},${Math.floor(g.y)}`:""}</button>)}</div>
      <p>{finished ? "Trận đã kết thúc. Quân không tiếp tục nhận lệnh tại đây." : groups.some(g=>selected.has(g.id)&&g.blocked) ? "Không có đường tới mục tiêu. Kiểm tra sông, thuyền, núi và lối qua cổng. Quân nhà không tự phá nhà mình." : selected.size ? "Bấm đất để dàn gác · Bấm địch để đánh · Chuột phải để đổi vị trí, kể cả đang giao chiến" : "Chọn vùng rồi kéo khung, hoặc Shift + bấm để chọn thêm nhóm"} · {selecting?"Đang kéo khung chọn; tắt Chọn vùng để kéo bản đồ":"Kéo và chụm để xem bản đồ"}</p>
      </details>
      <p className={styles.commandHint} role="status">{finished?'Trận đã kết thúc':groups.some(g=>selected.has(g.id)&&g.blocked)?'Quân đang bị chặn đường · mở chi tiết để kiểm tra':selected.size?'Bấm đất để di chuyển · bấm địch để đánh':selecting?'Kéo khung để chọn quân':'Chọn vùng hoặc chọn nhóm để ra lệnh'}</p>
      {packet?.side === "attacker" && !finished && <button type="button" className={styles.retreat} disabled={!active || battle?.status === "retreating"} onClick={() => send({ type: "retreat" })}>{battle?.status === "retreating" ? "Đang rút lui…" : "Rút quân"}</button>}
    </footer>
  </section>;
}
