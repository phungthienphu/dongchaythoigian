"use client";

// Dev-only gallery: every building at levels 1–3, to check the art without playing up to it.
import { useEffect, useRef, useState } from "react";
import { B, BKEYS, ERA_NAMES, MAX_LVL, buildingName, derive, newCity, type BKey, type City, type Derived } from "@/lib/engine";
import { drawThumb } from "@/components/draw";

const city: City = newCity(0, 1);
const D: Derived = derive(city);
const eraCities = [1, 2, 3].map((era) => ({ ...city, era }));
// Eras 7–9 magic architecture: drawn with a preview id (-1), so glows show as powered.
const magicKeys = BKEYS.filter((k) => B[k].era >= 7);
const magicCities = [7, 8, 9].map((era) => ({ ...city, era }));

function Cell({ k, lvl, preview = city, still = false, season = 0, tall = false }: { k: BKey; lvl: number; preview?: City; still?: boolean; season?: number; tall?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = (t: number) => { if (ref.current) drawThumb(ref.current, preview, D, k, season, lvl, still ? 0 : t); if (!still) raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [k, lvl, preview, still, season]);
  return <canvas ref={ref} style={{ width: 150, height: tall ? 230 : 130, display: "block" }} />;
}
const TALL = new Set<BKey>(["manaspire", "awakeningtower", "fourspirits", "riverpalace", "observatory", "woodgrove", "spiritgate", "manarelay", "crystalworks", "essenceforge", "celestialforge", "harmonizer", "firealtar"] as BKey[]);

function MagicGallery() {
  const [still, setStill] = useState(false), [season, setSeason] = useState(0);
  useEffect(() => { if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setStill(true); }, []);
  return <section>
    <h1>Thời 7–9 · Ma pháp</h1>
    <p>Mỗi công trình ma pháp ở mọi cấp. Hình xem trước luôn coi như có mana; trong làng, nhà thiếu mana hoặc dừng sẽ tối phù văn.</p>
    <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
      <label><input type="checkbox" checked={still} onChange={(e) => setStill(e.target.checked)} /> Giảm chuyển động</label>
      <label>Mùa <select value={season} onChange={(e) => setSeason(+e.target.value)}>{["Xuân", "Hạ", "Thu", "Đông"].map((n, i) => <option key={n} value={i}>{n}</option>)}</select></label>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "180px repeat(3, 150px)", gap: 8, alignItems: "center" }}>
      <b /> {[1, 2, 3].map((l) => <b key={l}>Cấp {l}</b>)}
      {magicKeys.map((k) => (
        <div key={k} style={{ display: "contents" }}>
          <span><b>{B[k].n}</b><br /><small className="muted">Thời {B[k].era}</small></span>
          {[1, 2, 3].map((l) => (B[k].up || l === 1 ? <Cell key={l} k={k} lvl={l} preview={magicCities[B[k].era - 7]} still={still} season={season} tall={TALL.has(k)} /> : <span key={l} className="muted small">—</span>))}
        </div>
      ))}
    </div>
  </section>;
}

export default function Page() {
  return (
    <main className="wrap">
      <MagicGallery />
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
