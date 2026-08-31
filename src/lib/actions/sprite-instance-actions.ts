"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { spriteInstanceNameSchema } from "@/lib/validation";

export type RenameSpriteState = {
  error: string | null;
  success: boolean;
};

export async function renameSpriteInstanceAction(
  _prevState: RenameSpriteState,
  formData: FormData,
): Promise<RenameSpriteState> {
  const session = await auth();
  if (!session?.user) {
    return { error: "You must be logged in.", success: false };
  }

  const instanceId = String(formData.get("instanceId") ?? "");
  const parsed = spriteInstanceNameSchema.safeParse(formData.get("name"));
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid name.",
      success: false,
    };
  }
  const newName = parsed.data;

  // The row to mutate — and who is allowed to mutate it — is always
  // re-derived from the database using the authenticated session, never
  // trusted from the client. A user can never rename another user's
  // Sprite instance by supplying a different instanceId, because
  // ownership is checked here against the real owner on record.
  const instance = await prisma.spriteInstance.findUnique({
    where: { id: instanceId },
    select: { id: true, ownerId: true, name: true },
  });
  if (!instance || instance.ownerId !== session.user.id) {
    return { error: "You don't own that Sprite.", success: false };
  }

  if (newName === instance.name) {
    return { error: null, success: true };
  }

  await prisma.$transaction([
    prisma.spriteInstance.update({
      where: { id: instance.id },
      data: { name: newName },
    }),
    prisma.spriteHistoryEntry.create({
      data: {
        spriteInstanceId: instance.id,
        type: "RENAMED",
        detail: { previousName: instance.name, newName },
      },
    }),
  ]);

  revalidatePath(`/sprites/mine/${instance.id}`);
  revalidatePath("/sprites/mine");

  return { error: null, success: true };
}
