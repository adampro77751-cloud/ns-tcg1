import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { generateJoinCode } from "@/lib/join-code";

// Creates a Match + the creator's MatchPlayer row with a freshly generated
// join code, retrying on the (astronomically unlikely) chance of collision.
export async function createMatchWithJoinCode(params: {
  formatId: string;
  creatorUserId: string;
  creatorDeckId: string;
  creatorSpriteInstanceId: string | null;
}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const joinCode = generateJoinCode();
    try {
      return await prisma.match.create({
        data: {
          joinCode,
          formatId: params.formatId,
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
