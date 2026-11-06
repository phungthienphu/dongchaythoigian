"use client";

import { ReadFlights } from "@/lib/read-flights";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  B, BKEYS, CAP, GATHER_SPEED, LVL_MULT, HOUR, POP_GROWTH_PER_HOUR, ERA_NAMES, ERA_REQ, F, HL, MAX_LVL, O, RES, RN, R, SEASONS, SEASON_MS, TERRAIN, UKEYS, UNITS, W, G,
  availableForWork, isScout, raidPhase, civiliansInDanger, gatherFoodPerHour, storageLevel, upkeepRates, isRock, mineralResource, depositCapacity, speedBuildCost, envoyCount, envoysAway, ENVOY_NAMES, ERA_NAMES as ERAS, buildingName, campStrength, MAX_LVL as TOP_LVL, campById, hallLevel, hasControl, levelCap,
  armyCap, armyUsed, buildingCost, trainingCost, builders, busyBuilders, buildMs, canPlace, cheb, costText, derive, idx, levelCost, marchMs, repairCost,
  armyStagingTiles, expeditionPlan, marchSupplies, marchLogistics, farmCapacity, farmRemaining, farmTendCost, reqMet, seasonIndexAt, settle, stamp, stats, troopCount, troopPower, workersAt,
  type Action, type BKey, type City, type Derived, type Person, type ResKey, type TaskInput, type Troops, type UKey,
} from "@/lib/engine";
import { MAX_ZOOM, camView, clampCam, drawCity, drawThumb, fitView, focusOn, pickHomeSoldier, pickVillageTarget, screenToCell, zoomAt, type Cam, type View } from "./draw";
import { Crowd } from "./villagers";
import { expeditionReadiness } from "@/lib/expedition-readiness";
import ExpeditionReadiness from "./ExpeditionReadiness";
import WorldMap from "./WorldMap";
import FriendSearch from "./FriendSearch";
import HowToPlay from "./HowToPlay";
import { buildAvailability } from "@/lib/build-availability";
import { placementHint, placementTiles } from "@/lib/build-placement";
import BattleView from "./BattleView";
import BattleReports from "./BattleReports";
import DiplomacyMessages, { diplomacyText } from "./DiplomacyMessages";
import { useDiplomacy } from "./useDiplomacy";
import CaravanNoticeLink from "./CaravanNoticeLink";
import DockPanel from "./DockPanel";
import AutoAssignPanel from "./AutoAssignPanel";
import EraStorageNotice from "./EraStorageNotice";
import WorkforcePanel from "./WorkforcePanel";
import FrontierStatus from "./FrontierStatus";
import {HungerNotice,HungryVillager} from "./HungerStatus";
import MarketPanel from "./MarketPanel";
import { useMarket } from "./useMarket";
import { useWars } from "./useWars";
import { OptimisticCityQueue } from "@/lib/optimistic-city";
import type { Nation } from "@/lib/world";

const VISIT_VIEW = { hover: null, selected: null, tool: null, picked: new Set<number>() };

type Cell = { x: number; y: number };
type Row = { name: string; score: number; era: number; pop: number; temple: boolean; me: boolean };
type Panel = "market" | "shop" | "army" | "people" | "era" | "log" | "rank" | "control" | "friends";
type Me = { user: { id: string; name: string; picture?: string; email: string; friendCode: string; hasCity: boolean } | null; friends: { id: string; name: string; picture?: string; online: boolean; city: { id: string; name: string; era: number; pop: number; score: number } | null }[] };

function fmtDur(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h) return `${h} giờ ${m} phút`;
  if (m) return `${m} phút ${String(sec).padStart(2, "0")} giây`;
  return `${sec} giây`;
}
const fmt = (n: number) => Math.floor(n).toLocaleString("vi-VN");

function tileDesc(c: City, D: Derived, i: number) {
  if (!c.seen[i]) return "Vùng chưa khám phá";
  const parts = [TERRAIN[c.t[i]]];
  if (c.t[i] === G && D.fert[i]) parts.push("đất phù sa");
  if(c.t[i]!==R && D.prot[i]) parts.push("được đê bảo vệ khỏi lũ mùa thu");
  else if(D.rd[i]===1 && c.t[i]!==R) parts.push("vùng lũ");
  const cap = depositCapacity(c.t[i]);
  if (cap) parts.push(`còn ${fmt(cap - (c.dep[i] ?? 0))} ${c.t[i] === F ? "gỗ" : RN[mineralResource(c.t[i])].toLowerCase()}`);
  return parts.join(", ");
}

const campAt = (c: City, i: number) => c.camps.find((k) => k.at === i && c.seen[k.at]);

/** What a click on this tile means for the people you have picked. */
function taskFor(c: City, i: number): { task: TaskInput; label: string } | null {
  const herd = c.herds.find((h) => h.n >= 1 && c.seen[h.at] && cheb(h.at, i) <= 2);
  if (herd) return { task: { t: "hunt", herd: herd.id }, label: herd.kind === "deer" ? "Săn đàn hươu" : "Săn đàn lợn rừng" };
  if (!c.seen[i]) return { task: { t: "explore", to: i }, label: "Đi thám hiểm tới đây" };
  if (campAt(c, i)) return null;
  const b = c.b[i];
  if (b) return B[b.k].jobs && b.lvl >= 1 && !b.flooded && !b.burned ? { task: { t: "work", at: i }, label: `Làm ở ${buildingName(c,b.k)}` } : null;
  if (c.t[i] === F) return { task: { t: "chop", at: i }, label: "Chặt cây ở đây" };
  if (c.t[i] === HL) return { task: { t: "mine", at: i }, label: "Đào đá ở đây" };
  if (isRock(c.t[i])) return { task: { t: "mine", at: i }, label: `Đào ${RN[mineralResource(c.t[i])].toLowerCase()} ở đây` };
  if (c.t[i] === R) return null;
  return { task: { t: "move", to: i }, label: "Chạy tới đây" };
}

function taskLabel(c: City, p: Person) {
  const tk = p.task;
  switch (tk.t) {
    case "work": return `Làm ở ${buildingName(c,c.b[tk.at]?.k ?? "hut")}`;
    case "chop": return "Chặt cây";
    case "mine": return `Đào ${RN[mineralResource(c.t[tk.at])].toLowerCase()}`;
    case "hunt": return c.herds.find((h) => h.id === tk.herd)?.kind === "boar" ? "Săn lợn rừng" : "Săn hươu";
    case "explore": return "Đi thám hiểm";
    default: return isScout(p) ? "Khám phá · chờ lệnh" : tk.t === "idle" && tk.at !== undefined ? "Đứng theo lệnh" : p.assignment === "manual" ? "Nghỉ · chờ lệnh" : "Rảnh";
  }
}
function haulDetail(p: Person, at: number, storage: City["res"], stock: City["res"]) {
  const h = p.haul;
  if (!h) return isScout(p) && p.task.t === "idle" ? "Nhóm khám phá đang chờ lệnh, không tự đổi việc." : p.task.t === "idle" ? "Chờ lệnh — chọn dân rồi bấm nơi cần đến." : p.task.t === "explore" ? "Đang dò đường trong làng." : "Chưa làm được: kiểm tra tài nguyên gần trại và đường đi; có thể giao việc khác.";
  const left = fmtDur(h.nextAt - at), name = h.resource ? RN[h.resource].toLowerCase() : "hàng";
  if (h.resting) return `${h.phase === "travel" ? "Đang đi theo lệnh" : "Đã nghỉ"} · vẫn giữ ${fmt(h.carried)} ${name} vì kho đầy. Dùng bớt tài nguyên hoặc xây Kho.`;
  if (h.phase === "travel") return `Đang tới chỗ làm · còn ${left}`;
  if (h.phase === "return") return `Đang mang ${fmt(h.carried)} ${name} về · tới nơi sau ${left}`;
  if (h.phase === "unload") return h.resource && stock[h.resource] >= storage[h.resource]
    ? `Kho đầy · còn giữ ${fmt(h.carried)} ${name}. Xây thêm Kho hoặc dùng bớt tài nguyên.`
    : `Đang nộp ${fmt(h.carried)} ${name} · còn ${left}`;
  return `Đang gom ${name} · đủ ${h.capacity} sau ${left}, rồi mang về nộp`;
}

function sameTarget(p: Person, tk: TaskInput) {
  const a = p.task;
  if (a.t !== tk.t) return false;
  if (a.t === "hunt" && tk.t === "hunt") return a.herd === tk.herd;
  if ((a.t === "work" || a.t === "chop" || a.t === "mine") && "at" in tk) return a.at === tk.at;
  return false;
}

/* ---------- icons ---------- */
const ICON = {
  food: <svg viewBox="0 0 24 24"><path d="M3 12h18a9 9 0 0 1-18 0z" fill="#c98b4a" /><path d="M5 12c1-3 3.5-4.5 7-4.5S18 9 19 12z" fill="#f4ecd6" /></svg>,
  wood: <svg viewBox="0 0 24 24"><rect x="3" y="8" width="16" height="8" rx="4" fill="#8a5a2b" /><ellipse cx="19" cy="12" rx="2.6" ry="4" fill="#e0b27a" /></svg>,
  stone: <svg viewBox="0 0 24 24"><path d="M4 17l3-8 6-3 6 5 1 6z" fill="#b9b2a2" /><path d="M13 6l6 5 1 6h-7z" fill="#948d7e" /></svg>,
  copper: <svg viewBox="0 0 24 24"><path d="M3 16l4-6h10l4 6z" fill="#d9813a" /><path d="M7 10h10l-2-3H9z" fill="#f0a868" /></svg>,
  gold: <svg viewBox="0 0 24 24"><path d="M3 17l4-8h10l4 8z" fill="#f1c64f"/><path d="M7 9l3-3h7v3z" fill="#fff1a1"/></svg>,
  diamond: <svg viewBox="0 0 24 24"><path d="M3 9l5-5h8l5 5-9 12z" fill="#70dbe7"/><path d="M3 9h18M8 4l4 17 4-17" fill="none" stroke="#e6ffff"/></svg>,
  pop: <svg viewBox="0 0 24 24"><circle cx="12" cy="7" r="3.5" fill="#f1c9a0" /><path d="M5 21c0-5 3-8 7-8s7 3 7 8z" fill="#c9503e" /></svg>,
  build: <svg viewBox="0 0 24 24"><path d="M4 20l8-8" stroke="#8a5a2b" strokeWidth="2.5" strokeLinecap="round" /><rect x="10" y="4" width="10" height="6" rx="1" fill="#d6a03f" transform="rotate(45 15 7)" /></svg>,
  army: <svg viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" fill="#b04130" /><path d="M12 6l4 1.7V11c0 3-1.7 5-4 6.3z" fill="#e2b240" /></svg>,
  shop: <svg viewBox="0 0 24 24"><path d="M3 10h18l-2-5H5z" fill="#c94c38" /><path d="M5 10h14v9H5z" fill="#d9b98a" /><path d="M10 13h4v6h-4z" fill="#6b4526" /></svg>,
  era: <svg viewBox="0 0 24 24"><path d="M4 20h16l-3-6h-3l-2-4-2 4H7z" fill="#d6a03f" /><path d="M12 3v7" stroke="#f0c766" strokeWidth="2" /></svg>,
  log: <svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2" fill="#e8d8b0" /><path d="M8 8h8M8 12h8M8 16h5" stroke="#8a6a42" strokeWidth="1.6" /></svg>,
  world: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#2f6f8f" /><path d="M6 9c2-1 3 1 5 0s2-3 4-2 2 3 1 4-3 0-3 2 1 3-1 4-4-1-5-3-3-2-1-5z" fill="#7fae4c" /></svg>,
  friends: <svg viewBox="0 0 24 24"><circle cx="8.5" cy="8" r="3" fill="#f1c9a0" /><circle cx="15.5" cy="8" r="3" fill="#d9a77a" /><path d="M2.5 19c0-4 2.7-6 6-6s6 2 6 6z" fill="#3f6fb0" /><path d="M9.5 19c0-4 2.7-6 6-6s6 2 6 6z" fill="#5c9a8a" /></svg>,
  rank: <svg viewBox="0 0 24 24"><path d="M7 4h10v5a5 5 0 0 1-10 0z" fill="#e2b240" /><path d="M10 14h4v3h3v3H7v-3h3z" fill="#b4842c" /></svg>,
};
type IconKey = keyof typeof ICON;
const Icon = ({ k }: { k: IconKey }) => <span className="ic" aria-hidden="true">{ICON[k]}</span>;

function Thumb({ city, D, k }: { city: City; D: Derived; k: BKey }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (ref.current) drawThumb(ref.current, city, D, k); }, [k, city.era]);
  return <canvas ref={ref} className="thumb" aria-hidden="true" />;
}

function Stepper({ value, max, onChange, label }: { value: number; max: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button onClick={() => onChange(Math.max(0, value - 1))} aria-label="Bớt">−</button>
      <span>{value}</span>
      <button onClick={() => onChange(Math.min(max, value + 1))} aria-label="Thêm">+</button>
    </div>
  );
}

function FriendsPanel({ me, reload, onVisit }: { me: Me; reload: () => Promise<void>; onVisit: (id:string)=>void }) {
  const [code, setCode] = useState("");
  const [note, setNote] = useState<{ text: string; err?: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [armed, setArmed] = useState<string | null>(null);
  if (!me.user) {
    return (
      <>
        <p className="small">Đăng nhập để có tài khoản cố định, kết bạn và cử sứ giả sang thăm làng bạn bè.</p>
        <p className="muted small">Thành phố bạn đang chơi sẽ được gắn vào tài khoản ở lần đăng nhập đầu tiên.</p>
        <a className="google" href="/api/auth/login">Đăng nhập bằng Google</a>
      </>
    );
  }
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/friends", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
    const data = await res.json();
    if (!res.ok) { setNote({ text: data.error, err: true }); return; }
    setNote({ text: `Đã kết bạn với ${data.name}.` });
    setCode("");
    reload();
  };
  const remove = async (id: string) => {
    if (armed !== id) { setArmed(id); return; }
    await fetch("/api/friends", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
    setArmed(null);
    reload();
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(me.user!.friendCode); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked: the code is selectable */ }
  };
  return (
    <>
      <div className="mycode">
        <span className="muted small">Mã mời của bạn</span>
        <b className="code">{me.user.friendCode}</b>
        <button onClick={copy}>{copied ? "Đã chép" : "Chép mã"}</button>
      </div>
      <form className="addfriend" onSubmit={add}>
        <label htmlFor="friendcode" className="muted small">Nhập mã của bạn bè</label>
        <div className="row">
          <input id="friendcode" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6} placeholder="VD: K7M2QX" autoComplete="off" />
          <button className="primary" type="submit" disabled={code.trim().length !== 6}>Kết bạn</button>
        </div>
        {note && <p className={"small " + (note.err ? "err" : "ok")}>{note.text}</p>}
      </form>
      <p className="muted small">Xem làng bạn bè không tiết lộ vị trí. Cần sứ giả dò tìm để hiện nước của họ trên bản đồ thế giới.</p>
      <FriendSearch onChanged={reload} />
      <h3>Bạn bè ({me.friends.length})</h3>
      {me.friends.length ? (
        <ul className="friends">
          {[...me.friends].sort((a, b) => Number(b.online) - Number(a.online)).map((f) => (
            <li key={f.id}>
              <span className="pic">{f.picture ? <img src={f.picture} alt="" referrerPolicy="no-referrer" /> : <span className="av">{f.name[0]}</span>}<i className={f.online ? "on" : ""} /></span>
              <div className="fi">
                <b>{f.name}</b>
                <span className="muted small">{f.city ? `${f.city.name} · ${ERA_NAMES[f.city.era].replace("Thời ", "")} · ${f.city.pop} dân · ${fmt(f.city.score)} điểm` : "Chưa dựng làng"}</span>
                <span className="muted small">{f.online ? "Đang online" : "Offline"}</span>
              </div>
              {f.city && <button onClick={() => onVisit(f.city!.id)}>Xem làng</button>}
              <button className="link" onClick={() => remove(f.id)}>{armed === f.id ? "Bấm lần nữa để xoá" : "Xoá"}</button>
            </li>
          ))}
        </ul>
      ) : <p className="muted small">Chưa có bạn nào. Gửi mã mời của bạn cho bạn bè để họ nhập vào đây.</p>}
      <form method="post" action="/api/auth/logout" onSubmit={async (e) => { e.preventDefault(); await fetch("/api/auth/logout", { method: "POST" }); location.reload(); }}>
        <button type="submit" className="link">Đăng xuất</button>
      </form>
    </>
  );
}

function ControlPanel(props: {
  c: City; t: number; busy: boolean; control: boolean; hallLv: number; groups: Map<string, Person[]>; homePower: number;
  rate: Record<ResKey, number>; act: (a: Action) => Promise<boolean>; pickGroup: (ids: number[]) => void; attackAll: (camp: number) => void;
}) {
  const { c, t, busy, control, hallLv, groups, homePower, rate, act } = props;
  const [tab, setTab] = useState<"people" | "auto" | "alarm" | "army">("people");
  if (!control) {
    return (
      <>
        <p className="small">Đình làng cấp <b>{hallLv}/{TOP_LVL}</b>. Các công trình khác chỉ nâng được tới cấp {hallLv}.</p>
        <p className="muted small">Nâng Đình làng lên cấp {TOP_LVL} để mở trung tâm điều khiển: bảng quản lý toàn làng, tự động giao việc, kẻng báo động và lệnh quân toàn bản đồ. Lên Thời đồ sắt cũng cần Đình cấp {TOP_LVL}.</p>
      </>
    );
  }
  const camps = c.camps.filter((k) => c.seen[k.at] && !k.cleared).sort((a, b) => cheb(a.at, c.camp) - cheb(b.at, c.camp));
  return (
    <>
      <div className="tabs" role="tablist">
        {([["people", "Dân làng"], ["auto", "Tự động"], ["alarm", "Báo động"], ["army", "Lệnh quân"]] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={"tab" + (tab === k ? " on" : "")} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === "people" && (
        <>
          <ul className="units">
            {RES.map((r) => <li key={r}><span>{RN[r]}</span><b className={rate[r] < 0 ? "danger" : "ok"}>{rate[r] >= 0 ? "+" : ""}{fmt(rate[r])}/giờ</b></li>)}
          </ul>
          <WorkforcePanel c={c} busy={busy} act={act} pickGroup={props.pickGroup}/>
          <h3>Theo việc</h3>
          <ul className="units train">
            {[...groups.entries()].sort((a, b) => b[1].length - a[1].length).map(([label, ps]) => (
              <li key={label}>
                <div><b>{label}</b> <span className="muted small">· {ps.length} người</span><div className="muted small">{ps.map((p) => p.name).join(", ")}</div></div>
                <div className="tb"><button onClick={() => props.pickGroup(ps.map((p) => p.id))}>Chọn nhóm</button></div>
              </li>
            ))}
          </ul>
        </>
      )}
      {tab === "auto" && <AutoAssignPanel c={c} busy={busy} act={act}/>}
      {tab === "alarm" && (
        (c.raid || c.raidEncounter) ? (
          <>
            <p className="small"><b className="danger">Man rợ ⚔ {c.raid?.power ?? c.raidEncounter!.power}</b> {raidPhase(c,t)==="warning"?`tới sau ${fmtDur(c.raid!.at-t)}`:raidPhase(c,t)==="enter"?"đang tiến vào làng":raidPhase(c,t)==="fight"?"đang giao chiến":"đang rút lui"}. Quân ở nhà ⚔ {fmt(homePower)}.</p>
            <p className="muted small">Đánh kẻng để chuẩn bị phòng thủ (+25% sức thủ); nếu thua chỉ mất 12% tài nguyên thay vì 25%. Dân vẫn làm việc, chỉ tự trú ẩn trong 60 giây cuối trước khi địch tới.</p>
            {c.raid && raidPhase(c,t)==="warning" && <button className="primary wide" disabled={busy || !!c.alarm} onClick={() => act({ type: "alarm" })}>{c.alarm ? "Đã đánh kẻng" : "Đánh kẻng báo động"}</button>}
          </>
        ) : <p className="muted small">Yên bình. Khi trinh sát thấy man rợ kéo đến, bạn sẽ có {Math.round(30)} phút để đánh kẻng.</p>
      )}
      {tab === "army" && (
        <>
          <p className="small">Quân ở nhà: <b>{troopCount(c.army)}</b> lính · ⚔ {fmt(homePower)}</p>
          <h3>Trại man rợ đã thấy</h3>
          {camps.length ? (
            <ul className="units train">
              {camps.map((k) => (
                <li key={k.id}>
                  <div><b className="danger">⚔ {campStrength(k)}</b> <span className="muted small">· cách {cheb(k.at, c.camp)} ô · đi {expeditionPlan(c,k.at) ? fmtDur(expeditionPlan(c,k.at)!.duration) : "chưa có lối"}</span><div className="muted small">{costText(k.loot)}</div></div>
                  <div className="tb"><button disabled={busy || !troopCount(c.army)} onClick={() => props.attackAll(k.id)}>Đánh</button></div>
                </li>
              ))}
            </ul>
          ) : <p className="muted small">Chưa thấy trại nào. Cho người đi thám hiểm.</p>}
          <h3>Đoàn quân đang đi</h3>
          {c.exps.length ? (
            <ul className="units train">
              {c.exps.map((e) => (
                <li key={e.id}>
                  <div><b>{troopCount(e.units)} lính</b> <span className="muted small">· {e.recalled ? `đang quay về, còn ${fmtDur(e.back - t)}` : t < e.arrive ? `tới trại ⚔ ${campById(c,e.camp) ? campStrength(campById(c,e.camp)!) : "?"} sau ${fmtDur(e.arrive - t)}` : !e.resolved ? `đang giao chiến · địch còn ${troopCount(e.combat?.defenders ?? {})} quân` : `${e.won ? "thắng" : "thua"}, về sau ${fmtDur(e.back - t)}`}</span></div>
                  <div className="tb">{!e.resolved && <button disabled={busy} onClick={() => act({ type: "recall", exp: e.id })}>Gọi về</button>}</div>
                </li>
              ))}
            </ul>
          ) : <p className="muted small">Không có đoàn nào ngoài kia.</p>}
        </>
      )}
    </>
  );
}

export default function Game() {
  const [loading, setLoading] = useState(true);
  const [readNotice, setReadNotice] = useState({ key: "", at: 0 });
  const [needsName, setNeedsName] = useState(false);
  const [name, setName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [, setVersion] = useState(0);
  const [tool, setTool] = useState<BKey | null>(null);
  const [selected, setSelected] = useState<Cell | null>(null);
  const [herdSel, setHerdSel] = useState<number | null>(null);
  const [hover, setHover] = useState<Cell | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [assignN, setAssignN] = useState(1);
  const [send, setSend] = useState<Troops>({});
  const [panel, setPanel] = useState<Panel | null>(null);
  const [shopEra, setShopEra] = useState(1);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [me, setMe] = useState<Me>({ user: null, friends: [] });
  const [busy, setBusy] = useState(false);
  const [pickedSoldier, setPickedSoldier] = useState<string | null>(null);
  const [guardEditing, setGuardEditing] = useState(false);
  const [battleOpen, setBattleOpen] = useState<string | null>(null);
  const [armDemolish, setArmDemolish] = useState(false);

  const reads = useRef(new ReadFlights());
  const panelRef = useRef(panel); panelRef.current = panel;
  const cityRef = useRef<City | null>(null);
  const actionQueue = useRef<OptimisticCityQueue | null>(null);
  const [saving, setSaving] = useState(false);
  const dRef = useRef<Derived | null>(null);
  const offsetRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<View>(fitView(800, 500));
  const camRef = useRef<Cam>({ zoom: 1, px: 0, py: 0 });
  const focusedRef = useRef(false);
  const crowdRef = useRef(new Crowd());
  // visiting another village: its state, derived data and crowd, shown instead of ours
  const visitRequest = useRef(0);
  const visitRef = useRef<{ id: string; name: string; ownerName: string | null; city: City; D: Derived; crowd: Crowd } | null>(null);
  const [visiting, setVisiting] = useState<{ id: string; name: string; ownerName: string | null; era: number } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [worldOpen, setWorldOpen] = useState(false);
  const [nations, setNations] = useState<Nation[]>([]);
  // dev-only handle for inspecting villagers from the browser console
  if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") (window as unknown as { __game?: unknown }).__game = { crowd: crowdRef.current, city: () => cityRef.current, view: () => camView(fitRef.current, camRef.current) };
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const dragRef = useRef<{ sx: number; sy: number; moved: boolean; pinch: number } | null>(null);
  const renderPausedRef = useRef(false);
  renderPausedRef.current=worldOpen || !!battleOpen || helpOpen;
  const viewRef = useRef({ hover, selected, tool, picked, pickedSoldier });
  viewRef.current = { hover, selected, tool, picked, pickedSoldier };

  const now = () => Date.now() + offsetRef.current;
  const bump = () => setVersion((v) => v + 1);

  const accept = useCallback((data: { state: City; serverNow: number; name?: string }) => {
    offsetRef.current = data.serverNow - Date.now();
    const publish = (state: City) => {
      cityRef.current = state;
      dRef.current = derive(state);
      crowdRef.current.sync(state);
      setSaving(actionQueue.current?.isPending ?? false);
      bump();
    };
    if (!actionQueue.current) {
      actionQueue.current = new OptimisticCityQueue({
        state: data.state, now: () => Date.now() + offsetRef.current,
        onState: publish, onError: (text) => setMsg({ text, err: true }),
        send: async (action, requestId) => {
          const res = await fetch("/api/city/action", {
            method: "POST", signal: AbortSignal.timeout(15_000),
            headers: { "content-type": "application/json", "x-action-id": requestId }, body: JSON.stringify(action),
          });
          const response = await res.json();
          if (response.serverNow) offsetRef.current = response.serverNow - Date.now();
          if (!res.ok && !response.error) throw new Error("Không lưu được thao tác.");
          return response;
        },
        onUncertain: async () => {
          const res = await fetch("/api/city", { cache: "no-store", signal: AbortSignal.timeout(15_000) });
          if (!res.ok) throw new Error("Không tải được làng.");
          const response = await res.json();
          offsetRef.current = response.serverNow - Date.now();
          return response.state;
        },
      });
      publish(data.state);
    } else {
      const accepted=actionQueue.current.setAuthoritative(data.state);
      if(data.name)setName(data.name);
      return accepted;
    }
    if (data.name) setName(data.name);
    return true;
  }, []);

  const loadCity = useCallback(() => reads.current.run("city", async () => {
    try {
    if (actionQueue.current?.isPending) return;
    const generation = actionQueue.current?.version;
    const res = await fetch("/api/city", { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (res.status === 404) { setNeedsName(true); setLoading(false); return; }
    if (!res.ok) { const data=await res.json().catch(()=>({})); setMsg({ text: data.error ?? "Không tải được thành phố. Thử kết nối lại.", err: true }); setLoading(false); return; }
    const data = await res.json();
    if (actionQueue.current && (actionQueue.current.isPending || generation !== actionQueue.current.version)) return;
    accept(data);
    setShopEra(data.state.era);
    setNeedsName(false);
    setLoading(false);
    } catch { setMsg({text:"Mất kết nối khi tải làng. Hãy tải lại trang.",err:true});setLoading(false); }
  }), [accept]);


  const loadWorld = useCallback(() => reads.current.run("world", async () => {
    try {
    const res = await fetch("/api/world", { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (res.ok) setNations((await res.json()).nations);
    else setMsg({ text: "Không tải được danh sách các nước. Hãy mở lại bản đồ.", err: true });
    } catch { setMsg({text:"Mất kết nối khi tải bản đồ thế giới.",err:true}); }
  }), []);

  const diplomacy = useDiplomacy(!loading && !needsName, () => { void loadCity(); void loadWorld(); });
  const [marketTarget,setMarketTarget]=useState<string>();
  const market = useMarket(!loading && !needsName && !!me.user?.hasCity, panel === "market" || worldOpen, () => { void loadCity(); }, panel === "market",marketTarget);
  const war = useWars(!loading && !needsName && !!me.user?.hasCity, () => { void loadCity(); void diplomacy.refresh(); void market.refresh(); });
  useEffect(()=>{if(panel==="log")void diplomacy.refresh();},[panel,diplomacy.refresh]);

  const sharedLocations=diplomacy.messages.filter(m=>m.side==="host"&&m.decision==="accepted").map(m=>m.id).join("|");
  useEffect(() => { if (worldOpen) void loadWorld(); }, [worldOpen, loadWorld, sharedLocations]);

  const envoySchedule = (cityRef.current?.trips ?? []).map(tr => `${tr.id}:${tr.target}:${tr.arrived ? tr.back : tr.arrive}`).join("|");
  useEffect(() => {
    const trips=cityRef.current?.trips ?? [];
    if(!trips.length) return;
    const deadline=Math.min(...trips.map(tr=>tr.arrived?tr.back:tr.arrive));
    const timer=setTimeout(() => { void loadCity().then(() => loadWorld()); },Math.max(500,deadline-(Date.now()+offsetRef.current)+500));
    return () => clearTimeout(timer);
  },[envoySchedule,loadCity,loadWorld]);

  const loadVisit = useCallback((id: string, first: boolean) => reads.current.run(`visit:${id}`, async () => {
    const request = ++visitRequest.current;
    try {
      const res = await fetch(`/api/visit/${id}`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
      const data = await res.json();
      if (request !== visitRequest.current) return;
      if (!res.ok) {
        setMsg({ text: data.error ?? "Không xem được làng này.", err: true });
        visitRef.current = null; setVisiting(null);
        return;
      }
      const prev = visitRef.current;
      const crowd = prev && prev.id === id ? prev.crowd : new Crowd();
      const D = derive(data.state);
      crowd.sync(data.state);
      visitRef.current = { id, name: data.name, ownerName: data.ownerName, city: data.state, D, crowd };
      setVisiting({ id, name: data.name, ownerName: data.ownerName, era: data.state.era });
      if (first) {
        const f = fitRef.current, st = data.state as City;
        focusOn(f, camRef.current, (st.camp % W) + 0.5, Math.floor(st.camp / W) + 0.5, Math.min(MAX_ZOOM, 60 / f.TW));
      }
    } catch {
      if (request === visitRequest.current) setMsg({ text: "Mất kết nối khi tải làng. Thử lại sau.", err: true });
    }
  }), []);

  const loadMe = useCallback(() => reads.current.run("me", async () => {
    try {
    const res = await fetch("/api/me", { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (res.ok) setMe(await res.json());
    } catch { /* Retain the last known identity until the next refresh. */ }
  }), []);

  const loadBoard = useCallback(() => reads.current.run("board", async () => {
    try {
    const res = await fetch("/api/leaderboard", { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (res.ok) setRows((await res.json()).rows);
    } catch { /* Retain the current leaderboard; opening it again retries. */ }
  }), []);

  useEffect(() => {
    void loadCity(); void loadMe();
    const authErr = new URLSearchParams(location.search).get("auth");
    if (authErr) { setMsg({ text: "Đăng nhập Google không thành công, thử lại.", err: true }); history.replaceState(null, "", "/"); }
    const tick = setInterval(() => {
      const c = cityRef.current;
      if (!c) return;
      actionQueue.current?.advance(now());
      const vis = visitRef.current;
      if (vis) { if (!vis.city.battleId) settle(vis.city, now()); vis.D = derive(vis.city); vis.crowd.sync(vis.city); }
      bump();
    }, 1000);
    const refreshVisible = () => {
      if (document.visibilityState !== "visible") return;
      void loadCity(); void loadMe(); void diplomacy.refresh();
      if (panelRef.current === "rank") void loadBoard();
    };
    const sync = setInterval(refreshVisible, 60_000);
    const foreground = () => {
      if (document.visibilityState !== "visible") return;
      refreshVisible();
      const v = visitRef.current; if (v) void loadVisit(v.id, false);
    };
    document.addEventListener("visibilitychange", foreground);
    window.addEventListener("online", foreground);
    // while visiting, pick up the owner's latest orders every few seconds
    const visitSync = setInterval(() => { const v = visitRef.current; if (v && document.visibilityState === "visible") void loadVisit(v.id, false); }, 5_000);
    return () => { clearInterval(tick); clearInterval(sync); clearInterval(visitSync); document.removeEventListener("visibilitychange", foreground); window.removeEventListener("online", foreground); };
  }, [loadCity, loadBoard, loadMe, loadVisit, diplomacy.refresh]);

  useEffect(() => { if (panel === "rank") void loadBoard(); }, [panel, loadBoard]);

  // canvas sizing, camera and render loop
  useEffect(() => {
    const cv = canvasRef.current, frame = frameRef.current;
    if (!cv || !frame) return;
    const ctx = cv.getContext("2d")!;
    const rm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let dpr = 1;
    const resize = () => {
      const w = frame.clientWidth, h = frame.clientHeight;
      const cam = camRef.current, v = camView(fitRef.current, cam);
      const f = fitView(w, h);
      fitRef.current = f;
      const ca = (v.width / 2 - v.ox) / (v.TW / 2), cb = (v.height / 2 - v.oy) / (v.TH / 2);
      if (focusedRef.current) focusOn(f, cam, (ca + cb) / 2, (cb - ca) / 2, cam.zoom);
      else clampCam(f, cam);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(frame);
    resize();
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect(), cam = camRef.current;
      zoomAt(fitRef.current, cam, cam.zoom * Math.exp(-e.deltaY * 0.0018), e.clientX - r.left, e.clientY - r.top);
    };
    cv.addEventListener("wheel", onWheel, { passive: false });
    let raf = 0, last = 0;
    const loop = (t: number) => {
      if(document.hidden || renderPausedRef.current){last=t;raf=requestAnimationFrame(loop);return;}
      const vis = visitRef.current;
      const c = vis ? vis.city : cityRef.current, D = vis ? vis.D : dRef.current, crowd = vis ? vis.crowd : crowdRef.current;
      const dt = last ? Math.min(0.1, (t - last) / 1000) : 0;
      last = t;
      if (c && D) {
        if (!focusedRef.current) {
          const f = fitRef.current;
          focusOn(f, camRef.current, (c.camp % W) + 0.5, Math.floor(c.camp / W) + 0.5, Math.min(MAX_ZOOM, 60 / f.TW));
          focusedRef.current = true;
        }
        if (!rm) crowd.update(c, dt, now());
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const view = vis ? VISIT_VIEW : viewRef.current;
        drawCity(ctx, c, D, { v: camView(fitRef.current, camRef.current), now: now(), anim: rm ? 0 : t, villagers: crowd.list, fx: crowd.fx, chopping: crowd.chopping, ...view });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); cv.removeEventListener("wheel", onWheel); };
  }, [loading, needsName]);

  const act = async (a: Action) => {
    if (busy || cityRef.current?.battleId) return false;
    if (a.type === "assign" || a.type === "assignN") {
      const pos: Record<string, number> = {};
      for (const v of crowdRef.current.list) {
        if (v.id === null) continue;
        const x = Math.max(0, Math.min(W - 1, Math.floor(v.fx))), y = Math.max(0, Math.min(W - 1, Math.floor(v.fy)));
        pos[v.id] = idx(x, y);
      }
      a = { ...a, pos };
    }
    const result = actionQueue.current?.enqueue(a) ?? Promise.resolve(false);
    setSaving(actionQueue.current?.isPending ?? false);
    return result.finally(() => setSaving(actionQueue.current?.isPending ?? false));
  };

  const sendEnvoy = async (id?: string) => {
    const city = cityRef.current;
    if (!city || busy) return;
    if (actionQueue.current?.isPending) {
      setMsg({ text: "Đang lưu thao tác, hãy cử sứ giả sau giây lát." });
      return;
    }
    setBusy(true);
    setMsg({text:"Đang cử sứ giả…"});
    try {
      const res = await fetch("/api/world/envoy", {
        method: "POST", signal:AbortSignal.timeout(15000), headers: { "content-type": "application/json" },
        body: JSON.stringify(id ? { target: id } : { explore: true }),
      });
      const data = await res.json();
      const accepted=data.state ? accept(data) : false;
      if(!res.ok || data.error){setMsg({text:data.error??"Không cử được sứ giả. Hãy thử lại.",err:true});return;}
      if(!accepted)await loadCity();
      void loadWorld();
      setMsg({
        text: id ? `${ENVOY_NAMES[city.era]} đã lên đường. Tuyến đi hiển thị bằng nét đứt xanh trên bản đồ.` : "Sứ giả đang dò tìm nước mới. Có tin sau 2 phút; trở về sau 4 phút.",
      });
    } catch {
      setMsg({ text: "Chưa nhận được xác nhận cử sứ giả. Hãy tải lại làng để kiểm tra trước khi cử tiếp.", err: true });
    } finally { setBusy(false); }
  };

  const createCity = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/city", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: nameInput }) });
    const data = await res.json();
    if (!res.ok) { setMsg({ text: data.error ?? "Không tạo được thành phố.", err: true }); return; }
    accept(data);
    setNeedsName(false);
    loadBoard(); loadMe();
  };

  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const view = () => camView(fitRef.current, camRef.current);
  const cellAt = (e: { clientX: number; clientY: number }): Cell | null => {
    const p = local(e);
    return screenToCell(view(), p.x, p.y);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    ptrs.current.set(e.pointerId, p);
    if (ptrs.current.size === 1) dragRef.current = { sx: p.x, sy: p.y, moved: false, pinch: 0 };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const prev = ptrs.current.get(e.pointerId);
    if (!prev) {
      const cell = cellAt(e); viewRef.current.hover = cell;
      setHover((old) => old?.x === cell?.x && old?.y === cell?.y ? old : cell);
      return;
    }
    const p = local(e), cam = camRef.current, f = fitRef.current, d = dragRef.current;
    ptrs.current.set(e.pointerId, p);
    if (ptrs.current.size >= 2) {
      const [a, b] = [...ptrs.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (d) {
        if (d.pinch) zoomAt(f, cam, cam.zoom * (dist / d.pinch), (a.x + b.x) / 2, (a.y + b.y) / 2);
        d.pinch = dist; d.moved = true;
      }
      return;
    }
    if (d) {
      if (!d.moved && Math.hypot(p.x - d.sx, p.y - d.sy) < 6) return;
      if (!d.moved) { d.moved = true; prev.x = d.sx; prev.y = d.sy; }
      cam.px += p.x - prev.x; cam.py += p.y - prev.y;
      clampCam(f, cam);
      setHover(null);
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    ptrs.current.delete(e.pointerId);
    if (dragRef.current) dragRef.current.pinch = 0;
  };

  const zoomBy = (k: number) => {
    const f = fitRef.current, cam = camRef.current;
    zoomAt(f, cam, cam.zoom * k, f.width / 2, f.height / 2);
  };
  const focusHome = () => {
    const c = cityRef.current, f = fitRef.current;
    if (c) focusOn(f, camRef.current, (c.camp % W) + 0.5, Math.floor(c.camp / W) + 0.5, Math.min(MAX_ZOOM, 60 / f.TW));
  };

  const togglePick = (id: number, add: boolean) =>
    setPicked((old) => {
      const next = new Set(add ? old : []);
      if (add && old.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const trackCaravan = (id:string) => { setMarketTarget(id);setPanel("market");setWorldOpen(false); };
  const openPanel = (p: Panel | null) => setPanel((cur) => (cur === p ? null : p));

  const onClick = async (e: React.MouseEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.moved) return;
    if (visitRef.current) return; // looking only
    const c = cityRef.current;
    if (!c) return;
    const p = local(e);
    if (guardEditing) {
      const cell = cellAt(e); if (!cell) return;
      const posts = c.guardPosts ?? [];
      const exists = posts.some((p) => p.x === cell.x && p.y === cell.y);
      void act({ type: "setGuardPosts", posts: exists ? posts.filter((p) => p.x !== cell.x || p.y !== cell.y) : [...posts, cell] });
      return;
    }
    if (tool) {
      const cell = cellAt(e);
      if (!cell) return;
      const ok = await act({ type: "build", k: tool, x: cell.x, y: cell.y });
      if (ok) {
        if(cityRef.current && buildAvailability(cityRef.current,tool).capped)pickTool(null);
        setMsg({ text: `Thợ bắt đầu xây ${buildingName(c, tool)}.` });
      }
      return;
    }
    if (pickedSoldier) {
      const cell=cellAt(e);if(!cell)return;
      if(await act({type:"moveSoldier",id:pickedSoldier,...cell}))setMsg({text:"Lính đang tới vị trí đã chọn. Bấm ô khác để đổi lệnh; Esc để bỏ chọn."});
      return;
    }
    const soldier = pickHomeSoldier(view(),c,now(),p.x,p.y);
    const buildingTarget=pickVillageTarget(view(),c,[],performance.now(),p.x,p.y);
    if(soldier && (buildingTarget?.type!=="building" || e.shiftKey || e.ctrlKey || e.metaKey)) {
      setPickedSoldier(soldier.id);setPicked(new Set());setSelected(null);setPanel(null);
      setMsg({text:`Đã chọn ${UNITS[soldier.u].n}. Bấm ô đất để điều quân. Esc để bỏ chọn.`});return;
    }
    const target = pickVillageTarget(view(),c,crowdRef.current.list,performance.now(),p.x,p.y,e.shiftKey||e.ctrlKey||e.metaKey);
    const vl = target?.type==="person" ? target.person : null;
    if (vl && vl.id !== null) {
      togglePick(vl.id, e.shiftKey || e.ctrlKey || e.metaKey);
      setSelected(null);
      setMsg({ text: "Bấm vào rừng, đồi, đàn thú, công trình hoặc vùng sương mù để giao việc. Giữ Shift để chọn thêm người." });
      return;
    }
    const herdId = target?.type==="herd" ? target.id : null;
    if (herdId !== null) {
      const h = c.herds.find((x) => x.id === herdId)!;
      const label = h.kind === "deer" ? "Săn đàn hươu" : "Săn đàn lợn rừng";
      if (picked.size) {
        const ids = [...picked];
        setPicked(new Set());
        const scouts=c.people.filter(p=>picked.has(p.id)).every(isScout);
        if (await act({ type: "assign", ids, task: scouts ? {t:"explore",to:h.at} : { t: "hunt", herd: herdId } })) { setMsg({ text: scouts ? `${ids.length} người tiếp tục khám phá, giữ nguyên nhóm.` : `${ids.length} người: ${label.toLowerCase()}.` }); setPicked(new Set()); }
        return;
      }
      setSelected(null); setHerdSel(herdId); setAssignN(1); setMsg(null);
      return;
    }
    const cell = target && (target.type==="building" || target.type==="cell") ? target.cell : null;
    if (!cell) return;
    const i = idx(cell.x, cell.y);
    if (picked.size && (!campAt(c, i) || c.people.filter(p=>picked.has(p.id)).every(isScout))) {
      const scouts=c.people.filter(p=>picked.has(p.id)).every(isScout);
      const tk = scouts ? {task:{t:"explore",to:i} as TaskInput,label:"Tiếp tục khám phá, giữ nguyên nhóm"} : taskFor(c, i);
      if (!tk) { setMsg({ text: "Không có việc gì để làm ở ô này.", err: true }); return; }
      const ids = [...picked];
      setPicked(new Set());
      if (await act({ type: "assign", ids, task: tk.task })) {
        setMsg({ text: `${ids.length} người: ${tk.label.toLowerCase()}.` });
        setPicked(new Set());
      }
      return;
    }
    setPicked(new Set());
    setHerdSel(null);
    viewRef.current.selected = cell;
    setSelected(cell);
    setAssignN(1);
    setArmDemolish(false);
    setMsg(null);
    if (campAt(c, i)) setSend({ ...c.army });
    if (c.b[i]?.k === "market") setPanel("market");
    if (c.b[i]?.k === "barracks") setPanel("army");
    if (c.b[i]?.k === "hall") setPanel("control");
  };

  const pickTool = (k: BKey | null) => {
    setPickedSoldier(null);
    setGuardEditing(false);
    setTool(k);
    setSelected(null);
    setPicked(new Set());
    if (k) setPanel(null);
    setMsg(k ? { text: `${buildingName(cityRef.current!, k)} (${costText(buildingCost(k, cityRef.current!.era))}, ${fmtDur(buildMs(k, 1))}): ${B[k].d} Chuột phải hoặc Esc để bỏ chọn.` } : null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setPickedSoldier(null); setGuardEditing(false); setTool(null); setSelected(null); setHerdSel(null); setPicked(new Set()); setPanel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const noticeCity=cityRef.current;
  const noticeKey=noticeCity?`dong-notices:${noticeCity.seed}:${noticeCity.t0}`:"";
  const diplomaticNotices=diplomacy.messages.map(m=>({caravanId:undefined as string|undefined,at:m.decidedAt??m.requestedAt??m.arrive,msg:diplomacyText(m),cls:"good"}));
  const latestNoticeAt=Math.max(0,...(noticeCity?.log??[]).map(l=>l.at),...diplomaticNotices.map(l=>l.at));
  useEffect(()=>{
    if(!noticeKey)return;
    let at=0;try{at=Number(localStorage.getItem(noticeKey))||0;}catch{}
    setReadNotice({key:noticeKey,at});
  },[noticeKey]);
  useEffect(()=>{
    if(panel!=="log"||!noticeKey)return;
    setReadNotice({key:noticeKey,at:latestNoticeAt});
    try{localStorage.setItem(noticeKey,String(latestNoticeAt));}catch{}
  },[panel,noticeKey,latestNoticeAt]);
  const c = cityRef.current, D = dRef.current;
  const t = now();
  const notices=[...(c?.log??[]),...diplomaticNotices].sort((a,b)=>b.at-a.at);

  if (loading) return <main className="wrap"><p className="muted">Đang tải thành phố…</p></main>;

  if (needsName || !c || !D) {
    return (
      <main className="wrap start">
        <h1>Dòng Sông Thời Đại</h1>
        <p className="lede">Dựng một khu định cư bên sông và đưa nó từ thời đồ đá lên thời đồ sắt. Giao việc cho dân làng, săn thú, khám phá vùng đất, luyện quân phá trại man rợ. Thành phố vẫn chạy khi bạn rời đi.</p>
        {!me.user && (
          <p className="small">Đã có thành phố? <a className="google" href="/api/auth/login">Đăng nhập bằng Google</a> để chơi tiếp trên máy này.</p>
        )}
        <form onSubmit={createCity} className="startform">
          <label htmlFor="cityname">Đặt tên thành phố</label>
          <input id="cityname" value={nameInput} onChange={(e) => setNameInput(e.target.value)} maxLength={24} placeholder="Ví dụ: Bến Phù Sa" autoFocus />
          <button type="submit" className="primary">Dựng trại</button>
        </form>
        {msg && <p className={msg.err ? "err" : "muted"}>{msg.text}</p>}
      </main>
    );
  }

  const st = stats(c, D, t), upkeep=upkeepRates(c.era);
  const si = seasonIndexAt(c, t), season = si % 4;
  const nextSeasonIn = c.t0 + (si + 1) * SEASON_MS - t;
  const busyN = busyBuilders(c), maxB = builders(c);
  const idle = c.people.filter(availableForWork);
  const populationStatus = c.battleId ? "Tạm dừng do trận đánh" : c.res.food <= 0 ? "Dân đang đói" : c.people.length >= st.housing ? "Cần thêm nhà" : `+1 dân sau ${fmtDur((1-c.popAcc) / (POP_GROWTH_PER_HOUR * (1+(c.res.wood>0?st.fires:0))) * HOUR)}`;
  const hasFoodWorker = c.people.some(p => p.task.t === "hunt" || p.task.t === "work" && ["gather","farm","wheel"].includes(c.b[p.task.at]?.k ?? ""));
  const goal = !hasFoodWorker ? { text: "1. Kiếm thức ăn: bấm Trại hái lượm → Giao người rảnh, hoặc chọn dân rồi bấm đàn thú.", panel: "people" as Panel }
    : c.people.length >= st.housing ? { text: "2. Tăng dân: mở Cửa hàng → xây Lều. Còn chỗ ở và đủ ăn thì khoảng 1 phút có thêm dân.", panel: "shop" as Panel }
    : !c.people.some(p => p.task.t === "chop") ? { text: "3. Lấy gỗ: chọn dân rảnh → bấm rừng. Gom khoảng 10 giây rồi dân mang 10 gỗ về nộp.", panel: "people" as Panel }
    : { text: `Làng đang phát triển · ${populationStatus}. Bấm Dân làng để xem từng chuyến hàng.`, panel: "people" as Panel };
  const cap = armyCap(c), used = armyUsed(c), homePower = troopPower(c.army);

  let status: { text: string; err?: boolean } | null = msg;
  if (hover && tool) {
    const bad = canPlace(c, D, tool, hover.x, hover.y);
    status = bad ? { text: `${buildingName(c, tool)}: ${bad}`, err: true } : { text: `${buildingName(c, tool)}: bấm để xây. Ô: ${tileDesc(c, D, idx(hover.x, hover.y))}.` };
  } else if (hover && picked.size) {
    const tk = taskFor(c, idx(hover.x, hover.y));
    status = tk ? { text: `Bấm để giao ${picked.size} người: ${tk.label.toLowerCase()}.` } : { text: "Không có việc ở ô này.", err: true };
  } else if (hover && !msg) {
    const i = idx(hover.x, hover.y), b = c.b[i], camp = campAt(c, i);
    const herd = c.herds.find((h) => c.seen[h.at] && cheb(h.at, i) <= 2 && h.n >= 1);
    status = { text: camp ? `Trại man rợ, sức mạnh ${campStrength(camp)}${camp.cleared ? " (đã bị phá)" : ""}. Bấm để xem và xuất quân.` : `${b ? buildingName(c, b.k) + (b.lvl ? ` cấp ${b.lvl}` : " (đang xây)") + ". " : ""}${herd ? `Đàn ${herd.kind === "deer" ? "hươu" : "lợn rừng"} ${Math.floor(herd.n)} con. ` : ""}${tileDesc(c, D, i)}.` };
  }

  const selI = selected ? idx(selected.x, selected.y) : -1;
  const sel = selected ? c.b[selI] : undefined;
  const selCamp = selected ? campAt(c, selI) : undefined;
  const campReadiness=selCamp?expeditionReadiness(c,selCamp.at,send):null;
  const campPlan=campReadiness?.plan??null;
  const campSupply=campPlan?marchSupplies(send,campPlan.duration,c.era):null;
  const campLogistics=campPlan?marchLogistics(send,campPlan.duration):null;
  const selTask: { task: TaskInput; label: string } | null = !selected || selCamp ? null
    : sel ? (B[sel.k].jobs && sel.lvl >= 1 && !sel.flooded && !sel.burned ? { task: { t: "work", at: selI }, label: `Làm ở ${buildingName(c,sel.k)}` } : null)
    : taskFor(c, selI);
  const herd = herdSel !== null ? c.herds.find((h) => h.id === herdSel) : undefined;
  const herdTask: TaskInput | null = herd ? { t: "hunt", herd: herd.id } : null;
  const hunters = herdTask ? c.people.filter((p) => sameTarget(p, herdTask)) : [];
  const onTarget = selTask ? c.people.filter((p) => sameTarget(p, selTask.task)) : [];
  const next = ERA_REQ[c.era + 1];
  const sendPower = troopPower(send);
  const hallLv = hallLevel(c), control = hasControl(c);
  const groups = new Map<string, Person[]>();
  for (const p of c.people) { const k = taskLabel(c, p); groups.set(k, [...(groups.get(k) ?? []), p]); }

  const bubbles: { k: Panel; icon: IconKey; label: string; badge?: number | string }[] = [
    { k: "shop", icon: "shop", label: "Cửa hàng" },
    { k: "army", icon: "army", label: "Quân đội", badge: troopCount(c.army) || undefined },
    { k: "people", icon: "pop", label: "Dân làng", badge: idle.length ? `${idle.length} rảnh` : undefined },
    { k: "era", icon: "era", label: "Thời đại", badge: reqMet(c) ? "!" : undefined },
    { k: "log", icon: "log", label: "Thông báo", badge: readNotice.key===noticeKey ? notices.filter(l=>l.at>readNotice.at).length||undefined : undefined },
    { k: "rank", icon: "rank", label: "Xếp hạng" },
    { k: "market", icon: "shop", label: "Chợ", badge: market.newOrders ? "Có hàng mới" : market.data?.caravans.filter(c=>c.mine&&c.status!=="completed").length || undefined },
    { k: "friends", icon: "friends", label: "Bạn bè", badge: me.friends.filter((f) => f.online).length || undefined },
    ...(hallLv ? [{ k: "control" as Panel, icon: "era" as IconKey, label: "Đình làng", badge: c.raid ? "!" : undefined }] : []),
  ];

  return (
    <main className={"game" + (visiting ? " visiting" : "")}>
      <div className="mapframe" ref={frameRef}>
        <canvas
          ref={canvasRef}
          aria-label="Bản đồ. Lăn chuột để phóng to, kéo để di chuyển, bấm vào dân để chọn."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => setHover(null)}
          onClick={onClick}
          onContextMenu={(e) => { e.preventDefault(); pickTool(null); setPicked(new Set()); }}
        />
      </div>

      <header className="hud-top">
        <div className="brand">
          <div className="titlerow">
            <h1>{name}</h1>
            <button onClick={()=>setHelpOpen(true)}>Cách chơi</button>
            {me.user ? (
              <button className="acct" onClick={() => openPanel("friends")} title={me.user.email}>
                {me.user.picture ? <img src={me.user.picture} alt="" referrerPolicy="no-referrer" /> : <span className="av">{me.user.name[0]}</span>}
                <span>{me.user.name}</span>
              </button>
            ) : <a className="google small" href="/api/auth/login">Đăng nhập Google</a>}
          </div>
          <div className="when">
            <span className="era">{ERA_NAMES[c.era]}</span>
            <span className={"date" + (season === 2 ? " flood" : "")}>
              Năm {Math.floor(si / 4) + 1} · {SEASONS[season]}{season === 2 ? " (lũ)" : ""} · còn {fmtDur(nextSeasonIn)}
            </span>
          </div>
          <FrontierStatus city={c} now={t}/>
        </div>
        <div className="chips">
          <div className="chip" tabIndex={0} title={`Dân số hiện tại / sức chứa nhà ở. Đầy chỗ thì dân ngừng tăng; xây hoặc nâng cấp nhà. Mỗi dân tiêu hao ${upkeep.civilian.food/6} lương thực / 10 phút và ${upkeep.civilian.wood} gỗ / giờ ở thời đại này, kể cả khi rảnh. Hết lương thực thì ngừng tăng dân; đói kéo dài dân bỏ đi.`}>
            <Icon k="pop" />
            <div className="cv">
              <span className="v">{c.people.length}<small>/{st.housing}</small></span>
              <span className={"d" + (c.people.length >= st.housing ? " down" : "")} title={populationStatus}>{populationStatus}</span>
            </div>
          </div>
          <div className="chip" tabIndex={0} title="Số thợ xây đang bận / tổng số thợ xây. Ví dụ 0/2 nghĩa là có thể xây hoặc nâng cấp đồng thời thêm 2 công trình.">
            <Icon k="build" />
            <div className="cv"><span className="v">{busyN}/{maxB}</span><span className="d">đang bận</span></div>
          </div>
          <div className="chip" tabIndex={0} title={`Số quân đang ở làng / sức chứa trại lính. Mỗi quân tiêu hao ${upkeep.soldier.food/6} lương thực / 10 phút và ${upkeep.soldier.wood} gỗ / giờ ở thời đại này. Quân đã mang lương thực hành quân không bị trừ khẩu phần lần nữa tại kho. Dòng ⚔ là tổng sức tấn công của quân ở nhà.`}>
            <Icon k="army" />
            <div className="cv"><span className="v">{troopCount(c.army)}<small>/{cap}</small></span><span className="d">⚔ {fmt(homePower)}</span></div>
          </div>
          {RES.map((r) => {
            const rate = r === "copper" ? st.copperRate : r === "wood" ? st.rate.wood - st.woodUse : r === "stone" ? st.rate.stone-st.stoneUse : st.rate[r];
            const pct = Math.min(100, (c.res[r] / st.storage[r]) * 100);
            const waiting = c.people.some(p => p.haul?.resource === r && p.haul.carried > 0 && st.storage[r]-c.res[r] < p.haul.carried);
            return (
              <div className="chip" key={r} tabIndex={0} title={`${RN[r]} trong kho: ${fmt(c.res[r])} / ${fmt(st.storage[r])} sức chứa. Thanh ngang biểu thị mức đầy kho. Dòng thu nhập là số ròng ước tính, không phải cộng tài nguyên tự động; dân phải mang hàng về nộp.${r === "food" ? ` Nuôi ${st.upkeep.civilians} dân và ${st.upkeep.foodSoldiers} quân chưa có dự trữ: ${Number((st.upkeep.food/60).toFixed(2))} thực/phút (${st.upkeep.food/6} thực/10 phút). Trại hái lượm dùng thêm tối đa ${st.gatherFoodUse/60} thực/phút khi sản xuất (2 thực/phút mỗi trại được kênh có nước tưới trong 1 ô, nếu không là 4), cộng riêng với sức ăn dân/quân. Trừ dần cả khi offline; khẩu phần hành quân đã trả không bị tính lần nữa.` : r === "wood" ? ` Dân và quân dùng ${st.upkeep.wood} gỗ/giờ cho sinh hoạt và bảo dưỡng, kể cả quân đi xa; bếp dùng ${st.fireWoodUse/6} gỗ/10 phút, lò đúc dùng thêm tối đa ${(st.woodUse-st.fireWoodUse-st.wheelWoodUse)/60} gỗ/phút, cối nước dùng thêm tối đa ${st.wheelWoodUse/60} gỗ/phút khi sản xuất. Xây, nâng cấp và luyện quân còn trừ riêng chi phí. Hết gỗ, lò đúc và cối nước tạm ngừng sản xuất; dân vẫn giữ việc.` : r === "stone" ? ` Lò đúc tiêu hao tối đa ${st.stoneUse/60} đá/phút; thiếu gỗ hoặc đá thì giảm/ngừng đúc. Xây dựng và nâng cấp còn trừ chi phí riêng.` : " Xây dựng, nâng cấp và luyện quân có thể tiêu tốn tài nguyên."}` }>
                <Icon k={r} />
                <div className="cv">
                  <span className={"v" + (pct >= 100 ? " full" : "")}>{fmt(c.res[r])}<small>/{fmt(st.storage[r])}</small></span>
                  <span className="bar"><i style={{ width: pct + "%" }} /></span>
                  <span title="Thu nhập ròng ước tính sau tiêu hao; hàng chỉ vào kho khi dân mang về nộp." className={"d" + (rate > 0.05 ? " up" : rate < -0.05 ? " down" : "")}>{waiting ? "Kho chật · dân chờ nộp" : `${rate >= 0 ? "+" : ""}${r==='food'?(rate/60).toLocaleString('vi-VN',{maximumFractionDigits:2}):fmt(rate)}/${r==='food'?'phút':'giờ'}*`}</span>
                </div>
              </div>
            );
          })}
        </div>
      </header>

      <div className="zoom" role="group" aria-label="Điều khiển bản đồ">
        <button onClick={() => zoomBy(1.5)} aria-label="Phóng to">+</button>
        <button onClick={() => zoomBy(1 / 1.5)} aria-label="Thu nhỏ">−</button>
        <button onClick={focusHome} aria-label="Về trại" title="Về trại">⌂</button>
        <button onClick={() => { camRef.current = { zoom: 1, px: 0, py: 0 }; }} aria-label="Xem toàn bản đồ" title="Xem toàn bản đồ">⤢</button>
      </div>

      {herd && herdTask && (
        <div className="hud-card">
          <button className="x" onClick={() => setHerdSel(null)} aria-label="Đóng">×</button>
          <h2>{herd.kind === "deer" ? "Đàn hươu" : "Đàn lợn rừng"}</h2>
          <p className="small">Còn <b>{Math.floor(herd.n)}</b>/{herd.max} con · mỗi con cho khoảng 50 thịt · tự sinh sôi lại theo thời gian.</p>
          <div className="assign">
            <Stepper value={assignN} max={Math.max(1, idle.length)} label="Số người" onChange={(n) => setAssignN(Math.max(1, n))} />
            <button className="primary" disabled={busy || !idle.length || herd.n < 1} onClick={() => act({ type: "assignN", n: assignN, task: herdTask })}>
              {herd.n < 1 ? "Đàn đã bị săn hết" : idle.length ? `Giao ${Math.min(assignN, idle.length)} người đi săn` : "Không ai rảnh"}
            </button>
          </div>
          {hunters.length > 0 && (
            <ul className="people compact">
              {hunters.map((p) => (
                <li key={p.id}><span>{p.name}<HungryVillager city={c} person={p}/><small className="haul-detail">{haulDetail(p,t,st.storage,c.res)}</small></span><button className="link" disabled={busy} onClick={() => act({ type: "assign", ids: [p.id], task: { t: "idle" } })}>Cho nghỉ</button></li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* selection card */}
      {selected && (sel || selTask || selCamp) && (
        <div className="hud-card">
          <button className="x" onClick={() => setSelected(null)} aria-label="Đóng">×</button>
          {selCamp ? (
            <>
              <h2>Trại man rợ</h2>
              {selCamp.cleared ? (
                <p className="muted small">Đã bị phá. Chúng sẽ dựng lại sau {fmtDur((selCamp.respawnAt ?? t) - t)}, mạnh hơn.</p>
              ) : (
                <>
                  <p className="small">Sức mạnh: <b className="danger">⚔ {campStrength(selCamp)}</b> · Chiến lợi phẩm: {costText(selCamp.loot)}</p>
                  {campReadiness&&<ExpeditionReadiness city={c} units={send} readiness={campReadiness} onDock={()=>{setSelected(null);setShopEra(2);setPanel("shop");}}/>}
                  {campPlan&&<p className="muted small">Hành quân {fmtDur(campPlan.duration)} mỗi chiều theo lối đi thực tế.</p>}
                  {troopCount(c.army) ? (
                    <>
                      <ul className="units">
                        {UKEYS.filter((u) => c.army[u]).map((u) => (
                          <li key={u}><span>{UNITS[u].n} <span className="muted">({c.army[u]})</span></span>
                            <Stepper value={send[u] ?? 0} max={c.army[u] ?? 0} label={UNITS[u].n} onChange={(n) => setSend({ ...send, [u]: n })} /></li>
                        ))}
                      </ul>
                      <p className="small">Quân gửi đi: <b className={sendPower >= campStrength(selCamp) ? "ok" : "danger"}>⚔ {fmt(sendPower)}</b> {sendPower >= campStrength(selCamp) * 1.2 ? "· nhiều khả năng thắng" : sendPower >= campStrength(selCamp) * 0.8 ? "· ngang sức, có thể hao quân" : "· yếu hơn, dễ thua"}</p>
                      {campLogistics&&<p className="small">{campLogistics.long?`Đường xa, hiểm trở: dự kiến hao ${campLogistics.losses} chiến binh. Vận tải ${Math.round(campLogistics.transport*100)}%, quân y ${Math.round(campLogistics.medical*100)}%.`:"Chuyến ngắn, không hao quân do đường xa."}</p>}
                      <button className="primary wide" disabled={busy || !campPlan || !troopPower(send) || c.res.food<(campSupply?.food??0)} onClick={async () => { if(campLogistics?.long && (campLogistics.transport<1||campLogistics.medical<1) && !window.confirm(`Chuyến hành quân dài và hiểm trở. Thiếu hậu cần/quân y có thể tổn hại lực lượng; dự kiến hao ${campLogistics.losses} chiến binh. Vẫn xuất quân?`))return;if (await act({ type: "attack", camp: selCamp.id, units: send })) setSelected(null); }}>Xuất quân</button>
                    </>
                  ) : <p className="muted small">Chưa có quân ở nhà. Xây Trại lính trong Cửa hàng rồi luyện quân.</p>}
                </>
              )}
            </>
          ) : sel ? (
            <>
              <h2>{buildingName(c, sel.k)}{sel.lvl ? ` · cấp ${sel.lvl}` : ""}</h2>
              <p className="muted small">Kiến trúc {ERA_NAMES[c.era].toLowerCase()} · Lên thời đại tự đổi kiến trúc, không tự tăng cấp. Bấm nâng cấp để tăng công năng và trang bị; cấp tối đa theo Đình làng.</p>
              <p className="muted small">{B[sel.k].d}</p>
              {sel.k==='smelter'&&sel.lvl>=1&&<p className="small">Đủ 3 thợ: tối đa {B.smelter.prod!.copper!*GATHER_SPEED*LVL_MULT[sel.lvl]/60} đồng/phút trước thời gian vận chuyển; dùng {B.smelter.use!.wood!*LVL_MULT[sel.lvl]/60} gỗ + {B.smelter.use!.stone!*LVL_MULT[sel.lvl]/60} đá/phút. Nuôi 3 thợ thêm {3*upkeep.civilian.food/60} thực/phút và {3*upkeep.civilian.wood} gỗ/giờ. Giá bán do người chơi quyết định; tính cả các chi phí này khi định giá.</p>}
              {sel.k==='gather'&&sel.lvl>=1&&<p className="small">Phí vận hành: {gatherFoodPerHour(c,D,selI)/60} thực/phút khi sản xuất. {gatherFoodPerHour(c,D,selI)===120?'Đang được kênh có nước tưới.':'Chưa có kênh có nước tưới trong 1 ô; sát sông hoặc kênh cạn vẫn tính 4 thực/phút.'} Cộng riêng với sức ăn dân; không thu lúc đi giao hàng hoặc chờ kho đầy.</p>}
              {sel.k==='wheel'&&sel.lvl>=1&&c.res.wood<=0&&<p className="err small">Cối nước hết gỗ, tạm ngừng sản xuất. Bổ sung gỗ để dân tự làm tiếp; hàng đang mang vẫn được nộp kho.</p>}
              {sel.k==='canal'&&sel.lvl>=1&&<p className={D.wet[selI]?'small':'err small'}>{D.wet[selI]?'Kênh đang có nước, tưới cho đất xung quanh.':'Kênh cạn: mất đường nối tới sông, không còn tưới đất. Nối lại kênh để có nước hoặc dùng Phá dỡ bên dưới để gỡ từng đoạn.'}</p>}
              {sel.doneAt && <p className="small">{sel.lvl === 0 ? "Đang xây" : sel.storageUpgrade ? `Đang nâng ngăn ${RN[sel.storageUpgrade]}` : `Đang nâng lên cấp ${sel.lvl + 1}`}: còn {fmtDur(sel.doneAt - t)}</p>}
              {c.cropDamage?.tile===selI && c.cropDamage.until>t && <p className="err small">Ruộng bị thú rừng giẫm: năng suất còn 50%, phục hồi sau {fmtDur(c.cropDamage.until-t)}.</p>}
              {sel.doneAt && <button disabled={busy||c.res.diamond<speedBuildCost(sel,t)} onClick={()=>act({type:"speedBuild",...selected})}>Hoàn tất ngay · {speedBuildCost(sel,t)} kim cương (30 giây / viên)</button>}
              {(sel.flooded || sel.burned) && <p className="err small">{sel.damageCause==='earthquake'?"Hư hại do động đất, cần sửa để hoạt động lại.":sel.burned ? "Bị cháy, cần sửa để hoạt động lại." : "Bị ngập, không hoạt động."}</p>}
              {sel.k==="farm" && <>
                <p className={farmRemaining(sel)<=0?"err small":"small"}>Dinh dưỡng: {Math.ceil(farmRemaining(sel))}/{farmCapacity(sel)} · giảm theo lượng lương thực thực sự thu hoạch.</p>
                {sel.tendUntil ? <p className="small">Đang cải tạo & gieo lại: {fmtDur(sel.tendUntil-t)}</p> : <button disabled={busy || !!sel.doneAt || !!sel.burned || !!sel.flooded || farmRemaining(sel)>=farmCapacity(sel)} onClick={()=>act({type:"tendFarm",x:selI%W,y:Math.floor(selI/W)})}>Cải tạo & gieo lại · {costText(farmTendCost(sel,c.era))} · 30 giây</button>}
                {farmRemaining(sel)<=0 && <p className="err small">Ruộng bạc màu. Người đã giao đang nghỉ, cần cải tạo để tiếp tục thu hoạch.</p>}
              </>}
              {sel.k==="farm" && <p className="small">Đã giao {onTarget.length}/{B.farm.jobs} người ({onTarget.filter(p=>p.refuge).length} đang tránh địch): {onTarget.filter(p=>!p.refuge && p.haul?.phase==="work").length} đang làm trên ruộng; {onTarget.filter(p=>!p.refuge && p.haul?.phase!=="work").length} đang đi hoặc chở/chờ nộp hàng. Người về kho vẫn giữ chỗ, không cần cử thêm.</p>}
              {B[sel.k].jobs ? <p className="small">Người làm: <b>{workersAt(c, selI)}/{B[sel.k].jobs}</b>. {workersAt(c,selI) ? "Gom đủ một chuyến rồi mang về nộp; chỉ khi nộp xong kho mới tăng." : "Chưa có người làm nên chưa tạo tài nguyên. Bấm Giao người rảnh bên dưới."}</p> : null}
            </>
          ) : (
            <>
              <h2>{selTask!.label}</h2>
              <p className="muted small">{tileDesc(c, D, selI)}.</p>
            </>
          )}
          {selTask && (
            <div className="assign">
              <Stepper value={assignN} max={Math.max(1, idle.length)} label="Số người" onChange={(n) => setAssignN(Math.max(1, n))} />
              <button className="primary" disabled={busy || !idle.length} onClick={() => act({ type: "assignN", n: assignN, task: selTask.task })}>
                {idle.length ? `Giao ${Math.min(assignN, idle.length)} người rảnh` : "Không ai rảnh"}
              </button>
            </div>
          )}
          {onTarget.length > 0 && (
            <ul className="people compact">
              {onTarget.map((p) => (
                <li key={p.id}><span>{p.name}<HungryVillager city={c} person={p}/><small className="haul-detail">{haulDetail(p,t,st.storage,c.res)}</small></span><button className="link" disabled={busy} onClick={() => act({ type: "assign", ids: [p.id], task: { t: "idle" } })}>Cho nghỉ</button></li>
              ))}
            </ul>
          )}
          {sel && selected && (
            <div className="actions">
              {sel.k === "envoy" && sel.lvl >= 1 && <>
                <p className="small">Sứ giả riêng: {Math.max(0,envoyCount(c)-envoysAway(c))}/{envoyCount(c)} đang rảnh. Dân làng chỉ dò địa hình trong làng; tìm nước khác cần cử sứ giả.</p>
                <button className="primary" disabled={busy || saving || !envoyCount(c) || envoysAway(c)>=envoyCount(c)} onClick={()=>sendEnvoy()}>Cử sứ giả rảnh đi do thám · 2 phút</button>
                <button onClick={()=>{setWorldOpen(true);setPanel(null);}}>Xem hành trình trên bản đồ thế giới</button>
              </>}
              {sel.k==="barracks" && sel.lvl>=1 && !armyStagingTiles(c,1).length && <p className="err small">Trại lính bị bịt kín. Chừa lối đất nối ra ngoài, đặt cổng thay tường hoặc dỡ công trình chắn lối; quân không tự phá nhà mình.</p>}
              {["barracks","logistics","infirmary"].includes(sel.k) && sel.lvl >= 1 && <button className="primary" onClick={() => setPanel("army")}>Luyện quân</button>}
              {sel.k==="dock"&&sel.lvl>=1&&<DockPanel city={c} building={sel} now={t} busy={busy} onBuild={()=>{void act({type:"buildShip",...selected});}}/>}
              {sel.k === "market" && sel.lvl >= 1 && <button className="primary" onClick={()=>setPanel("market")}>Giao thương bằng đoàn xe</button>}
              {sel.k === "hall" && sel.lvl >= 1 && <button className="primary" onClick={() => setPanel("control")}>{control ? "Trung tâm điều khiển" : "Xem Đình làng"}</button>}
              {sel.k === "storehouse" && sel.lvl >= 1 && <div><p className="small">Nâng riêng từng ngăn +1.000 sức chứa. Mỗi Kho nâng một ngăn mỗi lần.</p>{RES.map(r=>{
                const lv=storageLevel(sel,r), cap=levelCap(c,"storehouse"), locked=lv>=cap;
                const reason=lv>=MAX_LVL?"Đã tối đa":locked?"Cần xây/nâng Đình làng":sel.doneAt?"Kho đang nâng cấp":sel.flooded||sel.burned?"Cần sửa Kho":"";
                return <div key={r}><p>{RN[r]} · cấp {lv} · {fmt(lv*1000)} chỗ{sel.storageUpgrade===r?` · đang nâng (${fmtDur((sel.doneAt??t)-t)})`:""}</p><button disabled={busy||!!reason} onClick={()=>act({type:"upgradeStorage",...selected,resource:r})}>{reason||`Nâng ${RN[r]} lên cấp ${lv+1} (+1.000) · ${costText(levelCost("storehouse",lv+1,c.era))} · ${fmtDur(buildMs("storehouse",lv+1))}`}</button></div>;
              })}</div>}
              {sel.doneAt && <button disabled={busy||c.res.diamond<speedBuildCost(sel,t)} onClick={()=>act({type:"speedBuild",...selected})}>Hoàn tất ngay · {speedBuildCost(sel,t)} kim cương (30 giây / viên)</button>}
              {(sel.flooded || sel.burned) && <button className="primary" disabled={busy} onClick={() => act({ type: "repair", ...selected })}>Sửa ({costText(repairCost(sel.k, sel.lvl, !!sel.burned, c.era))})</button>}
              {sel.k !== "storehouse" && B[sel.k].up && sel.lvl >= 1 && sel.lvl < MAX_LVL && sel.lvl >= levelCap(c, sel.k) && (
                <p className="muted small">{hallLv ? `Nâng Đình làng lên cấp ${sel.lvl + 1} để nâng tiếp.` : "Xây Đình làng (Thời đồ đồng) để nâng cấp công trình."}</p>
              )}
              {sel.k !== "storehouse" && B[sel.k].up && sel.lvl >= 1 && sel.lvl < MAX_LVL && sel.lvl < levelCap(c, sel.k) && !sel.doneAt && !sel.flooded && !sel.burned && (
                <button disabled={busy} onClick={() => act({ type: "upgrade", ...selected })}>
                  Lên cấp {sel.lvl + 1} ({costText(levelCost(sel.k, sel.lvl + 1, c.era))}, {fmtDur(buildMs(sel.k, sel.lvl + 1))})
                </button>
              )}
              <button disabled={busy} onClick={async () => {
                if (!armDemolish) { setArmDemolish(true); return; }
                if (await act({ type: "demolish", ...selected })) { setSelected(null); setMsg({ text: "Đã phá, thu lại một nửa vật liệu." }); }
                setArmDemolish(false);
              }}>{armDemolish ? "Bấm lần nữa để phá" : "Phá dỡ"}</button>
            </div>
          )}
        </div>
      )}

      {(c.raid || c.raidEncounter) && (
        <div className="raidbar" role="alert">
          <b>⚠ Man rợ ⚔ {c.raid?.power ?? c.raidEncounter!.power} · {raidPhase(c,t)==="warning"?"đang chuẩn bị tấn công":raidPhase(c,t)==="enter"?"đang tiến vào làng":raidPhase(c,t)==="fight"?"đang giao chiến":"đang rút lui"}</b>
          <span>{raidPhase(c,t)==="warning" ? `tới sau ${fmtDur(c.raid!.at-t)} · ${civiliansInDanger(c,t)?"dân đang tìm chỗ trú":"dân tiếp tục làm việc; tự trú khi còn 60 giây"}` : "Dân giữ chỗ trú tới khi toán quân rút khỏi làng"} · quân ở nhà ⚔ {fmt(homePower)}</span>
          {c.raid && raidPhase(c,t)==="warning" && (control ? (
            <button className="primary" disabled={busy || !!c.alarm} onClick={() => act({ type: "alarm" })}>{c.alarm ? "Đã đánh kẻng" : "Đánh kẻng"}</button>
          ) : <span className="muted small">Đình làng cấp 3 mới đánh kẻng được</span>)}
        </div>
      )}

      <div className="hud-bottom">
        <HungerNotice city={c} onFindFood={()=>openPanel("people")}/>
        {!tool && !picked.size && <button className="next-step" onClick={() => openPanel(goal.panel)}>{goal.text}</button>}
        {picked.size > 0 && (
          <div className="pickbar">
            <b>{picked.size} người đã chọn</b>
            <span>Bấm lên bản đồ để giao việc</span>
            <button disabled={busy} onClick={() => act({ type: "assign", ids: [...picked], task: { t: "idle" } }).then((ok) => { if (ok) setPicked(new Set()); })}>Cho nghỉ</button>
            <button onClick={() => setPicked(new Set())}>Bỏ chọn</button>
          </div>
        )}
        {pickedSoldier && <div className="pickbar"><b>Đang chọn lính</b><span>Bấm ô đất để di chuyển · Shift + bấm để chọn lính đứng trước nhà.</span><button onClick={()=>setPickedSoldier(null)}>Bỏ chọn</button></div>}
        {guardEditing && <div className="pickbar"><b>Đặt điểm gác · {c.guardPosts?.length ?? 0}/20</b><span>Bấm ô trống để thêm; bấm lại để bỏ.</span><button onClick={() => setGuardEditing(false)}>Xong</button></div>}
        {tool && (
          <div className="pickbar">
            <b>Đang xây {buildingName(c, tool)}</b>
            <span>Ô xanh: xây được · ô đỏ: không hợp lệ. {placementHint(tool)}</span>
            <button onClick={()=>{
              const allowed=placementTiles(c,D,tool);
              let best=-1,distance=Infinity;
              for(let i=0;i<W*W;i++)if(allowed(i)){const d=cheb(c.camp,i);if(d<distance){best=i;distance=d;}}
              if(best<0){setMsg({text:"Chưa có ô xây được: kiểm tra vật liệu, thợ rảnh, giới hạn công trình và điều kiện vị trí. "+placementHint(tool),err:true});return;}
              focusOn(fitRef.current,camRef.current,best%W+.5,Math.floor(best/W)+.5,Math.min(MAX_ZOOM,60/fitRef.current.TW));
              setHover({x:best%W,y:Math.floor(best/W)});
            }}>Tìm ô xây được</button>
            <button onClick={() => pickTool(null)}>Xong</button>
          </div>
        )}
        <div className={"status" + (status?.err ? " err" : "")}>{saving && <span className="save-state">Đang lưu… · </span>}{status?.text ?? "Bấm vào dân để chọn rồi bấm vào rừng, đồi, đàn thú hoặc sương mù để giao việc. Mở Cửa hàng để xây nhà."}</div>
      </div>

      {helpOpen && <HowToPlay onClose={()=>setHelpOpen(false)} />}
      {!worldOpen && !battleOpen && panel!=="log" && me.user && <BattleReports wars={war.wars} playerId={me.user.id} />}
      {battleOpen && <BattleView id={battleOpen} onClose={() => { setBattleOpen(null); void loadCity(); void war.refresh(); }} onSettled={() => { void loadCity(); void war.refresh(); }} />}
      {!worldOpen && !battleOpen && readNotice.key===noticeKey && notices[0]?.at>readNotice.at && panel!=="log" && <div className="war-alerts" role="status"><span>{notices[0].cls==="warn"?"⚠ ":"✉ "}{notices[0].msg}</span><button onClick={()=>openPanel("log")}>Xem thông báo</button><CaravanNoticeLink id={notices[0].caravanId} onTrack={trackCaravan}/></div>}
      {!worldOpen && !battleOpen && (war.wars.some((w) => w.status !== "completed") || war.error) && (
        <aside className="war-alerts" aria-live="polite">
          {war.error && <p className="small">{war.error}</p>}
          {war.wars.filter((w) => w.status !== "completed").map((w) => (
            <div key={w._id} className={w.side === "defender" ? "incoming" : ""}>
              <b>{w.side === "defender" ? `${w.attackerName} tiến đánh làng!` : `Đoàn quân tới ${w.defenderName}`}</b>
              <span className="small">{w.status === "marching" ? ` · tới sau ${fmtDur(w.arrive - t)}` : w.status === "returning" ? ` · về sau ${fmtDur((w.back ?? t) - t)}` : " · đang giao chiến"}</span>
              {w.status === "fighting" && <button onClick={() => { setBattleOpen(w._id); setPanel(null); }}>Chỉ huy trận</button>}
            </div>
          ))}
        </aside>
      )}
      {visiting && (
        <div className="visitbar">
          <b>Đang thăm {visiting.name}</b>
          <span>{visiting.ownerName ? `của ${visiting.ownerName} · ` : ""}{ERAS[visiting.era]} · cảnh làng đang chạy trực tiếp</span>
          <button onClick={() => { setWorldOpen(true); }}>Bản đồ thế giới</button>
          <button className="primary" onClick={() => { ++visitRequest.current; visitRef.current = null; setVisiting(null); focusHome(); }}>Về làng mình</button>
        </div>
      )}

      {worldOpen && (
        <WorldMap
          caravans={market.data?.caravans ?? []}
          onMarket={id=>{setMarketTarget(id);setWorldOpen(false);setPanel("market");}}
          nations={nations}
          signedIn={!!me.user}
          onFriendsChanged={async () => { await Promise.all([loadMe(), loadWorld()]); }}
          wars={war.wars}
          warEnabled={war.enabled}
          warStatus={war.status}
          warError={war.error}
          onRetryWar={()=>void war.refresh()}
          feedback={msg}
          onAttack={async (id, troops) => {
            if (busy || actionQueue.current?.isPending) { setMsg({ text: "Đang lưu thao tác, chờ giây lát trước khi xuất quân." }); return; }
            setBusy(true);
            try {
              const res = await fetch("/api/battles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ target: id, troops }) });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error ?? "Không xuất quân được.");
              setMsg({ text: "Đoàn quân đã lên đường." });
              void war.refresh(); await loadCity();
            } catch (e) { setMsg({ text: (e as Error).message, err: true }); }
            finally { setBusy(false); }
          }}
          city={c}
          now={now}
          busy={busy}
          onClose={() => setWorldOpen(false)}
          onEnvoy={sendEnvoy}
          onVisit={(id) => { setWorldOpen(false); setPanel(null); setSelected(null); setPicked(new Set()); setTool(null); loadVisit(id, true); }}
        />
      )}

      <nav className="bubbles" aria-label="Bảng điều khiển">
        <button className="bubble" onClick={() => { setWorldOpen(true); setPanel(null); }}>
          <Icon k="world" />
          <span className="bl">Thế giới</span>
          {(c.trips ?? []).length > 0 && <span className="badge">{(c.trips ?? []).length}</span>}
        </button>
        {bubbles.map((b) => (
          <button key={b.k} className="bubble" aria-pressed={panel === b.k} onClick={() => openPanel(b.k)}>
            <Icon k={b.icon} />
            <span className="bl">{b.label}</span>
            {b.badge !== undefined && <span className="badge">{b.badge}</span>}
          </button>
        ))}
      </nav>

      {panel && (
        <aside className="drawer" aria-label={bubbles.find((b) => b.k === panel)?.label}>
          <div className="dh">
            <h2>{bubbles.find((b) => b.k === panel)?.label}</h2>
            <button className="x" onClick={() => setPanel(null)} aria-label="Đóng">×</button>
          </div>
          <div className="db">
            {panel === "shop" && (
              <>
                <div className="tabs" role="tablist">
                  {[1, 2, 3].map((e) => (
                    <button key={e} role="tab" aria-selected={shopEra === e} className={"tab" + (shopEra === e ? " on" : "")} onClick={() => setShopEra(e)}>
                      {ERA_NAMES[e].replace("Thời ", "")}{e > c.era ? " 🔒" : ""}
                    </button>
                  ))}
                </div>
                {shopEra > c.era && <p className="muted small">Lên {ERA_NAMES[shopEra]} để mở các công trình này.</p>}
                <div className="shopgrid">
                  {BKEYS.filter((k) => B[k].era === shopEra).map((k) => {
                    const availability=buildAvailability(c,k),locked=availability.locked;
                    const poor = RES.some((r) => (buildingCost(k, Math.max(B[k].era,c.era))[r] ?? 0) > c.res[r]);
                    return (
                      <button key={k} className="shopcard" aria-pressed={tool === k} disabled={locked} title={availability.reason??undefined} onClick={() => pickTool(k)}>
                        <Thumb city={c} D={D} k={k} />
                        <span className="n">{buildingName(c, k)}</span>
                        {availability.limit!==undefined && <span className={availability.capped?"err small":"small"}>Đã đặt {availability.count}/{availability.limit}{availability.capped?" · Đã đủ giới hạn":""}</span>}
                        {availability.reason && <span className="ds">{availability.reason}</span>}
                        <span className={"c" + (poor && !locked ? " no" : "")}>{costText(buildingCost(k, Math.max(B[k].era,c.era)))}</span>
                        <span className="tm">⏱ {fmtDur(buildMs(k, 1))}</span>
                        <span className="ds">{B[k].d}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {panel === "army" && (
              <>
                <p className="small muted">Mỗi quân: {upkeep.soldier.food/6} thực / 10 phút + {upkeep.soldier.wood} gỗ / giờ. Khẩu phần hành quân trả trước; không tính hai lần tại kho.</p>
                {!cap ? (
                  <p className="small">Chưa có Trại lính. <button className="link" onClick={() => { setShopEra(1); setPanel("shop"); }}>Mở Cửa hàng để xây</button>.</p>
                ) : (
                  <p className="small">Sức chứa trại: <b>{used}/{cap}</b> · Quân ở nhà: <b>⚔ {fmt(homePower)}</b></p>
                )}
                <ul className="units train">
                  {UKEYS.map((u) => {
                    const U = UNITS[u], needsBuilding=U.building && !Object.values(c.b).some(b=>b.k===U.building && b.lvl>0 && !b.burned && !b.flooded), locked = U.era > c.era || !!needsBuilding;
                    return (
                      <li key={u} className={locked ? "locked" : ""}>
                        <div>
                          <b>{U.n}</b> <span className="muted small">· {c.army[u] ?? 0} ở nhà</span>
                          <div className="muted small">⚔ {U.atk} · ❤ {U.hp}{U.space > 1 ? ` · ${U.space} chỗ` : ""} · {costText(trainingCost(u, Math.max(U.era,c.era)))} · {fmtDur(U.sec * 1000)}</div>
                          <div className="muted small">{U.era>c.era ? `Mở ở ${ERA_NAMES[U.era]}` : needsBuilding ? `Cần xây ${B[U.building!].n}` : U.d}</div>
                        </div>
                        <div className="tb">
                          <button disabled={locked || !cap || busy} onClick={() => act({ type: "train", u, n: 1 })}>+1</button>
                          <button disabled={locked || !cap || busy} onClick={() => act({ type: "train", u, n: 5 })}>+5</button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {c.queue.length > 0 && (
                  <div><p className="small">Đang luyện {c.queue.length} lính · tiếp theo: {UNITS[c.queue[0].u].n} · xong sau {fmtDur(c.queue[0].doneAt - t)} · tất cả xong sau {fmtDur(c.queue[c.queue.length - 1].doneAt - t)}</p>
                    <progress aria-label={`Tiến độ luyện ${UNITS[c.queue[0].u].n}`} max={1} value={Math.max(0,Math.min(1,1-(c.queue[0].doneAt-t)/Math.max(1,c.queue[0].doneAt-(c.queue[0].startedAt ?? c.queue[0].doneAt-UNITS[c.queue[0].u].sec*1000))))} style={{width:"100%",accentColor:"var(--accent)"}} />
                  </div>
                )}
                <p className="muted small">Đánh nước khác: mở Thế giới, cử sứ giả thăm rồi chọn quân. Hai nước cần đăng nhập Google.</p>
                <h3>Phòng thủ làng</h3>
                <p className="muted small">Đặt tối đa 20 điểm gác. Lính ở nhà tự bảo vệ các điểm này khi bạn vắng mặt.</p>
                <button onClick={() => { setPickedSoldier(null); setGuardEditing(true); setTool(null); setPicked(new Set()); setSelected(null); setPanel(null); }}>Đặt điểm gác ({c.guardPosts?.length ?? 0}/20)</button>
                {!!c.guardPosts?.length && <button onClick={() => act({ type: "setGuardPosts", posts: [] })}>Xóa các điểm gác</button>}
                {(c.shieldUntil ?? 0) > t && <p className="ok small">Khiên bảo vệ còn {fmtDur(c.shieldUntil! - t)}. Xuất quân sẽ bỏ khiên.</p>}
                <h3>Xuất quân</h3>
                <p className="muted small">Bấm vào trại man rợ (biển ⚔ đỏ) trên bản đồ để chọn quân và tấn công. Khám phá thêm để tìm trại.</p>
                {c.exps.length > 0 && (
                  <ul className="exps">
                    {c.exps.map((e) => (
                      <li key={e.id}>
                        <b>{troopCount(e.units)} lính</b> · {t < e.arrive ? `đang hành quân, tới sau ${fmtDur(e.arrive - t)}` : !e.resolved ? `đang giao chiến · địch còn ${troopCount(e.combat?.defenders ?? {})} quân` : `${e.won ? "thắng" : "thua"}, về làng sau ${fmtDur(e.back - t)}`}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {panel === "people" && (
              <>
                <div className="ph">
                  <span className="small muted">{c.people.length} người · {idle.length} rảnh · {populationStatus}</span>
                  <button className="link" disabled={!idle.length} onClick={() => setPicked(new Set(idle.map((p) => p.id)))}>Chọn người rảnh</button>
                </div>
                <p className="small muted">Mỗi dân: {upkeep.civilian.food/6} thực / 10 phút + {upkeep.civilian.wood} gỗ / giờ, kể cả khi rảnh.</p>
                <WorkforcePanel c={c} busy={busy} act={act} pickGroup={(ids)=>{setPicked(new Set(ids));setPickedSoldier(null);setTool(null);setPanel(null);setMsg({text:`Đã chọn ${ids.length} người. Bấm bản đồ để ra lệnh; nhóm khám phá tiếp tục giữ vai trò khám phá.`});}}/>
                <ul className="people">
                  {c.people.map((p) => (
                    <li key={p.id}>
                      <button className={"person" + (p.task.t === "idle" ? " idle" : "")} aria-pressed={picked.has(p.id)}
                        onClick={(e) => togglePick(p.id, e.shiftKey || e.ctrlKey || e.metaKey)}>
                        <span className="nm">{p.name}</span>
                        <HungryVillager city={c} person={p}/><span className="tk">{taskLabel(c, p)}</span><small className="haul-detail">{haulDetail(p,t,st.storage,c.res)}</small>
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="muted small">Chọn người rồi bấm lên bản đồ để giao việc. Giữ Shift để chọn nhiều người.</p>
              </>
            )}

            {panel === "era" && (next ? (
              <>
                <h3>Lên {ERA_NAMES[c.era + 1]}</h3>
                <p className="small muted">Lên đời tự đổi kiến trúc và mở công trình. Cấp công trình vẫn nâng riêng bằng tài nguyên. Đời sau cần dân số, kho và hạ tầng lớn hơn.</p>
                <EraStorageNotice era={c.era} storage={st.storage} onOpenShop={()=>setPanel("shop")}/>
                <p className="small">Sau khi lên đời, nhu cầu nuôi dân và quân tăng gấp đôi: dân {upkeepRates(c.era+1).civilian.food/6} thực / 10 phút + {upkeepRates(c.era+1).civilian.wood} gỗ / giờ; quân {upkeepRates(c.era+1).soldier.food/6} thực / 10 phút + {upkeepRates(c.era+1).soldier.wood} gỗ / giờ mỗi người.</p>
                <ul className="goal">
                  {next.hall ? <li><span>Đình làng</span><span className="gbar"><i style={{ width: Math.min(100, (hallLv / next.hall) * 100) + "%" }} /></span><span>cấp {hallLv}/{next.hall}</span></li> : null}
                  <li><span>Dân số</span><span className="gbar"><i style={{ width: Math.min(100, (c.people.length / next.pop) * 100) + "%" }} /></span><span>{Math.min(c.people.length, next.pop)}/{next.pop}</span></li>
                  {RES.filter((r) => next.cost[r]).map((r) => (
                    <li key={r}><span>{RN[r]}</span><span className="gbar"><i style={{ width: Math.min(100, (c.res[r] / next.cost[r]!) * 100) + "%" }} /></span><span>{fmt(Math.min(c.res[r], next.cost[r]!))}/{next.cost[r]}</span></li>
                  ))}
                </ul>
                <button className="wide primary" disabled={!reqMet(c) || busy} onClick={() => act({ type: "advance" })}>
                  {reqMet(c) ? `Bước sang ${ERA_NAMES[c.era + 1]}` : "Chưa đủ điều kiện"}
                </button>
              </>
            ) : (
              <>
                <h3>{c.templeAt ? "Kỳ quan đã đứng" : "Xây Đền Sông Mẹ"}</h3>
                <p className="muted small">{c.templeAt ? `Đền hoàn thành ${stamp(c, c.templeAt).toLowerCase()}.` : `Cần ${costText(buildingCost("temple", Math.max(3,c.era)))}, xây ${fmtDur(buildMs("temple", 1))}. Nhớ xây thêm Kho để đủ sức chứa.`}</p>
              </>
            ))}

            {panel === "log" && (
              <>{me.user && <BattleReports wars={war.wars} playerId={me.user.id} history />}<DiplomacyMessages messages={diplomacy.messages} busy={diplomacy.busy} error={diplomacy.error} onAction={diplomacy.act} /><ol className="log">
                {[...c.log].sort((a,b)=>b.at-a.at).map((l, i) => (
                  <li key={i} className={l.cls ?? ""}><span className="t">{stamp(c, l.at)}</span>{l.msg}<CaravanNoticeLink id={l.caravanId} onTrack={trackCaravan}/></li>
                ))}
              </ol></>
            )}

            {panel === "control" && (
              <ControlPanel
                c={c} t={t} busy={busy} control={control} hallLv={hallLv} groups={groups} homePower={homePower}
                rate={{ ...st.rate, wood: st.rate.wood - st.woodUse, stone:st.rate.stone-st.stoneUse }}
                act={act}
                pickGroup={(ids) => { setPicked(new Set(ids)); setPickedSoldier(null); setTool(null); setPanel(null); setMsg({ text: `Đã chọn ${ids.length} người. Bấm lên bản đồ để giao việc mới.` }); }}
                attackAll={(campId) => { const camp=campById(c,campId);if(!camp)return;setSelected({x:camp.at%W,y:Math.floor(camp.at/W)});setSend({...c.army});setPanel(null);setMsg({text:"Kiểm tra lương thực và hỗ trợ trước khi xuất quân."}); }}
              />
            )}

            {panel === "market" && <MarketPanel initialTarget={marketTarget} market={market} city={c} now={t} onWorld={()=>{setWorldOpen(true);setPanel(null);}} />}
            {panel === "friends" && <FriendsPanel me={me} reload={loadMe} onVisit={(id) => { setPanel(null);setWorldOpen(false);setSelected(null);setPicked(new Set());setTool(null);void loadVisit(id,true); }} />}

            {panel === "rank" && (
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
            )}
          </div>
        </aside>
      )}
    </main>
  );
}

export type { UKey };
