"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { WarLoadStatus } from "@/lib/world-service-status";
import type { WarView } from "@/lib/war-view";
export type WarSummary = WarView & { side: "attacker" | "defender" };
export function useWars(ready: boolean, onUpdate: () => void) {
  const [wars, setWars] = useState<WarSummary[]>([]);
  const [status,setStatus]=useState<WarLoadStatus>("idle");
  const [enabled, setEnabled] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const updateRef = useRef(onUpdate); updateRef.current = onUpdate;
  useEffect(() => {
    if (!ready) { setStatus("idle");setEnabled(false);setWars([]);setError(null);setConnected(false);return; }
    setStatus("loading");
    let disposed = false, socket: WebSocket | null = null, retry = 0, generation = 0;
    let reconnect: ReturnType<typeof setTimeout>, renew: ReturnType<typeof setTimeout>, deadline: ReturnType<typeof setTimeout>;
    const schedule = () => {
      if (disposed) return;
      setConnected(false);
      clearTimeout(reconnect);
      reconnect = setTimeout(() => void refresh(), Math.min(30_000, 1000 * 2 ** Math.min(retry++, 5)));
    };
    const refresh = async () => {
      const request = ++generation;
      try {
        const res = await fetch("/api/battles", { cache: "no-store", signal: AbortSignal.timeout(15_000) });
        if (!res.ok) throw new Error(res.status===401 ? "Phiên đăng nhập đã hết hạn. Đăng nhập lại để xuất quân." : "Không tải được trạng thái trận đánh. Hãy thử kết nối lại.");
        const data = await res.json(); if (disposed || request !== generation) return;
        setWars(data.battles); setEnabled(data.enabled); setError(null);setStatus("ready");
        clearTimeout(deadline);
        const times = (data.battles as WarSummary[]).flatMap((w) => w.status === "marching" ? [w.arrive] : w.status === "returning" && w.back ? [w.back] : []);
        if (times.length) deadline = setTimeout(() => { void refresh(); updateRef.current(); }, Math.max(1000, Math.min(...times) - Date.now() + 500));
        if (data.socket && (!socket || socket.readyState > WebSocket.OPEN)) {
          const ws = new WebSocket(data.socket); socket = ws;
          ws.onopen = () => {
            if (disposed) { ws.close(); return; }
            retry = 0; setConnected(true);
            clearTimeout(renew);
            renew = setTimeout(() => { socket = null; ws.onclose = null; ws.close(); void refresh(); }, 240_000);
          };
          ws.onmessage = () => { if (!disposed) { void refresh(); updateRef.current(); } };
          ws.onclose = schedule; ws.onerror = () => ws.close();
        }
      } catch (error) { if (!disposed && request === generation) { setStatus("error");setError(error instanceof Error && error.message.includes("đăng nhập") ? error.message : "Không tải được trạng thái trận đánh. Đang thử kết nối lại…"); schedule(); } }
    };
    refreshRef.current = refresh;
    const foreground = () => { if (document.visibilityState === "visible") { void refresh(); updateRef.current(); } };
    document.addEventListener("visibilitychange", foreground); window.addEventListener("online", foreground);
    void refresh();
    return () => { disposed = true; generation++; clearTimeout(reconnect); clearTimeout(renew); clearTimeout(deadline); if (socket) { socket.onclose = null; socket.close(); } document.removeEventListener("visibilitychange", foreground); window.removeEventListener("online", foreground); };
  }, [ready]);
  const refresh = useCallback(() => refreshRef.current(), []);
  return { status, wars, enabled, connected, error, refresh };
}
