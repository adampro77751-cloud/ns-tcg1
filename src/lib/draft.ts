import { prisma } from "@/lib/prisma";
import { Prisma, type DraftStatus } from "@/generated/prisma/client";
import { debitCoins } from "@/lib/coins";
import { grantCards } from "@/lib/collection";
import { DRAFT_ENTRY_COST } from "@/lib/economy-constants";
import { generatePackFromPool } from "@/lib/packs";
import { generateJoinCode } from "@/lib/join-code";
import { createGameState } from "@/lib/digital-engine/engine";
import type { DigitalGameState, EngineCard } from "@/lib/digital-engine/types";
import { simulateDraftBots } from "@/lib/draft-simulation";
import {
  createDraftState, pickDraftCard, buildBotDraftDeck, validateDraftDeck,
  countDraftCards, getDraftPairings, DRAFT_PACKS, DRAFT_SEATS,
  DRAFT_MIN_DECK, DRAFT_MAX_DECK, DRAFT_HEALTH, DRAFT_HAND,
  type DraftState,
} from "@/lib/draft-logic";

type Tx = Prisma.TransactionClient;
class DraftChangedError extends Error {}
const jsonState = (state: DraftState) => state as unknown as Prisma.InputJsonValue;

async function loadPod(tx: Tx, podId: string, userId: string) {
  const pod = await tx.draftPod.findFirst({ where: { id: podId, userId } });
  if (!pod) throw new Error("Draft not found.");
  return pod;
}

async function savePod(tx: Tx, pod: { id: string; version: number }, state: DraftState, status: DraftStatus) {
  const claimed = await tx.draftPod.updateMany({
    where: { id: pod.id, version: pod.version },
    data: {
      state: jsonState(state), status, version: { increment: 1 },
      ...(status === "COMPLETED" ? { activeUserId: null, completedAt: new Date() } : {}),
    },
  });
  if (!claimed.count) throw new DraftChangedError("Your draft changed in another tab. Refresh and try again.");
}

async function loadDraftCards(tx: Tx, state: DraftState) {
  const ids = [...state.unopened.flat(2), ...state.pools.flat()];
  const cards = await tx.card.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, slug: true, type: true, attack: true, defence: true, speed: true },
  });
  return new Map(cards.map((card) => [card.id, card]));
}

export async function enterDraft(userId: string, setName: string): Promise<string> {
  const active = await prisma.draftPod.findUnique({ where: { activeUserId: userId }, select: { id: true } });
  if (active) return active.id;

  const cards = await prisma.card.findMany({
    where: { set: setName, type: { in: ["Item", "Spell", "Commander", "Champion"] } },
    select: { id: true, name: true, rarity: true, image: true, type: true },
  });
  if (!cards.length || !cards.some((card) => ["Item", "Commander", "Champion"].includes(card.type ?? ""))) {
    throw new Error("This set doesn't have enough playable card types for a draft.");
  }
  const packs = Array.from({ length: DRAFT_PACKS }, () =>
    Array.from({ length: DRAFT_SEATS }, () => generatePackFromPool(cards).map((card) => card.id)));
  const state = createDraftState(packs);
  try {
    return await prisma.$transaction(async (tx) => {
      const pod = await tx.draftPod.create({
        data: { userId, activeUserId: userId, setName, state: jsonState(state) }, select: { id: true },
      });
      await debitCoins(tx, userId, DRAFT_ENTRY_COST, "DRAFT_ENTRY", { draftPodId: pod.id, setName });
      return pod.id;
    });
  } catch (error) {
    // A double click can race the initial lookup. The unique active-user
    // key rolls back the losing transaction, including any coin change.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.draftPod.findUnique({ where: { activeUserId: userId }, select: { id: true } });
      if (existing) return existing.id;
    }
    throw error;
  }
}

export async function pickCardInDraft(userId: string, podId: string, version: number, index: number) {
  await prisma.$transaction(async (tx) => {
    const pod = await loadPod(tx, podId, userId);
    if (pod.status !== "DRAFTING" || pod.version !== version) throw new Error("That pick has already changed. Refresh your draft.");
    const state = pod.state as unknown as DraftState;
    const cards = await loadDraftCards(tx, state);
    const next = pickDraftCard(state, index, cards);
    await savePod(tx, pod, next, next.pack === DRAFT_PACKS ? "BUILDING" : "DRAFTING");
    // Award each human pick once, in the same transaction as advancing the
    // draft. Leaving/reloading can never lose or duplicate picked cards.
    await grantCards(tx, userId, [next.pools[0][next.pools[0].length - 1]]);
  }, { timeout: 15000 });
}

function simulateOtherPairings(state: DraftState, round: number, cards: Map<string, EngineCard>) {
  for (const seats of getDraftPairings(round).filter((pair) => !pair.includes(0))) {
    const winner = simulateDraftBots([state.decks[seats[0]], state.decks[seats[1]]], cards);
    state.results.push({ round, seats, winner: winner === null ? null : seats[winner] });
  }
}

async function createRoundMatch(tx: Tx, podId: string, userId: string, state: DraftState, round: number, cards: Map<string, EngineCard>) {
  const pair = getDraftPairings(round).find((seats) => seats.includes(0))!;
  const opponent = pair.find((seat) => seat !== 0)!;
  // Draft has its own deck rules; it never validates against Constructed
  // copy limits or pulls cards out of the user's wider collection.
  const format = await tx.format.upsert({
    where: { slug: "pod-draft" }, update: {},
    create: {
      name: "Pod Draft", slug: "pod-draft", description: "Six-seat bot draft. Build only from your picks.",
      minDeckSize: DRAFT_MIN_DECK, maxDeckSize: DRAFT_MAX_DECK, maxCopiesPerCard: DRAFT_MAX_DECK,
      startingHand: DRAFT_HAND, startingHealth: DRAFT_HEALTH, isActive: false,
    },
    select: { id: true },
  });
  const now = new Date();
  const match = await tx.digitalMatch.create({
    data: {
      joinCode: generateJoinCode(), formatId: format.id, mode: "BOT", status: "IN_PROGRESS", startedAt: now,
      draftPodId: podId, draftRound: round, draftOpponentSeat: opponent,
      players: { create: [
        { userId, ready: true, joinedAt: now, deckSnapshot: { create: countDraftCards(state.decks[0]) } },
        { isBot: true, ready: true, joinedAt: new Date(now.getTime() + 1), deckSnapshot: { create: countDraftCards(state.decks[opponent]) } },
      ] },
    },
    select: { id: true },
  });
  const game = createGameState({
    matchId: match.id, formatId: format.id, startingHealth: DRAFT_HEALTH, startingHand: DRAFT_HAND, cardsById: cards,
    players: [
      { userId, spriteInstanceId: null, cardIds: state.decks[0] },
      { userId: null, spriteInstanceId: null, cardIds: state.decks[opponent] },
    ],
  });
  await tx.digitalMatch.update({ where: { id: match.id }, data: { state: game as unknown as Prisma.InputJsonValue } });
  return match.id;
}

export async function startDraftMatches(userId: string, podId: string, version: number, deck: string[]) {
  return prisma.$transaction(async (tx) => {
    const pod = await loadPod(tx, podId, userId);
    if (pod.status !== "BUILDING" || pod.version !== version) throw new Error("This draft is no longer building a deck. Refresh your draft.");
    const state = pod.state as unknown as DraftState;
    validateDraftDeck(state.pools[0], deck);
    const cards = await loadDraftCards(tx, state);
    state.decks[0] = deck;
    for (let seat = 1; seat < DRAFT_SEATS; seat++) state.decks[seat] = buildBotDraftDeck(state.pools[seat], cards, seat);
    simulateOtherPairings(state, 0, cards);
    await savePod(tx, pod, state, "PLAYING");
    return createRoundMatch(tx, pod.id, userId, state, 0, cards);
  }, { timeout: 20000 });
}

// Idempotent: a completion replay cannot add another result, simulate the
// same bots twice, or create another match. Called after match persistence
// and again by the pod's recovery action if a request was interrupted.
export async function advanceDraftAfterMatch(matchId: string) {
  const match = await prisma.digitalMatch.findUnique({
    where: { id: matchId },
    select: { draftPodId: true, draftRound: true, draftOpponentSeat: true, status: true, state: true },
  });
  if (!match?.draftPodId || match.status !== "COMPLETED" || match.draftRound === null || match.draftOpponentSeat === null) return;
  const podId = match.draftPodId;
  const round = match.draftRound;
  const opponent = match.draftOpponentSeat;
  await prisma.$transaction(async (tx) => {
    const pod = await tx.draftPod.findUniqueOrThrow({ where: { id: podId } });
    if (pod.status !== "PLAYING") return;
    const state = pod.state as unknown as DraftState;
    if (state.results.some((result) => result.round === round && result.seats.includes(0))) return;
    const game = match.state as unknown as DigitalGameState;
    if (game.phase !== "COMPLETE") throw new Error("This draft match hasn't finished.");
    state.results.push({ round, seats: [0, opponent], winner: game.winnerIndex === null ? null : game.winnerIndex === 0 ? 0 : opponent });
    const finished = round === DRAFT_SEATS - 2;
    const cards = finished ? new Map<string, EngineCard>() : await loadDraftCards(tx, state);
    if (!finished) simulateOtherPairings(state, round + 1, cards);
    await savePod(tx, pod, state, finished ? "COMPLETED" : "PLAYING");
    if (!finished) await createRoundMatch(tx, podId, pod.userId, state, round + 1, cards);
  }, { timeout: 20000 }).catch((error: unknown) => {
    // Another completion request already advanced this pod. Its write and
    // next match committed together; the losing transaction did nothing.
    if (!(error instanceof DraftChangedError)) throw error;
  });
}
