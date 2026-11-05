"use client";

// Dev-only gallery: every building at levels 1–3, to check the art without playing up to it.
import { useEffect, useRef } from "react";
import { B, BKEYS, ERA_NAMES, MAX_LVL, buildingName, derive, newCity, type BKey, type City, type Derived } from "@/lib/engine";
import { drawThumb } from "@/components/draw";

const city: City = newCity(0, 1);
const D: Derived = derive(city);
const eraCities = [1, 2, 3].map((era) => ({ ...city, era }));

function Cell({ k, lvl, preview = city }: { k: BKey; lvl: number; preview?: City }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = (t: number) => { if (ref.current) drawThumb(ref.current, preview, D, k, 0, lvl, t); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [k, lvl, preview]);
  return <canvas ref={ref} style={{ width: 150, height: 120, display: "block" }} />;
}

export default function Page() {
  return (
    <main className="wrap">
      <h1>Kiến trúc qua các thời đại</h1>
      <p>Hàng ngang: thời đại. Cấp công trình giữ ở 1 để so sánh kiến trúc.</p>
      <div style={{display:"grid",gridTemplateColumns:"160px repeat(3,150px)",gap:8,alignItems:"center",overflowX:"auto"}}>
        <b>Công trình</b>{eraCities.map(c=><b key={c.era}>{ERA_NAMES[c.era]}</b>)}
        {BKEYS.map(k=><div key={k} style={{display:"contents"}}><b>{B[k].n}</b>{eraCities.map(preview=>B[k].era>preview.era?<span key={preview.era}>Chưa mở</span>:<div key={preview.era}><Cell k={k} lvl={1} preview={preview}/><small>{buildingName(preview,k)}</small></div>)}</div>)}
      </div>
      <h1>Công trình theo cấp</h1>
      <h2>Nhà sứ giả qua ba thời đại</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, marginBottom: 24 }}>
        {eraCities.map((preview) => (
          <div key={preview.era}>
            <b>{buildingName(preview, "envoy")}</b>
            <p className="muted small">{ERA_NAMES[preview.era]}</p>
            <Cell k="envoy" lvl={1} preview={preview} />
          </div>
        ))}
      </div>
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
