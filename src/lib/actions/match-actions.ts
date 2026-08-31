"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getDeckLegality } from "@/lib/decks";
import { createMatchWithJoinCode } from "@/lib/matches";
import { normalizeJoinCode } from "@/lib/join-code";
import { awardMatchXp } from "@/lib/sprite-progression";

export type FormState = {
  error: string | null;
};

async function requireOwnedLegalDeck(deckId: string, userId: string) {
  const deck = await prisma.deck.findUnique({
    where: { id: deckId },
    select: { id: true, userId: true, formatId: true },
  });
  if (!deck || deck.userId !== userId) {
    throw new Error("You don't own that deck.");
  }
  const legality = await getDeckLegality(deck.id);
  if (!legality.legal) {
    throw new Error("That deck isn't legal for its format.");
  }
  return deck;
}

// "No Sprite" (empty selection) is always legitimate and resolves to null.
// Anything else must be an individual SpriteInstance actually owned by this
// user — re-checked here against the database on every call, never trusted
// from the submitted value, so a manipulated/guessed instance ID can never
// equip another player's (or nonexistent) Sprite.
async function resolveOwnedSpriteInstance(
  spriteInstanceId: string,
  userId: string,
): Promise<string | null> {
  if (!spriteInstanceId) return null;
  const instance = await prisma.spriteInstance.findUnique({
    where: { id: spriteInstanceId },
    select: { id: true, ownerId: true },
  });
  if (!instance || instance.ownerId !== userId) {
    throw new Error("You don't own that Sprite.");
  }
  return instance.id;
}

export async function createMatchAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be logged in." };

  const deckId = String(formData.get("deckId") ?? "");
  if (!deckId) return { error: "Choose a deck." };
  const spriteInstanceIdInput = String(formData.get("spriteInstanceId") ?? "");

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
    select: { id: true, formatId: true, status: true },
  });
  if (!match) return { error: "Match not found." };

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
      await tx.matchPlayer.create({
        data: {
          matchId,
          userId: session.user.id,
          deckId: deck.id,
          spriteInstanceId,
        },
      });
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

  await prisma.$transaction(async (tx) => {
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
    if (!result.xpAwardedAt) {
      const matchWithPlayers = await tx.match.findUniqueOrThrow({
        where: { id: matchId },
        select: {
          format: { select: { name: true } },
          players: { select: { userId: true, spriteInstanceId: true } },
        },
      });
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
  });

  revalidatePath(`/play/${matchId}`);
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
