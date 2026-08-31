import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export function matchesToWinFor(bestOf: number): number {
  return Math.ceil(bestOf / 2);
}

// Round wins are always derived from confirmed MatchResults linked to this
// event (never a stored counter), same principle as every other stats
// helper in this codebase — so a disputed/cancelled round can never count
// and nothing can drift out of sync with the actual match records.
export async function getEventRoundWins(
  eventId: string,
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<Record<string, number>> {
  const results = await db.matchResult.findMany({
    where: { status: "CONFIRMED", match: { eventId } },
    select: { winnerId: true },
  });
  const wins: Record<string, number> = {};
  for (const r of results) {
    wins[r.winnerId] = (wins[r.winnerId] ?? 0) + 1;
  }
  return wins;
}

// The round currently in flight for this event's series, if any — an
// event can have at most one open (non-terminal) round at a time, which is
// what keeps round-win tallying simple and race-free.
export async function getOpenEventRoundMatch(
  eventId: string,
  db: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return db.match.findFirst({
    where: {
      eventId,
      status: { in: ["WAITING", "IN_PROGRESS", "AWAITING_CONFIRMATION"] },
    },
    select: { id: true, status: true },
  });
}
