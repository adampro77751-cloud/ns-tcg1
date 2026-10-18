import { prisma } from "./prisma";
import type { Prisma } from "@/generated/prisma/client";
import { GOLDEN_COINS_STYLE } from "./card-style-catalog";

export async function grantPurchaseCardStyle(tx: Prisma.TransactionClient, purchase: { id: string; userId: string; productId: string }) {
  if (purchase.productId !== GOLDEN_COINS_STYLE.productId) return;
  const card = await tx.card.findUnique({ where: { slug: GOLDEN_COINS_STYLE.cardSlug }, select: { id: true } });
  if (!card) throw new Error("Exclusive style card is not available.");
  await tx.userCardStyle.upsert({
    where: { userId_styleKey: { userId: purchase.userId, styleKey: GOLDEN_COINS_STYLE.key } },
    update: {}, // Repeat purchases preserve the owner's current art selection.
    create: { userId: purchase.userId, cardId: card.id, styleKey: GOLDEN_COINS_STYLE.key, purchaseId: purchase.id },
  });
}

export async function getEquippedCardArt(userId: string): Promise<Map<string, string>> {
  const styles = await prisma.userCardStyle.findMany({ where: { userId, equipped: true }, select: { cardId: true, styleKey: true } });
  return new Map(styles.filter((s) => s.styleKey === GOLDEN_COINS_STYLE.key).map((s) => [s.cardId, GOLDEN_COINS_STYLE.image]));
}

export async function getVisibleInstanceArt(players: { userId: string | null; cards: { instanceId: string; cardId: string }[] }[]) {
  const entries = await Promise.all(players.map(async (player) => {
    if (!player.userId) return [];
    const art = await getEquippedCardArt(player.userId);
    return player.cards.flatMap((card) => art.has(card.cardId) ? [[card.instanceId, art.get(card.cardId)!] as const] : []);
  }));
  return Object.fromEntries(entries.flat());
}
