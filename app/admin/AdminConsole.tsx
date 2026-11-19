"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AdminCommand,
  AdminData,
  AdminRow,
  AdminTab,
} from "@/lib/admin-types";
import "./admin.css";
const tabs: {
  id: AdminTab;
  name: string;
  icon: string;
  description: string;
}[] = [
  {
    id: "overview",
    name: "Tổng quan",
    icon: "◈",
    description: "Nhịp sống của thế giới, trong một góc nhìn.",
  },
  {
    id: "players",
    name: "Người chơi",
    icon: "♙",
    description: "Tra cứu tài khoản và ghi nhận yêu cầu hỗ trợ.",
  },
  {
    id: "cities",
    name: "Làng & thành phố",
    icon: "▥",
    description: "Theo dõi tiến trình và quản lý tên các vùng đất.",
  },
  {
    id: "battles",
    name: "Trận đánh",
    icon: "⚑",
    description: "Theo dõi hành quân và trạng thái chiến trường.",
  },
  {
    id: "market",
    name: "Chợ giao thương",
    icon: "⇄",
    description: "Tra cứu lệnh bán và hoạt động của thị trường.",
  },
  {
    id: "audit",
    name: "Nhật ký quản trị",
    icon: "◷",
    description: "Mọi thay đổi đều có người thực hiện và lý do.",
  },
];
const labels: Record<string, string> = {
  id: "Mã định danh",
  name: "Tên",
  email: "Email",
  cityId: "Mã làng",
  lastSeen: "Truy cập gần nhất",
  createdAt: "Ngày tạo",
  owner: "Chủ làng",
  era: "Thời đại",
  pop: "Dân số",
  score: "Điểm",
  updatedAt: "Lần lưu gần nhất",
  ver: "Phiên bản",
  attackerName: "Bên tấn công",
  defenderName: "Bên phòng thủ",
  status: "Trạng thái",
  arrive: "Đến nơi",
  sellerName: "Người bán",
  resource: "Tài nguyên",
  amount: "Số lượng",
  currency: "Thanh toán bằng",
  price: "Giá",
  actor: "Quản trị viên",
  action: "Thao tác",
  target: "Đối tượng",
  reason: "Lý do",
  before: "Trước",
  after: "Sau / Nội dung",
  at: "Thời gian",
};
const states: Record<string, string> = {
  marching: "Hành quân",
  fighting: "Giao chiến",
  returning: "Trở về",
  completed: "Hoàn tất",
  cancelled: "Đã hủy",
  open: "Đang bán",
  sold: "Đã bán",
  "rename-city": "Đổi tên làng",
  note: "Ghi chú hỗ trợ",
};
function display(key: string, value: AdminRow[string]) {
  if (value === null || value === "") return "—";
  if (typeof value === "number") return value.toLocaleString("vi-VN");
  if (["at", "lastSeen", "createdAt", "updatedAt", "arrive"].includes(key))
    return new Date(value).toLocaleString("vi-VN");
  return states[value] ?? value;
}
async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(body.error ?? "Không tải được dữ liệu."), {
      status: response.status,
    });
  return body;
}
export default function AdminConsole() {
  const [tab, setTab] = useState<AdminTab>("overview");
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1);
  const [data, setData] = useState<AdminData | null>(null),
    [loading, setLoading] = useState(true);
  const [error, setError] = useState(""),
    [status, setStatus] = useState(0),
    [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<AdminRow | null>(null),
    [editing, setEditing] = useState(false);
  const [value, setValue] = useState(""),
    [reason, setReason] = useState(""),
    [saving, setSaving] = useState(false),
    [saveError, setSaveError] = useState(""),
    [notice, setNotice] = useState("");
  const requestId = useRef(""),
    closeButton = useRef<HTMLButtonElement>(null),
    opener = useRef<HTMLElement | null>(null);
  const current = tabs.find((t) => t.id === tab)!;
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setStatus(0);
    setData(null);
    api(
      `/api/admin?${new URLSearchParams({ tab, q: search, page: String(page) })}`,
    )
      .then((body) => {
        if (active) setData(body);
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setStatus(e.status ?? 0);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tab, search, page, revision]);
  const close = useCallback(() => {
    if (saving) return;
    setSelected(null);
    setEditing(false);
    opener.current?.focus();
  }, [saving]);
  useEffect(() => {
    if (!selected) return;
    closeButton.current?.focus();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const nodes = Array.from(
          document.querySelectorAll<HTMLElement>(
            ".admin-dialog button:not(:disabled), .admin-dialog input, .admin-dialog textarea",
          ),
        );
        const first = nodes[0],
          last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", key);
    };
  }, [selected, close]);
  function navigate(next: AdminTab) {
    setTab(next);
    setPage(1);
    setSearch("");
    setQuery("");
    setNotice("");
  }
  function open(row: AdminRow) {
    opener.current = document.activeElement as HTMLElement;
    setSelected(row);
    setEditing(false);
    setSaveError("");
    setReason("");
    setValue("");
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || saving) return;
    setSaving(true);
    setSaveError("");
    const command: AdminCommand = {
      action: tab === "cities" ? "rename-city" : "note",
      target: String(selected.id),
      value,
      reason,
      expected: tab === "cities" ? String(selected.name) : undefined,
      requestId: requestId.current,
    };
    try {
      await api("/api/admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(command),
      });
      setSelected(null);
      setEditing(false);
      setNotice("Đã lưu thành công và ghi vào nhật ký quản trị.");
      setRevision((n) => n + 1);
      opener.current?.focus();
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const columns = data?.rows[0]
    ? Object.keys(data.rows[0]).filter((k) => k !== "id")
    : [];
  return (
    <div className="admin-shell">
      <a className="admin-skip" href="#admin-content">
        Đến nội dung
      </a>
      <aside className="admin-sidebar">
        <a href="/" className="admin-brand">
          <span className="admin-mark">≋</span>
          <span>
            Dòng Chảy
            <br />
            <strong>Thời Gian</strong>
          </span>
        </a>
        <div className="admin-nav-label">ĐIỀU HÀNH THẾ GIỚI</div>
        <nav aria-label="Quản trị game">
          {tabs.map((t) => (
            <button
              key={t.id}
              aria-current={tab === t.id ? "page" : undefined}
              onClick={() => navigate(t.id)}
            >
              <span aria-hidden="true">{t.icon}</span>
              {t.name}
            </button>
          ))}
        </nav>
        <div className="admin-sidebar-foot">
          <span className="admin-dot" /> Không gian quản trị
          <a href="/">← Trở lại game</a>
        </div>
      </aside>
      <main id="admin-content" className="admin-main">
        <header className="admin-topbar">
          <span>
            GAME OPERATIONS <span className="admin-divider">/</span>{" "}
            {current.name}
          </span>
          <span className="admin-private">◉ Chỉ dành cho quản trị viên</span>
        </header>
        <div className="admin-content">
          <section className="admin-title">
            <div>
              <p className="admin-eyebrow">DÒNG CHẢY THỜI GIAN · ADMIN</p>
              <h1>{current.name}</h1>
              <p>{current.description}</p>
            </div>
            <button
              onClick={() => setRevision((n) => n + 1)}
              disabled={loading}
            >
              ↻ {loading ? "Đang tải…" : "Làm mới"}
            </button>
          </section>
          {notice && (
            <div className="admin-success" role="status">
              ✓ {notice}
            </div>
          )}
          {error ? (
            <section className="admin-gate" role="alert">
              <div className="admin-gate-icon">
                {status === 403 ? "◇" : "↗"}
              </div>
              <h2>
                {status === 401
                  ? "Đăng nhập để tiếp tục"
                  : status === 403
                    ? "Khu vực quản trị"
                    : "Chưa tải được dữ liệu"}
              </h2>
              <p>{error}</p>
              {status === 401 ? (
                <a
                  className="admin-primary"
                  href="/api/auth/login?returnTo=%2Fadmin"
                >
                  Đăng nhập với Google →
                </a>
              ) : status === 403 ? (
                <a href="/">Trở lại game →</a>
              ) : (
                <button onClick={() => setRevision((n) => n + 1)}>
                  Thử lại
                </button>
              )}
            </section>
          ) : (
            <>
              {tab === "overview" && (
                <>
                  <section
                    className="admin-metrics"
                    aria-label="Chỉ số vận hành"
                  >
                    {(
                      data?.metrics ??
                      Array.from({ length: 6 }, (_, i) => ({
                        label: [
                          "Người chơi",
                          "Hoạt động 24 giờ",
                          "Làng đã tạo",
                          "Trận đang diễn ra",
                          "Lệnh bán đang mở",
                          "Đoàn buôn đang đi",
                        ][i],
                        value: 0,
                      }))
                    ).map((m, i) => (
                      <article key={m.label}>
                        <div className="admin-metric-label">
                          <span>{m.label}</span>
                          <span aria-hidden="true">
                            {["♙", "◉", "▥", "⚑", "⇄", "➜"][i]}
                          </span>
                        </div>
                        <strong>
                          {loading ? "—" : m.value.toLocaleString("vi-VN")}
                        </strong>
                        <small>
                          {i === 1
                            ? "Theo lần truy cập tài khoản"
                            : "Dữ liệu đã lưu trên máy chủ"}
                        </small>
                      </article>
                    ))}
                  </section>
                  <section className="admin-world-note">
                    <span aria-hidden="true">≋</span>
                    <div>
                      <h2>Mỗi vùng đất, một câu chuyện.</h2>
                      <p>
                        Theo dõi thế giới, hỗ trợ người chơi và giữ mọi thay đổi
                        minh bạch.
                      </p>
                    </div>
                    <button onClick={() => navigate("cities")}>
                      Khám phá các làng →
                    </button>
                  </section>
                </>
              )}
              <section className="admin-panel" aria-busy={loading}>
                <div className="admin-panel-header">
                  <div>
                    <h2>
                      {tab === "overview"
                        ? "Hoạt động quản trị gần đây"
                        : current.name}
                    </h2>
                    <p>
                      {tab === "overview"
                        ? "Những thao tác đã lưu cùng nhật ký kiểm toán."
                        : "25 bản ghi mỗi trang · Bấm một dòng để xem chi tiết"}
                    </p>
                  </div>
                  {tab === "overview" && (
                    <button onClick={() => navigate("audit")}>
                      Xem tất cả →
                    </button>
                  )}
                </div>
                {tab !== "overview" && (
                  <form
                    className="admin-search"
                    onSubmit={(e) => {
                      e.preventDefault();
                      setSearch(query.trim());
                      setPage(1);
                    }}
                  >
                    <label htmlFor="admin-search">Tìm kiếm</label>
                    <div>
                      <input
                        id="admin-search"
                        type="search"
                        maxLength={100}
                        placeholder={
                          tab === "players"
                            ? "Tên, email, mã người chơi hoặc mã làng…"
                            : tab === "audit"
                              ? "Quản trị viên, đối tượng, lý do…"
                              : "Tên, mã định danh hoặc trạng thái…"
                        }
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                      <button type="submit" disabled={loading}>
                        Tìm kiếm
                      </button>
                      {search && (
                        <button
                          type="button"
                          onClick={() => {
                            setQuery("");
                            setSearch("");
                            setPage(1);
                          }}
                        >
                          Xóa lọc
                        </button>
                      )}
                    </div>
                  </form>
                )}
                {loading ? (
                  <div className="admin-empty" role="status">
                    <span className="admin-loader" />
                    Đang kết nối dữ liệu quản trị…
                  </div>
                ) : data?.rows.length ? (
                  <div className="admin-table-scroll">
                    <table>
                      <thead>
                        <tr>
                          {columns.map((k) => (
                            <th key={k}>{labels[k] ?? k}</th>
                          ))}
                          <th>
                            <span className="admin-sr">Chi tiết</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.rows.map((row) => (
                          <tr key={row.id}>
                            {columns.map((k) => (
                              <td key={k}>
                                {["status", "action"].includes(k) ? (
                                  <span
                                    className={`admin-badge admin-badge-${row[k]}`}
                                  >
                                    {display(k, row[k])}
                                  </span>
                                ) : (
                                  <span title={String(row[k] ?? "")}>
                                    {display(k, row[k])}
                                  </span>
                                )}
                              </td>
                            ))}
                            <td>
                              <button
                                className="admin-detail-button"
                                aria-label={`Chi tiết ${row.name ?? row.id}`}
                                onClick={() => open(row)}
                              >
                                Chi tiết ↗
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="admin-empty">
                    <span aria-hidden="true">◷</span>
                    <h3>
                      {search ? "Không có kết quả phù hợp" : "Chưa có bản ghi"}
                    </h3>
                    <p>
                      {search
                        ? "Thử tên, mã định danh hoặc từ khóa khác."
                        : "Dữ liệu sẽ xuất hiện khi có hoạt động."}
                    </p>
                  </div>
                )}
                {tab !== "overview" && (
                  <footer className="admin-pagination">
                    <span>
                      Trang {page}
                      {search && ` · Lọc: ${search}`}
                    </span>
                    <div>
                      <button
                        disabled={loading || page === 1}
                        onClick={() => setPage((n) => n - 1)}
                      >
                        ← Trước
                      </button>
                      <button
                        disabled={loading || !data?.hasMore}
                        onClick={() => setPage((n) => n + 1)}
                      >
                        Sau →
                      </button>
                    </div>
                  </footer>
                )}
              </section>
            </>
          )}
          <footer className="admin-foot">
            <span>Dòng Chảy Thời Gian · Bảng điều hành</span>
            <span>
              {data
                ? `Cập nhật ${new Date(data.at).toLocaleTimeString("vi-VN")} · ${data.actor}`
                : "Truy cập được kiểm soát ở máy chủ"}
            </span>
          </footer>
        </div>
      </main>
      {selected && (
        <div
          className="admin-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <section
            className="admin-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-dialog-title"
          >
            <header>
              <div>
                <p className="admin-eyebrow">CHI TIẾT BẢN GHI</p>
                <h2 id="admin-dialog-title">
                  {String(
                    selected.name ??
                      states[String(selected.action)] ??
                      "Thông tin vận hành",
                  )}
                </h2>
              </div>
              <button
                ref={closeButton}
                onClick={close}
                disabled={saving}
                aria-label="Đóng chi tiết"
              >
                ✕
              </button>
            </header>
            <dl>
              {Object.entries(selected).map(([k, v]) => (
                <div key={k}>
                  <dt>{labels[k] ?? k}</dt>
                  <dd>{display(k, v)}</dd>
                </div>
              ))}
            </dl>
            {["players", "cities"].includes(tab) && !editing && (
              <button
                className="admin-primary"
                onClick={() => {
                  setEditing(true);
                  setValue(tab === "cities" ? String(selected.name) : "");
                  setReason("");
                  requestId.current = crypto.randomUUID();
                }}
              >
                {tab === "cities" ? "Đổi tên làng" : "Thêm ghi chú hỗ trợ"}
              </button>
            )}
            {editing && (
              <form className="admin-edit" onSubmit={save}>
                <h3>
                  {tab === "cities"
                    ? "Xác nhận đổi tên làng"
                    : "Ghi chú nội bộ"}
                </h3>
                <p>
                  Thao tác sẽ lưu cùng tài khoản quản trị, thời gian và lý do.
                </p>
                <label htmlFor="admin-value">
                  {tab === "cities" ? "Tên mới" : "Nội dung ghi chú"}
                </label>
                <textarea
                  id="admin-value"
                  required
                  minLength={tab === "cities" ? 2 : 1}
                  maxLength={tab === "cities" ? 24 : 2000}
                  rows={tab === "cities" ? 2 : 4}
                  value={value}
                  disabled={saving}
                  onChange={(e) => {
                    setValue(e.target.value);
                    requestId.current = crypto.randomUUID();
                  }}
                />
                <label htmlFor="admin-reason">Lý do thực hiện</label>
                <input
                  id="admin-reason"
                  required
                  minLength={5}
                  maxLength={500}
                  value={reason}
                  disabled={saving}
                  onChange={(e) => {
                    setReason(e.target.value);
                    requestId.current = crypto.randomUUID();
                  }}
                />
                {saveError && (
                  <p className="admin-error" role="alert">
                    {saveError}
                  </p>
                )}
                <div className="admin-edit-actions">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setEditing(false)}
                  >
                    Hủy
                  </button>
                  <button
                    className="admin-primary"
                    disabled={
                      saving || !value.trim() || reason.trim().length < 5
                    }
                    type="submit"
                  >
                    {saving ? "Đang lưu…" : "Xác nhận và lưu"}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
