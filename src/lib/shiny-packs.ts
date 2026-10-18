import crypto from "node:crypto";
import { normalizeRarity } from "./card-rarity";
import type { GeneratedPackCard } from "./packs";

type PoolCard = Omit<GeneratedPackCard, "rarity"> & { rarity: string | null };

export function generateShinyPackFromPool(pool: PoolCard[], randomIndex = (length: number) => crypto.randomInt(length)): GeneratedPackCard[] {
  const mythics = pool.filter((card) => normalizeRarity(card.rarity) === "Mythic");
  const epics = pool.filter((card) => normalizeRarity(card.rarity) === "Epic");
  const legendaries = pool.filter((card) => normalizeRarity(card.rarity) === "Legendary");
  const filler = pool.filter((card) => ["Common", "Rare"].includes(normalizeRarity(card.rarity) ?? ""));
  if (![mythics, epics, legendaries, filler].every((cards) => cards.length)) {
    throw new Error("This set needs Mythic, Epic, Legendary and Common/Rare cards for shiny packs.");
  }
  const pick = (cards: PoolCard[]) => {
    const card = cards[randomIndex(cards.length)];
    return { ...card, rarity: normalizeRarity(card.rarity) };
  };
  const cards = [...Array.from({ length: 10 }, () => pick(filler)),
    pick(epics), pick(epics), pick(legendaries), pick(mythics), pick(mythics)];
  return cards;
}
