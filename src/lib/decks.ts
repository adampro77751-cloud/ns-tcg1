import { prisma } from "@/lib/prisma";
import { getFormatRules } from "@/lib/formats";
import { checkDeckLegality, type LegalityResult } from "@/lib/legality";

// Re-validated on every call (deck contents can change after a match/event
// is joined) — shared by match and event join flows so a manipulated/
// nonexistent deck ID, or one that's since become illegal, is always
// rejected server-side, never trusted from the client.
export async function requireOwnedLegalDeck(deckId: string, userId: string) {
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
