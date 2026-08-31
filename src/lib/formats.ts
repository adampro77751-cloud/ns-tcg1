import { prisma } from "@/lib/prisma";
import type { FormatRules } from "@/lib/legality";

export function parseAllowedSets(allowedSets: string | null): string[] | null {
  if (!allowedSets) return null;
  try {
    const parsed = JSON.parse(allowedSets);
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : null;
  } catch {
    return null;
  }
}

export function serializeAllowedSets(sets: string[] | null): string | null {
  if (!sets || sets.length === 0) return null;
  return JSON.stringify(sets);
}

export async function getFormatRules(formatId: string): Promise<FormatRules> {
  const format = await prisma.format.findUniqueOrThrow({
    where: { id: formatId },
    include: {
      bannedCards: { select: { cardId: true } },
      restrictedCards: { select: { cardId: true, maxCopies: true } },
    },
  });

  return {
    minDeckSize: format.minDeckSize,
    maxDeckSize: format.maxDeckSize,
    maxCopiesPerCard: format.maxCopiesPerCard,
    allowedSets: parseAllowedSets(format.allowedSets),
    bannedCardIds: new Set(format.bannedCards.map((b) => b.cardId)),
    restrictedCardIds: new Map(
      format.restrictedCards.map((r) => [r.cardId, r.maxCopies]),
    ),
  };
}
