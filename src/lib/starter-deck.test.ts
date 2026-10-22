import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ format: vi.fn(), cards: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { format: { findUniqueOrThrow: mocks.format }, card: { findMany: mocks.cards } } }));
import { getStarterDeckGrant, STARTER_CARD_SLUGS } from "./starter-deck";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.format.mockResolvedValue({ id: "basic", minDeckSize: 30, maxDeckSize: null, maxCopiesPerCard: 3, allowedSets: null, bannedCards: [], restrictedCards: [] });
  mocks.cards.mockResolvedValue(STARTER_CARD_SLUGS.map(slug => ({ id: slug, slug, name: slug, set: "1st Edition" })));
});
it("grants ownership of all 30 cards in the saved Basic deck", async () => {
  const grant = await getStarterDeckGrant();
  expect(grant.decks.create.formatId).toBe("basic");
  expect(grant.ownedCards.create).toEqual(grant.decks.create.cards.create);
  expect(grant.ownedCards.create.reduce((sum, card) => sum + card.quantity, 0)).toBe(30);
  expect(new Set(grant.ownedCards.create.map(card => card.cardId)).size).toBe(10);
});
it("rejects missing cards instead of granting an incomplete starter", async () => {
  mocks.cards.mockResolvedValue([]);
  await expect(getStarterDeckGrant()).rejects.toThrow("cards are unavailable");
});
it("respects Basic bans and restrictions", async () => {
  const format = await mocks.format();
  mocks.format.mockResolvedValue({ ...format, bannedCards: [{ cardId: "pen" }] });
  await expect(getStarterDeckGrant()).rejects.toThrow("unavailable for Basic");
  mocks.format.mockResolvedValue({ ...format, restrictedCards: [{ cardId: "pencil", maxCopies: 1 }] });
  await expect(getStarterDeckGrant()).rejects.toThrow("unavailable for Basic");
});
