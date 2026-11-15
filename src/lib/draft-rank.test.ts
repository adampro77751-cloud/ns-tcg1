import { describe, expect, it } from "vitest";
import { DRAFT_RANKS, getVisibleDraftRanks, getDraftRank, getDraftRankResult } from "./draft-rank";
import type { DraftResult } from "./draft-logic";

describe("ranked draft ladder", () => {
  it("promotes at each boundary and keeps Diamond until the secret threshold", () => {
    for (let i = 0; i < DRAFT_RANKS.length; i++) {
      expect(getDraftRank(DRAFT_RANKS[i].points)).toEqual(DRAFT_RANKS[i]);
      if (i > 0) expect(getDraftRank(DRAFT_RANKS[i].points - 1)).toEqual(DRAFT_RANKS[i - 1]);
    }
    expect(getDraftRank(14999).name).toBe("Diamond");
  });

  it("reveals Demon only at 15,000 RP and uses the strongest bot difficulty", () => {
    expect(getVisibleDraftRanks(14999).map(rank => rank.name)).not.toContain("Demon");
    expect(getVisibleDraftRanks(15000).at(-1)?.name).toBe("Demon");
    expect(getDraftRank(15000)).toMatchObject({ name: "Demon", difficulty: 4 });
    expect(getDraftRank(99999).name).toBe("Demon");
    const loss = getDraftRankResult(15000, [{ round: 0, seats: [0, 1], winner: 1 }]);
    expect(getDraftRank(loss.after).name).toBe("Diamond");
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
    expect(getDraftRankResult(990, results)).toEqual({ before: 990, after: 1060, change: 70 });
    expect(getDraftRank(1060).name).toBe("Silver");
    expect(getDraftRankResult(1010, [{ round: 0, seats: [0, 1], winner: 1 }]).after).toBe(980);
    expect(getDraftRank(980).name).toBe("Bronze");
    expect(getDraftRankResult(0, [{ round: 0, seats: [0, 1], winner: 1 }]).after).toBe(0);
  });
});
