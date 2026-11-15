import { existsSync } from "node:fs";
import path from "node:path";
import { prisma } from "./prisma";
import { creditCoins } from "./coins";
import { grantCards } from "./collection";
import { CHRISTMAS_REWARDS, CHRISTMAS_FINAL_CARD, christmasClaimError } from "./christmas-catalog";

export async function claimChristmasReward(userId: string, day: number) {
  const error = christmasClaimError(day);
  if (error) return { error };
  const reward = CHRISTMAS_REWARDS[day - 1];
  return prisma.$transaction(async tx => {
    // Validate again inside the transaction so a request cannot cross the event deadline.
    const error = christmasClaimError(day);
    if (error) return { error };
    const claim = await tx.christmasClaim.createMany({ data: { userId, year: 2026, day }, skipDuplicates: true });
    if (!claim.count) return { error: "You have already claimed this door." };
    await creditCoins(tx, userId, reward.coins, "CHRISTMAS_REWARD", { year: 2026, day });
    if (reward.packs) {
      const card = await tx.card.findFirst({ where: { set: { not: null }, NOT: { set: "" } }, orderBy: { id: "asc" }, select: { set: true } });
      if (!card?.set) throw new Error("Calendar packs are not ready yet. Please try again later.");
      await tx.earnedPack.createMany({ data: Array.from({ length: reward.packs }, (_, number) => ({ userId, number, setName: card.set! })) });
    }
    if (reward.style) {
      if (!existsSync(path.join(process.cwd(), "public", reward.style.image))) throw new Error("Christmas skin artwork is not ready yet.");
      const card = await tx.card.findUnique({ where: { slug: reward.style.cardSlug }, select: { id: true } });
      if (!card) throw new Error("This Christmas skin is not ready yet. Please try again later.");
      await tx.userCardStyle.upsert({ where: { userId_styleKey: { userId, styleKey: reward.style.key } }, update: {},
        create: { userId, cardId: card.id, styleKey: reward.style.key, equipped: false } });
    }
    if (reward.finalCard) {
      if (!existsSync(path.join(process.cwd(), "public", CHRISTMAS_FINAL_CARD.image))) throw new Error("Christmas finale artwork is not ready yet.");
      // Created only when the first eligible Christmas Day claim succeeds.
      const card = await tx.card.upsert({ where: { slug: CHRISTMAS_FINAL_CARD.slug },
        create: CHRISTMAS_FINAL_CARD, update: {}, select: { id: true } });
      await grantCards(tx, userId, [card.id]);
    }
    return { success: `Day ${day} claimed! Your rewards are in your wallet, Your Packs and Collection.` };
  });
}
