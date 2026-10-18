import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
const mocks = vi.hoisted(() => ({ find: vi.fn(), upsert: vi.fn(), styles: vi.fn() }));
vi.mock("./prisma", () => ({ prisma: { userCardStyle: { findMany: mocks.styles } } }));
import { grantPurchaseCardStyle, getVisibleInstanceArt } from "./card-styles";
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
});
