import type { Prisma } from "@/generated/prisma/client";
import { XP_PER_WIN, XP_PER_LOSS, MAX_SPRITE_LEVEL, levelForXp } from "@/lib/xp";

// Awards match XP to whichever individual SpriteInstance each side actually
// equipped ("No Sprite" — null — earns nothing, and is a legitimate state,
// not skipped by accident). MUST be called from inside the same
// transaction that flips a MatchResult from PENDING to CONFIRMED (see
// confirmResultAction in match-actions.ts) — that atomic, once-only status
// transition, plus the MatchResult.xpAwardedAt guard set alongside it, are
// what make this call idempotent: it can never run twice for the same
// match, however many times confirmation is retried/replayed/raced.
export async function awardMatchXp(
  tx: Prisma.TransactionClient,
  params: {
    matchId: string;
    formatName: string;
    winnerSpriteInstanceId: string | null;
    loserSpriteInstanceId: string | null;
  },
) {
  await awardOne(tx, {
    spriteInstanceId: params.winnerSpriteInstanceId,
    xpGain: XP_PER_WIN,
    won: true,
    matchId: params.matchId,
    formatName: params.formatName,
  });
  await awardOne(tx, {
    spriteInstanceId: params.loserSpriteInstanceId,
    xpGain: XP_PER_LOSS,
    won: false,
    matchId: params.matchId,
    formatName: params.formatName,
  });
}

async function awardOne(
  tx: Prisma.TransactionClient,
  params: {
    spriteInstanceId: string | null;
    xpGain: number;
    won: boolean;
    matchId: string;
    formatName: string;
  },
) {
  const { spriteInstanceId, xpGain, won, matchId, formatName } = params;
  if (!spriteInstanceId) return; // "No Sprite" was equipped — nothing to award.

  const instance = await tx.spriteInstance.findUnique({
    where: { id: spriteInstanceId },
    select: { id: true, level: true, xp: true },
  });
  if (!instance) return; // Defensive: the instance is gone, nothing to award.

  const previousLevel = instance.level;
  const newXp = instance.xp + xpGain;
  const newLevel = levelForXp(newXp); // Capped at MAX_SPRITE_LEVEL by construction.

  await tx.spriteInstance.update({
    where: { id: instance.id },
    data: { xp: newXp, level: newLevel },
  });

  await tx.spriteHistoryEntry.create({
    data: {
      spriteInstanceId: instance.id,
      type: won ? "MATCH_WON" : "MATCH_PLAYED",
      detail: { matchId, formatName, won },
    },
  });

  await tx.spriteHistoryEntry.create({
    data: {
      spriteInstanceId: instance.id,
      type: "XP_GAINED",
      detail: { matchId, xpGained: xpGain, totalXp: newXp },
    },
  });

  if (newLevel > previousLevel) {
    await tx.spriteHistoryEntry.create({
      data: {
        spriteInstanceId: instance.id,
        type: "LEVEL_UP",
        detail: {
          previousLevel,
          newLevel,
          maxLevel: newLevel >= MAX_SPRITE_LEVEL,
        },
      },
    });
  }
}
