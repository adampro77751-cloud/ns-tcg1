import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { getMissingDeckCards } from "./deck-collection";
import { snapshotDigitalDeck } from "./digital-play";

const cards = [{ cardId: "card-1", quantity: 3, card: { name: "Test Card" } }];

describe("digital deck collection requirements", () => {
  it("accepts exact or surplus copies and ignores unrelated cards", () => {
    for (const quantity of [3, 5]) {
      expect(getMissingDeckCards(cards, [{ cardId: "card-1", quantity }, { cardId: "other", quantity: 1 }])).toEqual([]);
    }
  });

  it("reports missing cards and insufficient quantities", () => {
    expect(getMissingDeckCards(cards, [])).toEqual(["Test Card: need 3, own 0."]);
    expect(getMissingDeckCards(cards, [{ cardId: "card-1", quantity: 2 }])).toEqual(["Test Card: need 3, own 2."]);
  });

  function database(quantity: number) {
    return {
      deckCard: { findMany: vi.fn().mockResolvedValue(cards) },
      userCard: { findMany: vi.fn().mockResolvedValue([{ cardId: "card-1", quantity }]) },
      digitalMatchPlayerDeckCard: { createMany: vi.fn() },
    };
  }

  it("rejects an unowned human deck before saving its snapshot", async () => {
    const db = database(2);
    await expect(snapshotDigitalDeck(db as never, "player", "deck", "user")).rejects.toThrow("Test Card: need 3, own 2.");
    expect(db.digitalMatchPlayerDeckCard.createMany).not.toHaveBeenCalled();
    expect(db.userCard.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "user", cardId: { in: ["card-1"] } } }));
  });

  it("saves the validated human deck without consuming collection copies", async () => {
    const db = database(3);
    await snapshotDigitalDeck(db as never, "player", "deck", "user");
    expect(db.digitalMatchPlayerDeckCard.createMany).toHaveBeenCalledWith({ data: [{ digitalMatchPlayerId: "player", cardId: "card-1", quantity: 3 }] });
  });

  it("lets the accountless bot use a deck without checking the human collection", async () => {
    const db = database(0);
    await snapshotDigitalDeck(db as never, "bot", "deck");
    expect(db.userCard.findMany).not.toHaveBeenCalled();
    expect(db.digitalMatchPlayerDeckCard.createMany).toHaveBeenCalled();
  });
});
