import { beforeEach, expect, it, vi } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
const mocks = vi.hoisted(() => ({ credit: vi.fn() }));
vi.mock("./coins", () => ({ creditCoins: mocks.credit }));
import { grantRankedRewards } from "./ranked-rewards";

function wallet() {
  let claimed = 0;
  const tx = {
    user: { updateMany: vi.fn(async ({ data }: { data: { draftRewardPoints: number } }) => {
      if (claimed >= data.draftRewardPoints) return { count: 0 };
      claimed = data.draftRewardPoints;
      return { count: 1 };
    }) },
    card: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "bell" }) },
    userCardStyle: { updateMany: vi.fn(), upsert: vi.fn() },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, styles: tx.userCardStyle };
}
beforeEach(() => vi.clearAllMocks());
it("does not pay below Silver", async () => {
  await grantRankedRewards(wallet().tx, "player", 199);
  expect(mocks.credit).not.toHaveBeenCalled();
});
it("pays every crossed tier once, including simultaneous retries", async () => {
  const { tx, styles } = wallet();
  await Promise.all([grantRankedRewards(tx, "player", 1400), grantRankedRewards(tx, "player", 1400)]);
  expect(mocks.credit).toHaveBeenCalledTimes(4);
  expect(mocks.credit.mock.calls.reduce((sum, call) => sum + call[2], 0)).toBe(185000);
  expect(styles.upsert).toHaveBeenCalledTimes(1);
  expect(styles.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: { userId: "player", cardId: "bell", styleKey: "the-final-bell-diamond-rank" } }));
  await grantRankedRewards(tx, "player", 500);
  await grantRankedRewards(tx, "player", 1500);
  expect(mocks.credit).toHaveBeenCalledTimes(4);
});
it("awards Silver at its exact threshold without granting Diamond art", async () => {
  const { tx, styles } = wallet();
  await grantRankedRewards(tx, "player", 200);
  expect(mocks.credit).toHaveBeenCalledWith(tx, "player", 10000, "DRAFT_REWARD", { rankedMilestone: "Silver" });
  expect(styles.upsert).not.toHaveBeenCalled();
});
