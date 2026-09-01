import { prisma } from "@/lib/prisma";

export type PlayerStats = {
  matchesPlayed: number;
  wins: number;
  losses: number;
  winPercentage: number;
  eventsPlayed: number;
  eventsWon: number;
  formatRecords: FormatRecord[];
};

export type FormatRecord = {
  formatName: string;
  formatSlug: string;
  wins: number;
  losses: number;
};

// Stats are always derived from confirmed MatchResults / completed Events —
// never from a stored counter — so there is exactly one source of truth and
// no risk of a result being counted twice or a cancelled match/event
// affecting a player's record.
export async function getPlayerStats(userId: string): Promise<PlayerStats> {
  const [wonResults, lostResults, eventsPlayed, eventsWon] = await Promise.all([
    prisma.matchResult.findMany({
      where: { status: "CONFIRMED", winnerId: userId },
      select: {
        match: { select: { format: { select: { name: true, slug: true } } } },
      },
    }),
    prisma.matchResult.findMany({
      where: { status: "CONFIRMED", loserId: userId },
      select: {
        match: { select: { format: { select: { name: true, slug: true } } } },
      },
    }),
    prisma.eventPlayer.count({
      where: { userId, event: { status: "COMPLETED" } },
    }),
    prisma.event.count({
      where: { status: "COMPLETED", winnerId: userId },
    }),
  ]);

  const wins = wonResults.length;
  const losses = lostResults.length;
  const matchesPlayed = wins + losses;
  const winPercentage = matchesPlayed > 0 ? (wins / matchesPlayed) * 100 : 0;

  const formatRecordsBySlug = new Map<string, FormatRecord>();
  const bump = (slug: string, name: string, key: "wins" | "losses") => {
    const record =
      formatRecordsBySlug.get(slug) ?? { formatName: name, formatSlug: slug, wins: 0, losses: 0 };
    record[key] += 1;
    formatRecordsBySlug.set(slug, record);
  };
  for (const r of wonResults) bump(r.match.format.slug, r.match.format.name, "wins");
  for (const r of lostResults) bump(r.match.format.slug, r.match.format.name, "losses");

  return {
    matchesPlayed,
    wins,
    losses,
    winPercentage,
    eventsPlayed,
    eventsWon,
    formatRecords: Array.from(formatRecordsBySlug.values()).sort((a, b) =>
      a.formatName.localeCompare(b.formatName),
    ),
  };
}

export type RecentMatch = {
  matchId: string;
  opponentUsername: string | null;
  formatName: string;
  won: boolean;
  spriteLabel: string | null;
  date: Date | null;
};

// Only confirmed match results are ever surfaced — cancelled, pending, and
// disputed matches never appear in a public "recent matches" list.
export async function getRecentMatches(
  userId: string,
  limit = 10,
): Promise<RecentMatch[]> {
  const matchPlayers = await prisma.matchPlayer.findMany({
    where: {
      userId,
      match: { result: { status: "CONFIRMED" } },
    },
    orderBy: { match: { finishedAt: "desc" } },
    take: limit,
    select: {
      spriteInstance: {
        select: { name: true, sprite: { select: { name: true } } },
      },
      match: {
        select: {
          id: true,
          finishedAt: true,
          format: { select: { name: true } },
          players: {
            select: { userId: true, user: { select: { username: true } } },
          },
          result: { select: { winnerId: true } },
        },
      },
    },
  });

  return matchPlayers.map((mp) => {
    const opponent = mp.match.players.find((p) => p.userId !== userId);
    return {
      matchId: mp.match.id,
      opponentUsername: opponent?.user.username ?? null,
      formatName: mp.match.format.name,
      won: mp.match.result?.winnerId === userId,
      spriteLabel: mp.spriteInstance
        ? `${mp.spriteInstance.name} — ${mp.spriteInstance.sprite.name}`
        : null,
      date: mp.match.finishedAt,
    };
  });
}
