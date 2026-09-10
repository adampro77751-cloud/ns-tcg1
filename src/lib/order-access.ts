import { redirect } from "next/navigation";
import { auth } from "@/auth";

// Order management (viewing all Orders, marking them Delivered) is open to
// the ADMIN role plus this small allowlist of specific accounts — not a new
// general permission/role, just this one account by explicit request. Same
// shape as src/lib/admin.ts's requireAdminPage/Action, kept separate since
// this is intentionally narrower than full admin access (an order manager
// gets none of the other admin tools).
const EXTRA_ORDER_MANAGER_USERNAMES = ["Oscame"];

function isOrderManager(user: { role?: string; username?: string } | undefined) {
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  return Boolean(user.username && EXTRA_ORDER_MANAGER_USERNAMES.includes(user.username));
}

export async function requireOrderManagerPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!isOrderManager(session.user)) redirect("/store");
  return session;
}

export async function requireOrderManagerAction() {
  const session = await auth();
  if (!session?.user || !isOrderManager(session.user)) {
    throw new Error("Unauthorized: order management access required.");
  }
  return session;
}

export async function canManageOrders() {
  const session = await auth();
  return isOrderManager(session?.user);
}
