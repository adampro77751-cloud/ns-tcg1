// Card collection service — one UserCard row per (user, card), the
// player's permanent server-side ownership record. See prisma/schema.prisma's
// "Coins economy" section: this deliberately does NOT know about or
// enforce deck-legality copy limits — a player can own (and this can
// grant) more copies than any format would let them play, per this
// feature's explicit V1 scope. Every function takes a `Db` so a grant can
// be composed into a larger transaction (see src/lib/packs.ts).
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

type Db = Prisma.TransactionClient | typeof prisma;

// Grants one or more Card copies to a player's collection. `cardIds` may
// contain the same id more than once (e.g. two copies of the same card in
// one pack) — each duplicate increments that card's owned quantity by one
// more, never overwrites it.
export async function grantCards(db: Db, userId: string, cardIds: string[]): Promise<void> {
  const counts = new Map<string, number>();
  for (const cardId of cardIds) counts.set(cardId, (counts.get(cardId) ?? 0) + 1);
  for (const [cardId, quantity] of counts) {
    await db.userCard.upsert({
      where: { userId_cardId: { userId, cardId } },
      create: { userId, cardId, quantity },
      update: { quantity: { increment: quantity } },
    });
  }
}

export async function getCollectionMap(userId: string): Promise<Map<string, number>> {
  const rows = await prisma.userCard.findMany({
    where: { userId, quantity: { gt: 0 } },
    select: { cardId: true, quantity: true },
  });
  return new Map(rows.map((r) => [r.cardId, r.quantity]));
}
