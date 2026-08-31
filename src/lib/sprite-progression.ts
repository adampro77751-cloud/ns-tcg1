import type { Prisma } from "@/generated/prisma/client";
import { XP_PER_WIN, XP_PER_LOSS, MAX_SPRITE_LEVEL, levelForXp } from "@/lib/xp";

type AwardSource =
  | { type: "MATCH"; matchId: string }
  | { type: "EVENT"; eventId: string };

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
  const source: AwardSource = { type: "MATCH", matchId: params.matchId };
  await awardOne(tx, {
    spriteInstanceId: params.winnerSpriteInstanceId,
    xpGain: XP_PER_WIN,
    won: true,
    formatName: params.formatName,
    source,
  });
  await awardOne(tx, {
    spriteInstanceId: params.loserSpriteInstanceId,
    xpGain: XP_PER_LOSS,
    won: false,
    formatName: params.formatName,
    source,
  });
}

// Awards event XP once a winner is declared: the winner's equipped Sprite
// gets win XP, every other participant's equipped Sprite gets loss XP
// (same rates as a direct match). MUST be called from inside the same
// transaction that moves the Event to COMPLETED (see declareWinnerAction
// in event-actions.ts), guarded by Event.xpAwardedAt exactly like
// awardMatchXp is guarded by MatchResult.xpAwardedAt — idempotent for the
// same reason: that atomic, once-only status transition can never fire
// twice for the same event.
export async function awardEventXp(
  tx: Prisma.TransactionClient,
  params: {
    eventId: string;
    formatName: string;
    winnerUserId: string;
    participants: { userId: string; spriteInstanceId: string | null }[];
  },
) {
  const source: AwardSource = { type: "EVENT", eventId: params.eventId };
  for (const participant of params.participants) {
    const won = participant.userId === params.winnerUserId;
    await awardOne(tx, {
      spriteInstanceId: participant.spriteInstanceId,
      xpGain: won ? XP_PER_WIN : XP_PER_LOSS,
      won,
      formatName: params.formatName,
      source,
    });
  }
}

async function awardOne(
  tx: Prisma.TransactionClient,
  params: {
    spriteInstanceId: string | null;
    xpGain: number;
    won: boolean;
    formatName: string;
    source: AwardSource;
  },
) {
  const { spriteInstanceId, xpGain, won, formatName, source } = params;
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

  const sourceDetail =
    source.type === "MATCH"
      ? { source: "MATCH", matchId: source.matchId }
      : { source: "EVENT", eventId: source.eventId };

  await tx.spriteHistoryEntry.create({
    data: {
      spriteInstanceId: instance.id,
      type: won ? "MATCH_WON" : "MATCH_PLAYED",
      detail: { ...sourceDetail, formatName, won },
    },
  });

  await tx.spriteHistoryEntry.create({
    data: {
      spriteInstanceId: instance.id,
      type: "XP_GAINED",
      detail: { ...sourceDetail, xpGained: xpGain, totalXp: newXp },
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
