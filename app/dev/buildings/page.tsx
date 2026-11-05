"use client";

// Dev-only gallery: every building at levels 1–3, to check the art without playing up to it.
import { useEffect, useRef } from "react";
import { B, BKEYS, MAX_LVL, derive, newCity, type BKey, type City, type Derived } from "@/lib/engine";
import { drawThumb } from "@/components/draw";

const city: City = newCity(0, 1);
const D: Derived = derive(city);

function Cell({ k, lvl }: { k: BKey; lvl: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = (t: number) => { if (ref.current) drawThumb(ref.current, city, D, k, 0, lvl, t); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [k, lvl]);
  return <canvas ref={ref} style={{ width: 150, height: 120, display: "block" }} />;
}

export default function Page() {
  return (
    <main className="wrap">
      <h1>Công trình theo cấp</h1>
      <div style={{ display: "grid", gridTemplateColumns: "160px repeat(3, 150px)", gap: 8, alignItems: "center" }}>
        <b /> {[1, 2, 3].map((l) => <b key={l}>Cấp {l}</b>)}
        {BKEYS.map((k) => (
          <div key={k} style={{ display: "contents" }}>
            <span>{B[k].n}</span>
            {[1, 2, 3].map((l) => (B[k].up || l === 1 ? <Cell key={l} k={k} lvl={Math.min(l, MAX_LVL)} /> : <span key={l} className="muted small">—</span>))}
          </div>
        ))}
      </div>
    </main>
  );
}
