import { prisma } from "@/lib/prisma";

export type PlayerStats = {
  matchesPlayed: number;
  wins: number;
  losses: number;
  winPercentage: number;
  eventsPlayed: number;
  eventsWon: number;
};

// Stats are always derived from confirmed MatchResults / completed Events —
// never from a stored counter — so there is exactly one source of truth and
// no risk of a result being counted twice or a cancelled match/event
// affecting a player's record.
export async function getPlayerStats(userId: string): Promise<PlayerStats> {
  const [wins, losses, eventsPlayed, eventsWon] = await Promise.all([
    prisma.matchResult.count({
      where: { status: "CONFIRMED", winnerId: userId },
    }),
    prisma.matchResult.count({
      where: { status: "CONFIRMED", loserId: userId },
    }),
    prisma.eventPlayer.count({
      where: { userId, event: { status: "COMPLETED" } },
    }),
    prisma.event.count({
      where: { status: "COMPLETED", winnerId: userId },
    }),
  ]);

  const matchesPlayed = wins + losses;
  const winPercentage = matchesPlayed > 0 ? (wins / matchesPlayed) * 100 : 0;

  return {
    matchesPlayed,
    wins,
    losses,
    winPercentage,
    eventsPlayed,
    eventsWon,
  };
}
