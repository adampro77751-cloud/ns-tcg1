import { prisma } from "@/lib/prisma";

export type SpriteInstanceMatchStats = {
  matchesPlayed: number;
  matchesWon: number;
  eventsPlayed: number;
  eventsWon: number;
  winRate: number;
};

// Derived from confirmed MatchResults and completed Events, same principle
// as getPlayerStats in stats.ts — never a stored counter, so
// cancelled/disputed/unconfirmed matches and non-completed events can
// never be counted and nothing can drift out of sync.
export async function getSpriteInstanceMatchStats(
  spriteInstanceId: string,
): Promise<SpriteInstanceMatchStats> {
  const [matchAppearances, eventAppearances] = await Promise.all([
    prisma.matchPlayer.findMany({
      where: {
        spriteInstanceId,
        match: { result: { status: "CONFIRMED" } },
      },
      select: {
        userId: true,
        match: { select: { result: { select: { winnerId: true } } } },
      },
    }),
    prisma.eventPlayer.findMany({
      where: {
        spriteInstanceId,
        event: { status: "COMPLETED" },
      },
      select: {
        userId: true,
        event: { select: { winnerId: true } },
      },
    }),
  ]);

  const matchesPlayed = matchAppearances.length;
  const matchesWon = matchAppearances.filter(
    (a) => a.match.result?.winnerId === a.userId,
  ).length;
  const eventsPlayed = eventAppearances.length;
  const eventsWon = eventAppearances.filter(
    (a) => a.event.winnerId === a.userId,
  ).length;

  const totalPlayed = matchesPlayed + eventsPlayed;
  const totalWon = matchesWon + eventsWon;
  const winRate = totalPlayed > 0 ? (totalWon / totalPlayed) * 100 : 0;

  return { matchesPlayed, matchesWon, eventsPlayed, eventsWon, winRate };
}
