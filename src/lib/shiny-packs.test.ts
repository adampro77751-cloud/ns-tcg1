import { describe, expect, it } from "vitest";
import { generateShinyPackFromPool } from "./shiny-packs";

const pool = ["Common", "Rare", "Epic", "Legendary", "Mythic"].map((rarity) => ({
  id: rarity, name: rarity, rarity, image: null, type: "Item",
}));

describe("shiny pack guarantees", () => {
  it("always grants 15 cards with the exact promised rarity counts", () => {
    const cards = generateShinyPackFromPool(pool);
    expect(cards).toHaveLength(15);
    expect(cards.filter((c) => c.rarity === "Mythic")).toHaveLength(2);
    expect(cards.filter((c) => c.rarity === "Epic")).toHaveLength(2);
    expect(cards.filter((c) => c.rarity === "Legendary")).toHaveLength(1);
    expect(cards.filter((c) => c.rarity === "Common" || c.rarity === "Rare")).toHaveLength(10);
  });

  it("uses only Common/Rare cards as filler and can select either", () => {
    expect(generateShinyPackFromPool(pool, () => 0).slice(0, 10).every((c) => c.rarity === "Common")).toBe(true);
    expect(generateShinyPackFromPool(pool, (n) => n - 1).slice(0, 10).every((c) => c.rarity === "Rare")).toBe(true);
  });

  it.each(["Mythic", "Epic", "Legendary"])("refuses a set missing %s instead of substituting a lower rarity", (rarity) => {
    expect(() => generateShinyPackFromPool(pool.filter((c) => c.rarity !== rarity))).toThrow();
  });
});
