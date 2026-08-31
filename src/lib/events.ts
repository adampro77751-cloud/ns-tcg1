import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { generateJoinCode } from "@/lib/join-code";

export const MIN_EVENT_PLAYERS = 2;
export const MIN_MAX_PLAYERS = 2;
export const MAX_MAX_PLAYERS = 8;

// Creates an Event + the organiser's own EventPlayer row (organising and
// not playing isn't a case v1 needs to support) with a freshly generated
// join code, retrying on the astronomically unlikely chance of collision.
export async function createEventWithJoinCode(params: {
  name: string;
  formatId: string;
  maxPlayers: number;
  organizerId: string;
  bestOf: number | null;
}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const joinCode = generateJoinCode();
    try {
      return await prisma.event.create({
        data: {
          name: params.name,
          formatId: params.formatId,
          maxPlayers: params.maxPlayers,
          bestOf: params.bestOf,
          joinCode,
          organizerId: params.organizerId,
          players: { create: { userId: params.organizerId } },
        },
      });
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

export function getEventDetails(eventId: string) {
  return prisma.event.findUnique({
    where: { id: eventId },
    include: {
      format: { select: { id: true, name: true } },
      organizer: { select: { id: true, username: true } },
      winner: { select: { id: true, username: true } },
      players: {
        orderBy: { joinedAt: "asc" },
        include: {
          user: { select: { id: true, username: true } },
          deck: { select: { id: true, name: true } },
          spriteInstance: {
            select: {
              id: true,
              name: true,
              level: true,
              sprite: { select: { name: true, rarity: true } },
            },
          },
        },
      },
      matches: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          status: true,
          result: { select: { winnerId: true, status: true } },
        },
      },
    },
  });
}

export type EventDetails = NonNullable<
  Awaited<ReturnType<typeof getEventDetails>>
>;
