import { prisma } from "@/lib/prisma";
import { getDeckLegality } from "@/lib/decks";
import type { EngineCard } from "@/lib/digital-engine/types";
import type { SpriteEngineData } from "@/lib/digital-engine/sprite-abilities";

export function getActiveFormats() {
  return prisma.format.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true, startingHand: true, startingHealth: true },
  });
}

// Every one of the user's saved decks for this format, each annotated with
// its real (server re-checked, not trusted from any earlier client state)
// legality — mirrors the existing Deck Builder/match-join legality display.
export async function getDecksWithLegality(userId: string, formatId: string) {
  const decks = await prisma.deck.findMany({
    where: { userId, formatId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true },
  });
  const legality = await Promise.all(decks.map((d) => getDeckLegality(d.id)));
  return decks.map((deck, i) => ({ ...deck, legality: legality[i] }));
}

export async function getOwnedSpriteOptions(userId: string) {
  const instances = await prisma.spriteInstance.findMany({
    where: { ownerId: userId },
    select: {
      id: true,
      name: true,
      level: true,
      sprite: { select: { name: true, rarity: true } },
    },
    orderBy: [{ sprite: { name: "asc" } }, { obtainedAt: "asc" }],
  });
  return instances.map((s) => ({
    id: s.id,
    label: `${s.name} — ${s.sprite.name}${s.sprite.rarity ? ` (${s.sprite.rarity})` : ""} — Level ${s.level}${s.level >= 5 ? " MAX" : ""}`,
  }));
}

// Same snapshot principle as src/lib/match-deck-snapshot.ts, for the
// digital-only DigitalMatchPlayerDeckCard table — never shared with the
// physical match snapshot table, per beta-isolation requirement.
export async function snapshotDigitalDeck(
  tx: Pick<typeof prisma, "deckCard" | "digitalMatchPlayerDeckCard">,
  digitalMatchPlayerId: string,
  deckId: string,
) {
  const deckCards = await tx.deckCard.findMany({
    where: { deckId },
    select: { cardId: true, quantity: true },
  });
  if (deckCards.length === 0) return;
  await tx.digitalMatchPlayerDeckCard.createMany({
    data: deckCards.map((dc) => ({
      digitalMatchPlayerId,
      cardId: dc.cardId,
      quantity: dc.quantity,
    })),
  });
}

// Expands a snapshot (cardId, quantity) list into one entry per physical
// copy, e.g. 3x Coke -> ["coke-id", "coke-id", "coke-id"] — what the
// engine's deck-builder expects.
export function expandSnapshotToCardIds(
  snapshot: { cardId: string; quantity: number }[],
): string[] {
  const ids: string[] = [];
  for (const row of snapshot) {
    for (let i = 0; i < row.quantity; i++) ids.push(row.cardId);
  }
  return ids;
}

export async function getCardsByIdMap(cardIds: Iterable<string>): Promise<Map<string, EngineCard>> {
  const idList = Array.from(new Set(cardIds));
  if (idList.length === 0) return new Map();
  const cards = await prisma.card.findMany({
    where: { id: { in: idList } },
    select: { id: true, slug: true, type: true, attack: true, defence: true, speed: true },
  });
  return new Map(cards.map((c) => [c.id, c]));
}

// The engine's own view of a Sprite (slug + level only) — everything
// getSpriteTopicBonus (sprite-abilities.ts) needs, keyed by
// SpriteInstance.id. Used by the SAME engine code path for both the human
// and the bot's equipped Sprite.
export async function getSpritesByIdMap(
  spriteInstanceIds: Iterable<string | null>,
): Promise<Map<string, SpriteEngineData>> {
  const idList = Array.from(new Set(Array.from(spriteInstanceIds).filter((id): id is string => id !== null)));
  if (idList.length === 0) return new Map();
  const instances = await prisma.spriteInstance.findMany({
    where: { id: { in: idList } },
    select: { id: true, level: true, sprite: { select: { slug: true } } },
  });
  return new Map(instances.map((s) => [s.id, { slug: s.sprite.slug, level: s.level }]));
}

// Public-safe Sprite display info for the battlefield UI (name/image/level).
export async function getSpriteDisplayMap(spriteInstanceIds: Iterable<string | null>) {
  const idList = Array.from(new Set(Array.from(spriteInstanceIds).filter((id): id is string => id !== null)));
  if (idList.length === 0) return new Map();
  const instances = await prisma.spriteInstance.findMany({
    where: { id: { in: idList } },
    select: {
      id: true,
      name: true,
      level: true,
      sprite: { select: { name: true, image: true, rarity: true } },
    },
  });
  return new Map(
    instances.map((s) => [
      s.id,
      { id: s.id, name: s.name, level: s.level, spriteName: s.sprite.name, image: s.sprite.image, rarity: s.sprite.rarity },
    ]),
  );
}

// Public-safe card display info for the battlefield UI (name/image/etc).
export async function getCardDisplayMap(cardIds: Iterable<string>) {
  const idList = Array.from(new Set(cardIds));
  if (idList.length === 0) return new Map();
  const cards = await prisma.card.findMany({
    where: { id: { in: idList } },
    select: {
      id: true,
      slug: true,
      name: true,
      type: true,
      rarity: true,
      attack: true,
      defence: true,
      speed: true,
      image: true,
    },
  });
  return new Map(cards.map((c) => [c.id, c]));
}
