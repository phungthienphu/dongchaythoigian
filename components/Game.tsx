"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  B, BKEYS, ERA_NAMES, ERA_REQ, H, MAX_LVL, RES, RN, R, SEASONS, SEASON_MS, TERRAIN, W, G,
  builders, busyBuilders, buildMs, canPlace, costText, derive, idx, inb, levelCost, repairCost,
  reqMet, seasonIndexAt, settle, stamp, stats, type Action, type BKey, type City, type Derived,
} from "@/lib/engine";
import { drawCity } from "./draw";

type Cell = { x: number; y: number };
type Row = { name: string; score: number; era: number; pop: number; temple: boolean; me: boolean };

function fmtDur(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h) return `${h} giờ ${m} phút`;
  if (m) return `${m} phút ${String(sec).padStart(2, "0")} giây`;
  return `${sec} giây`;
}
const fmt = (n: number) => Math.floor(n).toLocaleString("vi-VN");

function tileDesc(c: City, D: Derived, x: number, y: number) {
  const i = idx(x, y), parts = [TERRAIN[c.t[i]]];
  if (c.t[i] === G && D.fert[i]) parts.push("đất phù sa");
  if (c.oldbed[i]) parts.push("lòng sông cũ");
  if (D.rd[i] === 1 && c.t[i] !== R) parts.push(D.prot[i] ? "vùng lũ, có đê che" : "vùng lũ");
  return parts.join(", ");
}

export default function Game() {
  const [loading, setLoading] = useState(true);
  const [needsName, setNeedsName] = useState(false);
  const [name, setName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [, setVersion] = useState(0);
  const [tool, setTool] = useState<BKey | null>(null);
  const [selected, setSelected] = useState<Cell | null>(null);
  const [hover, setHover] = useState<Cell | null>(null);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [armDemolish, setArmDemolish] = useState(false);

  const cityRef = useRef<City | null>(null);
  const dRef = useRef<Derived | null>(null);
  const offsetRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const tsRef = useRef(28);
  const viewRef = useRef({ hover, selected, tool });
  viewRef.current = { hover, selected, tool };

  const now = () => Date.now() + offsetRef.current;
  const bump = () => setVersion((v) => v + 1);

  const accept = useCallback((data: { state: City; serverNow: number; name?: string }) => {
    offsetRef.current = data.serverNow - Date.now();
    cityRef.current = data.state;
    dRef.current = derive(data.state);
    if (data.name) setName(data.name);
    bump();
  }, []);

  const loadCity = useCallback(async () => {
    const res = await fetch("/api/city", { cache: "no-store" });
    if (res.status === 404) { setNeedsName(true); setLoading(false); return; }
    if (!res.ok) { setMsg({ text: "Không tải được thành phố. Kiểm tra kết nối MongoDB.", err: true }); setLoading(false); return; }
    accept(await res.json());
    setNeedsName(false);
    setLoading(false);
  }, [accept]);

  const loadBoard = useCallback(async () => {
    const res = await fetch("/api/leaderboard", { cache: "no-store" });
    if (res.ok) setRows((await res.json()).rows);
  }, []);

  useEffect(() => {
    loadCity(); loadBoard();
    const tick = setInterval(() => {
      const c = cityRef.current;
      if (!c) return;
      settle(c, now());
      dRef.current = derive(c);
      bump();
    }, 1000);
    const sync = setInterval(() => { loadCity(); loadBoard(); }, 60_000);
    return () => { clearInterval(tick); clearInterval(sync); };
  }, [loadCity, loadBoard]);

  // canvas sizing + render loop
  useEffect(() => {
    const cv = canvasRef.current, board = boardRef.current;
    if (!cv || !board) return;
    const ctx = cv.getContext("2d")!;
    const rm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let dpr = 1;
    const resize = () => {
      const ts = Math.max(12, Math.min(44, Math.floor(board.clientWidth / W)));
      tsRef.current = ts;
      dpr = window.devicePixelRatio || 1;
      cv.width = ts * W * dpr; cv.height = ts * H * dpr;
      cv.style.width = ts * W + "px"; cv.style.height = ts * H + "px";
    };
    const ro = new ResizeObserver(resize);
    ro.observe(board);
    resize();
    let raf = 0;
    const loop = (t: number) => {
      const c = cityRef.current, D = dRef.current;
      if (c && D) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawCity(ctx, c, D, { ts: tsRef.current, now: now(), anim: rm ? 0 : t, ...viewRef.current });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [loading, needsName]);

  const act = async (a: Action) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/city/action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(a) });
      const data = await res.json();
      if (data.state) accept(data);
      if (data.error) setMsg({ text: data.error, err: true });
      return !data.error;
    } catch {
      setMsg({ text: "Mất kết nối máy chủ.", err: true });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const createCity = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/city", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: nameInput }) });
    const data = await res.json();
    if (!res.ok) { setMsg({ text: data.error ?? "Không tạo được thành phố.", err: true }); return; }
    accept(data);
    setNeedsName(false);
    loadBoard();
  };

  const cellAt = (e: React.PointerEvent | React.MouseEvent): Cell | null => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / (r.width / W)), y = Math.floor((e.clientY - r.top) / (r.height / H));
    return inb(x, y) ? { x, y } : null;
  };

  const onClick = async (e: React.MouseEvent) => {
    const cell = cellAt(e), c = cityRef.current;
    if (!cell || !c) return;
    if (tool) {
      const ok = await act({ type: "build", k: tool, x: cell.x, y: cell.y });
      if (ok) setMsg({ text: `Thợ bắt đầu xây ${B[tool].n}.` });
      return;
    }
    setSelected(cell);
    setArmDemolish(false);
    setMsg(null);
  };

  const pickTool = (k: BKey | null) => {
    setTool(k);
    setSelected(null);
    setMsg(k ? { text: `${B[k].n} (${costText(B[k].cost)}, ${fmtDur(buildMs(k, 1))}): ${B[k].d} Chuột phải hoặc Esc để bỏ chọn.` } : null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setTool(null); setSelected(null); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const c = cityRef.current, D = dRef.current;
  const t = now();

  if (loading) return <main className="wrap"><p className="muted">Đang tải thành phố…</p></main>;

  if (needsName || !c || !D) {
    return (
      <main className="wrap start">
        <h1>Dòng Sông Thời Đại</h1>
        <p className="lede">Dựng một khu định cư bên sông và đưa nó từ thời đồ đá lên thời đồ sắt. Thành phố vẫn sản xuất khi bạn rời đi, sông vẫn lũ mỗi mùa thu.</p>
        <form onSubmit={createCity} className="startform">
          <label htmlFor="cityname">Đặt tên thành phố</label>
          <input id="cityname" value={nameInput} onChange={(e) => setNameInput(e.target.value)} maxLength={24} placeholder="Ví dụ: Bến Phù Sa" autoFocus />
          <button type="submit" className="primary">Dựng trại</button>
        </form>
        {msg && <p className={msg.err ? "err" : "muted"}>{msg.text}</p>}
      </main>
    );
  }

  const st = stats(c, D, t);
  const si = seasonIndexAt(c, t), season = si % 4;
  const nextSeasonIn = c.t0 + (si + 1) * SEASON_MS - t;
  const busyN = busyBuilders(c), maxB = builders(c);

  // hover / status line
  let status: { text: string; err?: boolean } | null = msg;
  if (hover && tool) {
    const bad = canPlace(c, D, tool, hover.x, hover.y);
    status = bad ? { text: `${B[tool].n}: ${bad}`, err: true } : { text: `${B[tool].n}: bấm để xây. Ô: ${tileDesc(c, D, hover.x, hover.y)}.` };
  } else if (hover && !msg) {
    const b = c.b[idx(hover.x, hover.y)];
    status = { text: `${b ? B[b.k].n + (b.lvl ? ` cấp ${b.lvl}` : " (đang xây)") + ". " : ""}Ô: ${tileDesc(c, D, hover.x, hover.y)}.` };
  }

  const sel = selected ? c.b[idx(selected.x, selected.y)] : null;
  const next = ERA_REQ[c.era + 1];

  return (
    <main className="wrap">
      <header className="top">
        <div className="brand">
          <h1>{name}</h1>
          <div className="when">
            <span className="era">{ERA_NAMES[c.era]}</span>
            <span className={"date" + (season === 2 ? " flood" : "")}>
              Năm {Math.floor(si / 4) + 1} · mùa {SEASONS[season]}{season === 2 ? " (mùa lũ)" : ""} · sang mùa {SEASONS[(season + 1) % 4]} sau {fmtDur(nextSeasonIn)}
            </span>
          </div>
        </div>
        <div className="builders" title="Thợ xây đang bận / tổng số thợ">Thợ xây <b>{busyN}/{maxB}</b></div>
      </header>

      <div className="res">
        <div><span className="k">Dân số</span><span className="v">{c.pop}/{st.housing}</span><span className={"d" + (c.pop >= st.housing ? " down" : "")}>{c.pop >= st.housing ? "cần thêm nhà" : "chỗ ở"}</span></div>
        <div><span className="k">Việc làm</span><span className="v">{Math.min(c.pop, st.jobs)}/{st.jobs}</span><span className={"d" + (st.jobs > c.pop ? " down" : "")}>{st.jobs > c.pop ? "thiếu người" : "đủ người"}</span></div>
        {RES.map((r) => {
          const rate = r === "copper" ? st.copperRate : r === "wood" ? st.rate.wood - st.woodUse : st.rate[r];
          return (
            <div key={r}>
              <span className="k">{RN[r]}</span>
              <span className={"v" + (c.res[r] >= st.storage ? " full" : "")}>{fmt(c.res[r])}<small>/{fmt(st.storage)}</small></span>
              <span className={"d" + (rate > 0.05 ? " up" : rate < -0.05 ? " down" : "")}>{rate >= 0 ? "+" : ""}{fmt(rate)}/giờ</span>
            </div>
          );
        })}
      </div>

      <div className="layout">
        <section className="board" ref={boardRef}>
          <canvas
            ref={canvasRef}
            aria-label="Bản đồ thành phố ven sông"
            onPointerMove={(e) => setHover(cellAt(e))}
            onPointerLeave={() => setHover(null)}
            onClick={onClick}
            onContextMenu={(e) => { e.preventDefault(); pickTool(null); }}
          />
          <div className={"status" + (status?.err ? " err" : "")}>{status?.text ?? "Chọn công trình bên phải rồi bấm lên bản đồ để xây. Bấm vào công trình có sẵn để nâng cấp hoặc sửa."}</div>
          <div className="legend">
            <span><i style={{ background: "#58783b" }} />Đất phù sa</span>
            <span><i style={{ background: "#738c4f" }} />Đồng cỏ</span>
            <span><i style={{ background: "#2f5530" }} />Rừng</span>
            <span><i style={{ background: "#8b7d63" }} />Đồi đá</span>
            <span><i style={{ background: "#d0843f" }} />Mỏ đồng</span>
            <span><i style={{ background: "rgba(120,180,225,.7)" }} />Vùng lũ (mùa hạ, thu)</span>
          </div>
        </section>

        <aside className="side">
          {sel && selected && (
            <div className="panel card">
              <h2>{B[sel.k].n}{sel.lvl ? ` · cấp ${sel.lvl}` : ""}</h2>
              <p className="muted small">{B[sel.k].d} Ô: {tileDesc(c, D, selected.x, selected.y)}.</p>
              {sel.doneAt && <p>{sel.lvl === 0 ? "Đang xây" : `Đang nâng lên cấp ${sel.lvl + 1}`}: còn {fmtDur(sel.doneAt - t)}</p>}
              {sel.flooded && <p className="err">Bị ngập, không hoạt động.</p>}
              <div className="actions">
                {sel.flooded && (
                  <button className="primary" disabled={busy} onClick={() => act({ type: "repair", ...selected })}>Sửa ({costText(repairCost(sel.k))})</button>
                )}
                {B[sel.k].up && sel.lvl >= 1 && sel.lvl < MAX_LVL && !sel.doneAt && !sel.flooded && (
                  <button className="primary" disabled={busy} onClick={() => act({ type: "upgrade", ...selected })}>
                    Lên cấp {sel.lvl + 1} ({costText(levelCost(sel.k, sel.lvl + 1))}, {fmtDur(buildMs(sel.k, sel.lvl + 1))})
                  </button>
                )}
                <button
                  disabled={busy}
                  onClick={async () => {
                    if (!armDemolish) { setArmDemolish(true); return; }
                    if (await act({ type: "demolish", ...selected })) { setSelected(null); setMsg({ text: "Đã phá, thu lại một nửa vật liệu." }); }
                    setArmDemolish(false);
                  }}
                >{armDemolish ? "Bấm lần nữa để phá" : "Phá dỡ"}</button>
              </div>
            </div>
          )}

          <div className="panel">
            <h2>Xây dựng</h2>
            <div className="pal">
              {[1, 2, 3].map((era) => (
                <div key={era} className="palgroup">
                  <div className="erah">{ERA_NAMES[era]}{era > c.era ? " (chưa mở)" : ""}</div>
                  {BKEYS.filter((k) => B[k].era === era).map((k) => {
                    const locked = B[k].era > c.era;
                    const poor = RES.some((r) => (B[k].cost[r] ?? 0) > c.res[r]);
                    return (
                      <button key={k} className="tool" aria-pressed={tool === k} disabled={locked} title={B[k].d} onClick={() => pickTool(tool === k ? null : k)}>
                        <span className="n">{B[k].n}</span>
                        <span className={"c" + (poor && !locked ? " no" : "")}>{costText(B[k].cost)}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            {next ? (
              <>
                <h2>Lên {ERA_NAMES[c.era + 1]}</h2>
                <ul className="goal">
                  <li className={c.pop >= next.pop ? "met" : ""}><span>Dân số</span><span>{Math.min(c.pop, next.pop)}/{next.pop}</span></li>
                  {RES.filter((r) => next.cost[r]).map((r) => (
                    <li key={r} className={c.res[r] >= next.cost[r]! ? "met" : ""}><span>{RN[r]}</span><span>{fmt(Math.min(c.res[r], next.cost[r]!))}/{next.cost[r]}</span></li>
                  ))}
                </ul>
                <button className="wide primary" disabled={!reqMet(c) || busy} onClick={() => act({ type: "advance" })}>
                  {reqMet(c) ? `Bước sang ${ERA_NAMES[c.era + 1]}` : "Chưa đủ điều kiện"}
                </button>
              </>
            ) : (
              <>
                <h2>{c.templeAt ? "Kỳ quan đã đứng" : "Xây Đền Sông Mẹ"}</h2>
                <p className="muted small">
                  {c.templeAt ? `Đền hoàn thành ${stamp(c, c.templeAt).toLowerCase()}. Tiếp tục nâng cấp để leo bảng xếp hạng.` : `Cần ${costText(B.temple.cost)}, xây ${fmtDur(buildMs("temple", 1))}. Nhớ xây thêm Kho để đủ sức chứa.`}
                </p>
              </>
            )}
          </div>

          <div className="panel">
            <h2>Bảng xếp hạng</h2>
            <ol className="board-list">
              {rows.map((r, i) => (
                <li key={i} className={r.me ? "me" : ""}>
                  <span className="rk">{i + 1}</span>
                  <span className="nm">{r.name}{r.temple ? " ★" : ""}</span>
                  <span className="muted small">{ERA_NAMES[r.era].replace("Thời ", "")} · {r.pop} dân</span>
                  <span className="sc">{fmt(r.score)}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="panel">
            <h2>Biên niên</h2>
            <ol className="log">
              {c.log.map((l, i) => (
                <li key={i} className={l.cls ?? ""}><span className="t">{stamp(c, l.at)}</span>{l.msg}</li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </main>
  );
}
