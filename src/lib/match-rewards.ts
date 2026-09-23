// Match-win Coin rewards. Currently wired to digital matches only (see
// src/lib/actions/digital-match-actions.ts's persistState) — the physical
// match confirm/event-declare-winner flows are a separate, more involved
// hook (best-of-X series, standalone events) and out of scope for this
// V1 foundation; extending here later is additive, not a rewrite.
import { prisma } from "@/lib/prisma";
import { creditCoins, MATCH_WIN_REWARD } from "@/lib/coins";

// Split out per mode so a bot-match reward can be tuned independently
// later (e.g. reduced to deter farming against the V1 bot) without
// touching the PvP path or any caller.
export function getDigitalMatchWinReward(mode: "ONLINE" | "BOT"): number {
  if (mode === "BOT") return MATCH_WIN_REWARD;
  return MATCH_WIN_REWARD;
}

// Awards the Coin reward for a COMPLETED digital match's winner exactly
// once. Guarded by DigitalMatch.coinsAwardedAt via an atomic
// compare-and-set (`updateMany` with `coinsAwardedAt: null` in the WHERE
// clause) inside the SAME transaction as the actual credit — a retried or
// racing call always either fully awards once, or does nothing at all,
// never both/neither. No-op if there's no winning USER (a draw, or the
// bot's own null-userId slot winning, which has no wallet to credit).
export async function awardDigitalMatchWinCoins(
  matchId: string,
  winnerUserId: string | null,
  mode: "ONLINE" | "BOT",
): Promise<void> {
  if (!winnerUserId) return;

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.digitalMatch.updateMany({
      where: { id: matchId, coinsAwardedAt: null },
      data: { coinsAwardedAt: new Date() },
    });
    if (claimed.count === 0) return; // already awarded — no-op

    const amount = getDigitalMatchWinReward(mode);
    await creditCoins(tx, winnerUserId, amount, "MATCH_WIN", { matchId, mode });
  });
}

// Looks up whether (and how much) this specific match already awarded
// this user — used purely for the "You earned X Coins" result-screen
// display, never to decide whether to award (that's coinsAwardedAt's
// job, above). Returns null if this match never awarded this user
// anything (e.g. they lost, or it's a draw).
export async function getMatchWinCoinAward(userId: string, matchId: string): Promise<number | null> {
  const recent = await prisma.coinTransaction.findMany({
    where: { userId, type: "MATCH_WIN" },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { amount: true, detail: true },
  });
  const found = recent.find((t) => (t.detail as { matchId?: string } | null)?.matchId === matchId);
  return found ? found.amount : null;
}
