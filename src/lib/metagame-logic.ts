// Pure computation logic for the Metagame page — deliberately has zero
// dependency on Prisma so every rule (multiple copies count as one deck,
// only confirmed matches count, minimum sample size, real co-occurrence
// rather than global popularity, etc) is unit-testable without a database.
// src/lib/metagame.ts is the thin layer that fetches rows from the
// database and hands them to these functions.

export type DeckCardRow = {
  deckId: string;
  cardId: string;
  quantity: number;
};

export type CardUsageStat = {
  cardId: string;
  decks: number;
  usagePercent: number;
  totalCopies: number;
  averageCopies: number;
};

// A deck containing 3 copies of a card still counts as ONE deck for usage
// purposes — decks are deduped via a Set — while totalCopies/averageCopies
// separately sum quantities across those decks (totalCopies increases by
// the full quantity; it is never conflated with the deck count above).
export function computeCardUsage(
  rows: DeckCardRow[],
  totalDecks: number,
): Map<string, CardUsageStat> {
  const byCard = new Map<string, { deckIds: Set<string>; totalCopies: number }>();

  for (const row of rows) {
    const entry = byCard.get(row.cardId) ?? {
      deckIds: new Set<string>(),
      totalCopies: 0,
    };
    entry.deckIds.add(row.deckId);
    entry.totalCopies += row.quantity;
    byCard.set(row.cardId, entry);
  }

  const result = new Map<string, CardUsageStat>();
  for (const [cardId, entry] of byCard) {
    const decks = entry.deckIds.size;
    result.set(cardId, {
      cardId,
      decks,
      usagePercent: totalDecks > 0 ? (decks / totalDecks) * 100 : 0,
      totalCopies: entry.totalCopies,
      averageCopies: decks > 0 ? entry.totalCopies / decks : 0,
    });
  }
  return result;
}

export type MatchResultStatus = "PENDING" | "CONFIRMED" | "DISPUTED" | null;

export type RawMatchPlayerCardRow = {
  cardId: string;
  matchId: string;
  playerUserId: string;
  winnerId: string | null;
  loserId: string | null;
  resultStatus: MatchResultStatus;
};

export type MatchPlayerCardRow = Omit<RawMatchPlayerCardRow, "resultStatus">;

// Only a CONFIRMED result ever counts — pending, disputed, and matches
// with no result at all (cancelled/still in progress) are all excluded.
// This mirrors the same rule already used for player stats (see
// src/lib/stats.ts) applied to card-level rows instead.
export function filterConfirmedRows(
  rows: RawMatchPlayerCardRow[],
): MatchPlayerCardRow[] {
  return rows.filter((r) => r.resultStatus === "CONFIRMED");
}

export type CardWinLossStat = { cardId: string; wins: number; losses: number };

export function computeCardWinLoss(
  rows: MatchPlayerCardRow[],
): Map<string, CardWinLossStat> {
  const byCard = new Map<string, CardWinLossStat>();
  for (const row of rows) {
    const entry = byCard.get(row.cardId) ?? {
      cardId: row.cardId,
      wins: 0,
      losses: 0,
    };
    if (row.winnerId && row.playerUserId === row.winnerId) {
      entry.wins += 1;
    } else if (row.loserId && row.playerUserId === row.loserId) {
      entry.losses += 1;
    }
    byCard.set(row.cardId, entry);
  }
  return byCard;
}

export function winRatePercent(stat: { wins: number; losses: number }): number {
  const total = stat.wins + stat.losses;
  return total > 0 ? (stat.wins / total) * 100 : 0;
}

// A card with 1 win and 0 losses is not "the best card in the game" —
// require a minimum number of confirmed matches (wins + losses) before a
// card is eligible for the Highest Win Rate ranking.
export function meetsMinimumMatches<T extends { wins: number; losses: number }>(
  stat: T,
  minMatches: number,
): boolean {
  return stat.wins + stat.losses >= minMatches;
}

export type TimeWindow = "all" | "30" | "90";

// Same cutoff-computation used both by production queries (as a Prisma
// `gte` filter) and by tests, so "time filtering works" tests the exact
// logic that's actually applied to real data, not a parallel reimplementation.
export function getTimeCutoff(
  window: TimeWindow,
  now: Date = new Date(),
): Date | null {
  if (window === "all") return null;
  const days = window === "30" ? 30 : 90;
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff;
}

export type DeckCardPair = { deckId: string; cardId: string };

// Real co-occurrence: counts, among decks that actually contain
// `targetCardId`, how many of those decks also contain each other card —
// never a global popularity count. `rows` should already be scoped to
// exactly the decks containing the target card (see getCommonlyPlayedWith
// in metagame.ts), which is what makes this "actual co-occurrence" rather
// than "cards that are popular anyway".
export function computeCoOccurrence(
  targetCardId: string,
  rows: DeckCardPair[],
): Map<string, number> {
  const seenPerDeck = new Map<string, Set<string>>();
  const counts = new Map<string, number>();

  for (const row of rows) {
    if (row.cardId === targetCardId) continue;
    let seen = seenPerDeck.get(row.deckId);
    if (!seen) {
      seen = new Set();
      seenPerDeck.set(row.deckId, seen);
    }
    if (seen.has(row.cardId)) continue;
    seen.add(row.cardId);
    counts.set(row.cardId, (counts.get(row.cardId) ?? 0) + 1);
  }

  return counts;
}
