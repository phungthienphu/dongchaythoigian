"use client";

import { useEffect, useRef, type FormEvent } from "react";
import { ERAS, RELEASED_ERA } from "@/lib/eras";
import { derive, G, idx, newCity, R, W, type BKey } from "@/lib/engine";
import { drawCity, type View } from "./draw";

/** A fixed illustration using the game's renderer. No simulation, API calls or animation loop. */
function VillageScene() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const c = newCity(1_800_000_000_000, 728193);
    c.era = 2;
    c.seen.fill(1);
    c.camps = [];
    c.herds = [];
    const cx = c.camp % W, cy = Math.floor(c.camp / W);
    const places: [BKey, number, number][] = [
      ["hall", 0, 0], ["house", 2, -2], ["house", 4, 0], ["house", 4, -4],
      ["storehouse", -1, 3], ["gather", 3, 3], ["farm", 1, 5], ["farm", 3, 5],
      ["envoy", 0, -4], ["market", -2, -2], ["builderhouse", 5, 3], ["barracks", 5, -2],
    ];
    for (const [k, x, y] of places) {
      const at = idx(cx + x, cy + y);
      if (c.t[at] === R) continue;
      c.t[at] = G;
      c.b[at] = { k, lvl: 1, doneAt: null };
    }
    const d = derive(c);
    const paint = () => {
      const { width, height } = cv.getBoundingClientRect();
      if (!width || !height) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(width * ratio);
      cv.height = Math.round(height * ratio);
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const tw = width < 420 ? 43 : 56, th = tw / 2;
      const fx = cx - 1, fy = cy + 1;
      const v: View = { TW: tw, TH: th, s: tw / 64, width, height,
        ox: width * .5 - (fx - fy) * tw / 2, oy: height * .52 - (fx + fy) * th / 2 };
      drawCity(ctx, c, d, { v, now: c.t0, anim: 0, hover: null, selected: null, tool: null,
        villagers: [], picked: new Set(), fx: [], chopping: new Set() });
    };
    const observer = new ResizeObserver(paint);
    observer.observe(cv);
    return () => observer.disconnect();
  }, []);
  return <canvas ref={ref} aria-hidden="true" />;
}

function GoogleMark() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.41 13.92a6 6 0 0 1 0-3.84V7.49H3.07a10 10 0 0 0 0 9.02l3.34-2.59Z"/><path fill="#EA4335" d="M12 5.96c1.47 0 2.79.5 3.83 1.5l2.87-2.88A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.93 5.49l3.34 2.59C7.2 7.72 9.4 5.96 12 5.96Z"/></svg>;
}

type Props = {
  user: { name: string } | null;
  name: string;
  onName: (name: string) => void;
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  message: { text: string; err?: boolean } | null;
  maxEra?: number;
};

export default function WelcomeScreen({ user, name, onName, onCreate, busy, message, maxEra = RELEASED_ERA }: Props) {
  const eras = ERAS.filter(e => e.id <= maxEra);
  return <main className="welcome">
    <header className="welcome-header">
      <a href="/" className="welcome-wordmark" aria-label="Dòng Chảy Thời Gian — trang chủ"><svg viewBox="0 0 36 36" width="32" height="32" fill="none" aria-hidden="true"><path d="M5 10h26M5 26h26M5 18c8-10 18 10 26 0" stroke="currentColor" strokeWidth="2"/><path d="m13 4 5 5 5-5M13 32l5-5 5 5" stroke="currentColor" strokeWidth="1.5"/></svg><span>Dòng Chảy Thời Gian</span></a>
      <a href="#truoc-khi-choi" className="welcome-help-link">Trước khi chơi <span aria-hidden="true">↗</span></a>
    </header>

    <div className="welcome-main">
      <section className="welcome-world" aria-labelledby="welcome-title">
        <div className="welcome-story">
          <p className="welcome-eyebrow">XÂY LÀNG · QUẢN LÝ · CHIẾN THUẬT</p>
          <h1 id="welcome-title">Dòng Sông<br/>Thời Đại<span>.</span></h1>
          <p>Từ năm người bên bến sông,<br/>dựng nên một đất nước của bạn.</p>
        </div>
        <div className="welcome-scene"><VillageScene/><span className="welcome-scene-caption">Một góc làng trong game</span></div>
        <div className="welcome-era-track" aria-label="Các thời đại đã mở">
          {eras.map(e => <span key={e.id}><small>{String(e.id).padStart(2, "0")}</small>{e.name.replace("Thời ", "")}</span>)}
        </div>
      </section>

      <section className="welcome-entry" aria-labelledby="entry-title">
        <p className="welcome-eyebrow">ĐĂNG NHẬP</p>
        <h2 id="entry-title">{user ? `Chào ${user.name}.` : "Về làng thôi."}</h2>
        <p className="welcome-entry-intro">{user ? "Đặt tên cho ngôi làng đầu tiên. Tiến trình sẽ được gắn với tài khoản Google của bạn." : "Đăng nhập để trở về làng cũ, hoặc bắt đầu một ngôi làng mới."}</p>
        {!user && <>
          <a className="welcome-google" href="/api/auth/login"><GoogleMark/>Tiếp tục với Google<span aria-hidden="true">→</span></a>
          <p className="welcome-account-note">Tiến trình gắn với tài khoản của bạn. Có thể chơi tiếp trên máy khác, tìm bạn và thăm làng nhau.</p>

        </>}
        {user && <form onSubmit={onCreate} className="welcome-form">
          <label htmlFor="cityname">Tên ngôi làng của bạn</label>
          <input id="cityname" value={name} onChange={e => onName(e.target.value)} minLength={2} maxLength={24} required placeholder="Ví dụ: Bến Phù Sa" autoComplete="off" aria-describedby="village-name-hint" disabled={busy}/>
          <p id="village-name-hint">Từ 2–24 ký tự. Bạn sẽ bắt đầu ở thời đồ đá với 5 dân làng.</p>
          <button type="submit" disabled={busy || name.trim().length < 2}>{busy ? "Đang dựng làng…" : "Dựng làng mới"}<span aria-hidden="true">→</span></button>
        </form>}
        {!user && <p className="welcome-login-note">Cần tài khoản Google để chơi. Mỗi tài khoản chơi trên một trình duyệt tại một thời điểm; đăng nhập ở máy mới sẽ ngắt phiên chơi cũ.</p>}
        {message && <p className={`welcome-message${message.err ? " is-error" : ""}`} role={message.err ? "alert" : "status"}>{message.text}</p>}
        <div className="welcome-first-steps">
          <h3>Những việc đầu tiên</h3>
          <ol><li><span>01</span>Giao dân kiếm thức ăn và chặt gỗ.</li><li><span>02</span>Dựng nhà, xây kho, đón thêm dân.</li><li><span>03</span>Khám phá đất mới, giao thương và lên đời.</li></ol>
        </div>
      </section>
    </div>

    <section id="truoc-khi-choi" className="welcome-info" aria-labelledby="before-title">
      <div><p className="welcome-eyebrow">VÀI ĐIỀU CẦN BIẾT</p><h2 id="before-title">Trước khi chơi</h2><p>Hướng dẫn chi tiết luôn có sẵn trong game.</p></div>
      <div className="welcome-questions">
        <details><summary>Rời game thì làng có dừng lại không?</summary><p>Làng vẫn tiếp tục sản xuất và tiêu hao tài nguyên. Nhớ bố trí người kiếm thức ăn và chừa chỗ trong kho trước khi rời đi; khi trở lại, game sẽ tính phần thời gian bạn vắng mặt.</p></details>
        <details><summary>Tài nguyên được cộng vào lúc nào?</summary><p>Khi dân mang hàng về nộp. Gỗ, đá hay thức ăn đang được mang trên đường chưa nằm trong kho. Nhà ở và thức ăn giúp làng có thêm dân.</p></details>
        <details><summary>Có thể chơi cùng bạn bè không?</summary><p>Có. Đăng nhập Google để tìm bạn, kết bạn và thăm làng nhau. Muốn biết vị trí nước khác trên bản đồ thế giới, bạn cần cử sứ giả đi tìm. Khi đủ quân và lương thực, bạn có thể xuất quân.</p></details>
      </div>
    </section>
    <footer className="welcome-footer"><span>Dòng Chảy Thời Gian</span><span>Từ thời đồ đá đến {eras.at(-1)?.name.toLowerCase()}.</span></footer>
  </main>;
}
