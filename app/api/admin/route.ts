import { currentUser } from "@/lib/auth";
import { handleAdmin } from "@/lib/admin-handler";
import { readAdmin, writeAdmin } from "@/lib/admin-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const run = (request: Request) =>
  handleAdmin(request, {
    user: currentUser,
    allowlist: () => process.env.ADMIN_USER_IDS,
    read: readAdmin,
    write: writeAdmin,
  });
export const GET = run;
export const POST = run;
