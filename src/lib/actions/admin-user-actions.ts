"use server";

import { revalidatePath } from "next/cache";
import { requireAdminAction } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

// A ban is an access flag, not a deletion — see the `bannedAt` comment on
// User in prisma/schema.prisma for why. It blocks login immediately (see
// src/auth.ts) but preserves the account and all its data (decks,
// matches, orders, Sprites), so it can never corrupt other players'
// shared match/metagame history.
export async function banUserAction(formData: FormData) {
  const session = await requireAdminAction();
  const userId = String(formData.get("userId") ?? "");
  if (!userId || userId === session.user.id) return;

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  // Never lets an admin account be banned this way — prevents an admin
  // (including by mistake) from locking out another admin.
  if (!target || target.role === "ADMIN") return;

  await prisma.user.update({
    where: { id: userId },
    data: { bannedAt: new Date() },
  });
  revalidatePath("/admin/users");
}

export async function unbanUserAction(formData: FormData) {
  await requireAdminAction();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return;

  await prisma.user.update({
    where: { id: userId },
    data: { bannedAt: null },
  });
  revalidatePath("/admin/users");
}
