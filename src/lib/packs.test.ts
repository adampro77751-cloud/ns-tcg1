import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findCards: vi.fn(), findSprites: vi.fn(), transaction: vi.fn(),
  earned: vi.fn(), claim: vi.fn(),
  debit: vi.fn(), grant: vi.fn(), opening: vi.fn(), edition: vi.fn(), instance: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {
  card: { findMany: mocks.findCards }, sprite: { findMany: mocks.findSprites },
  $transaction: mocks.transaction,
  earnedPack: { findFirst: mocks.earned },
} }));
vi.mock("@/lib/coins", () => ({ debitCoins: mocks.debit, PACK_COST: 1000 }));
vi.mock("@/lib/collection", () => ({ grantCards: mocks.grant }));
import crypto from "node:crypto";
import { buyAndOpenPack, openEarnedPack, rollPackSprite } from "./packs";

describe("pack sprite rewards", () => {
  beforeEach(() => { vi.restoreAllMocks(); vi.resetAllMocks(); });

  it("wins for exactly 10 of the 100 possible rolls", () => {
    const wins = Array.from({ length: 100 }, (_, roll) =>
      rollPackSprite(["fire"], (max) => max === 100 ? roll : 0));
    expect(wins.filter(Boolean)).toHaveLength(10);
    expect(wins[9]).toBe("fire");
    expect(wins[10]).toBeNull();
  });

  it("can select every eligible sprite and handles an empty pool", () => {
    const sprites = ["fire", "water", "air"];
    for (let index = 0; index < sprites.length; index++) {
      expect(rollPackSprite(sprites, (max) => max === 100 ? 0 : index)).toBe(sprites[index]);
    }
    expect(rollPackSprite([], () => { throw new Error("unexpected roll"); })).toBeNull();
  });

  it.each([true, false])("automatically grants a winning sprite in the purchase transaction: %s", async (wins) => {
    mocks.findCards.mockResolvedValue([{ id: "card", name: "Card", rarity: "Common", image: null, type: null }]);
    // A one-card pool needs index zero even on a losing sprite roll.
    vi.spyOn(crypto, "randomInt").mockImplementation(((min: number, max: number) => max === 100 ? (wins ? 0 : 99) : 0) as typeof crypto.randomInt);
    mocks.findSprites.mockResolvedValue([{ id: "fire", name: "Fire Sprite", image: "/sprites/fire-sprite.png", rarity: "RARE" }]);
    mocks.opening.mockResolvedValue({ id: "opening" });
    mocks.edition.mockResolvedValue({ id: "edition" });
    mocks.instance.mockResolvedValue({ id: "owned-sprite" });
    const tx = { packOpening: { create: mocks.opening }, edition: { upsert: mocks.edition }, spriteInstance: { create: mocks.instance } };
    mocks.transaction.mockImplementation((callback) => callback(tx));
    const result = await buyAndOpenPack("player", "Set One");
    expect(result.cards).toHaveLength(10);
    expect(mocks.debit).toHaveBeenCalledWith(tx, "player", 1000, "PACK_PURCHASE", expect.anything());
    expect(mocks.grant).toHaveBeenCalledWith(tx, "player", Array(10).fill("card"));
    if (wins) {
      expect(mocks.instance).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
        ownerId: "player", spriteId: "fire", obtainedMethod: "PACK_OPENING",
        packOpening: { connect: { id: "opening" } },
      }) }));
      expect(result.sprite?.instanceId).toBe("owned-sprite");
    } else {
      expect(mocks.instance).not.toHaveBeenCalled();
      expect(result.sprite).toBeNull();
    }
  });

  it("opens earned packs for free and refuses a second claim", async () => {
    vi.spyOn(crypto, "randomInt").mockImplementation((() => 0) as typeof crypto.randomInt);
    mocks.earned.mockResolvedValue({ id: "reward", setName: "Set One" });
    mocks.findCards.mockResolvedValue([{ id: "card", name: "Card", rarity: "Common", image: null, type: null }]);
    mocks.findSprites.mockResolvedValue([]);
    mocks.claim.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    mocks.opening.mockResolvedValue({ id: "opening" });
    const tx = { earnedPack: { updateMany: mocks.claim }, packOpening: { create: mocks.opening } };
    mocks.transaction.mockImplementation((callback) => callback(tx));
    expect((await openEarnedPack("player", "reward")).cards).toHaveLength(10);
    expect(mocks.debit).not.toHaveBeenCalled();
    expect(mocks.opening).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ coinsSpent: 0 }) }));
    expect(mocks.claim).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "reward", userId: "player", openedAt: null } }));
    await expect(openEarnedPack("player", "reward")).rejects.toThrow("already opened");
    expect(mocks.grant).toHaveBeenCalledTimes(1);
  });

  it("rejects reward packs that do not belong to the player", async () => {
    mocks.earned.mockResolvedValue(null);
    await expect(openEarnedPack("other-player", "reward")).rejects.toThrow("not found");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
