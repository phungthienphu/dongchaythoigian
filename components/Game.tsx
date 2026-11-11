"use client";
import ZombiePanel from './ZombiePanel';
import {RenderQuality,mapDetailLow} from '@/lib/render-quality';
import {FrameProfile} from '@/lib/frame-profile';
import FrameProfilePanel from './FrameProfilePanel';
import {towerStats} from '@/lib/tower-balance';
import {defendingTowers} from '@/lib/engine';
import {pollutionBirth} from '@/lib/industry';
import EraOfflineSummary from './EraOfflineSummary';
import {canToggle,finalWonderError,serviceBonus} from '@/lib/modern';
import FinalWonderReview from './FinalWonderReview';
import {RELEASE_RULES,type EngineRules} from '@/lib/eras';

import EraCivicPanel,{EraCivicBuilding} from './EraCivicPanel';
import { ReadFlights } from "@/lib/read-flights";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  B, CAP, GATHER_SPEED, resourceUnlocked, LVL_MULT, HOUR, POP_GROWTH_PER_HOUR, ERA_NAMES, ERA_REQ, F, HL, MAX_LVL, O, RES, RN, R, SEASONS, SEASON_MS, TERRAIN, UKEYS, UNITS, W, G,
  dockRelocationPlan, buildingJobs,storageCapacity, availableForQuickAssign, quickAssignBlockedReason, isScout, taskResource, raidPhase, civiliansInDanger, gatherFoodPerHour, storageLevel, upkeepRates, isRock, mineralResource, depositCapacity, speedBuildQuote, envoyCount, envoysAway, ENVOY_NAMES, ERA_NAMES as ERAS, buildingName, campStrength, MAX_LVL as TOP_LVL, campById, hallLevel, hasControl, levelCap,
  armyCap, armyUsed, barracksCapacity, buildingCost, builders, busyBuilders, buildMs, canPlace, cheb, costText, derive, idx, levelCost, marchMs, repairCost,
  homeSoldiers, armyStagingTiles, expeditionPlan, marchSupplies, marchLogistics, farmCapacity, farmRemaining, farmTendCost, farmAutoStatus, reqMet, seasonIndexAt, settle, stamp, stats, troopCount, troopPower, workersAt,
  type Action, type BKey, type City, type Derived, type Person, type ResKey, type TaskInput, type Troops, type UKey,
} from "@/lib/engine";
import {mapRotationShortcut} from "./map-shortcuts";
import {captureMapTurn,paintMapTurn,type MapTurn} from "./map-transition";
import { createTreeCache, createLayerCache, projectWorld, rotateCam, screenToWorld, MAX_ZOOM, camView, clampCam, drawCity, fitView, focusOn, pickBuilding, pickHomeSoldier, pickVillageTarget, screenToCell, zoomAt, type Cam, type View } from "./draw";
import {drawSelectionBox,inSelection,selectionMoved,type SelectionDrag} from './map-selection';
import { Crowd } from "./villagers";
import { erasUpTo, RELEASED_ERA } from "@/lib/eras";
import { expeditionReadiness } from "@/lib/expedition-readiness";
import ExpeditionReadiness from "./ExpeditionReadiness";
import WorldMap from "./WorldMap";
import MapLoadingScreen from './MapLoadingScreen';
import { loadCityResponse } from '@/lib/city-loading';
import type { RecoveryProgress } from '@/lib/city-recovery';
import WelcomeScreen from "./WelcomeScreen";
import DisasterNotifications from "./DisasterNotifications";
import FriendSearch from "./FriendSearch";
import HowToPlay from "./HowToPlay";
import { buildAvailability } from "@/lib/build-availability";
import { placementHint, placementTiles } from "@/lib/build-placement";
import BattleView from "./BattleView";
import ArmyManagement from "./ArmyManagement";
import TroopTypePicker from './TroopTypePicker';
import DefenseOrientation from './DefenseOrientation';
import {defenseAxis,type DefenseOrientation as DefenseMode} from '@/lib/fortifications';
import ArmyRecruitment from "./ArmyRecruitment";
import EconomySummary from './EconomySummary';
import FarmGroupCare from './FarmGroupCare';
import FarmWorkers from './FarmWorkers';
import BattleReports from "./BattleReports";
import DiplomacyMessages, { diplomacyText } from "./DiplomacyMessages";
import { useDiplomacy } from "./useDiplomacy";
import CaravanNoticeLink from "./CaravanNoticeLink";
import DockPanel from "./DockPanel";
import BridgePanel from "./BridgePanel";
import DemolitionPanel from "./DemolitionPanel";
import AutoAssignPanel from "./AutoAssignPanel";
import EraStorageNotice from "./EraStorageNotice";
import WorkforcePanel from "./WorkforcePanel";
import FrontierStatus from "./FrontierStatus";
import {HungerNotice,HungryVillager} from "./HungerStatus";
import MarketPanel from "./MarketPanel";
import { useMarket } from "./useMarket";
import { useWars } from "./useWars";
import { OptimisticCityQueue } from "@/lib/optimistic-city";
import { BatchedCityQueue, SyncTransportError, type SaveStatus } from '@/lib/batched-city';
import { controlCityTab } from '@/lib/city-queue-storage';
import { BATCH_DELAY_MS, type BatchRequest, type BatchResponse, type CitySync } from '@/lib/city-sync';
import { SESSION_ENDED_EVENT, SESSION_ENDED_MESSAGE } from "@/lib/session-client";
import type { Nation } from "@/lib/world";

import {Icon} from "./GameIcon";
import GameHUD, {ResourceDetails} from "./GameHUD";
import GamePanel from "./GamePanel";
import ContextCard from "./ContextCard";
import BuildingCatalog from "./BuildingCatalog";
import EraRequirements from "./EraRequirements";
import MagicPanel,{ManaOverlayButton,type MagicTab} from "./MagicPanel";
import MagicBuildingCard from "./MagicBuildingCard";
import PeopleDirectory from "./PeopleDirectory";
import UnitPortrait from "./UnitPortrait";
import VillageAttention from "./VillageAttention";
import {villageAttention, type AttentionTarget} from "@/lib/game-attention";
import {useUnreadBattleReports} from "./useUnreadBattleReports";
import {PANEL_LABELS, panelGroup, type GamePanelKey} from "@/lib/game-ui";

const VISIT_VIEW = { hover: null, selected: null, tool: null, picked: new Set<number>() };

type Cell = { x: number; y: number };
type Row = { name: string; score: number; era: number; pop: number; temple: boolean; me: boolean };
type Panel = GamePanelKey;
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
    case "mine": return `Đào ${RN[taskResource(c,p)!].toLowerCase()}`;
    case "hunt": return c.herds.find((h) => h.id === tk.herd)?.kind === "boar" ? "Săn lợn rừng" : "Săn hươu";
    case "explore": return "Đi thám hiểm";
    default: return isScout(p) ? "Khám phá · chờ lệnh" : tk.t === "idle" && tk.at !== undefined ? "Đứng theo lệnh" : p.assignment === "manual" ? "Nghỉ · chờ lệnh" : "Rảnh";
  }
}
function haulDetail(p: Person, at: number, storage: City["res"], stock: City["res"],city:City) {
  const h = p.haul;
  if(!h && (p.task.t==='chop'||p.task.t==='mine'))return `Giữ nhóm ${RN[taskResource(city,p)!].toLowerCase()} · chờ nguồn đã khám phá có đường tới. Tự tìm lại mỗi 15 giây; hãy khám phá thêm hoặc mở lối đi.`;
  if(!h&&p.task.t==='work'){
    const b=city.b[p.task.at],d=b&&B[b.k];
    if(b&&d?.jobs&&!d.prod){
      if(b.off)return 'Công trình đang tắt; vẫn giữ người đã giao.';
      if(b.burned||b.flooded)return 'Công trình hư hại, chờ sửa hoặc nước rút.';
      if(p.pos===p.task.at)return `Đang trực tại ${buildingName(city,b.k)}. Xem bảng công trình để biết công suất và hiệu quả.`;
      return 'Chờ đường tới nơi làm; kiểm tra lối vào công trình.';
    }
  }
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

function Stepper({ value, max, onChange, label }: { value: number; max: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button onClick={() => onChange(Math.max(0, value - 1))} aria-label="Bớt">−</button>
      <span>{value}</span>
      <button onClick={() => onChange(Math.min(max, value + 1))} aria-label="Thêm">+</button>
    </div>
  );
}

function FriendsPanel({ me, reload, onVisit, onLogout }: { me: Me; reload: () => Promise<void>; onVisit: (id:string)=>void; onLogout:()=>Promise<void> }) {
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
      <form method="post" action="/api/auth/logout" onSubmit={async (e) => { e.preventDefault(); await onLogout(); }}>
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
          <p className="small muted">Công suất ròng dự kiến; mở Thu chi để xem hàng thực nhận và chi phí gần đây.</p>
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

export default function Game({rules=RELEASE_RULES}:{rules?:EngineRules}={}) {
  const profileRef=useRef<FrameProfile|null>(null);
  useEffect(()=>{
    if(new URLSearchParams(location.search).get('perf')!=='1')return;
    profileRef.current=new FrameProfile();
    if(typeof PerformanceObserver==='undefined')return;
    const observer=new PerformanceObserver(list=>{
      if(document.hidden)return;
      for(const entry of list.getEntries())profileRef.current?.add('longTask',entry.duration);
    });
    try{observer.observe({type:'longtask',buffered:false});}catch{/* Unsupported browser. */}
    return()=>{observer.disconnect();profileRef.current=null;};
  },[]);
  const hudRef=useCallback((header:HTMLElement|null)=>{
    if(!header)return;
    const game=header.parentElement;
    const resize=()=>game?.style.setProperty('--hud-top-height',`${Math.ceil(header.getBoundingClientRect().height)}px`);
    resize();
    const observer=new ResizeObserver(resize);observer.observe(header);
    return ()=>observer.disconnect();
  },[]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [recoveryProgress, setRecoveryProgress] = useState<RecoveryProgress>();
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const loadAbort = useRef<AbortController | null>(null);
  const recoveringRef = useRef(false);
  const fetchCity = useCallback(async () => {
    const controller = new AbortController();
    loadAbort.current?.abort(); loadAbort.current = controller;
    try {
      return await loadCityResponse({ signal: controller.signal, onRetry: attempt => {
        setReconnectAttempt(attempt);
        if (attempt) { recoveringRef.current = true; setLoading(true); }
      }, onProgress: progress => {
        recoveringRef.current = true; setLoading(true); if (progress) setRecoveryProgress(progress);
      } });
    } catch (error) {
      if (recoveringRef.current && !controller.signal.aborted) {
        setLoadError('Kết nối tạm gián đoạn. Hãy thử tải lại để tiếp tục từ tiến trình đã lưu.');
        setLoading(false);
      }
      throw error;
    } finally {
      if (loadAbort.current === controller) {
        loadAbort.current = null;
        recoveringRef.current = false;
        setReconnectAttempt(0);
      }
    }
  }, []);
  useEffect(() => () => { loadAbort.current?.abort(); }, []);
  const [readNotice, setReadNotice] = useState({ key: "", at: 0 });
  const [needsName, setNeedsName] = useState(false);
  const [name, setName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [, setVersion] = useState(0);
  const [planting,setPlanting]=useState(false);
  const [finalReview,setFinalReview]=useState<'dam'|'green'|null>(null);
  const finalConfirmed=useRef<BKey|null>(null);
  const [tool, setTool] = useState<BKey | null>(null);
  const [defenseOrientation,setDefenseOrientation]=useState<DefenseMode>('auto');
  const [selected, setSelected] = useState<Cell | null>(null);
  const [bridgeFrom,setBridgeFrom]=useState<number|null>(null);
  const [bridgeTarget,setBridgeTarget]=useState<Cell|null>(null);
  const [dockMove, setDockMove] = useState<number | null>(null);
  const [dockTarget, setDockTarget] = useState<Cell | null>(null);
  const [herdSel, setHerdSel] = useState<number | null>(null);
  const [hover, setHoverState] = useState<Cell | null>(null);
  // Live hover for the canvas; React state (status text) follows once the pointer rests.
  const hoverRef = useRef<Cell | null>(null), hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [assignN, setAssignN] = useState(1);
  const [send, setSend] = useState<Troops>({});
  const [panel, setPanel] = useState<Panel | null>(null);
  const [shopEra, setShopEra] = useState(0);
  const [shopFocus,setShopFocus]=useState<BKey|null>(null);
  const [resourceFocus,setResourceFocus]=useState<ResKey|null>(null);
  const [peopleTab,setPeopleTab]=useState<'assign'|'directory'>('assign');
  const [armyTab,setArmyTab]=useState<'home'|'recruit'|'march'>('home');
  const [eraTab,setEraTab]=useState<'development'|'operations'>('development');
  const [magicTab,setMagicTab]=useState<MagicTab>('research');
  const [largeText,setLargeText]=useState(false);
  useEffect(()=>{try{setLargeText(localStorage.getItem('dong-ui-large-text')==='true');}catch{}},[]);
  useEffect(()=>{try{localStorage.setItem('dong-ui-large-text',String(largeText));}catch{}},[largeText]);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [me, setMe] = useState<Me>({ user: null, friends: [] });
  const [busy, setBusy] = useState(false);
  const [pickedSoldier, setPickedSoldier] = useState<string | null>(null);
  const [pickedSoldiers,setPickedSoldiers]=useState<Set<string>>(new Set());
  const [regionMode,setRegionMode]=useState<'soldiers'|'people'|null>(null);
  const [soldierType,setSoldierType]=useState<UKey|null>(null);
  const selectionDrag=useRef<SelectionDrag|null>(null);
  const [guardEditing, setGuardEditing] = useState(false);
  const [armyManagement,setArmyManagement]=useState(false);
  const [economyOpen,setEconomyOpen]=useState(false);
  const [battleOpen, setBattleOpen] = useState<string | null>(null);

  const reads = useRef(new ReadFlights());
  const panelRef = useRef(panel); panelRef.current = panel;
  const cityRef = useRef<City | null>(null);
  const actionQueue = useRef<OptimisticCityQueue | BatchedCityQueue | null>(null);
  const [saveStatus,setSaveStatus]=useState<SaveStatus>('saved');
  const controlRef=useRef<{key:string;dispose:()=>void}|null>(null);
  const controlEpoch=useRef(0);
  const sessionEndedRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const dRef = useRef<Derived | null>(null);
  const offsetRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<View>(fitView(800, 500));
  const camRef = useRef<Cam>({ zoom: 1, px: 0, py: 0 });
  const rotationFadeRef=useRef<MapTurn|null>(null);
  const [mapRotation,setMapRotation]=useState(0);
  useEffect(()=>{try{const value=Number(localStorage.getItem('map-rotation'));if(Number.isInteger(value)&&value>=0&&value<4){camRef.current.rotation=value;setMapRotation(value);}}catch{}},[]);
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
  const bridgePreview=bridgeFrom!==null?{from:bridgeFrom,to:bridgeTarget?idx(bridgeTarget.x,bridgeTarget.y):null}:undefined;
  const viewRef = useRef({ hover, selected, tool, picked, pickedSoldier, pickedSoldiers, bridgePreview, defenseOrientation });
  viewRef.current = { hover: hoverRef.current, selected, tool, picked, pickedSoldier, pickedSoldiers, bridgePreview, defenseOrientation };
  const setHover = (cell: Cell | null, lazy = false) => {
    hoverRef.current = cell; viewRef.current.hover = cell;
    clearTimeout(hoverTimer.current);
    const commit = () => setHoverState((old) => old?.x === cell?.x && old?.y === cell?.y ? old : cell);
    if (lazy) hoverTimer.current = setTimeout(commit, 80); else commit();
  };

  useEffect(()=>{if(tool||picked.size||pickedSoldier||guardEditing||planting||visiting){setBridgeFrom(null);setBridgeTarget(null);}},[tool,picked,pickedSoldier,guardEditing,planting,visiting]);
  useEffect(()=>{if(visiting||worldOpen||battleOpen||guardEditing||planting||tool){selectionDrag.current=null;setRegionMode(null);setPickedSoldiers(new Set());}},[visiting,worldOpen,battleOpen,guardEditing,planting,tool]);

  useEffect(()=>{if(panel!=='shop')setShopFocus(null);if(!panel)return;setMsg(m=>m?.err?m:null);setTool(null);setGuardEditing(false);setRegionMode(null);setBridgeFrom(null);setBridgeTarget(null);setDockMove(null);setDockTarget(null);setPlanting(false);},[panel]);

  const now = () => Date.now() + offsetRef.current;
  const bump = () => setVersion((v) => v + 1);

  const stopSession = useCallback(() => {
    sessionEndedRef.current = true;
    loadAbort.current?.abort();
    actionQueue.current?.stop();
    controlEpoch.current++;controlRef.current?.dispose();controlRef.current=null;
    cityRef.current = null; dRef.current = null; visitRef.current = null;
    setMe({ user: null, friends: [] }); setNeedsName(true); setLoading(false);
    setBattleOpen(null); setWorldOpen(false); setSaving(false); setBusy(false);
    setMsg({ text: SESSION_ENDED_MESSAGE, err: true });
  }, []);
  useEffect(() => {
    window.addEventListener(SESSION_ENDED_EVENT, stopSession);
    return () => window.removeEventListener(SESSION_ENDED_EVENT, stopSession);
  }, [stopSession]);
  useEffect(()=>()=>{controlEpoch.current++;controlRef.current?.dispose();controlRef.current=null;actionQueue.current?.stop();actionQueue.current=null;},[]);

  const accept = useCallback((data: { state: City; serverNow: number; name?: string; sync?:CitySync; batchEnabled?:boolean }) => {
    if (sessionEndedRef.current) return false;
    offsetRef.current = data.serverNow - Date.now();
    const publish = (state: City) => {
      cityRef.current = state;
      dRef.current = derive(state);
      crowdRef.current.sync(state);
      setSaving(actionQueue.current?.isPending ?? false);
      bump();
    };
    const loadCheckpoint=async():Promise<BatchResponse>=>{
      const res=await fetchCity();
      if(res.status===401){stopSession();throw new Error(SESSION_ENDED_MESSAGE);}
      const value=await res.json();
      if(!res.ok||!value.sync)throw new Error(value.error??'Chưa tải được checkpoint của làng.');
      setLoading(false); setRecoveryProgress(undefined); setLoadError(undefined);
      offsetRef.current=value.serverNow-Date.now();return value;
    };
    if(data.sync && !actionQueue.current) {
      publish(data.state);
      const key=`${data.sync.cityId}:${data.sync.session}:${data.sync.engine}`;
      if(!controlRef.current) {
        setSaveStatus('initializing');
        const dispose=controlCityTab(key,(active,storage)=>{
          const epoch=++controlEpoch.current;
          if(!active){actionQueue.current?.stop();actionQueue.current=null;setSaveStatus('readonly');setSaving(false);return;}
          void (async()=>{
            try {
              const fresh=await loadCheckpoint();
              if(sessionEndedRef.current||epoch!==controlEpoch.current)return;
              if(fresh.sync.cityId!==data.sync!.cityId||fresh.sync.session!==data.sync!.session||fresh.sync.engine!==data.sync!.engine)throw new Error("Phiên chơi đã đổi; hãy tải lại trang.");
              const queue=new BatchedCityQueue({
                state:fresh.state,sync:fresh.sync,rules,storage,now:()=>Date.now()+offsetRef.current,
                delayMs:fresh.batchEnabled?BATCH_DELAY_MS:0,onState:publish,
                onStatus:s=>{setSaveStatus(s);setSaving(s==='queued'||s==='sending'||s==='offline');},
                onError:text=>setMsg({text,err:true}),reload:loadCheckpoint,
                checkpoint:async()=>{
                  const res=await fetch('/api/city/checkpoint',{method:'POST',signal:AbortSignal.timeout(15_000)});
                  if(res.status===401){stopSession();throw new Error(SESSION_ENDED_MESSAGE);}
                  const value=await res.json();if(!res.ok)throw new Error(value.error??'Chưa lưu được mốc làng.');
                  offsetRef.current=value.serverNow-Date.now();return value;
                },
                send:async(body:BatchRequest)=>{
                  const res=await fetch('/api/city/batch',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15_000)});
                  if(res.status===401){stopSession();throw new Error(SESSION_ENDED_MESSAGE);}
                  const value=await res.json();
                  if(!res.ok)throw new SyncTransportError(value.error??'Chưa lưu được thao tác.',res.status);
                  offsetRef.current=value.serverNow-Date.now();return value as BatchResponse;
                },
              });
              actionQueue.current=queue;await queue.initialize();
            } catch {if(!sessionEndedRef.current){setSaveStatus('error');setMsg({text:'Chưa lấy được quyền điều khiển làng. Hãy tải lại trang khi có mạng.',err:true});}}
          })();
        });
        controlRef.current={key,dispose};
      }
      if(data.name)setName(data.name);return true;
    }
    if (!actionQueue.current) {
      actionQueue.current = new OptimisticCityQueue({
        rules, state: data.state, now: () => Date.now() + offsetRef.current,
        onState: publish, onError: (text) => setMsg({ text, err: true }),
        send: async (action, requestId) => {
          const res = await fetch("/api/city/action", {
            method: "POST", signal: AbortSignal.timeout(15_000),
            headers: { "content-type": "application/json", "x-action-id": requestId }, body: JSON.stringify(action),
          });
          if (res.status === 401) { stopSession(); return { error: SESSION_ENDED_MESSAGE }; }
          const response = await res.json();
          if (response.serverNow) offsetRef.current = response.serverNow - Date.now();
          if (!res.ok && !response.error) throw new Error("Không lưu được thao tác.");
          return response;
        },
        onUncertain: async () => {
          const res = await fetchCity();
          if (!res.ok) throw new Error("Không tải được làng.");
          const response = await res.json();
          offsetRef.current = response.serverNow - Date.now();
          setLoading(false); setRecoveryProgress(undefined); setLoadError(undefined);
          return response.state;
        },
      });
      publish(data.state);
    } else {
      const queue=actionQueue.current;
      const accepted=queue instanceof BatchedCityQueue?queue.setAuthoritative(data.state,queue.version,data.sync):queue.setAuthoritative(data.state);
      if(data.name)setName(data.name);
      return accepted;
    }
    if (data.name) setName(data.name);
    return true;
  }, [stopSession, fetchCity]);

  const externalCity=useCallback(async <T,>(run:()=>Promise<T>):Promise<T>=>{
    const queue=actionQueue.current;
    if(queue instanceof BatchedCityQueue)return queue.exclusive(run);
    if(controlRef.current&&!queue)throw new Error('Làng đang được điều khiển ở tab khác.');
    if(queue?.isPending)throw new Error('Đang lưu thao tác, hãy thử lại sau giây lát.');
    return run();
  },[]);

  const loadCity = useCallback(() => reads.current.run("city", async () => {
    try {
    if (sessionEndedRef.current) return;
    setLoadError(undefined);
    if (!cityRef.current) setLoading(true);
    if (actionQueue.current?.isPending) return;
    if(actionQueue.current instanceof BatchedCityQueue){await actionQueue.current.refresh();return;}
    const generation = actionQueue.current?.version;
    const res = await fetchCity();
    if (res.status === 401) {
      if (cityRef.current) stopSession();
      else { setMe({ user: null, friends: [] }); setNeedsName(true); setLoading(false); const data = await res.json(); if (data.sessionEnded) setMsg({ text: SESSION_ENDED_MESSAGE, err: true }); }
      return;
    }
    if (res.status === 404) {
      const data = await res.json();
      if (data.needsName === true) { setNeedsName(true); setLoading(false); return; }
    }
    if (!res.ok) { const data=await res.json().catch(()=>({})); setLoadError(data.error ?? "Không tải được làng. Hãy thử kết nối lại."); setMsg({ text: data.error ?? "Không tải được làng. Hãy thử kết nối lại.", err: true }); setLoading(false); return; }
    const data = await res.json();
    if (sessionEndedRef.current) return;
    if (actionQueue.current && (actionQueue.current.isPending || generation !== actionQueue.current.version)) return;
    accept(data);
    setRecoveryProgress(undefined);
    setShopEra(0);
    setNeedsName(false);
    setLoading(false);
    } catch { if (!sessionEndedRef.current) { setLoadError("Kết nối tạm gián đoạn. Bạn có thể thử tải lại để tiếp tục từ tiến trình đã lưu."); setMsg({text:"Mất kết nối khi tải làng. Hãy thử tải lại.",err:true}); setLoading(false); } }
  }), [accept, stopSession, fetchCity]);


  const loadWorld = useCallback(() => reads.current.run("world", async () => {
    try {
    const res = await fetch("/api/world", { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (res.ok) setNations((await res.json()).nations);
    else setMsg({ text: "Không tải được danh sách các nước. Hãy mở lại bản đồ.", err: true });
    } catch { setMsg({text:"Mất kết nối khi tải bản đồ thế giới.",err:true}); }
  }), []);

  const villageReady = !loading && !recoveryProgress && !needsName && !!cityRef.current;
  const diplomacy = useDiplomacy(villageReady, () => { void loadCity(); void loadWorld(); },externalCity);
  const [marketTarget,setMarketTarget]=useState<string>();
  const market = useMarket(villageReady && !!me.user?.hasCity, panel === "market" || worldOpen, () => { void loadCity(); }, panel === "market",marketTarget,externalCity);
  const war = useWars(villageReady && !!me.user?.hasCity, () => {
    const queue=actionQueue.current;
    if(queue instanceof BatchedCityQueue&&queue.isPending)void queue.flush().then(()=>loadCity());else void loadCity();
    void diplomacy.refresh(); void market.refresh();
  });
  const unreadReports=useUnreadBattleReports(war.wars,me.user?.id,panel==='log');
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
    if (sessionEndedRef.current) return;
    const res = await fetch("/api/me", { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (res.ok) {
      const data = await res.json();
      if (sessionEndedRef.current) return;
      if (!data.user && cityRef.current) stopSession(); else setMe(data);
    }
    } catch { /* Retain the last known identity until the next refresh. */ }
  }), [stopSession]);

  const loadBoard = useCallback(() => reads.current.run("board", async () => {
    try {
    const res = await fetch("/api/leaderboard", { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (res.ok) setRows((await res.json()).rows);
    } catch { /* Retain the current leaderboard; opening it again retries. */ }
  }), []);

  useEffect(() => {
    void loadCity(); void loadMe();
    const authErr = new URLSearchParams(location.search).get("auth");
    if (authErr) { setMsg({ text: authErr === 'session' ? "Chưa xác nhận được phiên chơi trên máy chủ trận đánh. Hãy thử đăng nhập lại." : "Đăng nhập Google không thành công, thử lại.", err: true }); history.replaceState(null, "", "/"); }
    const tick = setInterval(() => {
      const c = cityRef.current;
      if (!c || recoveringRef.current || document.hidden) return;
      const started=profileRef.current?performance.now():0;
      actionQueue.current?.advance(now());
      const vis = visitRef.current;
      if (vis) { if (!vis.city.battleId) settle(vis.city, now()); vis.D = derive(vis.city); vis.crowd.sync(vis.city); }
      bump();
      if(profileRef.current)profileRef.current.add('tick',performance.now()-started);
    }, 1000);
    const refreshVisible = () => {
      if (document.visibilityState !== "visible" || recoveringRef.current) return;
      const queue=actionQueue.current;
      if(queue instanceof BatchedCityQueue)void queue.checkpointIfDue().then(saved=>{if(!saved)void loadCity();});else void loadCity();
      void loadMe(); void diplomacy.refresh();
      if (panelRef.current === "rank") void loadBoard();
    };
    const sync = setInterval(refreshVisible, 60_000);
    const foreground = () => {
      if (document.visibilityState !== "visible" || recoveringRef.current) return;
      const queue=actionQueue.current;
      if(queue instanceof BatchedCityQueue)void (queue.isPending?queue.flush():queue.refresh());
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
    // Lower resolution under sustained load; recover only after prolonged headroom.
    let dpr = 1;
    const quality = new RenderQuality();
    const resize = () => {
      const w = frame.clientWidth, h = frame.clientHeight;
      const cam = camRef.current, v = camView(fitRef.current, cam);
      const f = fitView(w, h);
      fitRef.current = f;
      const [cx,cy]=screenToWorld(v,v.width/2,v.height/2);
      rotationFadeRef.current=null;
      if (focusedRef.current) focusOn(f, cam, cx,cy, cam.zoom);
      else clampCam(f, cam);
      dpr = Math.min(quality.cap, window.devicePixelRatio || 1);
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(frame);
    resize();
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      rotationFadeRef.current=null;
      const r = cv.getBoundingClientRect(), cam = camRef.current;
      zoomAt(fitRef.current, cam, cam.zoom * Math.exp(-e.deltaY * 0.0018), e.clientX - r.left, e.clientY - r.top);
    };
    cv.addEventListener("wheel", onWheel, { passive: false });
    let raf = 0, last = 0;
    const ground = createLayerCache(), items = createLayerCache();
    // Development-only A/B comparison; production always uses bounded crown sprites.
    const trees=process.env.NODE_ENV!=='production'&&new URLSearchParams(location.search).get('trees')==='0'?undefined:createTreeCache();
    if(profileRef.current){
      ground.onBuild=items.onBuild=ms=>profileRef.current?.add('cache',ms);
    }
    // Full frame rate while the player moves the camera or pointer; ~30 fps when idle.
    let activeAt = 0, cx = NaN, cy = NaN, cz = NaN, cr = NaN, ch: unknown = null, cd: unknown = null;
    let lowDetail:boolean|undefined;
    let inputAt:number|null=null;
    const input=(event:Event)=>{inputAt??=event.timeStamp;activeAt=performance.now();};
    for(const type of ['pointerdown','pointermove','pointerup','wheel'])cv.addEventListener(type,input,{passive:true});
    const resume=()=>{last=0;inputAt=null;quality.sample(performance.now(),0,false,window.devicePixelRatio||1);};
    document.addEventListener('visibilitychange',resume);
    const loop = (t: number) => {
      if(document.hidden || renderPausedRef.current){last=0;inputAt=null;raf=requestAnimationFrame(loop);return;}
      const cam = camRef.current, drag = selectionDrag.current, hov = viewRef.current.hover;
      if (cam.px !== cx || cam.py !== cy || cam.zoom !== cz || (cam.rotation ?? 0) !== cr || hov !== ch || drag?.end !== cd) {
        cx = cam.px; cy = cam.py; cz = cam.zoom; cr = cam.rotation ?? 0; ch = hov; cd = drag?.end; activeAt = t;
      }
      if (t - activeAt > 1000 && t - last < 30) { raf = requestAnimationFrame(loop); return; }
      const vis = visitRef.current;
      const c = vis ? vis.city : cityRef.current, D = vis ? vis.D : dRef.current, crowd = vis ? vis.crowd : crowdRef.current;
      const frameMs=last?t-last:0;
      const dt = Math.min(0.1, frameMs / 1000);
      last = t;
      const active=t-activeAt<=1000;
      if(quality.sample(t,frameMs,active,window.devicePixelRatio||1))resize();
      const profile=profileRef.current;
      if(frameMs>0){profile?.add('frame',frameMs);if(active)profile?.add('activeFrame',frameMs);}
      if (c && D) {
        if (!focusedRef.current) {
          const f = fitRef.current;
          focusOn(f, camRef.current, (c.camp % W) + 0.5, Math.floor(c.camp / W) + 0.5, Math.min(MAX_ZOOM, 60 / f.TW));
          focusedRef.current = true;
        }
        const started=profile?performance.now():0;
        if (!rm) crowd.update(c, dt, now());
        const drawStarted=profile?performance.now():0;
        profile?.add('crowd',drawStarted-started);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const view = vis ? VISIT_VIEW : viewRef.current;
        const v=camView(fitRef.current,camRef.current);
        lowDetail=mapDetailLow(v.TW,lowDetail);
        if(profile)profile.view=`TW=${v.TW.toFixed(1)} DPR=${dpr} detail=${lowDetail?'low':'full'} trees=${!!trees}`;
        drawCity(ctx, c, D, { v, now: now(), anim: rm ? 0 : t, villagers: crowd.list, fx: crowd.fx, chopping: crowd.chopping, ...view, rules, ground, items, dpr, lowDetail, trees: v.TW >= 24 && v.TW <= 60 ? trees : undefined });
        const turn=rotationFadeRef.current;
        if(turn&&!paintMapTurn(ctx,turn,t,fitRef.current.width,fitRef.current.height))rotationFadeRef.current=null;
        if(!vis)drawSelectionBox(ctx,selectionDrag.current);
        profile?.add('draw',performance.now()-drawStarted);
        if(inputAt!==null){profile?.add('input',performance.now()-inputAt);inputAt=null;}
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); cv.removeEventListener("wheel", onWheel);document.removeEventListener('visibilitychange',resume);for(const type of ['pointerdown','pointermove','pointerup','wheel'])cv.removeEventListener(type,input); };
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
    if(!actionQueue.current){setMsg({text:'Chưa có quyền điều khiển làng ở tab này.',err:true});return false;}
    const result = actionQueue.current.enqueue(a);
    setSaving(actionQueue.current?.isPending ?? false);
    return result.finally(() => setSaving(actionQueue.current?.isPending ?? false));
  };

  const sendEnvoy = async (id?: string) => {
    const city = cityRef.current;
    if (!city || busy) return;
    setBusy(true);
    setMsg({text:"Đang cử sứ giả…"});
    try {
      const res = await externalCity(()=>fetch("/api/world/envoy", {
        method: "POST", signal:AbortSignal.timeout(15000), headers: { "content-type": "application/json" },
        body: JSON.stringify(id ? { target: id } : { explore: true }),
      }));
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
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/city", { method: "POST", signal: AbortSignal.timeout(15000), headers: { "content-type": "application/json" }, body: JSON.stringify({ name: nameInput }) });
      const data = await res.json();
      if (!res.ok) { setMsg({ text: data.error ?? "Không tạo được làng. Hãy thử lại.", err: true }); return; }
      accept(data);
      setNeedsName(false);
      loadBoard(); loadMe();
    } catch {
      setMsg({ text: "Chưa nhận được xác nhận tạo làng. Hãy tải lại trang để kiểm tra trước khi thử lại.", err: true });
    } finally { setBusy(false); }
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
    if(e.button!==0)return;
    rotationFadeRef.current=null;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    ptrs.current.set(e.pointerId, p);
    if (ptrs.current.size === 1) dragRef.current = { sx: p.x, sy: p.y, moved: false, pinch: 0 };
    if(ptrs.current.size>1)selectionDrag.current=null;
    else if(!visitRef.current&&!cityRef.current?.battleId&&(regionMode||e.shiftKey)&&!tool&&!planting&&bridgeFrom===null&&dockMove===null&&!guardEditing)selectionDrag.current={pointerId:e.pointerId,start:p,end:p,additive:e.shiftKey};
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const prev = ptrs.current.get(e.pointerId);
    if (!prev) {
      const cell = cellAt(e), old = hoverRef.current;
      if (old?.x !== cell?.x || old?.y !== cell?.y) setHover(cell, true);
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
    if(selectionDrag.current?.pointerId===e.pointerId){selectionDrag.current.end=p;if(d&&selectionMoved(selectionDrag.current))d.moved=true;return;}
    if (d) {
      if (!d.moved && Math.hypot(p.x - d.sx, p.y - d.sy) < 6) return;
      if (!d.moved) { d.moved = true; prev.x = d.sx; prev.y = d.sy; }
      cam.px += p.x - prev.x; cam.py += p.y - prev.y;
      clampCam(f, cam);
      if (hoverRef.current) setHover(null);
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const box=selectionDrag.current;
    if(box?.pointerId===e.pointerId){
      selectionDrag.current=null;
      box.end=local(e);
      if(selectionMoved(box)&&cityRef.current){
        if(dragRef.current)dragRef.current.moved=true;
        const c=cityRef.current,v=view(),soldiers=homeSoldiers(c,now()).filter(s=>{if(regionMode==='soldiers'&&soldierType&&s.u!==soldierType)return false;const [x,y]=projectWorld(v,s.x,s.y);return inSelection(box,{x,y});});
        const kind=regionMode??(soldiers.length?'soldiers':'people');
        setPickedSoldier(null);setSelected(null);setHerdSel(null);setPanel(null);setRegionMode(kind);
        if(kind==='soldiers'){
          setPicked(new Set());setPickedSoldiers(old=>new Set([...(box.additive?old:[]),...soldiers.map(s=>s.id)]));
        }else{
          const ids=crowdRef.current.list.filter(p=>p.id!==null&&p.visible&&!p.fleeing&&inSelection(box,(()=>{const [x,y]=projectWorld(v,p.fx,p.fy);return {x,y};})())).map(p=>p.id!);
          setPickedSoldiers(new Set());setPicked(old=>new Set([...(box.additive?old:[]),...ids]));
        }
      }
    }
    ptrs.current.delete(e.pointerId);
    if (dragRef.current) dragRef.current.pinch = 0;
  };

  const rotateMap=(delta:number)=>{
    const cv=canvasRef.current;if(!cv)return;
    rotationFadeRef.current=captureMapTurn(cv);
    rotateCam(fitRef.current,camRef.current,delta);
    const rotation=camRef.current.rotation??0;setMapRotation(rotation);
    try{localStorage.setItem('map-rotation',String(rotation));}catch{}
    setHover(null);
  };
  const zoomBy = (k: number) => {
    rotationFadeRef.current=null;
    const f = fitRef.current, cam = camRef.current;
    zoomAt(f, cam, cam.zoom * k, f.width / 2, f.height / 2);
  };
  const focusHome = () => {
    rotationFadeRef.current=null;
    const c = cityRef.current, f = fitRef.current;
    if (c) focusOn(f, camRef.current, (c.camp % W) + 0.5, Math.floor(c.camp / W) + 0.5, Math.min(MAX_ZOOM, 60 / f.TW));
  };
  const focusPerson = (p:Person) => {
    setRegionMode(null);setPickedSoldiers(new Set());setPickedSoldier(null);
    const actor=crowdRef.current.list.find(v=>v.id===p.id),tile=p.pos??cityRef.current?.camp??0;
    setPicked(new Set([p.id]));
    focusOn(fitRef.current,camRef.current,actor?.fx??tile%W+.5,actor?.fy??Math.floor(tile/W)+.5,Math.min(MAX_ZOOM,60/fitRef.current.TW));
  };

  const togglePick = (id: number, add: boolean) =>
    setPicked((old) => {
      const next = new Set(add ? old : []);
      if (add && old.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const trackCaravan = (id:string) => { setMarketTarget(id);setPanel("market");setWorldOpen(false); };
  const openPanel = (p: Panel | null) => setPanel((cur) => (cur === p ? null : p));
  const locateTile=(tile:number)=>{setWorldOpen(false);setSelected({x:tile%W,y:Math.floor(tile/W)});setPanel(null);focusOn(fitRef.current,camRef.current,tile%W+.5,Math.floor(tile/W)+.5,Math.min(MAX_ZOOM,60/fitRef.current.TW));};

  const onClick = async (e: React.MouseEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.moved) return;
    if (visitRef.current) return; // looking only
    const c = cityRef.current;
    if (!c) return;
    const p = local(e);
    if(regionMode){
      const cell=cellAt(e);if(!cell)return;
      if(e.shiftKey||!(regionMode==='soldiers'?pickedSoldiers.size:picked.size)){
        if(regionMode==='soldiers'){const s=pickHomeSoldier(view(),c,now(),p.x,p.y);if(s&&(!soldierType||s.u===soldierType))setPickedSoldiers(old=>{const next=new Set(e.shiftKey?old:[]);if(e.shiftKey&&next.has(s.id))next.delete(s.id);else next.add(s.id);return next;});}
        else {const target=pickVillageTarget(view(),c,crowdRef.current.list,performance.now(),p.x,p.y,true);if(target?.type==='person'&&target.person.id!==null&&!target.person.fleeing)togglePick(target.person.id,e.shiftKey);}
        return;
      }
      if(regionMode==='soldiers'){
        if(await act({type:'moveSoldiers',ids:[...pickedSoldiers],...cell}))setMsg({text:`Đã điều ${pickedSoldiers.size} lính dàn gác quanh vị trí đã chọn. Bấm ô khác để đổi lệnh; Esc để bỏ chọn.`});
      }else if(await act({type:'assign',ids:[...picked],task:{t:'move',to:idx(cell.x,cell.y)}}))setMsg({text:`${picked.size} dân đang tới vị trí đã chọn và giữ lệnh thủ công. Chọn Giao việc để phân công công việc mới.`});
      return;
    }
    if(bridgeFrom!==null){const cell=cellAt(e);if(cell)setBridgeTarget(cell);return;}
    if(dockMove!==null){const cell=cellAt(e);if(cell)setDockTarget(cell);return;}
    if(planting){const cell=cellAt(e);if(cell)await act({type:"plantTree",...cell});return;}
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
      const ok = await act({ type: "build", k: tool, x: cell.x, y: cell.y, ...((tool==='wall'||tool==='gate')?{orientation:defenseOrientation}:{}), ...(finalConfirmed.current===tool?{confirmFinal:true}:{}) });
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
    const hit = pickBuilding(view(),c,p.x,p.y);
    const buildingTarget=pickVillageTarget(view(),c,[],performance.now(),p.x,p.y,false,hit);
    if(soldier && (buildingTarget?.type!=="building" || e.shiftKey || e.ctrlKey || e.metaKey)) {
      setPickedSoldier(soldier.id);setPicked(new Set());setSelected(null);setPanel(null);
      setMsg({text:`Đã chọn ${UNITS[soldier.u].n}. Bấm ô đất để điều quân. Esc để bỏ chọn.`});return;
    }
    const target = pickVillageTarget(view(),c,crowdRef.current.list,performance.now(),p.x,p.y,e.shiftKey||e.ctrlKey||e.metaKey,hit);
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
    setHerdSel(null);setPanel(null);
    viewRef.current.selected = cell;
    setSelected(cell);
    setAssignN(1);
    setMsg(null);
    if (campAt(c, i)) setSend({ ...c.army });
    if (c.b[i]?.k === "market") setPanel("market");
    if (c.b[i]?.k === "barracks") setPanel("army");
    if (c.b[i]?.k === "hall") setPanel("control");
  };

  const pickTool = (k: BKey | null) => {
    selectionDrag.current=null;setRegionMode(null);setPickedSoldiers(new Set());
    setBridgeFrom(null);setBridgeTarget(null);setDockMove(null);setDockTarget(null);
    setPlanting(false);
    setPickedSoldier(null);
    setGuardEditing(false);
    setTool(k);
    setDefenseOrientation('auto');
    setSelected(null);
    setPicked(new Set());
    if (k) setPanel(null);
    setMsg(k ? { text: `${buildingName(cityRef.current!, k)} · ${costText(buildingCost(k, cityRef.current!.era))} · ${fmtDur(buildMs(k, 1))}. Chọn ô xanh để xây; Esc để hủy.` } : null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const turn=mapRotationShortcut(e);
      if(turn!==null&&canvasRef.current&&cityRef.current&&!renderPausedRef.current){
        e.preventDefault();rotateMap(turn);return;
      }
      if(e.key.toLowerCase()==='r'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.repeat&&!(e.target instanceof HTMLElement&&e.target.closest('input,textarea,select,[contenteditable="true"]'))){
        const view=viewRef.current,c=cityRef.current;
        if(c&&!renderPausedRef.current&&!visitRef.current&&(view.tool==='wall'||view.tool==='gate')){
          e.preventDefault();
          const tile=view.hover?idx(view.hover.x,view.hover.y):-1;
          const axis=defenseAxis(c,tile,{tile,building:{k:view.tool,lvl:1,doneAt:null,...(view.defenseOrientation!=='auto'?{orientation:view.defenseOrientation}:{})}});
          setDefenseOrientation(axis==='x'?'y':'x');
        }
      }
      if (e.key !== "Escape" || document.querySelector("dialog[open]")) return;
      selectionDrag.current=null;setRegionMode(null);setPickedSoldiers(new Set());
      setBridgeFrom(null);setBridgeTarget(null);setDockMove(null);setDockTarget(null);setPlanting(false);setFinalReview(null);setPickedSoldier(null); setGuardEditing(false); setTool(null); setSelected(null); setHerdSel(null); setPicked(new Set()); setPanel(null);setMsg(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const noticeCity=cityRef.current;
  const noticeKey=noticeCity?`dong-notices:${noticeCity.seed}:${noticeCity.t0}`:"";
  const diplomaticNotices=diplomacy.messages.map(m=>({caravanId:undefined as string|undefined,at:m.decidedAt??m.requestedAt??m.arrive,msg:diplomacyText(m),cls:"good"}));
  const latestNoticeAt=Math.max(0,...(noticeCity?.log??[]).map(l=>l.at),...(noticeCity?.disasterNotices??[]).map(l=>l.at),...diplomaticNotices.map(l=>l.at));
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
  const archivedDisasters=(c?.disasterNotices??[]).filter(n=>!c?.log.some(l=>l.at===n.at&&l.msg===n.msg)).map(n=>({caravanId:undefined as string|undefined,at:n.at,msg:n.msg,cls:n.phase==='protected'?'good' as const:'warn' as const}));
  const notices=[...(c?.log??[]),...archivedDisasters,...diplomaticNotices].sort((a,b)=>b.at-a.at);

  if (loading || recoveryProgress && loadError) return <MapLoadingScreen progress={recoveryProgress} reconnectAttempt={reconnectAttempt} error={loading ? undefined : loadError} onRetry={() => void loadCity()}/>;

  if (needsName) {
    return <WelcomeScreen user={me.user} name={nameInput} onName={setNameInput} onCreate={createCity} busy={busy} message={msg} maxEra={rules.maxEra}/>;
  }

  if (!c || !D) return <MapLoadingScreen progress={recoveryProgress} error={loadError ?? 'Chưa tải được dữ liệu làng. Hãy thử lại.'} onRetry={() => void loadCity()}/>;

  const st = stats(c, D, t), upkeep=upkeepRates(c.era);
  const si = seasonIndexAt(c, t), season = si % 4;
  const nextSeasonIn = c.t0 + (si + 1) * SEASON_MS - t;
  const idle = c.people.filter(availableForQuickAssign);
  const birthRate=POP_GROWTH_PER_HOUR*(1+(c.res.wood>0?st.fires:0))*pollutionBirth(c)*serviceBonus(c).birth;
  const populationStatus = c.battleId ? "Tạm dừng do trận đánh" : c.res.food <= 0 ? "Dân đang đói" : (c.hunger?.stressMs??0)>0 ? "Đang hồi phục sau đói · chưa tăng dân" : c.people.length >= st.housing ? "Cần thêm nhà" : birthRate<=0?"Ô nhiễm ngăn sinh dân": `+1 dân sau ${fmtDur((1-c.popAcc) / birthRate * HOUR)}`;
  const cap = armyCap(c), used = armyUsed(c), homePower = troopPower(c.army);

  let status: { text: string; err?: boolean } | null = msg;
  if(bridgeFrom!==null){status={text:"Chọn ô đất ở bờ đối diện, thẳng hàng với Cầu Sắt. Xem chi phí và điều kiện trước khi xác nhận."};
  } else if (dockMove!==null) {
    const plan=hover?dockRelocationPlan(c,dockMove,idx(hover.x,hover.y),rules):null;
    status={text:plan?`Chuyển bến: ${plan.error??`${plan.distance} ô · ${costText(plan.cost)} · ${fmtDur(plan.duration)} · 1 đội thợ xây. Bấm để chọn, xác nhận trong bảng cảng.`}`:"Chọn ô đất trống sát sông để chuyển bến. Esc để hủy.",err:!!plan?.error};
  } else if (hover && tool) {
    const bad = canPlace(c, D, tool, hover.x, hover.y,rules);
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
  const next = c.era+1<=rules.maxEra?ERA_REQ[c.era + 1]:undefined;
  const sendPower = troopPower(send);
  const hallLv = hallLevel(c), control = hasControl(c);
  const groups = new Map<string, Person[]>();
  if(panel==='control')for (const p of c.people) { const k = taskLabel(c, p); const group=groups.get(k);if(group)group.push(p);else groups.set(k,[p]); }

  const unreadCount=(readNotice.key===noticeKey?notices.filter(l=>l.at>readNotice.at).length:0)+unreadReports;
  const effectiveSaveStatus:SaveStatus=actionQueue.current instanceof OptimisticCityQueue?(saving?'sending':'saved'):saveStatus;
  const activeWars=war.wars.filter(w=>w.status!=='completed'&&w.status!=='cancelled');
  const attention=villageAttention(c,st.storage,effectiveSaveStatus,war.wars,unreadCount,t);
  const handleAttention=(target:AttentionTarget)=>{
    if(target.kind==='tile'){locateTile(target.tile);return;}
    if(target.kind==='resource'){setResourceFocus(target.resource);setPanel('resources');return;}
    if(target.kind==='shop'){setShopFocus('gather');setShopEra(1);setPanel('shop');return;}
    if(target.kind==='era')setEraTab('operations');
    if(target.kind==='people')setPeopleTab('assign');
    if(target.kind==='battle'){void externalCity(async()=>{setBattleOpen(target.id);setPanel(null);}).catch(e=>setMsg({text:e.message,err:true}));return;}
    if(target.kind==='sync'){if(effectiveSaveStatus==='readonly'){setPanel('manage');setMsg({text:'Tab này chỉ xem. Hãy quay lại tab đang điều khiển làng.',err:true});return;}const q=actionQueue.current;if(q instanceof BatchedCityQueue)void q.refresh().then(()=>q.flush()).catch(e=>setMsg({text:e.message,err:true}));return;}
    setPanel(target.kind);
  };

  return (
    <main className={"game ui-game" + (visiting ? " visiting" : "") + (largeText?" large-text":"")} data-panel={panel??undefined} data-overlay={worldOpen||!!battleOpen?true:undefined}>
      <FrameProfilePanel profile={profileRef}/>
      <div className="mapframe" ref={frameRef}>
        <canvas
          ref={canvasRef}
          aria-label="Bản đồ. Kéo để di chuyển; bật Chọn lính hoặc Chọn dân rồi kéo khung để chọn nhiều người. Bấm đất để điều cả nhóm."
          style={regionMode?{cursor:'crosshair'}:undefined}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={e=>{selectionDrag.current=null;ptrs.current.delete(e.pointerId);if(dragRef.current)dragRef.current.moved=true;}}
          onPointerLeave={() => setHover(null)}
          onClick={onClick}
          onContextMenu={(e) => { e.preventDefault(); pickTool(null); setPicked(new Set()); }}
        />
      </div>

      <GameHUD city={c} stats={st} name={name} season={season} year={Math.floor(si/4)+1} unread={unreadCount} ref={hudRef} onPanel={p=>openPanel(p)} onResource={r=>{setResourceFocus(r??null);setPanel("resources");}} onHelp={()=>setHelpOpen(true)}/>
      {!visiting&&!worldOpen&&!battleOpen&&<VillageAttention items={attention} onOpen={()=>setPanel('attention')} onAction={handleAttention}/>}

      <details className="camera-tools"><summary aria-label="Mở điều khiển bản đồ">⌖ <span>Bản đồ</span></summary><div className="zoom" role="group" aria-label="Điều khiển bản đồ">
        {!visiting&&!c.battleId&&<><button className="region-toggle" aria-pressed={regionMode==='soldiers'} onClick={()=>{pickTool(null);setPicked(new Set());setPickedSoldier(null);setSelected(null);setGuardEditing(false);setPanel(null);setSoldierType(null);setRegionMode(regionMode==='soldiers'?null:'soldiers');}}>Chọn lính</button><button className="region-toggle" aria-pressed={regionMode==='people'} onClick={()=>{pickTool(null);setPicked(new Set());setPickedSoldier(null);setSelected(null);setGuardEditing(false);setPanel(null);setRegionMode(regionMode==='people'?null:'people');}}>Chọn dân</button></>}
        <button onClick={() => zoomBy(1.5)} aria-label="Phóng to">+</button>
        <button onClick={() => zoomBy(1 / 1.5)} aria-label="Thu nhỏ">−</button>
        <button onClick={()=>rotateMap(-1)} aria-label="Xoay bản đồ sang trái" aria-keyshortcuts="Q" title="Xoay trái 90° (Q)">↶</button>
        <button onClick={()=>rotateMap(1)} aria-label="Xoay bản đồ sang phải" aria-keyshortcuts="E" title="Xoay phải 90° (E)">↷</button>
        <span className="map-bearing" aria-live="polite" aria-label={`Góc nhìn ${mapRotation*90} độ`}>{mapRotation*90}°</span>
        <button onClick={focusHome} aria-label="Về trại" title="Về trại">⌂</button>
        <button onClick={() => { rotationFadeRef.current=null; camRef.current = { zoom: 1, px: 0, py: 0, rotation:camRef.current.rotation }; }} aria-label="Xem toàn bản đồ" title="Xem toàn bản đồ">⤢</button>
        {c.magic&&<ManaOverlayButton/>}
      </div></details>

      {!panel && herd && herdTask && (
        <ContextCard key={herd.id} selectingLocation={dockMove!==null&&!dockTarget||bridgeFrom!==null&&!bridgeTarget}>
          <button className="x" onClick={() => setHerdSel(null)} aria-label="Đóng">×</button>
          <h2>{herd.kind === "deer" ? "Đàn hươu" : "Đàn lợn rừng"}</h2>
          <p className="small">Còn <b>{Math.floor(herd.n)}</b>/{herd.max} con · mỗi con cho khoảng 50 thịt · tự sinh sôi lại theo thời gian.</p>
          <div className="assign">
            <Stepper value={assignN} max={Math.max(1, idle.length)} label="Số người" onChange={(n) => setAssignN(Math.max(1, n))} />
            <button className="primary" disabled={busy || !idle.length || herd.n < 1} onClick={() => act({ type: "assignN", n: assignN, task: herdTask })}>
              {herd.n < 1 ? "Đàn đã bị săn hết" : idle.length ? `Giao ${Math.min(assignN, idle.length)} người đi săn` : "Không ai rảnh"}
            </button>
            {!idle.length&&<><p className="small muted" role="status">{quickAssignBlockedReason(c)}</p><button disabled={busy} onClick={()=>setPanel("people")}>Chọn dân để đổi việc</button></>}
          </div>
          {hunters.length > 0 && (
            <ul className="people compact">
              {hunters.map((p) => (
                <li key={p.id}><span>{p.name}<HungryVillager city={c} person={p}/><small className="haul-detail">{haulDetail(p,t,st.storage,c.res,c)}</small></span><button className="link" disabled={busy} onClick={() => act({ type: "assign", ids: [p.id], task: { t: "idle" } })}>Cho nghỉ</button></li>
              ))}
            </ul>
          )}
        </ContextCard>
      )}

      {/* selection card */}
      {!panel && selected && (sel || selTask || selCamp) && (
        <ContextCard key={selI} selectingLocation={dockMove!==null&&!dockTarget||bridgeFrom!==null&&!bridgeTarget}>
          <button className="x" onClick={() => setSelected(null)} aria-label="Đóng">×</button>
          {msg?.err&&<div className="inline-warning" role="alert">{msg.text}</div>}
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
              <details className="ui-details"><summary>Công năng & thông số</summary>
              <p className="muted small">Kiến trúc {ERA_NAMES[c.era].toLowerCase()} · Lên thời đại tự đổi kiến trúc, không tự tăng cấp. Bấm nâng cấp để tăng công năng và trang bị; cấp tối đa theo Đình làng.</p>
              <p className="muted small">{B[sel.k].d}</p>
              {(sel.k==='wall'||sel.k==='gate')&&<DefenseOrientation value={sel.orientation??'auto'} axis={defenseAxis(c,selI)} disabled={busy} onChange={orientation=>{void act({type:'orientDefense',x:selI%W,y:Math.floor(selI/W),orientation});}}/>}
              {sel.k==='watchtower'&&<p className="small">{towerStats(sel.lvl||1).damage} sát thương/phát · mỗi {towerStats(sel.lvl||1).attackMs/1000} giây 1 phát · tầm {towerStats(sel.lvl||1).range} ô. Đã đặt {buildAvailability(c,'watchtower').count}/{buildAvailability(c,'watchtower').limit} trụ. {sel.lvl>0&&!sel.burned&&!sel.flooded&&(defendingTowers(c).has(selI)?'Trong hạn mức phòng thủ.':'Trụ dự phòng: vượt hạn mức tham chiến thời đại.')} Khi có dư trụ, ưu tiên cấp cao rồi gần Đình/điểm tập kết. Trụ tham chiến được chốt lúc bắt đầu trận.</p>}
              {sel.k==='smelter'&&sel.lvl>=1&&<p className="small">Đủ 3 thợ: tối đa {B.smelter.prod!.copper!*GATHER_SPEED*LVL_MULT[sel.lvl]/60} đồng/phút trước thời gian vận chuyển; dùng {B.smelter.use!.wood!*LVL_MULT[sel.lvl]/60} gỗ + {B.smelter.use!.stone!*LVL_MULT[sel.lvl]/60} đá/phút. Nuôi 3 thợ thêm {3*upkeep.civilian.food/60} thực/phút và {3*upkeep.civilian.wood} gỗ/giờ. Giá bán do người chơi quyết định; tính cả các chi phí này khi định giá.</p>}
              {sel.k==='gather'&&sel.lvl>=1&&<p className="small">Phí vận hành: {gatherFoodPerHour(c,D,selI)/60} thực/phút khi sản xuất. {gatherFoodPerHour(c,D,selI)===120?'Đang được kênh có nước tưới.':'Chưa có kênh có nước tưới trong 1 ô; sát sông hoặc kênh cạn vẫn tính 4 thực/phút.'} Cộng riêng với sức ăn dân; không thu lúc đi giao hàng hoặc chờ kho đầy.</p>}
              </details>
              {sel.k==='wheel'&&sel.lvl>=1&&c.res.wood<=0&&<p className="err small">Cối nước hết gỗ, tạm ngừng sản xuất. Bổ sung gỗ để dân tự làm tiếp; hàng đang mang vẫn được nộp kho.</p>}
              {sel.k==='canal'&&sel.lvl>=1&&<p className={D.wet[selI]?'small':'err small'}>{D.wet[selI]?'Kênh đang có nước, tưới cho đất xung quanh.':'Kênh cạn: mất đường nối tới sông, không còn tưới đất. Nối lại kênh để có nước hoặc dùng Phá dỡ bên dưới để gỡ từng đoạn.'}</p>}
              {sel.doneAt && <p className="small">{sel.relocation ? "Đang chuyển bến" : sel.k==='ironbridge'&&sel.bridge&&!sel.bridge.ready ? "Đang nối nhịp cầu" : sel.lvl === 0 ? "Đang xây" : sel.storageUpgrade ? `Đang nâng ngăn ${RN[sel.storageUpgrade]}` : `Đang nâng lên cấp ${sel.lvl + 1}`}: còn {fmtDur(sel.doneAt - t)}</p>}
              {c.cropDamage?.tile===selI && c.cropDamage.until>t && <p className="err small">Ruộng bị thú rừng giẫm: năng suất còn 50%, phục hồi sau {fmtDur(c.cropDamage.until-t)}.</p>}

              {(sel.flooded || sel.burned) && <p className="err small">{sel.damageCause==='earthquake'?"Hư hại do động đất, cần sửa để hoạt động lại.":sel.burned ? "Bị cháy, cần sửa để hoạt động lại." : "Bị ngập, không hoạt động."}</p>}
              {["farm","estate"].includes(sel.k) && <>
                <p className={farmRemaining(sel)<=0?"err small":"small"}>Dinh dưỡng: {Math.ceil(farmRemaining(sel))}/{farmCapacity(sel)} · giảm theo lượng lương thực thực sự thu hoạch.</p>
                {sel.tendUntil ? <p className="small">Đang cải tạo & gieo lại: {fmtDur(sel.tendUntil-t)}</p> : <button disabled={busy || !!sel.doneAt || !!sel.burned || !!sel.flooded || farmRemaining(sel)>=farmCapacity(sel)} onClick={()=>act({type:"tendFarm",x:selI%W,y:Math.floor(selI/W)})}>Cải tạo & gieo lại · {costText(farmTendCost(sel,c.era))} · 30 giây</button>}
                {c.era>=4&&<p className="small">{farmAutoStatus(c,sel)}</p>}
                <FarmGroupCare city={c} tile={selI} busy={busy} act={act}/>
                {c.era<4 && farmRemaining(sel)<=0 && <p className="err small">Ruộng bạc màu. Người đã giao đang nghỉ, cần cải tạo để tiếp tục thu hoạch.</p>}
              </>}
              {["farm","estate"].includes(sel.k) && <FarmWorkers city={c} tile={selI} storage={st.storage}/>}
              <EraCivicBuilding city={c} building={sel} tile={selI} now={t}/><MagicBuildingCard city={c} tile={selI} now={t} busy={busy} act={act} onLocate={locateTile} onOpenMagic={tab=>{setMagicTab(tab);setPanel('magic');}}/>{B[sel.k].jobs && !["farm","estate"].includes(sel.k) ? <p className="small">Người làm: <b>{workersAt(c, selI)}/{buildingJobs(sel)}</b>. {workersAt(c,selI) ? !B[sel.k].prod ? "Nhân viên vận hành dịch vụ tại đây; không mang hàng về kho." : "Gom đủ một chuyến rồi mang về nộp; chỉ khi nộp xong kho mới tăng." : "Chưa có người làm nên chưa tạo tài nguyên. Bấm Giao người rảnh bên dưới."}</p> : null}
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
              {!idle.length&&<><p className="small muted" role="status">{quickAssignBlockedReason(c)}</p><button disabled={busy} onClick={()=>setPanel("people")}>Chọn dân để đổi việc</button></>}
            </div>
          )}
          {onTarget.length > 0 && (
            <details className="ui-details"><summary>{onTarget.length} người đã giao · xem trạng thái</summary><ul className="people compact">
              {onTarget.map((p) => (
                <li key={p.id}><span>{p.name}<HungryVillager city={c} person={p}/><small className="haul-detail">{haulDetail(p,t,st.storage,c.res,c)}</small></span><button className="link" onClick={()=>focusPerson(p)}>Tìm người</button><button className="link" disabled={busy} onClick={() => act({ type: "assign", ids: [p.id], task: { t: "idle" } })}>Cho nghỉ</button></li>
              ))}
            </ul></details>
          )}
          {sel && selected && (
            <div className="actions">
              {sel.k==='nursery'&&sel.lvl>=1&&<button onClick={()=>{setPlanting(true);setTool(null);setPanel(null);setSelected(null);setMsg({text:'Bấm đồng cỏ trống trong 6 ô Vườn ươm để trồng; 10 thực/cây, 30 phút lớn. Tối đa 4 cây/vườn.'});}}>Trồng cây · 10 thực/cây</button>}
              {canToggle(B[sel.k])&&sel.lvl>0&&<button disabled={busy} onClick={()=>act({type:'toggleBuilding',...selected})}>{sel.off?'Bật lại công trình':'Tắt công trình'}</button>}
              {sel.k === "envoy" && sel.lvl >= 1 && <>
                <p className="small">Sứ giả riêng: {Math.max(0,envoyCount(c)-envoysAway(c))}/{envoyCount(c)} đang rảnh. Dân làng chỉ dò địa hình trong làng; tìm nước khác cần cử sứ giả.</p>
                <button className="primary" disabled={busy || !envoyCount(c) || envoysAway(c)>=envoyCount(c)} onClick={()=>sendEnvoy()}>Cử sứ giả rảnh đi do thám · 2 phút</button>
                <button onClick={()=>{setWorldOpen(true);setPanel(null);}}>Xem hành trình trên bản đồ thế giới</button>
              </>}
              {sel.k==="barracks" && sel.lvl>=1 && <p className="small">Trại này hỗ trợ {barracksCapacity(c.era,sel.lvl)} chỗ quân và có hàng tuyển riêng.</p>}
              {sel.k==="barracks" && sel.lvl>=1 && !armyStagingTiles(c,1,selI).length && <p className="err small">Trại lính bị bịt kín. Chừa lối đất nối ra ngoài, đặt cổng thay tường hoặc dỡ công trình chắn lối; quân không tự phá nhà mình.</p>}
              {["barracks","logistics","infirmary"].includes(sel.k) && sel.lvl >= 1 && <button className="primary" onClick={() => setPanel("army")}>Luyện quân</button>}
              {sel.k==='ironbridge'&&sel.lvl>=1&&<BridgePanel city={c} from={selI} to={bridgeFrom===selI&&bridgeTarget?idx(bridgeTarget.x,bridgeTarget.y):null} selecting={bridgeFrom===selI} busy={busy} rules={rules} act={act} onSelect={()=>{setBridgeFrom(selI);setBridgeTarget(null);setDockMove(null);setDockTarget(null);setTool(null);setPicked(new Set());setPickedSoldier(null);setGuardEditing(false);setPlanting(false);setMsg(null);}} onCancel={()=>{setBridgeFrom(null);setBridgeTarget(null);}}/>}
              {sel.k==="dock"&&sel.lvl>=1&&<>
                <DockPanel city={c} building={sel} now={t} busy={busy} onBuild={()=>{void act({type:"buildShip",...selected});}} onRelocate={()=>{setBridgeFrom(null);setBridgeTarget(null);setDockMove(selI);setDockTarget(null);setTool(null);setPicked(new Set());setPickedSoldier(null);setGuardEditing(false);setPlanting(false);setMsg(null);}}/>
                {dockMove===selI&&<div className="dock-move-review" role="region" aria-label="Chuyển bến cảng"><p>Chọn ô đất trống sát sông trên bản đồ. Xem phí trước khi xác nhận.</p>{dockTarget&&(()=>{
                  const plan=dockRelocationPlan(c,selI,idx(dockTarget.x,dockTarget.y),rules);
                  return <><p>Bờ mới ({dockTarget.x}, {dockTarget.y}) · {plan.distance} ô</p><p>{costText(plan.cost)} · {fmtDur(plan.duration)} · 1 đội thợ xây</p>{plan.error&&<p className="err" role="status">{plan.error}</p>}<button className="primary" disabled={busy||!!plan.error} onClick={async()=>{if(await act({type:"relocateDock",...selected,to:idx(dockTarget.x,dockTarget.y)})){setSelected(dockTarget);setDockMove(null);setDockTarget(null);}}}>Xác nhận chuyển bến</button></>;
                })()}<button onClick={()=>{setDockMove(null);setDockTarget(null);}}>Hủy chuyển bến</button></div>}
              </>}
              {sel.k === "market" && sel.lvl >= 1 && <button className="primary" onClick={()=>setPanel("market")}>Giao thương bằng đoàn xe</button>}
              {sel.k === "hall" && sel.lvl >= 1 && <button className="primary" onClick={() => setPanel("control")}>{control ? "Trung tâm điều khiển" : "Xem Đình làng"}</button>}
              {["storehouse","grandstore"].includes(sel.k) && sel.lvl >= 1 && <div><p className="small">Nâng riêng từng ngăn. Kho thường thêm 1.000 chỗ; Đại kho tăng 10.000 → 20.000 → 40.000.</p>{RES.filter(r=>resourceUnlocked(r,c.era)).map(r=>{
                const lv=storageLevel(sel,r), cap=levelCap(c,sel.k), locked=lv>=cap;
                const reason=lv>=MAX_LVL?"Đã tối đa":locked?"Cần xây/nâng Đình làng":sel.doneAt?"Kho đang nâng cấp":sel.flooded||sel.burned?"Cần sửa Kho":"";
                return <div key={r}><p>{RN[r]} · cấp {lv} · {fmt(storageCapacity(sel,r))} chỗ{sel.storageUpgrade===r?` · đang nâng (${fmtDur((sel.doneAt??t)-t)})`:""}</p><button disabled={busy||!!reason} onClick={()=>act({type:"upgradeStorage",...selected,resource:r})}>{reason||`Nâng ${RN[r]} lên cấp ${lv+1} · ${costText(levelCost(sel.k,lv+1,c.era))} · ${fmtDur(buildMs(sel.k,lv+1))}`}</button></div>;
              })}</div>}
              {sel.doneAt && (()=>{const fee=speedBuildQuote(c,sel,t),short=RES.filter(r=>c.res[r]<(fee[r]??0));return <div><button disabled={busy||short.length>0} onClick={()=>act({type:"speedBuild",...selected})}>Hoàn tất ngay · {costText(fee)}</button><p className="small muted">Phí thêm: kim cương (30 giây/viên) và vật liệu theo thời gian còn lại. Cấp 1: tối đa 25%, cấp 2: 50%, từ cấp 3: 100% giá vật liệu lần nâng. Không hoàn phí tăng tốc.{short.length>0?` Thiếu: ${costText(Object.fromEntries(short.map(r=>[r,Math.ceil((fee[r]??0)-c.res[r])])))}.`:''}</p></div>;})()}
              {(sel.flooded || sel.burned) && <button className="primary" disabled={busy} onClick={() => act({ type: "repair", ...selected })}>Sửa ({costText(repairCost(sel.k, sel.lvl, !!sel.burned, c.era))})</button>}
              {!["storehouse","grandstore"].includes(sel.k) && B[sel.k].up && sel.lvl >= 1 && sel.lvl < (sel.k==="hall"?rules.maxEra:MAX_LVL) && sel.lvl >= levelCap(c, sel.k) && (
                <p className="muted small">{hallLv ? `Nâng Đình làng lên cấp ${sel.lvl + 1} để nâng tiếp.` : "Xây Đình làng (Thời đồ đồng) để nâng cấp công trình."}</p>
              )}
              {!["storehouse","grandstore"].includes(sel.k) && B[sel.k].up && sel.lvl >= 1 && sel.lvl < (sel.k==="hall"?rules.maxEra:MAX_LVL) && sel.lvl < levelCap(c, sel.k) && !sel.doneAt && !sel.flooded && !sel.burned && !sel.stranded && (
                <button disabled={busy} onClick={() => act({ type: "upgrade", ...selected })}>
                  Lên cấp {sel.lvl + 1} ({costText(levelCost(sel.k, sel.lvl + 1, c.era))}, {fmtDur(buildMs(sel.k, sel.lvl + 1))})
                </button>
              )}
              <details className="ui-details"><summary>Phá dỡ & hoàn vật liệu</summary><DemolitionPanel key={selI} city={c} tile={selI} now={t} disabled={busy} onConfirm={async()=>{
                const ok=await act({type:"demolish",...selected});
                if(ok){setSelected(null);setMsg({text:"Đã phá dỡ và hoàn vật liệu vào kho. Chi tiết trong Thông báo."});}
                return ok;
              }}/></details>

            </div>
          )}
        </ContextCard>
      )}


      {armyManagement&&!visiting&&<ArmyManagement city={c} now={t} busy={busy} act={act} onClose={()=>setArmyManagement(false)}/>}
      {economyOpen&&!visiting&&<EconomySummary city={c} now={t} stats={st} onClose={()=>setEconomyOpen(false)}/>}
      {finalReview&&<FinalWonderReview city={c} kind={finalReview} now={t} onClose={()=>setFinalReview(null)} onConfirm={()=>{finalConfirmed.current=finalReview;pickTool(finalReview);setFinalReview(null);}} onLocate={tile=>{setFinalReview(null);setSelected({x:tile%W,y:Math.floor(tile/W)});setPanel(null);focusOn(fitRef.current,camRef.current,tile%W+.5,Math.floor(tile/W)+.5,Math.min(MAX_ZOOM,60/fitRef.current.TW));}}/>}
      <div className="hud-bottom">
        {planting&&<button onClick={()=>setPlanting(false)}>Kết thúc trồng cây</button>}
        {regionMode&&<div className="pickbar"><b>{regionMode==='soldiers'?`${pickedSoldiers.size} lính`:`${picked.size} dân`} đã chọn</b>{regionMode==='soldiers'&&<details className="command-help"><summary>Chọn theo loại quân</summary><TroopTypePicker counts={c.army} filter={soldierType} onChoose={(type,additive)=>{setSoldierType(type);const ids=homeSoldiers(c,now()).filter(s=>!type||s.u===type).map(s=>s.id);setPickedSoldiers(old=>new Set([...(additive?old:[]),...ids]));}}/></details>}<details className="command-help"><summary>Cách chọn & ra lệnh</summary><p>Kéo khung để chọn · Shift để chọn thêm · bấm đất để {regionMode==='soldiers'?'dàn quân gác quanh điểm bấm':'di chuyển'}. Tắt chế độ để kéo bản đồ.</p></details>{regionMode==='people'&&picked.size>0&&<button onClick={()=>setRegionMode(null)}>Giao việc</button>}<button onClick={()=>{selectionDrag.current=null;setRegionMode(null);setPickedSoldiers(new Set());setPicked(new Set());}}>Bỏ chọn</button></div>}
        {!regionMode&&picked.size > 0 && (
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
            <details className="command-help"><summary>Vị trí & cách đặt</summary><p>Ô xanh: xây được · ô đỏ: không hợp lệ. {placementHint(tool)}</p></details>
            {(tool==='dam'||tool==='green')&&finalWonderError(c,tool,t)&&<span className="err">{finalWonderError(c,tool,t)} <button onClick={()=>setFinalReview(tool)}>Xem toàn bộ điều kiện</button></span>}
            {(tool==='wall'||tool==='gate')&&<><DefenseOrientation value={defenseOrientation} axis={defenseAxis(c,hover?idx(hover.x,hover.y):-1,{tile:hover?idx(hover.x,hover.y):-1,building:{k:tool,lvl:1,doneAt:null,...(defenseOrientation!=='auto'?{orientation:defenseOrientation}:{})}})} onChange={setDefenseOrientation}/><span className="small">Phím R để xoay. Xoay và tự nối không tốn tài nguyên.</span></>}
            <button onClick={()=>{
              const prerequisite=finalWonderError(c,tool,t);if(prerequisite){setMsg({text:prerequisite,err:true});if(tool==='dam'||tool==='green')setFinalReview(tool);return;}
              const allowed=placementTiles(c,D,tool,rules);
              let best=-1,distance=Infinity;
              for(let i=0;i<W*W;i++)if(allowed(i)){const d=cheb(c.camp,i);if(d<distance){best=i;distance=d;}}
              if(best<0){setMsg({text:"Chưa có ô xây được: kiểm tra vật liệu, thợ rảnh, giới hạn công trình và điều kiện vị trí. "+placementHint(tool),err:true});return;}
              focusOn(fitRef.current,camRef.current,best%W+.5,Math.floor(best/W)+.5,Math.min(MAX_ZOOM,60/fitRef.current.TW));
              setHover({x:best%W,y:Math.floor(best/W)});
            }}>Tìm ô xây được</button>
            <button onClick={() => pickTool(null)}>Xong</button>
          </div>
        )}
        <div className={"status" + (status?.err ? " err" : "") + (!status?.text?" quiet-status":"")}><span className="save-state" role="status">{({initializing:'Đang mở làng…',queued:'Chờ lưu',sending:'Đang đồng bộ…',saved:'Đã lưu',offline:'Mất kết nối · chưa lưu xong',readonly:'Tab khác đang điều khiển · tab này chỉ xem',error:'Cần kiểm tra đồng bộ'})[actionQueue.current instanceof OptimisticCityQueue?(saving?'sending':'saved'):saveStatus]}{status?.text?' · ':''}</span>{(saveStatus==='offline'||saveStatus==='error')&&<button onClick={()=>{const q=actionQueue.current;if(q instanceof BatchedCityQueue)void q.refresh().then(()=>q.flush());}}>Thử đồng bộ</button>}{status?.text??""}</div>
      </div>

      {!visitRef.current&&c.era>=5&&<EraOfflineSummary city={c} now={t}/>}
      {helpOpen && <HowToPlay maxEra={rules.maxEra} onClose={()=>setHelpOpen(false)} />}
      {battleOpen && <BattleView id={battleOpen} onClose={() => { setBattleOpen(null); void loadCity(); void war.refresh(); }} onSettled={() => { void loadCity(); void war.refresh(); }} />}
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
          onAttack={async (id, troops, magic) => {
            if (busy) return;
            setBusy(true);
            try {
              const res = await externalCity(()=>fetch("/api/battles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ target: id, troops, ...(magic?.manaSource&&(troops.firemage||troops.watermage)?{manaSource:magic.manaSource}:{}), ...(magic?.spells?.length?{spells:magic.spells}:{}) }) }));
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

      <nav className="game-nav" aria-label="Bảng điều khiển chính">
        {([{k:'shop',icon:'shop',label:'Xây dựng'},{k:'people',icon:'pop',label:'Dân làng'},{k:'army',icon:'army',label:'Quân đội'},{k:'worldmenu',icon:'world',label:'Thế giới'},{k:'manage',icon:'era',label:'Quản lý'}] as const).map(item=><button key={item.k} aria-pressed={panelGroup(panel)===item.k} onClick={()=>openPanel(item.k)}><Icon k={item.icon}/><span>{item.label}</span>{item.k==='manage'&&attention.some(i=>i.severity==='urgent')&&<i className="nav-dot" aria-label="Có việc khẩn"/>}</button>)}
      </nav>

      {panel && (
        <GamePanel feedback={msg?.err?msg.text:undefined} onDismissFeedback={()=>setMsg(null)} title={PANEL_LABELS[panel]} onClose={()=>setPanel(null)} onBack={panelGroup(panel)!==panel?()=>setPanel(panelGroup(panel) as Panel):undefined}>
            {panel==='magic'&&<MagicPanel key={magicTab} city={c} now={t} busy={busy} act={act} maxEra={Math.min(rules.maxEra,9)} initialTab={magicTab} onLocate={locateTile}/>}
            {panel==='zombies'&&<ZombiePanel city={c} now={t} busy={busy} act={act} onLocate={locateTile}/>}
            {panel==='manage'&&<>
              <p className="panel-intro">{name}<span>{ERA_NAMES[c.era]} · {populationStatus}</span></p>
              <div className="menu-links"><button onClick={()=>setPanel('zombies')}><Icon k="army"/><span>Zombie & cứu hộ<small>{c.zombies?`${c.zombies.actors.length} zombie · bảo vệ, bệnh và thiệt hại`:'Đọc luật mới · 5 phút chuẩn bị sau khi bật'}</small></span><b>›</b></button>
                <button onClick={()=>setPanel('attention')}><Icon k="log"/><span>Cần chú ý<small>{attention.length} việc · ưu tiên vấn đề đang ảnh hưởng làng</small></span><b>›</b></button>
                <button onClick={()=>setPanel('resources')}><Icon k="food"/><span>Tài nguyên & thu chi<small>Trong kho, thực nhận và sức chứa</small></span><b>›</b></button>
                <button onClick={()=>setPanel('era')}><Icon k="era"/><span>Phát triển & vận hành<small>Lên đời, nước, điện, ô nhiễm và kỳ quan</small></span><b>›</b></button>
                {c.magic&&<button onClick={()=>setPanel('magic')}><Icon k="rune"/><span>Ma pháp<small>{c.magic.research?'Đang nghiên cứu · ':''}Nghiên cứu, mạng mana, lựa chọn và phép</small></span><b>›</b></button>}
                {hallLv>0&&<button onClick={()=>setPanel('control')}><Icon k="build"/><span>Đình làng<small>Nhóm việc, tự động và kẻng báo động</small></span><b>›</b></button>}
                <button onClick={()=>setPanel('log')}><Icon k="log"/><span>Thông báo<small>{unreadCount?`${unreadCount} tin chưa đọc`:'Lịch sử làng, ngoại giao và trận đánh'}</small></span><b>›</b></button>
                <button onClick={()=>setPanel('rank')}><Icon k="rank"/><span>Xếp hạng<small>So sánh các làng</small></span><b>›</b></button>
                <button onClick={()=>setHelpOpen(true)}><span className="menu-symbol">?</span><span>Cách chơi<small>Tìm luật và hướng dẫn theo chủ đề</small></span><b>›</b></button>
                <button onClick={()=>setPanel('friends')}><Icon k="friends"/><span>{me.user?.name??'Tài khoản'}<small>Bạn bè và đăng xuất</small></span><b>›</b></button>
              </div>
              <details className="ui-details"><summary>Hiển thị</summary><label className="setting-row"><input type="checkbox" checked={largeText} onChange={e=>setLargeText(e.target.checked)}/> Chữ lớn</label><p className="small muted">Tùy chọn lưu trên máy này. Hiệu ứng tôn trọng cài đặt giảm chuyển động của thiết bị.</p></details>
              <p className="small muted">{SEASONS[season]} · còn {fmtDur(nextSeasonIn)}{season===2?' · Mùa lũ':''}</p><FrontierStatus city={c} now={t}/>
            </>}
            {panel==='worldmenu'&&<>
              <p className="panel-intro">Bên ngoài làng<span>{c.trips?.length??0} chuyến sứ giả · {activeWars.length} đoàn quân hoạt động</span></p>
              <button className="primary wide" onClick={()=>{setWorldOpen(true);setPanel(null);}}>Mở bản đồ thế giới →</button>
              <div className="menu-links"><button onClick={()=>setPanel('friends')}><Icon k="friends"/><span>Bạn bè<small>Tìm bạn, kết bạn và xem làng</small></span><b>›</b></button><button onClick={()=>setPanel('market')}><Icon k="shop"/><span>Chợ & đoàn xe<small>{market.newOrders?`${market.newOrders} lô hàng mới`:'Mua bán, vận chuyển và hộ tống'}</small></span><b>›</b></button><button onClick={()=>setPanel('log')}><Icon k="log"/><span>Ngoại giao & tin tức<small>Lời nhắn, vị trí được chia sẻ và kết quả chuyến đi</small></span><b>›</b></button></div>
              <details className="ui-details"><summary>Vì sao chưa thấy nước bạn bè?</summary><p>Kết bạn cho phép xem làng. Vị trí trên bản đồ vẫn giữ kín tới khi sứ giả khám phá hoặc được chia sẻ.</p></details>
            </>}
            {panel==='attention'&&<VillageAttention items={attention} expanded onOpen={()=>{}} onAction={handleAttention}/>}
            {panel==='resources'&&<><ResourceDetails key={resourceFocus??'all'} city={c} stats={st} now={t} resource={resourceFocus} populationStatus={populationStatus} onEconomy={()=>setEconomyOpen(true)} onPeople={()=>setPanel('people')}/><details className="ui-details"><summary>Đói & hồi phục</summary><HungerNotice city={c} onFindFood={()=>setPanel('people')}/></details></>}
            {panel === "shop" && <BuildingCatalog city={c} D={D} rules={rules} initialEra={shopEra} initialKind={shopFocus} onChoose={k=>{if(k==='dam'||k==='green')setFinalReview(k);else pickTool(k);}} onLocate={locateTile}/>}

            {panel === "army" && (
              <>
                <p className="panel-intro">{troopCount(c.army)} quân ở nhà<span>{used}/{cap} chỗ quân · sức mạnh {fmt(homePower)}</span></p>
                <div className="tabs" role="group" aria-label="Quản lý quân đội">{([['home','Ở nhà'],['recruit','Tuyển quân'],['march','Hành quân']] as const).map(([key,label])=><button key={key} className={'tab'+(armyTab===key?' on':'')} aria-pressed={armyTab===key} onClick={()=>setArmyTab(key)}>{label}</button>)}</div>
                {armyTab==='home'&&<>

                {!cap ? (
                  <p className="small">Chưa có Trại lính. <button className="link" onClick={() => { setShopEra(1); setPanel("shop"); }}>Mở Cửa hàng để xây</button>.</p>
                ) : (
                  <p className="small">Sức chứa trại: <b>{used}/{cap}</b> · Quân ở nhà: <b>⚔ {fmt(homePower)}</b></p>
                )}
                <div className="army-roster" role="group" aria-label="Chọn quân ở nhà để ra gác">{UKEYS.filter(u=>(c.army[u]??0)>0).map(u=><button key={u} onClick={()=>{pickTool(null);setSoldierType(u);setRegionMode('soldiers');setPickedSoldiers(new Set(homeSoldiers(c,t).filter(s=>s.u===u).map(s=>s.id)));setPanel(null);}}><UnitPortrait unit={u}/><span>{UNITS[u].n}</span><b>{c.army[u]}</b><small>Chọn để ra gác →</small></button>)}</div>
                <button onClick={()=>setArmyManagement(true)}>Quản lý quân · giải ngũ</button>

                <p className="muted small">Đánh nước khác: mở Thế giới, cử sứ giả thăm rồi chọn quân. Hai nước cần đăng nhập Google.</p>
                <h3>Phòng thủ làng</h3>
                <p className="muted small">Đặt tối đa 20 điểm gác. Lính ở nhà tự bảo vệ các điểm này khi bạn vắng mặt.</p>
                <button onClick={() => { setPickedSoldier(null); setGuardEditing(true); setTool(null); setPicked(new Set()); setSelected(null); setPanel(null); }}>Đặt điểm gác ({c.guardPosts?.length ?? 0}/20)</button>
                {!!c.guardPosts?.length && <button onClick={() => act({ type: "setGuardPosts", posts: [] })}>Xóa các điểm gác</button>}
                {(c.shieldUntil ?? 0) > t && <p className="ok small">Khiên bảo vệ còn {fmtDur(c.shieldUntil! - t)}. Xuất quân sẽ bỏ khiên.</p>}
                </>}
                <div hidden={armyTab!=='recruit'}><ArmyRecruitment city={c} now={t} busy={busy} act={act} rules={rules}/></div>
                {armyTab==='march'&&<>
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
                </>}
      {(c.raid || c.raidEncounter) && (
        <div className="raid-detail" role="alert">
          <b>⚠ Man rợ ⚔ {c.raid?.power ?? c.raidEncounter!.power} · {raidPhase(c,t)==="warning"?"đang chuẩn bị tấn công":raidPhase(c,t)==="enter"?"đang tiến vào làng":raidPhase(c,t)==="fight"?"đang giao chiến":"đang rút lui"}</b>
          <span>{raidPhase(c,t)==="warning" ? `tới sau ${fmtDur(c.raid!.at-t)} · ${civiliansInDanger(c,t)?"dân đang tìm chỗ trú":"dân tiếp tục làm việc; tự trú khi còn 60 giây"}` : "Dân giữ chỗ trú tới khi toán quân rút khỏi làng"} · quân ở nhà ⚔ {fmt(homePower)}</span>
          {c.raid && raidPhase(c,t)==="warning" && (control ? (
            <button className="primary" disabled={busy || !!c.alarm} onClick={() => act({ type: "alarm" })}>{c.alarm ? "Đã đánh kẻng" : "Đánh kẻng"}</button>
          ) : <span className="muted small">Đình làng cấp 3 mới đánh kẻng được</span>)}
        </div>
      )}

      {(activeWars.length>0 || war.error) && (
        <aside className="war-details" aria-live="polite">
          {war.error && <p className="small">{war.error}</p>}
          {activeWars.map((w) => (
            <div key={w._id} className={w.side === "defender" ? "incoming" : ""}>
              <b>{w.side === "defender" ? w.status==='returning'?`${w.attackerName} đang rút quân`:`${w.attackerName} tiến đánh làng!` : `Đoàn quân tới ${w.defenderName}`}</b>
              <span className="small">{w.status === "marching" ? ` · tới sau ${fmtDur(w.arrive - t)}` : w.status === "returning" ? ` · về sau ${fmtDur((w.back ?? t) - t)}` : " · đang giao chiến"}</span>
              {w.status === "fighting" && <button onClick={() => { void externalCity(async()=>{setBattleOpen(w._id);setPanel(null);}).catch(e=>setMsg({text:e.message,err:true})); }}>Chỉ huy trận</button>}
            </div>
          ))}
        </aside>
      )}
                <details className="ui-details"><summary>Khẩu phần & phòng thủ</summary><p>Mỗi quân dùng {upkeep.soldier.food/6} thực/10 phút và {upkeep.soldier.wood} gỗ/giờ. Khẩu phần hành quân đã trả không bị trừ hai lần. Đặt điểm gác để quân ở nhà tự phòng thủ khi bạn vắng.</p></details>
              </>
            )}

            {panel === "people" && <>
              <p className="panel-intro">{c.people.length} dân · {idle.length} có thể nhận việc<span>{populationStatus}</span></p>
              <div className="tabs" role="group" aria-label="Quản lý dân làng">{([['assign','Phân công'],['directory','Từng người']] as const).map(([key,label])=><button key={key} className={'tab'+(peopleTab===key?' on':'')} aria-pressed={peopleTab===key} onClick={()=>setPeopleTab(key)}>{label}</button>)}</div>
              {picked.size>0&&<button className="primary" onClick={()=>setPanel(null)}>Giao việc cho {picked.size} người trên bản đồ →</button>}
              <div hidden={peopleTab!=='assign'}><button disabled={!idle.length} onClick={()=>{setPicked(new Set(idle.map(p=>p.id)));setPanel(null);}}>Chọn {idle.length} người có thể nhận việc</button><WorkforcePanel c={c} busy={busy} act={act} pickGroup={ids=>{setPicked(new Set(ids));setPickedSoldier(null);setTool(null);setPanel(null);setMsg({text:`Đã chọn ${ids.length} người. Bấm bản đồ để giao việc.`});}}/></div>{peopleTab==='directory'&&<PeopleDirectory city={c} picked={picked} label={p=>taskLabel(c,p)} detail={p=>haulDetail(p,t,st.storage,c.res,c)} onPick={togglePick} onLocate={p=>{focusPerson(p);setPanel(null);}}/>}
              <details className="ui-details"><summary>Khẩu phần & phân công</summary><p>Mỗi dân dùng {upkeep.civilian.food/6} thực/10 phút và {upkeep.civilian.wood} gỗ/giờ, kể cả khi rảnh. Người giữ nhóm khám phá hoặc đứng theo lệnh không bị điều sang việc khác.</p></details>
            </>}

            {panel==='era'&&<div className="tabs" role="group" aria-label="Phát triển và vận hành">{([['development','Phát triển'],['operations','Vận hành']] as const).map(([key,label])=><button key={key} className={'tab'+(eraTab===key?' on':'')} aria-pressed={eraTab===key} onClick={()=>setEraTab(key)}>{label}</button>)}</div>}
            {panel==='era'&&eraTab==='operations'&&c.era<4&&<p>Nước, điện và môi trường mở từ Trung đại. Hiện bạn có thể kiểm tra nguồn cung trong Tài nguyên & thu chi.</p>}
            {panel === "era" && eraTab==='operations'&&<EraCivicPanel city={c} now={t} busy={busy} act={act} view="operations" onLocate={locateTile}/>}
            {panel==='era'&&eraTab==='development'&&<>
            {panel === "era" && (next ? (
              <>
                <h3>Lên {ERA_NAMES[c.era + 1]}</h3>
                <EraRequirements city={c} hallLevel={hallLv} onBuilding={kind=>{const tile=Object.keys(c.b).find(tile=>c.b[+tile].k===kind);if(tile)locateTile(+tile);else{setShopEra(B[kind].era);setPanel('shop');}}} onResource={r=>{setResourceFocus(r);setPanel('resources');}} onPeople={()=>setPanel('people')}/>
                <EraStorageNotice era={c.era} storage={st.storage} maxEra={rules.maxEra} onOpenShop={()=>setPanel("shop")}/>
                <button className="wide primary" disabled={!reqMet(c,rules) || busy} onClick={() => act({ type: "advance" })}>
                  {reqMet(c,rules) ? `Bước sang ${ERA_NAMES[c.era + 1]}` : "Chưa đủ điều kiện"}
                </button>
                <details className="ui-details"><summary>Thay đổi & khẩu phần sau lên đời</summary><p>Lên đời tự đổi kiến trúc và mở công trình. Cấp công trình vẫn nâng riêng bằng tài nguyên. Đời sau cần dân số, kho và hạ tầng lớn hơn.</p><p>Sau khi lên đời, nhu cầu nuôi dân và quân {c.era<3?"tăng gấp đôi":"giữ mức thời Sắt"}: dân {upkeepRates(c.era+1).civilian.food/6} thực / 10 phút + {upkeepRates(c.era+1).civilian.wood} gỗ / giờ; quân {upkeepRates(c.era+1).soldier.food/6} thực / 10 phút + {upkeepRates(c.era+1).soldier.wood} gỗ / giờ mỗi người.</p></details>
              </>
            ) : (
              <>
                <h3>{ERA_NAMES[c.era]} · thời đại hiện tại</h3>
                <p className="muted small">Bạn đã đến thời đại cao nhất đang mở. Tiếp tục phát triển làng; xem nước, điện và môi trường trong Vận hành.</p>
              </>
            ))}
            <EraCivicPanel city={c} now={t} busy={busy} act={act} view="development" onLocate={locateTile}/>
            {c.magic&&<button className="wide" onClick={()=>{setMagicTab('research');setPanel('magic');}}>Mở Ma pháp · nghiên cứu, mana và phép →</button>}
            <details className="ui-details"><summary>Lộ trình các thời đại</summary><div className="era-roadmap">{erasUpTo(Math.max(6,rules.maxEra)).map(e=><p key={e.id}><b>{e.name}</b> · {e.id>rules.maxEra?"Sắp ra mắt":e.id===c.era?"Thời hiện tại":e.id<c.era?"Đã mở":"Chưa mở"}<br/><small>{e.theme}</small></p>)}</div></details>
</>}

            {panel === "log" && (
              <><DisasterNotifications city={c} onLocate={locateTile}/>{me.user && <BattleReports wars={war.wars} playerId={me.user.id} history />}<DiplomacyMessages messages={diplomacy.messages} busy={diplomacy.busy} error={diplomacy.error} onAction={diplomacy.act} /><ol className="log">
                {[...c.log,...archivedDisasters].sort((a,b)=>b.at-a.at).map((l, i) => (
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
            {panel === "friends" && <FriendsPanel me={me} reload={loadMe} onLogout={async()=>{
              const queue=actionQueue.current;
              if(queue instanceof BatchedCityQueue&&!await queue.flush()){setMsg({text:'Chưa lưu xong. Hãy nối mạng trước khi đăng xuất.',err:true});return;}
              await fetch('/api/auth/logout',{method:'POST'});location.reload();
            }} onVisit={(id) => { setPanel(null);setWorldOpen(false);setSelected(null);setPicked(new Set());setTool(null);void loadVisit(id,true); }} />}

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
        </GamePanel>
      )}
    </main>
  );
}

export type { UKey };
