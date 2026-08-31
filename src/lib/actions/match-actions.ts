"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getDeckLegality } from "@/lib/decks";
import { createMatchWithJoinCode } from "@/lib/matches";
import { normalizeJoinCode } from "@/lib/join-code";

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

export async function createMatchAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be logged in." };

  const deckId = String(formData.get("deckId") ?? "");
  if (!deckId) return { error: "Choose a deck." };

  let deck;
  try {
    deck = await requireOwnedLegalDeck(deckId, session.user.id);
  } catch (err) {
    return { error: (err as Error).message };
  }

  const match = await createMatchWithJoinCode({
    formatId: deck.formatId,
    creatorUserId: session.user.id,
    creatorDeckId: deck.id,
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

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { id: true, formatId: true, status: true },
  });
  if (!match) return { error: "Match not found." };

  let deck;
  try {
    deck = await requireOwnedLegalDeck(deckId, session.user.id);
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
        data: { matchId, userId: session.user.id, deckId: deck.id },
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
