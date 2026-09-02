import { prisma } from "@/lib/prisma";
import {
  computeCardUsage,
  computeCardWinLoss,
  computeCoOccurrence,
  filterConfirmedRows,
  getTimeCutoff,
  meetsMinimumMatches,
  winRatePercent,
  type CardUsageStat,
  type CardWinLossStat,
  type DeckCardRow,
  type RawMatchPlayerCardRow,
  type TimeWindow,
} from "@/lib/metagame-logic";

export type MetagameFilters = {
  formatId: string | null;
  cardType: string | null;
  rarity: string | null;
  time: TimeWindow;
};

export const DEFAULT_MIN_MATCHES = 10;

export type CardSummary = {
  id: string;
  slug: string;
  name: string;
  type: string | null;
  rarity: string | null;
};

async function getEligibleDeckIds(filters: MetagameFilters): Promise<string[]> {
  const cutoff = getTimeCutoff(filters.time);
  const decks = await prisma.deck.findMany({
    where: {
      formatId: filters.formatId ?? undefined,
      updatedAt: cutoff ? { gte: cutoff } : undefined,
    },
    select: { id: true },
  });
  return decks.map((d) => d.id);
}

async function getDeckCardRows(
  deckIds: string[],
  cardWhere: { type?: string; rarity?: string },
): Promise<DeckCardRow[]> {
  if (deckIds.length === 0) return [];
  const rows = await prisma.deckCard.findMany({
    where: {
      deckId: { in: deckIds },
      card: {
        type: cardWhere.type ?? undefined,
        rarity: cardWhere.rarity ?? undefined,
      },
    },
    select: { deckId: true, cardId: true, quantity: true },
  });
  return rows;
}

async function getConfirmedMatchPlayerCardRows(
  filters: MetagameFilters,
): Promise<RawMatchPlayerCardRow[]> {
  const cutoff = getTimeCutoff(filters.time);
  const rows = await prisma.matchPlayerDeckCard.findMany({
    where: {
      matchPlayer: {
        match: {
          formatId: filters.formatId ?? undefined,
          finishedAt: cutoff ? { gte: cutoff } : undefined,
        },
      },
    },
    select: {
      cardId: true,
      matchPlayer: {
        select: {
          matchId: true,
          userId: true,
          match: {
            select: {
              result: { select: { status: true, winnerId: true, loserId: true } },
            },
          },
        },
      },
    },
  });

  return rows.map((r) => ({
    cardId: r.cardId,
    matchId: r.matchPlayer.matchId,
    playerUserId: r.matchPlayer.userId,
    winnerId: r.matchPlayer.match.result?.winnerId ?? null,
    loserId: r.matchPlayer.match.result?.loserId ?? null,
    resultStatus: r.matchPlayer.match.result?.status ?? null,
  }));
}

async function getCardsById(
  ids: Iterable<string>,
): Promise<Map<string, CardSummary>> {
  const idList = Array.from(new Set(ids));
  if (idList.length === 0) return new Map();
  const cards = await prisma.card.findMany({
    where: { id: { in: idList } },
    select: { id: true, slug: true, name: true, type: true, rarity: true },
  });
  return new Map(cards.map((c) => [c.id, c]));
}

export type MostPlayedCard = CardSummary & CardUsageStat;

export async function getMostPlayedCards(
  filters: MetagameFilters,
  limit = 20,
): Promise<{ cards: MostPlayedCard[]; totalDecks: number }> {
  const deckIds = await getEligibleDeckIds(filters);
  const totalDecks = deckIds.length;
  const rows = await getDeckCardRows(deckIds, {
    type: filters.cardType ?? undefined,
    rarity: filters.rarity ?? undefined,
  });
  const usage = computeCardUsage(rows, totalDecks);
  const cardsById = await getCardsById(usage.keys());

  const cards = Array.from(usage.values())
    .map((stat) => {
      const card = cardsById.get(stat.cardId);
      if (!card) return null;
      return { ...card, ...stat };
    })
    .filter((c): c is MostPlayedCard => c !== null)
    .sort((a, b) => b.decks - a.decks)
    .slice(0, limit);

  return { cards, totalDecks };
}

export type WinRateCard = CardSummary &
  CardWinLossStat & { winRate: number; usagePercent: number; decks: number };

export async function getHighestWinRateCards(
  filters: MetagameFilters,
  minMatches = DEFAULT_MIN_MATCHES,
  limit = 20,
): Promise<{ cards: WinRateCard[]; confirmedMatches: number }> {
  const [rawRows, deckIds] = await Promise.all([
    getConfirmedMatchPlayerCardRows(filters),
    getEligibleDeckIds(filters),
  ]);
  const confirmedRows = filterConfirmedRows(rawRows);
  const confirmedMatches = new Set(confirmedRows.map((r) => r.matchId)).size;

  const winLoss = computeCardWinLoss(confirmedRows);
  const eligible = Array.from(winLoss.values()).filter((s) =>
    meetsMinimumMatches(s, minMatches),
  );

  const deckRows = await getDeckCardRows(deckIds, {
    type: filters.cardType ?? undefined,
    rarity: filters.rarity ?? undefined,
  });
  const usage = computeCardUsage(deckRows, deckIds.length);

  const cardsById = await getCardsById(eligible.map((s) => s.cardId));

  const cards = eligible
    .map((stat) => {
      const card = cardsById.get(stat.cardId);
      if (!card) return null;
      if (filters.cardType && card.type !== filters.cardType) return null;
      if (filters.rarity && card.rarity !== filters.rarity) return null;
      const u = usage.get(stat.cardId);
      return {
        ...card,
        ...stat,
        winRate: winRatePercent(stat),
        decks: u?.decks ?? 0,
        usagePercent: u?.usagePercent ?? 0,
      };
    })
    .filter((c): c is WinRateCard => c !== null)
    .sort((a, b) => b.winRate - a.winRate)
    .slice(0, limit);

  return { cards, confirmedMatches };
}

export async function getMostPlayedCommanders(
  filters: MetagameFilters,
  limit = 10,
): Promise<{ commanders: (MostPlayedCard & Partial<CardWinLossStat & { winRate: number }>)[] }> {
  const commanderFilters: MetagameFilters = { ...filters, cardType: "Commander" };
  const { cards } = await getMostPlayedCards(commanderFilters, limit);
  if (cards.length === 0) return { commanders: [] };

  const rawRows = await getConfirmedMatchPlayerCardRows(filters);
  const confirmedRows = filterConfirmedRows(rawRows).filter((r) =>
    cards.some((c) => c.id === r.cardId),
  );
  const winLoss = computeCardWinLoss(confirmedRows);

  const commanders = cards.map((c) => {
    const wl = winLoss.get(c.id);
    return wl
      ? { ...c, wins: wl.wins, losses: wl.losses, winRate: winRatePercent(wl) }
      : c;
  });

  return { commanders };
}

export type MetaOverview = {
  cardsTracked: number;
  decksAnalysed: number;
  confirmedMatchesAnalysed: number;
  mostPlayedCard: MostPlayedCard | null;
  highestWinRateCard: WinRateCard | null;
};

export async function getMetaOverview(
  filters: MetagameFilters,
): Promise<MetaOverview> {
  const [{ cards: mostPlayed, totalDecks }, { cards: winRateCards, confirmedMatches }] =
    await Promise.all([
      getMostPlayedCards(filters, 1),
      getHighestWinRateCards(filters, DEFAULT_MIN_MATCHES, 1),
    ]);

  const deckIds = await getEligibleDeckIds(filters);
  const allRows = await getDeckCardRows(deckIds, {});
  const cardsTracked = new Set(allRows.map((r) => r.cardId)).size;

  return {
    cardsTracked,
    decksAnalysed: totalDecks,
    confirmedMatchesAnalysed: confirmedMatches,
    mostPlayedCard: mostPlayed[0] ?? null,
    highestWinRateCard: winRateCards[0] ?? null,
  };
}

export async function getFilterOptions() {
  const [formats, types, rarities] = await Promise.all([
    prisma.format.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.card.findMany({
      where: { type: { not: null } },
      select: { type: true },
      distinct: ["type"],
    }),
    prisma.card.findMany({
      where: { rarity: { not: null } },
      select: { rarity: true },
      distinct: ["rarity"],
    }),
  ]);

  const RARITY_ORDER = ["Common", "Rare", "Epic", "Legendary", "Mythic", "TBD"];
  const rarityValues = rarities
    .map((r) => r.rarity!)
    .sort(
      (a, b) =>
        (RARITY_ORDER.indexOf(a) === -1 ? 99 : RARITY_ORDER.indexOf(a)) -
        (RARITY_ORDER.indexOf(b) === -1 ? 99 : RARITY_ORDER.indexOf(b)),
    );

  return {
    formats,
    cardTypes: types.map((t) => t.type!).sort(),
    rarities: rarityValues,
  };
}

export type CardMetaDetail = {
  card: CardSummary;
  usage: CardUsageStat;
  winLoss: CardWinLossStat & { winRate: number };
  confirmedMatches: number;
  commonlyPlayedWith: (CardSummary & { decks: number })[];
};

export async function getCardMetaDetail(
  cardId: string,
  filters: MetagameFilters,
): Promise<CardMetaDetail | null> {
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    select: { id: true, slug: true, name: true, type: true, rarity: true },
  });
  if (!card) return null;

  const deckIds = await getEligibleDeckIds(filters);
  const deckRows = await getDeckCardRows(deckIds, {});
  const usageMap = computeCardUsage(deckRows, deckIds.length);
  const usage = usageMap.get(cardId) ?? {
    cardId,
    decks: 0,
    usagePercent: 0,
    averageCopies: 0,
  };

  const rawRows = await getConfirmedMatchPlayerCardRows(filters);
  const confirmedRows = filterConfirmedRows(rawRows);
  const winLossMap = computeCardWinLoss(confirmedRows);
  const winLoss = winLossMap.get(cardId) ?? { cardId, wins: 0, losses: 0 };
  const confirmedMatches = new Set(
    confirmedRows.filter((r) => r.cardId === cardId).map((r) => r.matchId),
  ).size;

  const targetDeckIds = deckRows
    .filter((r) => r.cardId === cardId)
    .map((r) => r.deckId);
  const commonlyPlayedWith = await getCommonlyPlayedWith(
    cardId,
    targetDeckIds,
    deckRows,
  );

  return {
    card,
    usage,
    winLoss: { ...winLoss, winRate: winRatePercent(winLoss) },
    confirmedMatches,
    commonlyPlayedWith,
  };
}

async function getCommonlyPlayedWith(
  cardId: string,
  targetDeckIds: string[],
  allDeckRowsInScope: DeckCardRow[],
  limit = 8,
): Promise<(CardSummary & { decks: number })[]> {
  if (targetDeckIds.length === 0) return [];
  const targetSet = new Set(targetDeckIds);
  const rowsInTargetDecks = allDeckRowsInScope.filter((r) => targetSet.has(r.deckId));
  const coOccurrence = computeCoOccurrence(cardId, rowsInTargetDecks);

  const ranked = Array.from(coOccurrence.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

  const cardsById = await getCardsById(ranked.map(([id]) => id));
  return ranked
    .map(([id, decks]) => {
      const card = cardsById.get(id);
      return card ? { ...card, decks } : null;
    })
    .filter((c): c is CardSummary & { decks: number } => c !== null);
}
