import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient | typeof prisma;

// Freezes a copy of `deckId`'s current DeckCard rows onto `matchPlayerId`,
// so this MatchPlayer's card list can never change again after this call
// — even if the underlying Deck is edited later. Must be called at the
// same time the MatchPlayer row is created (this IS "the deck they used
// for this match"); calling it any later risks the deck having already
// changed. A deck with zero cards writes zero snapshot rows, which is
// correctly treated as "no snapshot data" everywhere it's read.
export async function snapshotMatchPlayerDeck(
  tx: Tx,
  matchPlayerId: string,
  deckId: string,
) {
  const deckCards = await tx.deckCard.findMany({
    where: { deckId },
    select: { cardId: true, quantity: true },
  });
  if (deckCards.length === 0) return;

  await tx.matchPlayerDeckCard.createMany({
    data: deckCards.map((dc) => ({
      matchPlayerId,
      cardId: dc.cardId,
      quantity: dc.quantity,
    })),
  });
}
