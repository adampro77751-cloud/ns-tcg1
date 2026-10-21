import { describe, expect, it } from "vitest";
import { DRAFT_RANKS, getDraftRank, getDraftRankResult } from "./draft-rank";
import type { DraftResult } from "./draft-logic";

describe("ranked draft ladder", () => {
  it("promotes at each boundary and keeps Diamond above the final threshold", () => {
    for (let i = 0; i < DRAFT_RANKS.length; i++) {
      expect(getDraftRank(DRAFT_RANKS[i].points)).toEqual(DRAFT_RANKS[i]);
      if (i > 0) expect(getDraftRank(DRAFT_RANKS[i].points - 1)).toEqual(DRAFT_RANKS[i - 1]);
    }
    expect(getDraftRank(99999).name).toBe("Diamond");
  });

  it("counts only human results, awards draws and can promote or demote", () => {
    const results: DraftResult[] = [
      { round: 0, seats: [0, 1], winner: 0 },
      { round: 1, seats: [0, 2], winner: 0 },
      { round: 2, seats: [0, 3], winner: null },
      { round: 3, seats: [0, 4], winner: 4 },
      { round: 4, seats: [0, 5], winner: 5 },
      { round: 0, seats: [2, 3], winner: 2 },
    ];
    expect(getDraftRankResult(190, results)).toEqual({ before: 190, after: 260, change: 70 });
    expect(getDraftRank(260).name).toBe("Silver");
    expect(getDraftRankResult(210, [{ round: 0, seats: [0, 1], winner: 1 }]).after).toBe(180);
    expect(getDraftRank(180).name).toBe("Bronze");
    expect(getDraftRankResult(0, [{ round: 0, seats: [0, 1], winner: 1 }]).after).toBe(0);
  });
});
