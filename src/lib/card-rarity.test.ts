import { describe, expect, it } from "vitest";
import { normalizeRarity, RARITY_COLORS, RARITY_ORDER } from "./card-rarity";

describe("normalizeRarity", () => {
  it("normalizes every real casing variant seen in the actual Card data to its canonical tier", () => {
    expect(normalizeRarity("Common")).toBe("Common");
    expect(normalizeRarity("RARE")).toBe("Rare");
    expect(normalizeRarity("Rare")).toBe("Rare");
    expect(normalizeRarity("Epic")).toBe("Epic");
    expect(normalizeRarity("LEGENDARY")).toBe("Legendary");
    expect(normalizeRarity("Legendary")).toBe("Legendary");
    expect(normalizeRarity("MYTHIC")).toBe("Mythic");
    expect(normalizeRarity("Mythic")).toBe("Mythic");
  });

  it("is whitespace-tolerant", () => {
    expect(normalizeRarity("  mythic  ")).toBe("Mythic");
  });

  it("returns null for unclassified rarity text (TBD, unknown, null) rather than guessing", () => {
    expect(normalizeRarity("TBD")).toBeNull();
    expect(normalizeRarity("something-unexpected")).toBeNull();
    expect(normalizeRarity(null)).toBeNull();
    expect(normalizeRarity(undefined)).toBeNull();
    expect(normalizeRarity("")).toBeNull();
  });
});

describe("RARITY_COLORS / RARITY_ORDER", () => {
  it("has an entry for every canonical rarity, matching the spec's 5 tiers", () => {
    expect(RARITY_ORDER).toEqual(["Common", "Rare", "Epic", "Legendary", "Mythic"]);
    for (const rarity of RARITY_ORDER) {
      expect(RARITY_COLORS[rarity]).toBeDefined();
      expect(RARITY_COLORS[rarity].text.length).toBeGreaterThan(0);
    }
  });
});
