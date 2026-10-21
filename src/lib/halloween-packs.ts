import { randomInt } from "node:crypto";
import { prisma } from "./prisma";
import { Prisma } from "@/generated/prisma/client";
import { debitCoins } from "./coins";
import type { GeneratedPackCard, PackOpeningResult } from "./packs";
import { HALLOWEEN_STYLES, HALLOWEEN_PACK_COST, HALLOWEEN_PACK_SIZE, HALLOWEEN_PACK_NAME, isHalloweenPackAvailable } from "./card-style-catalog";

export function rollHalloweenStyles(randomIndex: (max: number) => number = max => randomInt(max)) {
  const pool = [...HALLOWEEN_STYLES];
  return Array.from({ length: HALLOWEEN_PACK_SIZE }, () => pool.splice(randomIndex(pool.length), 1)[0]);
}

function openingResult(opening: { id: string; cards: unknown }): PackOpeningResult {
  return { openingId: opening.id, cards: opening.cards as GeneratedPackCard[], sprite: null };
}

export async function buyHalloweenPack(userId: string, requestKey: string): Promise<PackOpeningResult> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestKey)) throw new Error("Refresh the Store and try again.");
  const where = { userId_requestKey: { userId, requestKey } };
  const previous = await prisma.packOpening.findUnique({ where });
  if (previous) return openingResult(previous);
  if (!isHalloweenPackAvailable()) throw new Error("The Halloween pack sale ended on 7 November 2026.");

  const [cards, sprites] = await Promise.all([
    prisma.card.findMany({ where: { slug: { in: HALLOWEEN_STYLES.flatMap(style => style.kind === "card" ? [style.cardSlug] : []) } }, select: { id: true, slug: true } }),
    prisma.sprite.findMany({ where: { slug: "devil-sprite" }, select: { id: true, slug: true } }),
  ]);
  const targets = new Map([...cards, ...sprites].map(target => [target.slug, target.id]));
  for (const style of HALLOWEEN_STYLES) {
    if (!targets.has(style.kind === "card" ? style.cardSlug : style.spriteSlug)) throw new Error("Halloween styles are temporarily unavailable.");
  }
  const styles = rollHalloweenStyles();
  const rewards: GeneratedPackCard[] = styles.map(style => ({ id: style.key, name: `${style.cardName} · Halloween`, image: style.image, type: `${style.kind === "sprite" ? "Sprite" : "Card"} art style`, rarity: null }));
  try {
    return await prisma.$transaction(async tx => {
      // Wallet locking serialises this user's purchases with equipment changes.
      await debitCoins(tx, userId, HALLOWEEN_PACK_COST, "PACK_PURCHASE", { setName: HALLOWEEN_PACK_NAME, packKind: "HALLOWEEN", packSize: HALLOWEEN_PACK_SIZE, requestKey });
      if (!isHalloweenPackAvailable()) throw new Error("The Halloween pack sale ended on 7 November 2026.");
      const opening = await tx.packOpening.create({ data: { userId, requestKey, setName: HALLOWEEN_PACK_NAME, coinsSpent: HALLOWEEN_PACK_COST, cards: rewards as unknown as Prisma.InputJsonValue } });
      for (const style of styles) {
        const targetId = targets.get(style.kind === "card" ? style.cardSlug : style.spriteSlug)!;
        const styleWhere = { userId_styleKey: { userId, styleKey: style.key } };
        if (style.kind === "card") {
          const owned = await tx.userCardStyle.findUnique({ where: styleWhere });
          if (!owned) await tx.userCardStyle.updateMany({ where: { userId, cardId: targetId, equipped: true }, data: { equipped: false } });
          await tx.userCardStyle.upsert({ where: styleWhere, create: { userId, cardId: targetId, styleKey: style.key, packOpeningId: opening.id }, update: { quantity: { increment: 1 } } });
        } else {
          const owned = await tx.userSpriteStyle.findUnique({ where: styleWhere });
          if (!owned) await tx.userSpriteStyle.updateMany({ where: { userId, spriteId: targetId, equipped: true }, data: { equipped: false } });
          await tx.userSpriteStyle.upsert({ where: styleWhere, create: { userId, spriteId: targetId, styleKey: style.key, packOpeningId: opening.id }, update: { quantity: { increment: 1 } } });
        }
      }
      return openingResult(opening);
    }, { timeout: 15000 });
  } catch (error) {
    // A retried purchase returns its committed result, never another pack.
    // This also covers an insufficient balance on a simultaneous retry.
    const committed = await prisma.packOpening.findUnique({ where });
    if (committed) return openingResult(committed);
    throw error;
  }
}
