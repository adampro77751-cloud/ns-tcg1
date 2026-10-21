import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ previous: vi.fn(), cards: vi.fn(), sprites: vi.fn(), opening: vi.fn(), debit: vi.fn(), owned: vi.fn(), upsert: vi.fn(), clear: vi.fn(), transaction: vi.fn() }));
vi.mock("./prisma", () => ({ prisma: { packOpening: { findUnique: mocks.previous }, card: { findMany: mocks.cards }, sprite: { findMany: mocks.sprites }, $transaction: mocks.transaction } }));
vi.mock("./coins", () => ({ debitCoins: mocks.debit }));
import { buyHalloweenPack, rollHalloweenStyles } from "./halloween-packs";
import { HALLOWEEN_STYLES, isHalloweenPackAvailable } from "./card-style-catalog";
const key = "c80a2512-b258-4a15-88c2-63ce84159691";

describe("Halloween cosmetic packs", () => {
  beforeEach(() => {
    vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
    mocks.previous.mockResolvedValue(null);
    mocks.cards.mockResolvedValue(HALLOWEEN_STYLES.flatMap(style => style.kind === "card" ? [{ id: style.cardSlug, slug: style.cardSlug }] : []));
    mocks.sprites.mockResolvedValue([{ id: "devil", slug: "devil-sprite" }]);
    mocks.owned.mockResolvedValue(null);
    mocks.opening.mockImplementation(({ data }) => ({ id: "opening", cards: data.cards }));
    const styles = { findUnique: mocks.owned, updateMany: mocks.clear, upsert: mocks.upsert };
    mocks.transaction.mockImplementation(fn => fn({ packOpening: { create: mocks.opening }, userCardStyle: styles, userSpriteStyle: styles }));
  });
  afterEach(() => vi.useRealTimers());

  it("draws three different styles from exactly the supplied ten with a secure injectable index", () => {
    expect(HALLOWEEN_STYLES).toHaveLength(10);
    const maxes: number[] = [];
    const styles = rollHalloweenStyles(max => { maxes.push(max); return max - 1; });
    expect(maxes).toEqual([10, 9, 8]);
    expect(new Set(styles.map(style => style.key)).size).toBe(3);
    expect(styles.some(style => style.kind === "sprite")).toBe(true);
  });

  it("charges 500 Coins for exactly three cosmetic unlocks and records the opening", async () => {
    const result = await buyHalloweenPack("player", key);
    expect(result.cards).toHaveLength(3);
    expect(new Set(result.cards.map(card => card.id)).size).toBe(3);
    expect(result.sprite).toBeNull();
    expect(mocks.debit).toHaveBeenCalledWith(expect.anything(), "player", 500, "PACK_PURCHASE", expect.objectContaining({ packKind: "HALLOWEEN", packSize: 3, requestKey: key }));
    expect(mocks.upsert).toHaveBeenCalledTimes(3);
    expect(mocks.opening).toHaveBeenCalledWith({ data: expect.objectContaining({ coinsSpent: 500, requestKey: key, userId: "player" }) });
  });

  it("returns a previous result for retries without another charge, even after the sale", async () => {
    vi.setSystemTime(new Date("2026-11-09T00:00:00Z"));
    mocks.previous.mockResolvedValue({ id: "saved", cards: [] });
    expect((await buyHalloweenPack("player", key)).openingId).toBe("saved");
    expect(mocks.debit).not.toHaveBeenCalled();
  });

  it("keeps 7 November inclusive and refuses new purchases from 8 November", async () => {
    expect(isHalloweenPackAvailable(new Date("2026-11-07T23:59:59.999Z"))).toBe(true);
    vi.setSystemTime(new Date("2026-11-08T00:00:00Z"));
    expect(isHalloweenPackAvailable()).toBe(false);
    await expect(buyHalloweenPack("player", key)).rejects.toThrow("sale ended");
    expect(mocks.debit).not.toHaveBeenCalled();
  });

  it("refuses a missing catalog target before charging", async () => {
    mocks.sprites.mockResolvedValue([]);
    await expect(buyHalloweenPack("player", key)).rejects.toThrow("temporarily unavailable");
    expect(mocks.debit).not.toHaveBeenCalled();
  });

  it("preserves equipment and increments collected quantities for repeat pulls", async () => {
    mocks.owned.mockResolvedValue({ equipped: false });
    await buyHalloweenPack("player", key);
    expect(mocks.clear).not.toHaveBeenCalled();
    for (const [args] of mocks.upsert.mock.calls) expect(args.update).toEqual({ quantity: { increment: 1 } });
  });

  it("grants nothing when the debit fails", async () => {
    mocks.debit.mockRejectedValue(new Error("Not enough Coins"));
    await expect(buyHalloweenPack("player", key)).rejects.toThrow("Not enough Coins");
    expect(mocks.opening).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
