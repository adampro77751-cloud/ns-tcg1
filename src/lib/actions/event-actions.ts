"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  createEventWithJoinCode,
  MIN_EVENT_PLAYERS,
  MIN_MAX_PLAYERS,
  MAX_MAX_PLAYERS,
} from "@/lib/events";
import { normalizeJoinCode } from "@/lib/join-code";
import { resolveOwnedSpriteInstance } from "@/lib/sprite-ownership";
import { awardEventXp } from "@/lib/sprite-progression";

export type FormState = {
  error: string | null;
};

const createEventSchema = z.object({
  name: z.string().trim().min(1, "Enter an event name.").max(60),
  formatId: z.string().min(1, "Choose a format."),
  maxPlayers: z.coerce
    .number()
    .int()
    .min(MIN_MAX_PLAYERS, `Max players must be at least ${MIN_MAX_PLAYERS}.`)
    .max(MAX_MAX_PLAYERS, `Max players must be at most ${MAX_MAX_PLAYERS}.`),
});

export async function createEventAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be logged in." };

  const parsed = createEventSchema.safeParse({
    name: formData.get("name"),
    formatId: formData.get("formatId"),
    maxPlayers: formData.get("maxPlayers"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const format = await prisma.format.findUnique({
    where: { id: parsed.data.formatId, isActive: true },
    select: { id: true },
  });
  if (!format) return { error: "Choose a valid format." };

  const event = await createEventWithJoinCode({
    name: parsed.data.name,
    formatId: format.id,
    maxPlayers: parsed.data.maxPlayers,
    organizerId: session.user.id,
  });

  redirect(`/events/${event.id}`);
}

export async function findEventByCodeAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be logged in." };

  const code = normalizeJoinCode(String(formData.get("code") ?? ""));
  if (!code) return { error: "Enter a join code." };

  const event = await prisma.event.findUnique({
    where: { joinCode: code },
    select: { id: true },
  });
  if (!event) return { error: "No event found with that code." };

  redirect(`/events/${event.id}`);
}

export async function joinEventAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const eventId = String(formData.get("eventId") ?? "");
  const spriteInstanceIdInput = String(formData.get("spriteInstanceId") ?? "");

  try {
    const spriteInstanceId = await resolveOwnedSpriteInstance(
      spriteInstanceIdInput,
      session.user.id,
    );
    await prisma.$transaction(async (tx) => {
      const event = await tx.event.findUnique({
        where: { id: eventId },
        select: {
          status: true,
          maxPlayers: true,
          _count: { select: { players: true } },
        },
      });
      if (!event) throw new Error("Event not found.");
      if (event.status !== "REGISTRATION") {
        throw new Error("This event isn't accepting new players.");
      }
      if (event._count.players >= event.maxPlayers) {
        throw new Error("This event is full.");
      }
      // The @@unique([eventId, userId]) constraint also blocks joining
      // twice under a concurrent double-submit.
      await tx.eventPlayer.create({
        data: { eventId, userId: session.user.id, spriteInstanceId },
      });
    });
  } catch {
    // Swallow and just re-render the event page — its own state (full,
    // already joined, wrong status) will explain why nothing changed.
  }

  revalidatePath(`/events/${eventId}`);
  redirect(`/events/${eventId}`);
}

async function requireOrganizer(eventId: string, userId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { organizerId: true, status: true },
  });
  if (!event || event.organizerId !== userId) {
    throw new Error("You don't organise this event.");
  }
  return event;
}

export async function startEventAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const eventId = String(formData.get("eventId") ?? "");
  await requireOrganizer(eventId, session.user.id);

  const playerCount = await prisma.eventPlayer.count({ where: { eventId } });
  if (playerCount < MIN_EVENT_PLAYERS) {
    redirect(`/events/${eventId}?error=not-enough-players`);
  }

  await prisma.event.updateMany({
    where: { id: eventId, status: "REGISTRATION" },
    data: { status: "IN_PROGRESS", startedAt: new Date() },
  });

  revalidatePath(`/events/${eventId}`);
  redirect(`/events/${eventId}`);
}

export async function declareWinnerAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const eventId = String(formData.get("eventId") ?? "");
  const winnerId = String(formData.get("winnerId") ?? "");
  await requireOrganizer(eventId, session.user.id);

  const isPlayer = await prisma.eventPlayer.findUnique({
    where: { eventId_userId: { eventId, userId: winnerId } },
    select: { userId: true },
  });
  if (!isPlayer) {
    redirect(`/events/${eventId}?error=invalid-winner`);
  }

  await prisma.$transaction(async (tx) => {
    // Atomic compare-and-set: only an IN_PROGRESS event can be completed
    // here, and this can only ever succeed once per event — nothing in
    // this codebase ever moves a COMPLETED event back to IN_PROGRESS. That
    // makes the XP award below idempotent by construction, the same way
    // confirmResultAction's PENDING -> CONFIRMED transition does for
    // matches. The xpAwardedAt check is a second, independent guard.
    const updated = await tx.event.updateMany({
      where: { id: eventId, status: "IN_PROGRESS" },
      data: { status: "COMPLETED", winnerId, finishedAt: new Date() },
    });
    if (updated.count === 0) return;

    const event = await tx.event.findUniqueOrThrow({
      where: { id: eventId },
      select: {
        xpAwardedAt: true,
        format: { select: { name: true } },
        players: { select: { userId: true, spriteInstanceId: true } },
      },
    });
    if (!event.xpAwardedAt) {
      await awardEventXp(tx, {
        eventId,
        formatName: event.format.name,
        winnerUserId: winnerId,
        participants: event.players,
      });
      await tx.event.update({
        where: { id: eventId },
        data: { xpAwardedAt: new Date() },
      });
    }
  });

  revalidatePath(`/events/${eventId}`);
  redirect(`/events/${eventId}`);
}

export async function cancelEventAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const eventId = String(formData.get("eventId") ?? "");
  await requireOrganizer(eventId, session.user.id);

  await prisma.event.updateMany({
    where: { id: eventId, status: "REGISTRATION" },
    data: { status: "CANCELLED", finishedAt: new Date() },
  });

  revalidatePath(`/events/${eventId}`);
  redirect(`/events/${eventId}`);
}
