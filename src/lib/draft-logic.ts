import type { EngineCard } from "@/lib/digital-engine/types";

export const DRAFT_SEATS = 6;
export const DRAFT_PACKS = 3;
export const DRAFT_PACK_SIZE = 10;
export const DRAFT_MIN_DECK = 20;
export const DRAFT_MAX_DECK = 30;
export const DRAFT_HEALTH = 500;
export const DRAFT_HAND = 5;

export type DraftResult = {
  round: number;
  seats: [number, number];
  winner: number | null;
};

export type DraftState = {
  pack: number;
  pick: number;
  unopened: string[][][];
  packs: string[][];
  pools: string[][];
  decks: string[][];
  results: DraftResult[];
};

export function createDraftState(packs: string[][][]): DraftState {
  if (packs.length !== DRAFT_PACKS || packs.some((round) =>
    round.length !== DRAFT_SEATS || round.some((pack) => pack.length !== DRAFT_PACK_SIZE))) {
    throw new Error("A draft needs three 10-card packs for each of six seats.");
  }
  const unopened = structuredClone(packs);
  return {
    pack: 0, pick: 0, unopened,
    packs: structuredClone(unopened[0]),
    pools: Array.from({ length: DRAFT_SEATS }, () => []),
    decks: Array.from({ length: DRAFT_SEATS }, () => []),
    results: [],
  };
}

// Bots favour playable Items and stats, with seat-specific preferences so
// the pod doesn't make identical choices. They only see their own pack.
export function draftCardScore(card: EngineCard | undefined, seat: number): number {
  if (!card) return -1;
  const item = ["Item", "Commander", "Champion"].includes(card.type ?? "");
  return (item ? 200 : 70) + (card.attack ?? 0) * (seat % 2 ? 1 : 0.8)
    + (card.defence ?? 0) * (seat % 2 ? 0.4 : 0.7) + (card.speed ?? 0) * 0.3;
}

export function pickDraftCard(state: DraftState, index: number, cards: Map<string, EngineCard>): DraftState {
  if (state.pack >= DRAFT_PACKS || !Number.isInteger(index) || index < 0 || index >= state.packs[0].length) {
    throw new Error("That card is no longer available. Refresh your draft.");
  }
  const next = structuredClone(state);
  for (let seat = 0; seat < DRAFT_SEATS; seat++) {
    const pack = next.packs[seat];
    const choice = seat === 0 ? index : pack.reduce((best, id, i) =>
      draftCardScore(cards.get(id), seat) > draftCardScore(cards.get(pack[best]), seat) ? i : best, 0);
    next.pools[seat].push(pack.splice(choice, 1)[0]);
  }
  next.pick++;
  if (next.pick === DRAFT_PACK_SIZE) {
    next.pack++;
    next.pick = 0;
    next.packs = next.pack < DRAFT_PACKS ? structuredClone(next.unopened[next.pack]) : [];
  } else {
    const direction = next.pack % 2 === 0 ? 1 : -1;
    const remaining = next.packs;
    next.packs = remaining.map((_, seat) => remaining[(seat - direction + DRAFT_SEATS) % DRAFT_SEATS]);
  }
  return next;
}

export function countDraftCards(ids: string[]): { cardId: string; quantity: number }[] {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return Array.from(counts, ([cardId, quantity]) => ({ cardId, quantity }));
}

export function validateDraftDeck(pool: string[], deck: string[]): void {
  if (deck.length < DRAFT_MIN_DECK || deck.length > DRAFT_MAX_DECK) {
    throw new Error(`Choose ${DRAFT_MIN_DECK}–${DRAFT_MAX_DECK} cards for your draft deck.`);
  }
  const counts = new Map(countDraftCards(pool).map((row) => [row.cardId, row.quantity]));
  for (const row of countDraftCards(deck)) {
    if (row.quantity > (counts.get(row.cardId) ?? 0)) {
      throw new Error("Your draft deck can only contain copies you picked in this pod.");
    }
  }
}

export function buildBotDraftDeck(pool: string[], cards: Map<string, EngineCard>, seat: number): string[] {
  return [...pool].sort((a, b) => draftCardScore(cards.get(b), seat) - draftCardScore(cards.get(a), seat)).slice(0, DRAFT_MIN_DECK);
}

// A six-seat round robin: three matches per round, five rounds, no byes
// or rematches. Seat zero is always the human.
export function getDraftPairings(round: number): [number, number][] {
  if (!Number.isInteger(round) || round < 0 || round >= DRAFT_SEATS - 1) throw new Error("Invalid draft round.");
  const seats = Array.from({ length: DRAFT_SEATS }, (_, i) => i);
  for (let i = 0; i < round; i++) seats.splice(1, 0, seats.pop()!);
  return Array.from({ length: DRAFT_SEATS / 2 }, (_, i) => [seats[i], seats[DRAFT_SEATS - 1 - i]]);
}

export function getDraftStandings(results: DraftResult[]) {
  const standings = Array.from({ length: DRAFT_SEATS }, (_, seat) => ({ seat, wins: 0, losses: 0, draws: 0, points: 0 }));
  for (const result of results) {
    for (const seat of result.seats) {
      if (result.winner === null) { standings[seat].draws++; standings[seat].points++; }
      else if (result.winner === seat) { standings[seat].wins++; standings[seat].points += 3; }
      else standings[seat].losses++;
    }
  }
  return standings.sort((a, b) => b.points - a.points || b.wins - a.wins || a.seat - b.seat);
}
