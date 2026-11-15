import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), claim: vi.fn(), credit: vi.fn(), packs: vi.fn(), card: vi.fn(), styles: vi.fn(), grant: vi.fn() }));
vi.mock("./prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("./coins", () => ({ creditCoins: mocks.credit }));
vi.mock("./collection", () => ({ grantCards: mocks.grant }));
import { claimChristmasReward } from "./christmas";
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-12-25T12:00:00Z"));
  mocks.claim.mockResolvedValue({ count: 1 });
  mocks.transaction.mockImplementation(callback => callback({ christmasClaim: { createMany: mocks.claim }, card: { findFirst: mocks.card, findUnique: mocks.card, upsert: mocks.card }, earnedPack: { createMany: mocks.packs }, userCardStyle: { upsert: mocks.styles } }));
});
afterEach(() => vi.useRealTimers());
it("rejects early claims without touching the database", async () => {
  vi.setSystemTime(new Date("2026-11-30T23:59:59Z"));
  expect(await claimChristmasReward("u", 1)).toHaveProperty("error");
  expect(mocks.transaction).not.toHaveBeenCalled();
});
it("does not grant anything when a duplicate claim loses", async () => {
  mocks.claim.mockResolvedValue({ count: 0 });
  expect(await claimChristmasReward("u", 1)).toHaveProperty("error");
  expect(mocks.credit).not.toHaveBeenCalled();
  expect(mocks.packs).not.toHaveBeenCalled();
});
it("credits a daily gift inside the claim transaction", async () => {
  expect(await claimChristmasReward("u", 1)).toHaveProperty("success");
  expect(mocks.claim).toHaveBeenCalledWith({ data: { userId: "u", year: 2026, day: 1 }, skipDuplicates: true });
  expect(mocks.credit).toHaveBeenCalledWith(expect.anything(), "u", 240, "CHRISTMAS_REWARD", { year: 2026, day: 1 });
});
it("grants unopened packs", async () => {
  mocks.card.mockResolvedValue({ set: "1st Edition" });
  await claimChristmasReward("u", 11);
  expect(mocks.packs).toHaveBeenCalledWith({ data: [{ userId: "u", number: 0, setName: "1st Edition" }] });
});
it("grants the finale card and two packs on Christmas Day", async () => {
  mocks.card.mockResolvedValueOnce({ set: "1st Edition" }).mockResolvedValueOnce({ id: "finale" });
  expect(await claimChristmasReward("u", 25)).toHaveProperty("success");
  expect(mocks.grant).toHaveBeenCalledWith(expect.anything(), "u", ["finale"]);
  expect(mocks.packs.mock.calls[0][0].data).toHaveLength(2);
  expect(mocks.credit).toHaveBeenCalledWith(expect.anything(), "u", 2160, "CHRISTMAS_REWARD", { year: 2026, day: 25 });
});
