import type { UserDoc } from "./db";
import { AdminError, adminCommand, adminQuery, isAdmin } from "./admin-policy";
import type { AdminCommand, AdminData, AdminTab } from "./admin-types";
import { boundedJSON, InputError } from "../cloudflare/api/runtime";
export type AdminDependencies = {
  user(): Promise<UserDoc | null>;
  allowlist(): string | undefined;
  read(
    actor: string,
    tab: AdminTab,
    q: string,
    page: number,
  ): Promise<AdminData>;
  write(actor: string, command: AdminCommand): Promise<{ ok: boolean }>;
};
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      vary: "Cookie",
    },
  });
export async function handleAdmin(request: Request, deps: AdminDependencies) {
  try {
    const user = await deps.user();
    if (!user)
      return json({ error: "Đăng nhập Google để mở trang quản trị." }, 401);
    if (!isAdmin(user._id, deps.allowlist()))
      return json(
        { error: "Tài khoản này chưa được cấp quyền quản trị." },
        403,
      );
    if (request.method === "GET") {
      const { tab, q, page } = adminQuery(new URL(request.url));
      return json(await deps.read(user._id, tab, q, page));
    }
    if (request.method !== "POST")
      return json({ error: "Phương thức không hợp lệ." }, 405);
    const configured = process.env.APP_URL;
    const expected = configured
      ? new URL(configured).origin
      : new URL(request.url).origin;
    if (
      request.headers.get("origin") !== expected ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      return json({ error: "Yêu cầu không hợp lệ." }, 403);
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      return json({ error: "Cần gửi JSON." }, 415);
    const command = adminCommand(await boundedJSON(request, 8192));
    return json(await deps.write(user._id, command));
  } catch (error) {
    if (error instanceof AdminError || error instanceof InputError)
      return json({ error: error.message }, error.status);
    console.error("admin_request_failed");
    return json(
      { error: "Không kết nối được dữ liệu quản trị. Vui lòng thử lại." },
      503,
    );
  }
}
