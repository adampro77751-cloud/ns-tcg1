"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireOwnedLegalDeck } from "@/lib/decks";
import { createMatchWithJoinCode, createNextEventRoundMatch } from "@/lib/matches";
import { normalizeJoinCode } from "@/lib/join-code";
import { awardMatchXp, awardEventXp } from "@/lib/sprite-progression";
import { resolveOwnedSpriteInstance } from "@/lib/sprite-ownership";
import { snapshotMatchPlayerDeck } from "@/lib/match-deck-snapshot";
import {
  matchesToWinFor,
  getEventRoundWins,
} from "@/lib/event-series";

export type FormState = {
  error: string | null;
};

export async function createMatchAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be logged in." };

  const deckId = String(formData.get("deckId") ?? "");
  if (!deckId) return { error: "Choose a deck." };
  const spriteInstanceIdInput = String(formData.get("spriteInstanceId") ?? "");
  const isPrivate = String(formData.get("visibility") ?? "private") !== "public";

  let deck;
  let spriteInstanceId: string | null;
  try {
    deck = await requireOwnedLegalDeck(deckId, session.user.id);
    spriteInstanceId = await resolveOwnedSpriteInstance(
      spriteInstanceIdInput,
      session.user.id,
    );
  } catch (err) {
    return { error: (err as Error).message };
  }

  const match = await createMatchWithJoinCode({
    formatId: deck.formatId,
    creatorUserId: session.user.id,
    creatorDeckId: deck.id,
    creatorSpriteInstanceId: spriteInstanceId,
    isPrivate,
  });

  redirect(`/play/${match.id}`);
}

export async function findMatchByCodeAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be logged in." };

  const code = normalizeJoinCode(String(formData.get("code") ?? ""));
  if (!code) return { error: "Enter a join code." };

  const match = await prisma.match.findUnique({
    where: { joinCode: code },
    select: { id: true },
  });
  if (!match) return { error: "No match found with that code." };

  redirect(`/play/${match.id}`);
}

export async function joinMatchAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be logged in." };

  const matchId = String(formData.get("matchId") ?? "");
  const deckId = String(formData.get("deckId") ?? "");
  if (!deckId) return { error: "Choose a deck." };
  const spriteInstanceIdInput = String(formData.get("spriteInstanceId") ?? "");

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      formatId: true,
      status: true,
      eventId: true,
      event: { select: { players: { select: { userId: true } } } },
    },
  });
  if (!match) return { error: "Match not found." };

  // A round of an event's best-of-X series is only joinable by that
  // event's other player — not by anyone who happens to have the link,
  // unlike a normal standalone match.
  if (match.event && !match.event.players.some((p) => p.userId === session.user.id)) {
    return { error: "Only the other player in this event may join this round." };
  }

  let deck;
  let spriteInstanceId: string | null;
  try {
    deck = await requireOwnedLegalDeck(deckId, session.user.id);
    spriteInstanceId = await resolveOwnedSpriteInstance(
      spriteInstanceIdInput,
      session.user.id,
    );
  } catch (err) {
    return { error: (err as Error).message };
  }
  if (deck.formatId !== match.formatId) {
    return { error: "Your deck must match the match's format." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Atomic compare-and-set: only a WAITING match can be joined, and
      // only one concurrent join attempt can win this update — this is
      // what enforces the 2-player cap even under a race.
      const result = await tx.match.updateMany({
        where: { id: matchId, status: "WAITING" },
        data: { status: "IN_PROGRESS", startedAt: new Date() },
      });
      if (result.count === 0) {
        throw new Error("This match can't be joined right now.");
      }
      // The @@unique([matchId, userId]) constraint also blocks the creator
      // from "joining" their own match a second time.
      const matchPlayer = await tx.matchPlayer.create({
        data: {
          matchId,
          userId: session.user.id,
          deckId: deck.id,
          spriteInstanceId,
        },
      });
      await snapshotMatchPlayerDeck(tx, matchPlayer.id, deck.id);
    });
  } catch (err) {
    return { error: (err as Error).message ?? "Couldn't join this match." };
  }

  revalidatePath(`/play/${matchId}`);
  redirect(`/play/${matchId}`);
}

async function requireParticipant(matchId: string, userId: string) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      status: true,
      players: { select: { userId: true } },
    },
  });
  if (!match || !match.players.some((p) => p.userId === userId)) {
    throw new Error("You're not part of this match.");
  }
  return match;
}

export async function submitResultAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const matchId = String(formData.get("matchId") ?? "");
  const winnerId = String(formData.get("winnerId") ?? "");

  const match = await requireParticipant(matchId, session.user.id);
  if (match.status !== "IN_PROGRESS") {
    redirect(`/play/${matchId}?error=not-in-progress`);
  }
  const participantIds = match.players.map((p) => p.userId);
  if (!participantIds.includes(winnerId)) {
    redirect(`/play/${matchId}?error=invalid-winner`);
  }
  const loserId = participantIds.find((id) => id !== winnerId)!;

  await prisma.$transaction(async (tx) => {
    const updated = await tx.match.updateMany({
      where: { id: matchId, status: "IN_PROGRESS" },
      data: { status: "AWAITING_CONFIRMATION" },
    });
    if (updated.count === 0) {
      throw new Error("This match already has a result submitted.");
    }
    await tx.matchResult.upsert({
      where: { matchId },
      create: {
        matchId,
        winnerId,
        loserId,
        submittedById: session.user.id,
        status: "PENDING",
      },
      update: {
        winnerId,
        loserId,
        submittedById: session.user.id,
        submittedAt: new Date(),
        status: "PENDING",
        confirmedById: null,
        confirmedAt: null,
      },
    });
  });

  revalidatePath(`/play/${matchId}`);
  redirect(`/play/${matchId}`);
}

export async function confirmResultAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const matchId = String(formData.get("matchId") ?? "");
  await requireParticipant(matchId, session.user.id);

  const outcome = await prisma.$transaction(async (tx) => {
    // Atomic guard: only affects a PENDING result submitted by the OTHER
    // player — a submitter can never confirm their own claim, and a result
    // can only ever transition to CONFIRMED once.
    const updated = await tx.matchResult.updateMany({
      where: {
        matchId,
        status: "PENDING",
        submittedById: { not: session.user.id },
      },
      data: {
        status: "CONFIRMED",
        confirmedById: session.user.id,
        confirmedAt: new Date(),
      },
    });
    if (updated.count === 0) {
      throw new Error("Nothing to confirm.");
    }
    await tx.match.updateMany({
      where: { id: matchId, status: "AWAITING_CONFIRMATION" },
      data: { status: "COMPLETED", finishedAt: new Date() },
    });

    // Award Sprite XP. `updated.count > 0` above already guarantees the
    // PENDING -> CONFIRMED transition just happened for the first and only
    // time (nothing in this codebase ever moves a CONFIRMED result back to
    // PENDING, so this block can never run twice for the same match by
    // construction). The xpAwardedAt check is a second, independent guard
    // against the same double-award scenario.
    const result = await tx.matchResult.findUniqueOrThrow({
      where: { matchId },
      select: { id: true, winnerId: true, loserId: true, xpAwardedAt: true },
    });
    const matchWithPlayers = await tx.match.findUniqueOrThrow({
      where: { id: matchId },
      select: {
        eventId: true,
        format: { select: { name: true } },
        players: {
          select: { userId: true, deckId: true, spriteInstanceId: true },
        },
      },
    });

    if (!result.xpAwardedAt) {
      const winnerSpriteInstanceId =
        matchWithPlayers.players.find((p) => p.userId === result.winnerId)
          ?.spriteInstanceId ?? null;
      const loserSpriteInstanceId = result.loserId
        ? (matchWithPlayers.players.find((p) => p.userId === result.loserId)
            ?.spriteInstanceId ?? null)
        : null;

      await awardMatchXp(tx, {
        matchId,
        formatName: matchWithPlayers.format.name,
        winnerSpriteInstanceId,
        loserSpriteInstanceId,
      });

      await tx.matchResult.update({
        where: { id: result.id },
        data: { xpAwardedAt: new Date() },
      });
    }

    // If this match is one round of an Event's best-of-X series, check
    // whether the series is now decided and, if so, complete the event
    // and award event XP — same atomic-transition + xpAwardedAt guard
    // pattern as declareWinnerAction, so this can never double-fire even
    // if a future round were somehow confirmed again. If the series isn't
    // decided yet, the next round is auto-created AFTER this transaction
    // commits (see below) — it involves its own join-code retry loop,
    // which shouldn't happen inside this transaction.
    if (!matchWithPlayers.eventId) {
      return { eventId: null as string | null, seriesCompleted: false };
    }

    const event = await tx.event.findUniqueOrThrow({
      where: { id: matchWithPlayers.eventId },
      select: {
        id: true,
        bestOf: true,
        status: true,
        xpAwardedAt: true,
        formatId: true,
        format: { select: { name: true } },
        players: { select: { userId: true, spriteInstanceId: true } },
      },
    });
    if (!event.bestOf || event.status !== "IN_PROGRESS") {
      return { eventId: event.id, seriesCompleted: false };
    }

    const roundWins = await getEventRoundWins(event.id, tx);
    const target = matchesToWinFor(event.bestOf);
    const seriesWinnerId = event.players
      .map((p) => p.userId)
      .find((userId) => (roundWins[userId] ?? 0) >= target);

    if (!seriesWinnerId) {
      // Series continues — hand back what's needed to auto-create the
      // next round with the same deck/Sprite each player just used.
      return {
        eventId: event.id,
        seriesCompleted: false,
        formatId: event.formatId,
        roundPlayers: matchWithPlayers.players,
      };
    }

    const updatedEvent = await tx.event.updateMany({
      where: { id: event.id, status: "IN_PROGRESS" },
      data: {
        status: "COMPLETED",
        winnerId: seriesWinnerId,
        finishedAt: new Date(),
      },
    });
    if (updatedEvent.count > 0 && !event.xpAwardedAt) {
      // Use the Sprites equipped in THIS deciding round (matchWithPlayers),
      // not EventPlayer.spriteInstanceId — for a series, Sprite is chosen
      // per round on MatchPlayer, not once at event join, and the
      // organiser in particular never sets EventPlayer.spriteInstanceId at
      // all (they're auto-added when the event is created).
      await awardEventXp(tx, {
        eventId: event.id,
        formatName: event.format.name,
        winnerUserId: seriesWinnerId,
        participants: matchWithPlayers.players,
      });
      await tx.event.update({
        where: { id: event.id },
        data: { xpAwardedAt: new Date() },
      });
    }
    return { eventId: event.id, seriesCompleted: true };
  });

  revalidatePath(`/play/${matchId}`);

  if (outcome.seriesCompleted && outcome.eventId) {
    revalidatePath(`/events/${outcome.eventId}`);
    redirect(`/events/${outcome.eventId}`);
  }

  // Series continues: try to auto-create the next round using the same
  // deck/Sprite each player just used. Deck legality is re-checked fresh
  // (contents can change between rounds) — if either player's deck is no
  // longer legal, this is skipped and the event page falls back to its
  // manual "Start next round" form instead of silently failing.
  if (outcome.eventId && !outcome.seriesCompleted && outcome.roundPlayers) {
    try {
      for (const p of outcome.roundPlayers) {
        await requireOwnedLegalDeck(p.deckId, p.userId);
      }
      await createNextEventRoundMatch({
        eventId: outcome.eventId,
        formatId: outcome.formatId!,
        players: outcome.roundPlayers.map((p) => ({
          userId: p.userId,
          deckId: p.deckId,
          spriteInstanceId: p.spriteInstanceId,
        })),
      });
      revalidatePath(`/events/${outcome.eventId}`);
    } catch {
      // Leave it to the manual "Start next round" form on the event page.
    }
  }

  redirect(`/play/${matchId}`);
}

export async function disputeResultAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const matchId = String(formData.get("matchId") ?? "");
  await requireParticipant(matchId, session.user.id);

  await prisma.$transaction(async (tx) => {
    const updated = await tx.matchResult.updateMany({
      where: {
        matchId,
        status: "PENDING",
        submittedById: { not: session.user.id },
      },
      data: { status: "DISPUTED" },
    });
    if (updated.count === 0) {
      throw new Error("Nothing to dispute.");
    }
    await tx.match.updateMany({
      where: { id: matchId, status: "AWAITING_CONFIRMATION" },
      data: { status: "IN_PROGRESS" },
    });
  });

  revalidatePath(`/play/${matchId}`);
  redirect(`/play/${matchId}`);
}

export async function cancelMatchAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const matchId = String(formData.get("matchId") ?? "");
  await requireParticipant(matchId, session.user.id);

  await prisma.match.updateMany({
    where: { id: matchId, status: "WAITING" },
    data: { status: "CANCELLED", finishedAt: new Date() },
  });

  revalidatePath(`/play/${matchId}`);
  redirect("/play");
}
