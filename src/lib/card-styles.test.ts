import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
const mocks = vi.hoisted(() => ({ find: vi.fn(), upsert: vi.fn(), styles: vi.fn(), spriteStyles: vi.fn(), findOwned: vi.fn(), clear: vi.fn(), update: vi.fn(), transaction: vi.fn(), user: vi.fn() }));
vi.mock("./prisma", () => ({ prisma: {
  userCardStyle: { findMany: mocks.styles, findUnique: mocks.findOwned, updateMany: mocks.clear, update: mocks.update },
  userSpriteStyle: { findMany: mocks.spriteStyles, findUnique: mocks.findOwned, updateMany: mocks.clear, update: mocks.update },
  user: { update: mocks.user }, $transaction: mocks.transaction,
} }));
import { prisma } from "./prisma";
import { grantPurchaseCardStyle, getVisibleInstanceArt, getEquippedCardArt, getSpriteInstanceArt, setOwnedArtStyle } from "./card-styles";
import { GOLDEN_COINS_STYLE as style } from "./card-style-catalog";

describe("exclusive Golden Coins card art", () => {
  const tx = { card: { findUnique: mocks.find }, userCardStyle: { upsert: mocks.upsert } } as unknown as Prisma.TransactionClient;
  beforeEach(() => { vi.resetAllMocks(); mocks.find.mockResolvedValue({ id: "cathedral" }); });

  it("unlocks the style for the 50,000-Coin bundle without changing card ownership or stats", async () => {
    await grantPurchaseCardStyle(tx, { id: "paid", userId: "owner", productId: "coins-50000" });
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { userId_styleKey: { userId: "owner", styleKey: style.key } }, update: {},
      create: { userId: "owner", cardId: "cathedral", styleKey: style.key, purchaseId: "paid" },
    });
  });

  it.each(["coins-5000", "coins-10000", "coins-20000", "normal-24", "shiny-6"])("does not unlock the style with %s", async (productId) => {
    await grantPurchaseCardStyle(tx, { id: "paid", userId: "owner", productId });
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.find).not.toHaveBeenCalled();
  });

  it("refuses to complete a style grant when the original card is unavailable", async () => {
    mocks.find.mockResolvedValue(null);
    await expect(grantPurchaseCardStyle(tx, { id: "paid", userId: "owner", productId: "coins-50000" })).rejects.toThrow("not available");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("applies art by owning player and visible instance, never to the opponent's same card", async () => {
    mocks.styles.mockImplementation(({ where }) => where.userId === "owner" ? [{ cardId: "cathedral", styleKey: style.key }] : []);
    const art = await getVisibleInstanceArt([
      { userId: "owner", cards: [{ instanceId: "own-card", cardId: "cathedral" }] },
      { userId: "other", cards: [{ instanceId: "opponent-card", cardId: "cathedral" }] },
      { userId: null, cards: [{ instanceId: "bot-card", cardId: "cathedral" }] },
    ]);
    expect(art).toEqual({ "own-card": style.image });
    expect(mocks.styles).toHaveBeenCalledWith({ where: { userId: "owner", equipped: true }, select: { cardId: true, styleKey: true } });
  });

  it("applies Halloween card art using the server catalog", async () => {
    mocks.styles.mockResolvedValue([{ cardId: "cupcake", styleKey: "cupcake-halloween-2026" }]);
    expect((await getEquippedCardArt("owner")).get("cupcake")).toBe("/cards/styles/halloween-2026/cupcake.png");
  });

  it("keeps Sprite skins tied to their owner's instances", async () => {
    mocks.spriteStyles.mockResolvedValue([{ userId: "owner", spriteId: "devil", styleKey: "devil-sprite-halloween-2026" }]);
    const art = await getSpriteInstanceArt([{ id: "own", ownerId: "owner", spriteId: "devil" }, { id: "other", ownerId: "opponent", spriteId: "devil" }]);
    expect(art.get("own")).toBe("/cards/styles/halloween-2026/devil-sprite.png");
    expect(art.has("other")).toBe(false);
  });

  it("checks ownership before equipping and clears only competing styles for that card", async () => {
    mocks.transaction.mockImplementation(fn => fn(prisma));
    mocks.findOwned.mockResolvedValue({ cardId: "cupcake" });
    await setOwnedArtStyle("owner", "cupcake-halloween-2026", true);
    expect(mocks.clear).toHaveBeenCalledWith({ where: { userId: "owner", cardId: "cupcake", equipped: true }, data: { equipped: false } });
    expect(mocks.update).toHaveBeenCalledWith({ where: { userId_styleKey: { userId: "owner", styleKey: "cupcake-halloween-2026" } }, data: { equipped: true } });
    mocks.update.mockClear(); mocks.clear.mockClear();
    mocks.findOwned.mockResolvedValue(null);
    await expect(setOwnedArtStyle("owner", "devil-sprite-halloween-2026", true)).rejects.toThrow("not unlocked");
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();
  });
});
