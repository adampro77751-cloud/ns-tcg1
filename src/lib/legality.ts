// Pure deck-legality checking logic. Deliberately has zero dependency on
// Prisma or Next.js so format rules aren't duplicated across UI components
// — every place that needs to know "is this deck legal" (deck builder,
// match creation, event join) calls this same function.

export type FormatRules = {
  minDeckSize: number;
  maxDeckSize: number | null;
  maxCopiesPerCard: number;
  allowedSets: string[] | null; // null/empty = all sets allowed
  bannedCardIds: ReadonlySet<string>;
  restrictedCardIds: ReadonlyMap<string, number>; // cardId -> max copies
};

export type DeckCardInput = {
  cardId: string;
  cardName: string;
  set: string | null;
  quantity: number;
};

export type LegalityResult = {
  legal: boolean;
  errors: string[];
};

export function checkDeckLegality(
  format: FormatRules,
  cards: DeckCardInput[],
): LegalityResult {
  const errors: string[] = [];
  const totalCards = cards.reduce((sum, c) => sum + c.quantity, 0);

  if (totalCards < format.minDeckSize) {
    errors.push(
      `Deck requires at least ${format.minDeckSize} cards (currently ${totalCards}).`,
    );
  }
  if (format.maxDeckSize !== null && totalCards > format.maxDeckSize) {
    errors.push(
      `Deck must have at most ${format.maxDeckSize} cards (currently ${totalCards}).`,
    );
  }

  const allowedSets = format.allowedSets;
  const hasSetRestriction = allowedSets !== null && allowedSets.length > 0;

  for (const card of cards) {
    if (card.quantity <= 0) continue;

    if (format.bannedCardIds.has(card.cardId)) {
      errors.push(`${card.cardName} is banned in this format.`);
      continue;
    }

    const restrictedMax = format.restrictedCardIds.get(card.cardId);
    const maxCopies = restrictedMax ?? format.maxCopiesPerCard;
    if (card.quantity > maxCopies) {
      errors.push(
        `Maximum ${maxCopies} cop${maxCopies === 1 ? "y" : "ies"} of ${card.cardName} allowed (currently ${card.quantity}).`,
      );
    }

    if (hasSetRestriction && (!card.set || !allowedSets!.includes(card.set))) {
      errors.push(`${card.cardName} is not legal in this format (set not allowed).`);
    }
  }

  return { legal: errors.length === 0, errors };
}
