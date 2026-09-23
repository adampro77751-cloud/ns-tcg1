// Pack store service — set listing, secure random pack generation, and
// the atomic buy+open transaction. No real-money payments anywhere here;
// Coins (src/lib/coins.ts) are the only purchase method. Server-side only
// — the client never supplies pack contents, only which set to buy from.
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { debitCoins, PACK_COST } from "@/lib/coins";
import { grantCards } from "@/lib/collection";
import { normalizeRarity, type CanonicalRarity } from "@/lib/card-rarity";
import { PACK_SIZE } from "@/lib/economy-constants";

export { PACK_SIZE };

// Independent per-slot rarity odds — each of the PACK_SIZE cards rolls its
// own rarity separately (not a guaranteed-slot booster model). Provisional
// and intentionally isolated in one table so it's easy to retune, or to
// let a future format/set override it, without touching the generation
// logic below. Must sum to 1.
const RARITY_ODDS: Record<CanonicalRarity, number> = {
  Common: 0.6,
  Rare: 0.25,
  Epic: 0.1,
  Legendary: 0.035,
  Mythic: 0.015,
};

// Cryptographically secure randomness (Node's crypto.randomInt), never
// Math.random — required for pack generation per this feature's spec.
function secureRandomFloat(): number {
  return crypto.randomInt(0, 1_000_000) / 1_000_000;
}

function secureRandomIndex(length: number): number {
  return crypto.randomInt(0, length);
}

function rollRarity(): CanonicalRarity {
  const roll = secureRandomFloat();
  let cumulative = 0;
  for (const [rarity, odds] of Object.entries(RARITY_ODDS) as [CanonicalRarity, number][]) {
    cumulative += odds;
    if (roll < cumulative) return rarity;
  }
  return "Common"; // floating-point rounding safety net only
}

export type SetSummary = {
  name: string;
  cardCount: number;
  sampleImage: string | null;
};

// Every set a pack can currently be bought from — derived from the Cards
// that actually exist (there is no separate Set catalog model; Card.set
// is free text, same as the rest of the site already treats it — see
// Format.allowedSets' identical convention).
export async function listAvailableSets(): Promise<SetSummary[]> {
  const cards = await prisma.card.findMany({
    where: { set: { not: null } },
    select: { set: true, image: true },
  });
  const bySet = new Map<string, { count: number; image: string | null }>();
  for (const c of cards) {
    if (!c.set) continue;
    const entry = bySet.get(c.set) ?? { count: 0, image: null };
    entry.count += 1;
    if (!entry.image && c.image) entry.image = c.image;
    bySet.set(c.set, entry);
  }
  return Array.from(bySet.entries())
    .map(([name, { count, image }]) => ({ name, cardCount: count, sampleImage: image }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type GeneratedPackCard = {
  id: string;
  name: string;
  rarity: CanonicalRarity | null;
  image: string | null;
  type: string | null;
};

// Generates PACK_SIZE cards for `setName` server-side. `setName` is only
// ever used to filter the server's own Card table — never trusted for
// anything beyond that. Throws if the set has no cards at all.
export async function generatePackCards(setName: string): Promise<GeneratedPackCard[]> {
  const cardsInSet = await prisma.card.findMany({
    where: { set: setName },
    select: { id: true, name: true, rarity: true, image: true, type: true },
  });
  if (cardsInSet.length === 0) {
    throw new Error(`No cards found in set "${setName}".`);
  }

  const byRarity = new Map<CanonicalRarity, typeof cardsInSet>();
  for (const card of cardsInSet) {
    const rarity = normalizeRarity(card.rarity);
    if (!rarity) continue;
    const list = byRarity.get(rarity) ?? [];
    list.push(card);
    byRarity.set(rarity, list);
  }

  const result: GeneratedPackCard[] = [];
  for (let i = 0; i < PACK_SIZE; i++) {
    let pool = byRarity.get(rollRarity());
    // Graceful fallback if this set has no cards at the rolled rarity —
    // pack generation must never fail just because a set is thin on one
    // tier. Tries progressively looser fallbacks: the next rarities in
    // order, then finally any card in the set at all.
    if (!pool || pool.length === 0) {
      for (const rarity of ["Common", "Rare", "Epic", "Legendary", "Mythic"] as CanonicalRarity[]) {
        const candidate = byRarity.get(rarity);
        if (candidate && candidate.length > 0) {
          pool = candidate;
          break;
        }
      }
    }
    const finalPool = pool && pool.length > 0 ? pool : cardsInSet;
    const chosen = finalPool[secureRandomIndex(finalPool.length)];
    result.push({
      id: chosen.id,
      name: chosen.name,
      rarity: normalizeRarity(chosen.rarity),
      image: chosen.image,
      type: chosen.type,
    });
  }
  return result;
}

export type PackOpeningResult = {
  openingId: string;
  cards: GeneratedPackCard[];
};

// The one entry point the store action calls: generates the pack, then
// atomically debits Coins, grants the cards to the collection, and
// records the opening — all in a single transaction, so a failure partway
// (insufficient Coins, a DB error) can never charge without granting, or
// grant without charging. Card generation itself happens BEFORE the
// transaction (pure reads), keeping the transaction itself short.
export async function buyAndOpenPack(userId: string, setName: string): Promise<PackOpeningResult> {
  const cards = await generatePackCards(setName);

  return prisma.$transaction(async (tx) => {
    await debitCoins(tx, userId, PACK_COST, "PACK_PURCHASE", { setName, packSize: cards.length });
    await grantCards(
      tx,
      userId,
      cards.map((c) => c.id),
    );
    const opening = await tx.packOpening.create({
      data: {
        userId,
        setName,
        coinsSpent: PACK_COST,
        cards: cards.map((c) => ({ id: c.id, name: c.name, rarity: c.rarity, image: c.image })) as Prisma.InputJsonValue,
        packCards: { create: cards.map((c) => ({ cardId: c.id })) },
      },
      select: { id: true },
    });
    return { openingId: opening.id, cards };
  });
}
