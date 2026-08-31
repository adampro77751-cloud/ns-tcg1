import { prisma } from "@/lib/prisma";

// "No Sprite" (empty selection) is always legitimate and resolves to null.
// Anything else must be an individual SpriteInstance actually owned by this
// user — re-checked here against the database on every call, never trusted
// from the submitted value, so a manipulated/guessed instance ID can never
// equip another player's (or nonexistent) Sprite. Shared by match and event
// join flows.
export async function resolveOwnedSpriteInstance(
  spriteInstanceId: string,
  userId: string,
): Promise<string | null> {
  if (!spriteInstanceId) return null;
  const instance = await prisma.spriteInstance.findUnique({
    where: { id: spriteInstanceId },
    select: { id: true, ownerId: true },
  });
  if (!instance || instance.ownerId !== userId) {
    throw new Error("You don't own that Sprite.");
  }
  return instance.id;
}
