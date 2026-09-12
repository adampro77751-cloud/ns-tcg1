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
} from "@/lib/digital-play";
import {
  createGameState,
  playItem as engPlayItem,
  playSpell as engPlaySpell,
  declareAttack as engDeclareAttack,
  endTurn as engEndTurn,
  concede as engConcede,
  activateTimeBomb as engActivateTimeBomb,
} from "@/lib/digital-engine/engine";
import { runBotTurn } from "@/lib/digital-engine/bot";
import type { DigitalGameState } from "@/lib/digital-engine/types";
import { IllegalActionError } from "@/lib/digital-engine/types";

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
          data: { matchId: match.id, userId: null, isBot: true, deckId: deck.id, ready: true },
        });
        await snapshotDigitalDeck(tx, human.id, deck.id);
        // V1 has no dedicated bot decks — the bot plays a separate snapshot
        // of the SAME deck the human chose (see final report limitations).
        await snapshotDigitalDeck(tx, bot.id, deck.id);

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
            { userId: null, spriteInstanceId: null, cardIds: expandSnapshotToCardIds(botSnap) },
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

// Runs after any human action: if it's now the bot's turn and the match
// isn't over, drive the bot's full turn through the exact same engine
// functions a human action uses.
async function runBotIfNeeded(state: DigitalGameState, botIndex: 0 | 1 | null) {
  if (botIndex === null) return state;
  if (state.phase === "COMPLETE" || state.activePlayerIndex !== botIndex) return state;

  const allCardIds = [
    ...state.players[0].deck,
    ...state.players[0].hand,
    ...state.players[0].battlefield,
    ...state.players[0].discard,
    ...state.players[1].deck,
    ...state.players[1].hand,
    ...state.players[1].battlefield,
    ...state.players[1].discard,
  ].map((c) => c.cardId);
  const cardsById = await getCardsByIdMap(allCardIds);

  return runBotTurn(state, botIndex, cardsById);
}

async function loadCardsById(state: DigitalGameState) {
  const allCardIds = [
    ...state.players[0].deck,
    ...state.players[0].hand,
    ...state.players[0].battlefield,
    ...state.players[0].discard,
    ...state.players[1].deck,
    ...state.players[1].hand,
    ...state.players[1].battlefield,
    ...state.players[1].discard,
  ].map((c) => c.cardId);
  return getCardsByIdMap(allCardIds);
}

async function runGameAction(
  matchId: string,
  apply: (m: LoadedMatch, cardsById: Awaited<ReturnType<typeof getCardsByIdMap>>) => DigitalGameState,
) {
  const session = await requireAdminAction();
  const match = await loadMatchForAction(matchId, session.user.id);
  const cardsById = await loadCardsById(match.state);

  let next = apply(match, cardsById);
  next = await runBotIfNeeded(next, match.botIndex);

  await persistState(matchId, next);
  revalidatePath(`/play/digital/${matchId}`);
}

export async function playDigitalItemAction(formData: FormData) {
  const matchId = String(formData.get("matchId") ?? "");
  const instanceId = String(formData.get("instanceId") ?? "");
  await runGameAction(matchId, (m, cardsById) =>
    engPlayItem(m.state, m.playerIndex, instanceId, cardsById),
  );
}

export async function playDigitalSpellAction(formData: FormData) {
  const matchId = String(formData.get("matchId") ?? "");
  const instanceId = String(formData.get("instanceId") ?? "");
  await runGameAction(matchId, (m, cardsById) =>
    engPlaySpell(m.state, m.playerIndex, instanceId, cardsById),
  );
}

export async function attackDigitalAction(formData: FormData) {
  const matchId = String(formData.get("matchId") ?? "");
  const instanceId = String(formData.get("instanceId") ?? "");
  await runGameAction(matchId, (m, cardsById) =>
    engDeclareAttack(m.state, m.playerIndex, instanceId, cardsById),
  );
}

export async function endDigitalTurnAction(formData: FormData) {
  const matchId = String(formData.get("matchId") ?? "");
  await runGameAction(matchId, (m, cardsById) => engEndTurn(m.state, cardsById));
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
