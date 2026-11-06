"use client";

import { useEffect, useRef, useState } from "react";
import { drawCity, type View } from "@/components/draw";
import { applyAction, derive, G, idx, newCity, settle, troopCount } from "@/lib/engine";

const view: View = { TW: 88, TH: 44, ox: 470, oy: -650, width: 940, height: 540, s: 88 / 64 };
export default function CampPreview() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [weak, setWeak] = useState(false), [support, setSupport] = useState(false), [run, setRun] = useState(0);
  const [status, setStatus] = useState(""), [events, setEvents] = useState<string[]>([]);
  useEffect(() => {
    const c = newCity(0, 123); c.t.fill(G); c.seen.fill(1); c.b = {}; c.people = []; c.herds = []; c.trips = [];
    c.camp = idx(20, 20); c.b[c.camp] = { k: "barracks", lvl: 1, doneAt: null };
    c.army = { club: weak ? 2 : 18, sling: weak ? 0 : 4, medic: support ? 2 : 0 };
    c.res.food = 5000; c.camps = [{ id: 1, at: idx(25, 20), power: 180, loot: { wood: 20 }, cleared: false, respawnAt: null }];
    applyAction(c, { type: "attack", camp: 1, units: { ...c.army } }, 0);
    const D = derive(c); let raf = 0, lastStatus = -1000; const start = performance.now();
    const paint = (time: number) => {
      const elapsed = time - start; settle(c, elapsed);
      const ctx = canvas.current?.getContext("2d");
      if (ctx) drawCity(ctx, c, D, { v: view, now: elapsed, anim: time, hover: null, selected: null, tool: null, villagers: [], picked: new Set(), fx: [], chopping: new Set() });
      if (elapsed - lastStatus > 200) {
        const e = c.exps[0];
        setStatus(e ? `${elapsed < e.arrive ? "Đang hành quân" : !e.resolved ? "Đang giao chiến" : e.won ? "Thắng, đang trở về" : "Thua, đang trở về"} · quân ta: ${troopCount(e.units)} · quân địch: ${troopCount(e.combat?.defenders ?? {})}` : `Đã về làng · còn ${troopCount(c.army)} quân · ${c.wins} trận thắng`);
        setEvents(c.log.map(entry => entry.msg)); lastStatus = elapsed;
      }
      raf = requestAnimationFrame(paint);
    };
    raf = requestAnimationFrame(paint); return () => cancelAnimationFrame(raf);
  }, [weak, support, run]);
  return <main style={{ padding: 16, color: "#f4e7c5", background: "#19362b", minHeight: "100vh" }}>
    <h1>Giao chiến trại man rợ</h1><p>Bản xem thử độc lập, không đọc hoặc lưu tài khoản.</p>
    <div className="actions"><button onClick={() => setRun(v => v + 1)}>Chạy lại</button><button onClick={() => setWeak(v => !v)}>{weak ? "Đổi sang quân mạnh" : "Đổi sang quân yếu"}</button><button onClick={() => setSupport(v => !v)}>{support ? "Bỏ quân y" : "Thêm quân y"}</button></div>
    <p role="status">{status}</p><canvas ref={canvas} width={940} height={540} style={{ width: "100%", maxWidth: 940 }} aria-label="Quân đi từ trại lính tới đánh quân man rợ rồi trở về" />
    <ul>{events.map((event, i) => <li key={i}>{event}</li>)}</ul>
  </main>;
}
