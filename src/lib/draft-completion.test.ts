import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  match: vi.fn(), pod: vi.fn(), save: vi.fn(), reward: vi.fn(), packs: vi.fn(), credit: vi.fn(), transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {
  digitalMatch: { findUnique: mocks.match }, $transaction: mocks.transaction,
} }));
vi.mock("@/lib/coins", () => ({ debitCoins: vi.fn(), creditCoins: mocks.credit }));
import { advanceDraftAfterMatch } from "./draft";
import { getDraftPairings } from "./draft-logic";

describe("draft completion payouts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.match.mockResolvedValue({ draftPodId: "pod", draftRound: 4, draftOpponentSeat: 1,
      status: "COMPLETED", state: { phase: "COMPLETE", winnerIndex: 0 } });
    const results = Array.from({ length: 5 }, (_, round) => getDraftPairings(round)
      .filter((seats) => round !== 4 || !seats.includes(0))
      .map((seats) => ({ round, seats, winner: Math.min(...seats) }))).flat();
    mocks.pod.mockResolvedValue({ id: "pod", userId: "player", setName: "Draft Set", version: 5, status: "PLAYING", state: { results } });
    mocks.save.mockResolvedValue({ count: 1 });
    const tx = { draftPod: { findUniqueOrThrow: mocks.pod, updateMany: mocks.save, update: mocks.reward }, earnedPack: { createMany: mocks.packs } };
    mocks.transaction.mockImplementation((callback) => callback(tx));
  });

  it("grants the finishing prize once and saves packs from the draft's set", async () => {
    await advanceDraftAfterMatch("final-match");
    expect(mocks.credit).toHaveBeenCalledWith(expect.anything(), "player", 2000, "DRAFT_REWARD",
      { draftPodId: "pod", place: 1, coins: 2000, packs: 3 });
    expect(mocks.packs).toHaveBeenCalledWith({ data: [0, 1, 2].map((number) => ({ userId: "player", draftPodId: "pod", number, setName: "Draft Set" })) });
    mocks.pod.mockResolvedValue({ status: "COMPLETED" });
    await advanceDraftAfterMatch("final-match");
    expect(mocks.credit).toHaveBeenCalledTimes(1);
    expect(mocks.packs).toHaveBeenCalledTimes(1);
  });

  it("does not award a second payout when another request wins the version claim", async () => {
    mocks.save.mockResolvedValue({ count: 0 });
    await advanceDraftAfterMatch("final-match");
    expect(mocks.credit).not.toHaveBeenCalled();
    expect(mocks.packs).not.toHaveBeenCalled();
  });

  it("does not award prizes for an unfinished match", async () => {
    mocks.match.mockResolvedValue({ status: "IN_PROGRESS", draftPodId: "pod" });
    await advanceDraftAfterMatch("final-match");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
