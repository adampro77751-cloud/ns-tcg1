import type { prisma } from "@/lib/prisma";

type CardQuantity = { cardId: string; quantity: number };

export function getMissingDeckCards(
  cards: (CardQuantity & { card: { name: string } })[],
  collection: CardQuantity[],
): string[] {
  const owned = new Map(collection.map((row) => [row.cardId, row.quantity]));
  return cards.flatMap((row) => {
    const quantity = owned.get(row.cardId) ?? 0;
    return quantity < row.quantity
      ? [`${row.card.name}: need ${row.quantity}, own ${quantity}.`]
      : [];
  });
}

export async function getDeckCollectionErrors(
  db: Pick<typeof prisma, "userCard">,
  userId: string,
  cards: (CardQuantity & { card: { name: string } })[],
) {
  const collection = await db.userCard.findMany({
    where: { userId, cardId: { in: cards.map((row) => row.cardId) } },
    select: { cardId: true, quantity: true },
  });
  return getMissingDeckCards(cards, collection).map(
    (error) => `Missing cards in your collection — ${error}`,
  );
}
