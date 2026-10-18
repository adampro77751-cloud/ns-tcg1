import { redirect } from "next/navigation";
import { auth } from "@/auth";

export async function requirePlayerPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session;
}

export async function requirePlayerAction() {
  const session = await auth();
  if (!session?.user) throw new Error("You must be logged in to play.");
  return session;
}
