import { describe, expect, it } from "vitest";
import {
  createDraftState, pickDraftCard, getDraftPairings, getDraftStandings,
  validateDraftDeck, buildBotDraftDeck, countDraftCards,
} from "./draft-logic";
import { simulateDraftBots } from "./draft-simulation";
import type { EngineCard } from "./digital-engine/types";

function packs() {
  return Array.from({ length: 3 }, (_, round) => Array.from({ length: 6 }, (_, seat) =>
    Array.from({ length: 10 }, (_, card) => `${round}-${seat}-${card}`)));
}

const item: EngineCard = { id: "item", slug: "draft-test-item", type: "Item", attack: 80, defence: 30, speed: 30 };
const spell: EngineCard = { ...item, id: "spell", slug: "draft-test-spell", type: "Spell", attack: null, defence: null, speed: null };

describe("six-seat draft", () => {
  it("requires exactly three packs per seat, with ten cards each", () => {
    expect(() => createDraftState([])).toThrow();
    const bad = packs(); bad[1][4].pop();
    expect(() => createDraftState(bad)).toThrow();
  });

  it("picks for all seats, passes left, and leaves input unchanged", () => {
    const state = createDraftState(packs());
    const next = pickDraftCard(state, 2, new Map());
    expect(next.pools[0]).toEqual(["0-0-2"]);
    expect(next.pools.every((pool) => pool.length === 1)).toBe(true);
    expect(next.packs[0][0]).toBe("0-5-1");
    expect(next.packs[1]).not.toContain("0-0-2");
    expect(state.packs[0]).toHaveLength(10);
    expect(state.pools[0]).toEqual([]);
  });

  it("reverses to the right for pack two", () => {
    let state = createDraftState(packs());
    for (let i = 0; i < 10; i++) state = pickDraftCard(state, 0, new Map());
    expect(state.pack).toBe(1);
    expect(state.packs[0][0]).toBe("1-0-0");
    state = pickDraftCard(state, 0, new Map());
    expect(state.packs[0][0]).toBe("1-1-1");
  });

  it("distributes all 180 copies exactly once, with 30 picks per seat", () => {
    let state = createDraftState(packs());
    for (let i = 0; i < 30; i++) state = pickDraftCard(state, 0, new Map());
    expect(state.pack).toBe(3);
    expect(state.packs).toEqual([]);
    expect(state.pools.every((pool) => pool.length === 30)).toBe(true);
    expect(new Set(state.pools.flat()).size).toBe(180);
    expect(() => pickDraftCard(state, 0, new Map())).toThrow();
  });

  it("rejects invalid pick positions", () => {
    for (const index of [-1, 10, 0.5, NaN]) {
      expect(() => pickDraftCard(createDraftState(packs()), index, new Map())).toThrow();
    }
  });

  it("builds bot decks only from their pools and favours Items", () => {
    const cards = new Map([[item.id, item], [spell.id, spell]]);
    const pool = [...Array<string>(10).fill("spell"), ...Array<string>(20).fill("item")];
    expect(buildBotDraftDeck(pool, cards, 1)).toEqual(Array(20).fill("item"));
  });
});

describe("draft deck restrictions", () => {
  const pool = [...Array<string>(20).fill("a"), ...Array<string>(10).fill("b")];

  it("allows drafted duplicates and decks from 20 to 30 cards", () => {
    expect(() => validateDraftDeck(pool, pool.slice(0, 20))).not.toThrow();
    expect(() => validateDraftDeck(pool, pool)).not.toThrow();
    expect(countDraftCards(pool)).toEqual([{ cardId: "a", quantity: 20 }, { cardId: "b", quantity: 10 }]);
  });

  it("rejects collection cards from outside the pod and extra copies", () => {
    expect(() => validateDraftDeck(pool, [...Array<string>(19).fill("a"), "outside"])).toThrow("picked");
    expect(() => validateDraftDeck(pool, Array<string>(21).fill("a"))).toThrow("picked");
  });

  it("rejects decks outside the draft size range", () => {
    expect(() => validateDraftDeck(pool, pool.slice(0, 19))).toThrow("20–30");
    expect(() => validateDraftDeck(pool, [...pool, "a"])).toThrow("20–30");
  });
});

describe("automatic pod matches", () => {
  it("pairs all six seats once per round, with no byes or rematches in five rounds", () => {
    const pairs = new Set<string>();
    const opponents = new Set<number>();
    for (let round = 0; round < 5; round++) {
      const pairings = getDraftPairings(round);
      expect(pairings).toHaveLength(3);
      expect([...pairings.flat()].sort()).toEqual([0, 1, 2, 3, 4, 5]);
      for (const pair of pairings) pairs.add([...pair].sort().join("-"));
      opponents.add(pairings.find((pair) => pair.includes(0))!.find((seat) => seat !== 0)!);
    }
    expect(pairs.size).toBe(15);
    expect([...opponents].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(() => getDraftPairings(5)).toThrow();
  });

  it("scores wins, losses and draws across all seats", () => {
    const standings = getDraftStandings([
      { round: 0, seats: [0, 5], winner: 0 },
      { round: 0, seats: [1, 4], winner: null },
      { round: 0, seats: [2, 3], winner: 2 },
    ]);
    expect(standings.find((row) => row.seat === 0)).toMatchObject({ wins: 1, losses: 0, points: 3 });
    expect(standings.find((row) => row.seat === 5)).toMatchObject({ losses: 1, points: 0 });
    expect(standings.find((row) => row.seat === 1)).toMatchObject({ draws: 1, points: 1 });
    expect(standings.reduce((total, row) => total + row.wins + row.losses + row.draws, 0)).toBe(6);
  });

  it("plays bot-only matches through the battle engine", () => {
    const cards = new Map([[item.id, item]]);
    expect([0, 1, null]).toContain(simulateDraftBots([Array<string>(20).fill(item.id), Array<string>(20).fill(item.id)], cards));
  });

  it.each([0, 1, 2, 3, 4])("finishes ranked bot simulations at difficulty %i", (difficulty) => {
    const cards = new Map([[item.id, item]]);
    expect([0, 1]).toContain(simulateDraftBots([Array<string>(20).fill(item.id), Array<string>(20).fill(item.id)], cards, difficulty));
  });

  it("terminates stalled bot games as draws", () => {
    const cards = new Map([[spell.id, spell]]);
    expect(simulateDraftBots([Array<string>(20).fill(spell.id), Array<string>(20).fill(spell.id)], cards)).toBeNull();
  });
});
