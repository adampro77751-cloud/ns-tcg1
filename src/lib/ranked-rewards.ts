import type { Prisma } from "@/generated/prisma/client";
import { creditCoins } from "./coins";
import { DIAMOND_RANK_STYLE } from "./card-style-catalog";
import { RANKED_REWARDS } from "./ranked-reward-catalog";

// The conditional update locks the wallet and claims each milestone once.
// Coins, style ownership and the claim always commit or roll back together.
export async function grantRankedRewards(tx: Prisma.TransactionClient, userId: string, points: number) {
  for (const reward of RANKED_REWARDS.filter(reward => reward.points <= points)) {
    const claim = await tx.user.updateMany({
      where: { id: userId, draftRewardPoints: { lt: reward.points } },
      data: { draftRewardPoints: reward.points },
    });
    if (!claim.count) continue;
    await creditCoins(tx, userId, reward.coins, "DRAFT_REWARD", { rankedMilestone: reward.name });
    if (reward.name === "Diamond") {
      const card = await tx.card.findUniqueOrThrow({ where: { slug: DIAMOND_RANK_STYLE.cardSlug }, select: { id: true } });
      await tx.userCardStyle.updateMany({ where: { userId, cardId: card.id, equipped: true }, data: { equipped: false } });
      await tx.userCardStyle.upsert({
        where: { userId_styleKey: { userId, styleKey: DIAMOND_RANK_STYLE.key } },
        create: { userId, cardId: card.id, styleKey: DIAMOND_RANK_STYLE.key },
        update: { equipped: true },
      });
    }
  }
}
