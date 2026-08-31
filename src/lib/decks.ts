import { prisma } from "@/lib/prisma";
import { getFormatRules } from "@/lib/formats";
import { checkDeckLegality, type LegalityResult } from "@/lib/legality";

// Shared by the deck builder, and later by match/event join flows that must
// reject an illegal deck server-side (not just hide the option in the UI).
export async function getDeckLegality(deckId: string): Promise<LegalityResult> {
  const deck = await prisma.deck.findUniqueOrThrow({
    where: { id: deckId },
    select: {
      formatId: true,
      cards: {
        select: {
          quantity: true,
          card: { select: { id: true, name: true, set: true } },
        },
      },
    },
  });

  const rules = await getFormatRules(deck.formatId);
  const cardInputs = deck.cards.map((dc) => ({
    cardId: dc.card.id,
    cardName: dc.card.name,
    set: dc.card.set,
    quantity: dc.quantity,
  }));

  return checkDeckLegality(rules, cardInputs);
}
