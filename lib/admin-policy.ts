import type { AdminCommand, AdminTab } from "./admin-types";
export class AdminError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
export function isAdmin(uid: string, allowlist: string | undefined) {
  return (
    !!uid &&
    (allowlist ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .includes(uid)
  );
}
export function adminQuery(url: URL) {
  const tab = url.searchParams.get("tab") ?? "overview";
  if (
    !["overview", "players", "cities", "battles", "market", "audit"].includes(
      tab,
    )
  )
    throw new AdminError("Mục quản trị không hợp lệ.");
  const q = (url.searchParams.get("q") ?? "").trim();
  const page = Number(url.searchParams.get("page") ?? "1");
  if (q.length > 100 || !Number.isInteger(page) || page < 1 || page > 1000)
    throw new AdminError("Bộ lọc không hợp lệ.");
  return { tab: tab as AdminTab, q, page };
}
export function adminCommand(input: unknown): AdminCommand {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new AdminError("Nội dung không hợp lệ.");
  const c = input as Record<string, unknown>;
  if (
    !["rename-city", "note", "zombie-system"].includes(c.action as string) ||
    typeof c.target !== "string" ||
    !c.target.trim() ||
    c.target.length > 200 ||
    typeof c.reason !== "string" ||
    c.reason.trim().length < 5 ||
    c.reason.length > 500 ||
    typeof c.value !== "string" ||
    !c.value.trim() ||
    c.value.length > (c.action === "note" ? 2000 : 24) ||
    /[\u0000-\u001f\u007f]/.test(c.target + c.reason + c.value) ||
    typeof c.requestId !== "string" ||
    !/^[a-f0-9-]{36}$/.test(c.requestId) ||
    (c.action === "zombie-system" &&
      (c.target !== "global" ||
        !["true", "false"].includes(c.value) ||
        typeof c.expected !== "string" ||
        !/^\d+$/.test(c.expected))) ||
    (c.action === "rename-city" &&
      (c.value.trim().length < 2 ||
        typeof c.expected !== "string" ||
        c.expected.length > 100))
  )
    throw new AdminError(
      "Kiểm tra tên (2–24 ký tự), nội dung và lý do (ít nhất 5 ký tự).",
    );
  return {
    action: c.action as AdminCommand["action"],
    target: c.target,
    reason: c.reason.trim(),
    value: c.value.trim(),
    expected: c.expected as string | undefined,
    requestId: c.requestId,
  };
}
export function literalSearch(q: string) {
  return q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
