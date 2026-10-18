import { describe, expect, it } from "vitest";
import { getDraftPairings, type DraftResult } from "./draft-logic";
import { getDraftPrize } from "./draft-rewards";

describe("draft placement prizes", () => {
  const results: DraftResult[] = Array.from({ length: 5 }, (_, round) =>
    getDraftPairings(round).map((seats) => ({ round, seats, winner: Math.min(...seats) }))).flat();

  it("awards the correct prize for each finishing place", () => {
    expect(Array.from({ length: 6 }, (_, seat) => getDraftPrize(results, seat))).toEqual([
      { place: 1, coins: 2000, packs: 3 }, { place: 2, coins: 1000, packs: 2 },
      { place: 3, coins: 500, packs: 1 }, { place: 4, coins: 250, packs: 0 },
      { place: 5, coins: 250, packs: 0 }, { place: 6, coins: 250, packs: 0 },
    ]);
  });

  it("gives tied records the same placing and prize regardless of seat", () => {
    const draws = results.map((result) => ({ ...result, winner: null }));
    for (let seat = 0; seat < 6; seat++) expect(getDraftPrize(draws, seat)).toEqual({ place: 1, coins: 2000, packs: 3 });
  });
});
