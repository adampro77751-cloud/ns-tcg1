import { redirect } from "next/navigation";
import { auth } from "@/auth";

// For Server Components/pages: redirect non-admins away rather than
// rendering anything admin-only. Unauthenticated users go to /login;
// logged-in non-admins go home.
export async function requireAdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/");
  return session;
}

// For Server Actions: throws, which aborts the action before any mutation
// runs. This is what protects admin actions even if someone calls them
// directly, bypassing the UI entirely (the UI hiding admin controls is not
// itself the security boundary).
export async function requireAdminAction() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    throw new Error("Unauthorized: admin access required.");
  }
  return session;
}

// For Route Handlers: returns the session (or null) so the route can shape
// its own 401/403 Response instead of an unhandled exception.
export async function getAdminSession() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") return null;
  return session;
}
