import { prisma } from "@/lib/prisma";

export type SpriteInstanceMatchStats = {
  matchesPlayed: number;
  matchesWon: number;
  winRate: number;
};

// Derived from confirmed MatchResults, same principle as getPlayerStats in
// stats.ts — never a stored counter, so cancelled/disputed/unconfirmed
// matches can never be counted and nothing can drift out of sync.
export async function getSpriteInstanceMatchStats(
  spriteInstanceId: string,
): Promise<SpriteInstanceMatchStats> {
  const appearances = await prisma.matchPlayer.findMany({
    where: {
      spriteInstanceId,
      match: { result: { status: "CONFIRMED" } },
    },
    select: {
      userId: true,
      match: { select: { result: { select: { winnerId: true } } } },
    },
  });

  const matchesPlayed = appearances.length;
  const matchesWon = appearances.filter(
    (a) => a.match.result?.winnerId === a.userId,
  ).length;
  const winRate = matchesPlayed > 0 ? (matchesWon / matchesPlayed) * 100 : 0;

  return { matchesPlayed, matchesWon, winRate };
}
