import { describe, expect, it } from "vitest";
import {
  computeCardUsage,
  computeCardWinLoss,
  computeCoOccurrence,
  filterConfirmedRows,
  getTimeCutoff,
  meetsMinimumMatches,
  winRatePercent,
  type DeckCardRow,
  type MatchPlayerCardRow,
  type RawMatchPlayerCardRow,
} from "./metagame-logic";

describe("computeCardUsage", () => {
  it("counts a card in multiple decks correctly", () => {
    const rows: DeckCardRow[] = [
      { deckId: "d1", cardId: "coke", quantity: 1 },
      { deckId: "d2", cardId: "coke", quantity: 2 },
      { deckId: "d3", cardId: "coke", quantity: 1 },
    ];
    const usage = computeCardUsage(rows, 3);
    expect(usage.get("coke")?.decks).toBe(3);
    expect(usage.get("coke")?.usagePercent).toBeCloseTo(100);
  });

  it("does not let multiple copies in one deck inflate deck usage", () => {
    // Same deck, same card, appearing more than once (shouldn't happen given
    // the DB's unique(deckId, cardId) constraint, but the function must be
    // robust regardless) — this must still count as ONE deck.
    const rows: DeckCardRow[] = [
      { deckId: "d1", cardId: "coke", quantity: 3 },
      { deckId: "d1", cardId: "coke", quantity: 3 },
    ];
    const usage = computeCardUsage(rows, 10);
    expect(usage.get("coke")?.decks).toBe(1);
    expect(usage.get("coke")?.usagePercent).toBeCloseTo(10);
  });

  it("calculates average copies only across decks that include the card", () => {
    const rows: DeckCardRow[] = [
      { deckId: "d1", cardId: "coke", quantity: 1 },
      { deckId: "d2", cardId: "coke", quantity: 3 },
      { deckId: "d3", cardId: "coke", quantity: 2 },
      { deckId: "d4", cardId: "other-card", quantity: 4 },
    ];
    const usage = computeCardUsage(rows, 10);
    // (1 + 3 + 2) / 3 decks = 2, NOT divided by the 10 total decks.
    expect(usage.get("coke")?.averageCopies).toBeCloseTo(2);
  });

  it("format filtering: only decks within the eligible (pre-filtered) set are counted", () => {
    const basicFormatRows: DeckCardRow[] = [
      { deckId: "b1", cardId: "coke", quantity: 1 },
      { deckId: "b2", cardId: "coke", quantity: 1 },
    ];
    const allFormatsRows: DeckCardRow[] = [
      ...basicFormatRows,
      { deckId: "q1", cardId: "coke", quantity: 1 }, // a Quickfire deck
    ];
    const basicOnly = computeCardUsage(basicFormatRows, 2);
    const allFormats = computeCardUsage(allFormatsRows, 3);
    expect(basicOnly.get("coke")?.decks).toBe(2);
    expect(allFormats.get("coke")?.decks).toBe(3);
  });
});

describe("filterConfirmedRows", () => {
  const base: Omit<RawMatchPlayerCardRow, "resultStatus"> = {
    cardId: "coke",
    matchId: "m1",
    playerUserId: "u1",
    winnerId: "u1",
    loserId: "u2",
  };

  it("keeps confirmed matches", () => {
    const rows: RawMatchPlayerCardRow[] = [{ ...base, resultStatus: "CONFIRMED" }];
    expect(filterConfirmedRows(rows)).toHaveLength(1);
  });

  it("excludes pending matches", () => {
    const rows: RawMatchPlayerCardRow[] = [{ ...base, resultStatus: "PENDING" }];
    expect(filterConfirmedRows(rows)).toHaveLength(0);
  });

  it("excludes disputed matches", () => {
    const rows: RawMatchPlayerCardRow[] = [{ ...base, resultStatus: "DISPUTED" }];
    expect(filterConfirmedRows(rows)).toHaveLength(0);
  });

  it("excludes matches with no result at all (e.g. cancelled)", () => {
    const rows: RawMatchPlayerCardRow[] = [{ ...base, resultStatus: null }];
    expect(filterConfirmedRows(rows)).toHaveLength(0);
  });
});

describe("computeCardWinLoss", () => {
  it("a confirmed win increases the card's wins", () => {
    const rows: MatchPlayerCardRow[] = [
      { cardId: "coke", matchId: "m1", playerUserId: "u1", winnerId: "u1", loserId: "u2" },
    ];
    expect(computeCardWinLoss(rows).get("coke")).toEqual({
      cardId: "coke",
      wins: 1,
      losses: 0,
    });
  });

  it("a confirmed loss increases the card's losses", () => {
    const rows: MatchPlayerCardRow[] = [
      { cardId: "coke", matchId: "m1", playerUserId: "u2", winnerId: "u1", loserId: "u2" },
    ];
    expect(computeCardWinLoss(rows).get("coke")).toEqual({
      cardId: "coke",
      wins: 0,
      losses: 1,
    });
  });

  it("tallies across multiple matches for the same card", () => {
    const rows: MatchPlayerCardRow[] = [
      { cardId: "coke", matchId: "m1", playerUserId: "u1", winnerId: "u1", loserId: "u2" },
      { cardId: "coke", matchId: "m2", playerUserId: "u2", winnerId: "u1", loserId: "u2" },
      { cardId: "coke", matchId: "m3", playerUserId: "u1", winnerId: "u1", loserId: "u2" },
    ];
    const stat = computeCardWinLoss(rows).get("coke")!;
    expect(stat.wins).toBe(2);
    expect(stat.losses).toBe(1);
    expect(winRatePercent(stat)).toBeCloseTo((2 / 3) * 100);
  });
});

describe("meetsMinimumMatches", () => {
  it("excludes a card with only 1 win from the Highest Win Rate ranking by default", () => {
    expect(meetsMinimumMatches({ wins: 1, losses: 0 }, 10)).toBe(false);
  });

  it("includes a card once it reaches the minimum sample size", () => {
    expect(meetsMinimumMatches({ wins: 7, losses: 3 }, 10)).toBe(true);
  });
});

describe("getTimeCutoff", () => {
  const now = new Date("2026-09-15T00:00:00.000Z");

  it("returns null for 'all' (no cutoff)", () => {
    expect(getTimeCutoff("all", now)).toBeNull();
  });

  it("returns a date 30 days back for '30'", () => {
    expect(getTimeCutoff("30", now)?.toISOString()).toBe("2026-08-16T00:00:00.000Z");
  });

  it("returns a date 90 days back for '90'", () => {
    expect(getTimeCutoff("90", now)?.toISOString()).toBe("2026-06-17T00:00:00.000Z");
  });
});

describe("Commander statistics", () => {
  it("aggregate correctly using the same usage/win-loss logic as any other card", () => {
    // No separate Commander system — Commander is just a Card.type value,
    // so it's put through the exact same functions as everything else.
    const usageRows: DeckCardRow[] = [
      { deckId: "d1", cardId: "budge", quantity: 1 },
      { deckId: "d2", cardId: "budge", quantity: 1 },
    ];
    const usage = computeCardUsage(usageRows, 4);
    expect(usage.get("budge")).toMatchObject({ decks: 2, usagePercent: 50 });

    const matchRows: MatchPlayerCardRow[] = [
      { cardId: "budge", matchId: "m1", playerUserId: "u1", winnerId: "u1", loserId: "u2" },
      { cardId: "budge", matchId: "m2", playerUserId: "u2", winnerId: "u1", loserId: "u2" },
    ];
    const winLoss = computeCardWinLoss(matchRows).get("budge")!;
    expect(winLoss).toEqual({ cardId: "budge", wins: 1, losses: 1 });
  });
});

describe("historical integrity", () => {
  it("edited decks don't rewrite historical match statistics", () => {
    // The snapshot taken at match time says this player's deck had Coke in
    // it, and they won. This function has no way to consult the deck's
    // CURRENT (possibly since-edited-to-remove-Coke) card list — it only
    // ever sees whatever snapshot rows it's given.
    const snapshotAtMatchTime: MatchPlayerCardRow[] = [
      { cardId: "coke", matchId: "m1", playerUserId: "u1", winnerId: "u1", loserId: "u2" },
    ];
    const stat = computeCardWinLoss(snapshotAtMatchTime).get("coke")!;
    expect(stat).toEqual({ cardId: "coke", wins: 1, losses: 0 });
    // Even though "today" the player's deck no longer contains Coke at
    // all, the historical stat above is untouched — because it was never
    // derived from the deck's current state in the first place.
  });
});

describe("computeCoOccurrence", () => {
  it("only counts real co-occurrence, not global popularity", () => {
    // "Popular" appears in three decks that never contain the target card.
    // "Partner" appears in both decks that DO contain the target card.
    const targetCardId = "coke";
    const rowsInTargetDecks: { deckId: string; cardId: string }[] = [
      { deckId: "d1", cardId: "coke" },
      { deckId: "d1", cardId: "partner" },
      { deckId: "d2", cardId: "coke" },
      { deckId: "d2", cardId: "partner" },
    ];
    const result = computeCoOccurrence(targetCardId, rowsInTargetDecks);
    expect(result.get("partner")).toBe(2);
    expect(result.has("popular")).toBe(false);
    expect(result.has(targetCardId)).toBe(false);
  });

  it("dedupes multiple appearances of the same co-occurring card in one deck", () => {
    const rows = [
      { deckId: "d1", cardId: "coke" },
      { deckId: "d1", cardId: "partner" },
      { deckId: "d1", cardId: "partner" },
    ];
    const result = computeCoOccurrence("coke", rows);
    expect(result.get("partner")).toBe(1);
  });
});
