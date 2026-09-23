"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdminAction } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requireOwnedLegalDeck } from "@/lib/decks";
import { resolveOwnedSpriteInstance } from "@/lib/sprite-ownership";
import { generateJoinCode, normalizeJoinCode } from "@/lib/join-code";
import {
  snapshotDigitalDeck,
  expandSnapshotToCardIds,
  getCardsByIdMap,
  getSpritesByIdMap,
  getCardDisplayMap,
} from "@/lib/digital-play";
import {
  createGameState,
  playItem as engPlayItem,
  playSpell as engPlaySpell,
  declareAttack as engDeclareAttack,
  resolveDefense as engResolveDefense,
  endTurn as engEndTurn,
  concede as engConcede,
  activateTimeBomb as engActivateTimeBomb,
  activateStarDrop as engActivateStarDrop,
  resolveSearchDeckDestination,
} from "@/lib/digital-engine/engine";
import { runBotStep, runBotDefense } from "@/lib/digital-engine/bot";
import { getCardAbilities } from "@/lib/digital-engine/abilities";
import type { DigitalGameState, EngineCard } from "@/lib/digital-engine/types";
import { IllegalActionError } from "@/lib/digital-engine/types";
import type { SpriteEngineData } from "@/lib/digital-engine/sprite-abilities";

export type DigitalFormState = { error: string | null };

// ---------------------------------------------------------------------------
// Match creation
// ---------------------------------------------------------------------------

async function createMatchWithJoinCode<T>(
  create: (joinCode: string) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const joinCode = generateJoinCode();
    try {
      return await create(joinCode);
    } catch (err) {
      const isCollision =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        (err.meta?.target as string[] | undefined)?.includes("joinCode");
      if (!isCollision) throw err;
    }
  }
  throw new Error("Failed to generate a unique join code.");
}

export async function createBotMatchAction(
  _prevState: DigitalFormState,
  formData: FormData,
): Promise<DigitalFormState> {
  const session = await requireAdminAction();
  const formatId = String(formData.get("formatId") ?? "");
  const deckId = String(formData.get("deckId") ?? "");
  const spriteInstanceIdInput = String(formData.get("spriteInstanceId") ?? "");
  // The bot has no User account of its own, so its "own" deck/Sprite are
  // just a second choice from the SAME admin tester's collection — real
  // saved decks/Sprites via the existing systems, never fabricated ones.
  const botDeckId = String(formData.get("botDeckId") ?? "");
  const botSpriteInstanceIdInput = String(formData.get("botSpriteInstanceId") ?? "");

  let deck;
  let spriteInstanceId: string | null;
  let botDeck;
  let botSpriteInstanceId: string | null;
  try {
    deck = await requireOwnedLegalDeck(deckId, session.user.id);
    if (deck.formatId !== formatId) {
      return { error: "Choose a deck legal for the selected format." };
    }
    spriteInstanceId = await resolveOwnedSpriteInstance(spriteInstanceIdInput, session.user.id);

    botDeck = await requireOwnedLegalDeck(botDeckId, session.user.id);
    if (botDeck.formatId !== formatId) {
      return { error: "Choose a Bot deck legal for the selected format." };
    }
    botSpriteInstanceId = await resolveOwnedSpriteInstance(botSpriteInstanceIdInput, session.user.id);
  } catch (err) {
    return { error: (err as Error).message };
  }

  const format = await prisma.format.findUnique({
    where: { id: formatId },
    select: { id: true, isActive: true, startingHand: true, startingHealth: true },
  });
  if (!format || !format.isActive) {
    return { error: "That format isn't available." };
  }

  let matchId: string;
  try {
    matchId = await createMatchWithJoinCode(async (joinCode) =>
      prisma.$transaction(async (tx) => {
        const match = await tx.digitalMatch.create({
          data: { joinCode, formatId, mode: "BOT", status: "IN_PROGRESS", startedAt: new Date() },
        });
        const human = await tx.digitalMatchPlayer.create({
          data: {
            matchId: match.id,
            userId: session.user.id,
            deckId: deck.id,
            spriteInstanceId,
            ready: true,
          },
        });
        const bot = await tx.digitalMatchPlayer.create({
          data: {
            matchId: match.id,
            userId: null,
            isBot: true,
            deckId: botDeck.id,
            spriteInstanceId: botSpriteInstanceId,
            ready: true,
          },
        });
        await snapshotDigitalDeck(tx, human.id, deck.id);
        // The bot gets its OWN independently-chosen deck snapshot — never
        // the human's cards/hand.
        await snapshotDigitalDeck(tx, bot.id, botDeck.id);

        const [humanSnap, botSnap] = await Promise.all([
          tx.digitalMatchPlayerDeckCard.findMany({
            where: { digitalMatchPlayerId: human.id },
            select: { cardId: true, quantity: true },
          }),
          tx.digitalMatchPlayerDeckCard.findMany({
            where: { digitalMatchPlayerId: bot.id },
            select: { cardId: true, quantity: true },
          }),
        ]);

        const allCardIds = [...expandSnapshotToCardIds(humanSnap), ...expandSnapshotToCardIds(botSnap)];
        const cardsForSetup = await tx.card.findMany({
          where: { id: { in: Array.from(new Set(allCardIds)) } },
          select: { id: true, slug: true, type: true, attack: true, defence: true, speed: true },
        });
        const cardsByIdForSetup = new Map(cardsForSetup.map((c) => [c.id, c]));

        const state = createGameState({
          matchId: match.id,
          formatId,
          startingHealth: format.startingHealth,
          startingHand: format.startingHand,
          cardsById: cardsByIdForSetup,
          players: [
            {
              userId: session.user.id,
              spriteInstanceId,
              cardIds: expandSnapshotToCardIds(humanSnap),
            },
            {
              userId: null,
              spriteInstanceId: botSpriteInstanceId,
              cardIds: expandSnapshotToCardIds(botSnap),
            },
          ],
        });

        await tx.digitalMatch.update({
          where: { id: match.id },
          data: { state: state as unknown as Prisma.InputJsonValue },
        });
        return match.id;
      }),
    );
  } catch (err) {
    return { error: (err as Error).message || "Couldn't start the bot match." };
  }

  redirect(`/play/digital/${matchId}`);
}

export async function createOnlineMatchAction(
  _prevState: DigitalFormState,
  formData: FormData,
): Promise<DigitalFormState> {
  const session = await requireAdminAction();
  const formatId = String(formData.get("formatId") ?? "");
  const deckId = String(formData.get("deckId") ?? "");
  const spriteInstanceIdInput = String(formData.get("spriteInstanceId") ?? "");

  let deck;
  let spriteInstanceId: string | null;
  try {
    deck = await requireOwnedLegalDeck(deckId, session.user.id);
    if (deck.formatId !== formatId) {
      return { error: "Choose a deck legal for the selected format." };
    }
    spriteInstanceId = await resolveOwnedSpriteInstance(spriteInstanceIdInput, session.user.id);
  } catch (err) {
    return { error: (err as Error).message };
  }

  const format = await prisma.format.findUnique({
    where: { id: formatId },
    select: { isActive: true },
  });
  if (!format?.isActive) return { error: "That format isn't available." };

  const matchId = await createMatchWithJoinCode(async (joinCode) =>
    prisma.$transaction(async (tx) => {
      const match = await tx.digitalMatch.create({
        data: { joinCode, formatId, mode: "ONLINE", status: "WAITING" },
      });
      const player = await tx.digitalMatchPlayer.create({
        data: { matchId: match.id, userId: session.user.id, deckId: deck.id, spriteInstanceId },
      });
      await snapshotDigitalDeck(tx, player.id, deck.id);
      return match.id;
    }),
  );

  redirect(`/play/digital/${matchId}`);
}

export async function findDigitalMatchByCodeAction(
  _prevState: DigitalFormState,
  formData: FormData,
): Promise<DigitalFormState> {
  await requireAdminAction();
  const code = normalizeJoinCode(String(formData.get("code") ?? ""));
  if (!code) return { error: "Enter a join code." };

  const match = await prisma.digitalMatch.findUnique({
    where: { joinCode: code },
    select: { id: true },
  });
  if (!match) return { error: "No digital match found with that code." };

  redirect(`/play/digital/${match.id}`);
}

export async function joinOnlineMatchAction(
  _prevState: DigitalFormState,
  formData: FormData,
): Promise<DigitalFormState> {
  const session = await requireAdminAction();
  const matchId = String(formData.get("matchId") ?? "");
  const deckId = String(formData.get("deckId") ?? "");
  const spriteInstanceIdInput = String(formData.get("spriteInstanceId") ?? "");

  const match = await prisma.digitalMatch.findUnique({
    where: { id: matchId },
    select: { id: true, formatId: true, mode: true, status: true },
  });
  if (!match || match.mode !== "ONLINE") return { error: "Match not found." };
  if (match.status !== "WAITING") return { error: "This match can't be joined right now." };

  let deck;
  let spriteInstanceId: string | null;
  try {
    deck = await requireOwnedLegalDeck(deckId, session.user.id);
    if (deck.formatId !== match.formatId) {
      return { error: "Choose a deck legal for this match's format." };
    }
    spriteInstanceId = await resolveOwnedSpriteInstance(spriteInstanceIdInput, session.user.id);
  } catch (err) {
    return { error: (err as Error).message };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const result = await tx.digitalMatch.updateMany({
        where: { id: matchId, status: "WAITING" },
        data: { status: "READY" },
      });
      if (result.count === 0) throw new Error("This match can't be joined right now.");

      const player = await tx.digitalMatchPlayer.create({
        data: { matchId, userId: session.user.id, deckId: deck.id, spriteInstanceId },
      });
      await snapshotDigitalDeck(tx, player.id, deck.id);
    });
  } catch (err) {
    return { error: (err as Error).message ?? "Couldn't join this match." };
  }

  revalidatePath(`/play/digital/${matchId}`);
  redirect(`/play/digital/${matchId}`);
}

export async function readyDigitalMatchAction(formData: FormData) {
  const session = await requireAdminAction();
  const matchId = String(formData.get("matchId") ?? "");

  await prisma.digitalMatchPlayer.updateMany({
    where: { matchId, userId: session.user.id },
    data: { ready: true },
  });

  await maybeStartMatch(matchId);
  revalidatePath(`/play/digital/${matchId}`);
}

async function maybeStartMatch(matchId: string) {
  await prisma.$transaction(async (tx) => {
    const match = await tx.digitalMatch.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        formatId: true,
        status: true,
        format: { select: { startingHand: true, startingHealth: true } },
        players: {
          orderBy: { joinedAt: "asc" },
          select: {
            id: true,
            userId: true,
            spriteInstanceId: true,
            ready: true,
            deckSnapshot: { select: { cardId: true, quantity: true } },
          },
        },
      },
    });
    if (!match || match.status !== "READY") return;
    if (match.players.length !== 2 || !match.players.every((p) => p.ready)) return;

    const allCardIds = [
      ...expandSnapshotToCardIds(match.players[0].deckSnapshot),
      ...expandSnapshotToCardIds(match.players[1].deckSnapshot),
    ];
    const cardsForSetup = await tx.card.findMany({
      where: { id: { in: Array.from(new Set(allCardIds)) } },
      select: { id: true, slug: true, type: true, attack: true, defence: true, speed: true },
    });
    const cardsByIdForSetup = new Map(cardsForSetup.map((c) => [c.id, c]));

    const state = createGameState({
      matchId: match.id,
      formatId: match.formatId,
      startingHealth: match.format.startingHealth,
      startingHand: match.format.startingHand,
      cardsById: cardsByIdForSetup,
      players: [
        {
          userId: match.players[0].userId,
          spriteInstanceId: match.players[0].spriteInstanceId,
          cardIds: expandSnapshotToCardIds(match.players[0].deckSnapshot),
        },
        {
          userId: match.players[1].userId,
          spriteInstanceId: match.players[1].spriteInstanceId,
          cardIds: expandSnapshotToCardIds(match.players[1].deckSnapshot),
        },
      ],
    });

    await tx.digitalMatch.update({
      where: { id: match.id },
      data: {
        status: "IN_PROGRESS",
        startedAt: new Date(),
        state: state as unknown as Prisma.InputJsonValue,
      },
    });
  });
}

// ---------------------------------------------------------------------------
// In-game actions
// ---------------------------------------------------------------------------

type LoadedMatch = {
  id: string;
  status: string;
  mode: string;
  state: DigitalGameState;
  playerIndex: 0 | 1;
  playerIds: [string | null, string | null];
  botIndex: 0 | 1 | null;
};

async function loadMatchForAction(matchId: string, userId: string): Promise<LoadedMatch> {
  const match = await prisma.digitalMatch.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      status: true,
      mode: true,
      state: true,
      players: { orderBy: { joinedAt: "asc" }, select: { userId: true, isBot: true } },
    },
  });
  if (!match) throw new IllegalActionError("Match not found.");
  if (match.status !== "IN_PROGRESS" || !match.state) {
    throw new IllegalActionError("This match isn't in progress.");
  }
  const playerIndex = match.players.findIndex((p) => p.userId === userId);
  if (playerIndex === -1) throw new IllegalActionError("You're not part of this match.");
  const botIndex = match.players.findIndex((p) => p.isBot);

  return {
    id: match.id,
    status: match.status,
    mode: match.mode,
    state: match.state as unknown as DigitalGameState,
    playerIndex: playerIndex as 0 | 1,
    playerIds: [match.players[0]?.userId ?? null, match.players[1]?.userId ?? null],
    botIndex: botIndex === -1 ? null : (botIndex as 0 | 1),
  };
}

async function persistState(matchId: string, state: DigitalGameState) {
  const isComplete = state.phase === "COMPLETE";
  let winnerUserId: string | null = null;
  if (isComplete && state.winnerIndex !== null) {
    winnerUserId = state.players[state.winnerIndex].userId;
  }
  await prisma.digitalMatch.update({
    where: { id: matchId },
    data: {
      state: state as unknown as Prisma.InputJsonValue,
      ...(isComplete
        ? { status: "COMPLETED", finishedAt: new Date(), winnerId: winnerUserId ?? undefined }
        : {}),
    },
  });
}

function allCardIdsIn(state: DigitalGameState): string[] {
  return [
    ...state.players[0].deck,
    ...state.players[0].hand,
    ...state.players[0].battlefield,
    ...state.players[0].discard,
    ...state.players[1].deck,
    ...state.players[1].hand,
    ...state.players[1].battlefield,
    ...state.players[1].discard,
  ].map((c) => c.cardId);
}

async function loadCardsById(state: DigitalGameState) {
  return getCardsByIdMap(allCardIdsIn(state));
}

async function loadSpritesById(state: DigitalGameState) {
  return getSpritesByIdMap([state.players[0].spriteInstanceId, state.players[1].spriteInstanceId]);
}

// Runs after any human action: resolves a bot defense first if the bot is
// the one being attacked (defending isn't gated by whose turn it is), then
// — only if it's now genuinely the bot's own turn with nothing pending —
// takes exactly ONE bot action, not its whole turn. The rest of the bot's
// turn is driven one visible tick at a time by advanceBotTurnAction below
// (see the client-side BotTurnDriver), so a human watching sees each of
// the bot's actions land separately instead of an entire turn resolving
// instantly the moment it becomes the bot's turn.
async function runBotIfNeeded(
  state: DigitalGameState,
  botIndex: 0 | 1 | null,
  cardsById: Map<string, EngineCard>,
  spritesById: Map<string, SpriteEngineData>,
) {
  if (botIndex === null || state.phase === "COMPLETE") return state;

  if (state.pendingCombat && state.pendingCombat.defendingPlayerIndex === botIndex) {
    state = runBotDefense(state, botIndex, cardsById, spritesById);
  }
  if (state.phase === "COMPLETE" || state.pendingCombat || state.activePlayerIndex !== botIndex) {
    return state;
  }

  return runBotStep(state, botIndex, cardsById, spritesById);
}

// One visible "tick" of the bot's turn — called repeatedly by the client
// (BotTurnDriver), paced with a short delay between calls, so the bot's
// actions appear one at a time instead of its whole turn resolving the
// instant it starts. Resolves a pending defense first (not gated by whose
// turn it is), otherwise takes up to a few normal actions before returning
// (still one at a time in the log), so a bot turn with several plays isn't
// dominated by one network round trip PER action — each round trip
// (server action call + the client's page refresh) costs far more than
// the deliberate pacing delay itself, which is what actually made the bot
// feel like it "stops and wastes time" between visible moves. A no-op if
// there's nothing for the bot to do right now.
const MAX_BOT_ACTIONS_PER_TICK = 4;

export async function advanceBotTurnAction(matchId: string) {
  const session = await requireAdminAction();
  const match = await loadMatchForAction(matchId, session.user.id);
  if (match.botIndex === null) return;

  const [cardsById, spritesById] = await Promise.all([
    loadCardsById(match.state),
    loadSpritesById(match.state),
  ]);

  let state = match.state;
  for (let i = 0; i < MAX_BOT_ACTIONS_PER_TICK; i++) {
    const next = await runBotIfNeeded(state, match.botIndex, cardsById, spritesById);
    if (next === state) break; // nothing more to do right now
    state = next;
    // Stop early once it's genuinely no longer the bot's turn to keep
    // acting (turn ended, match over, or a combat is now pending on
    // either side) — the same conditions runBotIfNeeded itself checks.
    if (state.phase === "COMPLETE" || state.activePlayerIndex !== match.botIndex || state.pendingCombat) break;
  }

  if (state !== match.state) {
    await persistState(matchId, state);
    revalidatePath(`/play/digital/${matchId}`);
  }
}

export type SearchableDeckCard = {
  instanceId: string;
  cardId: string;
  name: string;
  type: string | null;
  rarity: string | null;
  attack: number | null;
  defence: number | null;
  speed: number | null;
  image: string | null;
};

// School/Cathedral Pergrines/Budge (all SEARCH_DECK) reveal a real,
// searchable list of the CALLER'S OWN deck contents — never the
// opponent's. Deck contents otherwise stay completely hidden (see
// getVisibleState, which never sends either player's deck array at all);
// this is the one deliberate, card-justified exception, scoped to exactly
// what that card lets you see. `instanceId` identifies the specific card
// doing the searching (its hand instance for School's ON_PLAY search, or
// its battlefield instance for Cathedral Pergrines'/Budge's ATTACK_STARTED
// one) so the legal candidate list can be computed exactly the way
// applyEffect's SEARCH_DECK case will (Item-only for a battlefield
// placement — the same resolveSearchDeckDestination the engine itself
// uses — or every card type when the result is headed to hand instead,
// e.g. Budge without 3+ Spells in discard).
export async function getSearchableDeckItemsAction(matchId: string, instanceId: string): Promise<SearchableDeckCard[]> {
  const session = await requireAdminAction();
  const match = await loadMatchForAction(matchId, session.user.id);

  const player = match.state.players[match.playerIndex];
  const cardsById = await loadCardsById(match.state);

  const inHand = player.hand.find((c) => c.instanceId === instanceId);
  const searching = inHand ?? player.battlefield.find((c) => c.instanceId === instanceId);
  const trigger = inHand ? "ON_PLAY" : "ATTACK_STARTED";
  const slug = searching ? cardsById.get(searching.cardId)?.slug : undefined;

  let itemsOnly = true; // safe default — matches every existing search card (School, Cathedral Pergrines)
  if (slug) {
    for (const ability of getCardAbilities(slug).filter((a) => a.trigger === trigger)) {
      for (const effect of ability.effects) {
        if (effect.type !== "SEARCH_DECK") continue;
        itemsOnly = resolveSearchDeckDestination(effect, match.state, match.playerIndex, cardsById) === "BATTLEFIELD";
      }
    }
  }

  const deck = player.deck;
  const candidates = deck.filter((c) => !itemsOnly || cardsById.get(c.cardId)?.type === "Item");
  const displayMap = await getCardDisplayMap(candidates.map((c) => c.cardId));

  return candidates.map((instance) => {
    const card = displayMap.get(instance.cardId);
    return {
      instanceId: instance.instanceId,
      cardId: instance.cardId,
      name: card?.name ?? "Unknown card",
      type: card?.type ?? null,
      rarity: card?.rarity ?? null,
      attack: card?.attack ?? null,
      defence: card?.defence ?? null,
      speed: card?.speed ?? null,
      image: card?.image ?? null,
    };
  });
}

async function runGameAction(
  matchId: string,
  apply: (
    m: LoadedMatch,
    cardsById: Map<string, EngineCard>,
    spritesById: Map<string, SpriteEngineData>,
  ) => DigitalGameState,
) {
  const session = await requireAdminAction();
  const match = await loadMatchForAction(matchId, session.user.id);
  const cardsById = await loadCardsById(match.state);
  const spritesById = await loadSpritesById(match.state);

  let next = apply(match, cardsById, spritesById);
  // The card/sprite pool can change shape after the action (a search
  // effect could reveal nothing new, but a bot's own play might reference
  // cards not yet in scope — reload defensively before driving the bot).
  const nextCardsById = await loadCardsById(next);
  const nextSpritesById = await loadSpritesById(next);
  next = await runBotIfNeeded(next, match.botIndex, nextCardsById, nextSpritesById);

  await persistState(matchId, next);
  revalidatePath(`/play/digital/${matchId}`);
}

export async function playDigitalItemAction(formData: FormData) {
  const matchId = String(formData.get("matchId") ?? "");
  const instanceId = String(formData.get("instanceId") ?? "");
  const targetId = formData.get("targetId");
  await runGameAction(matchId, (m, cardsById, spritesById) =>
    engPlayItem(m.state, m.playerIndex, instanceId, cardsById, targetId ? String(targetId) : undefined, spritesById),
  );
}

export async function playDigitalSpellAction(formData: FormData) {
  const matchId = String(formData.get("matchId") ?? "");
  const instanceId = String(formData.get("instanceId") ?? "");
  const targetId = formData.get("targetId");
  await runGameAction(matchId, (m, cardsById, spritesById) =>
    engPlaySpell(m.state, m.playerIndex, instanceId, cardsById, targetId ? String(targetId) : undefined, spritesById),
  );
}

export async function attackDigitalAction(formData: FormData) {
  const matchId = String(formData.get("matchId") ?? "");
  const instanceId = String(formData.get("instanceId") ?? "");
  const targetId = formData.get("targetId");
  await runGameAction(matchId, (m, cardsById, spritesById) =>
    engDeclareAttack(m.state, m.playerIndex, instanceId, cardsById, spritesById, targetId ? String(targetId) : undefined),
  );
}

// The defending player's response to a pending attack: `defenderInstanceId`
// is the instanceId of one of their own untired battlefield Items, or
// omitted/empty to explicitly take the attack undefended ("no defender").
export async function resolveDefenseAction(formData: FormData) {
  const matchId = String(formData.get("matchId") ?? "");
  const defenderInstanceIdRaw = formData.get("defenderInstanceId");
  const defenderInstanceId = defenderInstanceIdRaw ? String(defenderInstanceIdRaw) : null;
  await runGameAction(matchId, (m, cardsById, spritesById) =>
    engResolveDefense(m.state, m.playerIndex, defenderInstanceId, cardsById, spritesById),
  );
}

export async function endDigitalTurnAction(formData: FormData) {
  const matchId = String(formData.get("matchId") ?? "");
  await runGameAction(matchId, (m, cardsById, spritesById) => engEndTurn(m.state, cardsById, spritesById));
}

export async function concedeDigitalMatchAction(formData: FormData) {
  const matchId = String(formData.get("matchId") ?? "");
  await runGameAction(matchId, (m) => engConcede(m.state, m.playerIndex));
}

export async function activateTimeBombAction(formData: FormData) {
  const matchId = String(formData.get("matchId") ?? "");
  const instanceId = String(formData.get("instanceId") ?? "");
  await runGameAction(matchId, (m, cardsById) =>
    engActivateTimeBomb(m.state, m.playerIndex, instanceId, cardsById),
  );
}

export async function activateStarDropAction(formData: FormData) {
  const matchId = String(formData.get("matchId") ?? "");
  const instanceId = String(formData.get("instanceId") ?? "");
  await runGameAction(matchId, (m, cardsById, spritesById) =>
    engActivateStarDrop(m.state, m.playerIndex, instanceId, cardsById, Math.random, spritesById),
  );
}
