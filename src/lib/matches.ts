import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { generateJoinCode } from "@/lib/join-code";

// Creates a Match + the creator's MatchPlayer row with a freshly generated
// join code, retrying on the (astronomically unlikely) chance of collision.
// When eventId is set, this is one round of an Event's best-of-X series —
// still goes through the normal WAITING -> (other player joins) ->
// IN_PROGRESS lifecycle, just scoped to that event's players (see
// joinMatchAction) instead of being joinable by anyone with the code, and
// always private regardless of the isPrivate input (never listed).
export async function createMatchWithJoinCode(params: {
  formatId: string;
  creatorUserId: string;
  creatorDeckId: string;
  creatorSpriteInstanceId: string | null;
  isPrivate: boolean;
  eventId?: string;
}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const joinCode = generateJoinCode();
    try {
      return await prisma.match.create({
        data: {
          joinCode,
          formatId: params.formatId,
          isPrivate: params.eventId ? true : params.isPrivate,
          eventId: params.eventId,
          players: {
            create: {
              userId: params.creatorUserId,
              deckId: params.creatorDeckId,
              spriteInstanceId: params.creatorSpriteInstanceId,
            },
          },
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

export function getMatchDetails(matchId: string) {
  return prisma.match.findUnique({
    where: { id: matchId },
    include: {
      format: {
        select: {
          id: true,
          name: true,
          startingHand: true,
          startingHealth: true,
        },
      },
      event: {
        select: {
          id: true,
          name: true,
          bestOf: true,
          players: { select: { userId: true } },
        },
      },
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
      result: {
        include: {
          winner: { select: { id: true, username: true } },
          loser: { select: { id: true, username: true } },
          submittedBy: { select: { id: true, username: true } },
          confirmedBy: { select: { id: true, username: true } },
        },
      },
    },
  });
}

export type MatchDetails = NonNullable<
  Awaited<ReturnType<typeof getMatchDetails>>
>;
