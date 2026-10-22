import { prisma } from "@/lib/prisma";
import { parseAllowedSets } from "@/lib/formats";
import { checkDeckLegality } from "@/lib/legality";

export const STARTER_DECK_NAME = "First Bell · Starter Deck";
// Seven Items and three Spells, with three copies each: 30 cards for Basic.
export const STARTER_CARD_SLUGS = [
  "pen", "pencil", "rubber", "tennis-balls", "maths", "cupcake", "cricket-ball",
  "cricket-bowl", "old-book", "punch",
] as const;

export async function getStarterDeckGrant() {
  const [format, cards] = await Promise.all([
    prisma.format.findUniqueOrThrow({
      where: { slug: "basic", isActive: true },
      include: { bannedCards: true, restrictedCards: true },
    }),
    prisma.card.findMany({
      where: { slug: { in: [...STARTER_CARD_SLUGS] } },
      select: { id: true, slug: true, name: true, set: true },
    }),
  ]);
  if (cards.length !== STARTER_CARD_SLUGS.length) throw new Error("Starter deck cards are unavailable.");
  const legality = checkDeckLegality({
    minDeckSize: format.minDeckSize, maxDeckSize: format.maxDeckSize,
    maxCopiesPerCard: format.maxCopiesPerCard, allowedSets: parseAllowedSets(format.allowedSets),
    bannedCardIds: new Set(format.bannedCards.map(card => card.cardId)),
    restrictedCardIds: new Map(format.restrictedCards.map(card => [card.cardId, card.maxCopies])),
  }, cards.map(card => ({ cardId: card.id, cardName: card.name, set: card.set, quantity: 3 })));
  if (!legality.legal) throw new Error("Starter deck is unavailable for Basic.");
  const copies = cards.map(card => ({ cardId: card.id, quantity: 3 }));
  return {
    ownedCards: { create: copies },
    decks: { create: { name: STARTER_DECK_NAME, formatId: format.id, cards: { create: copies } } },
  };
}
