import { describe, expect, it } from "vitest";
import {
  createGameState,
  drawCard,
  playItem,
  playSpell,
  declareAttack,
  endTurn,
  concede,
  getLegalActions,
  getVisibleState,
  shuffle,
} from "./engine";
import { simpleRulesBot, runBotTurn } from "./bot";
import { IllegalActionError } from "./types";
import type { EngineCard } from "./types";

const ITEM_STRONG: EngineCard = { id: "item-strong", type: "Item", attack: 50, defence: 10, speed: 20 };
const ITEM_WEAK: EngineCard = { id: "item-weak", type: "Item", attack: 10, defence: 40, speed: 5 };
const SPELL_A: EngineCard = { id: "spell-a", type: "Spell", attack: null, defence: null, speed: null };

const cardsById = new Map<string, EngineCard>([
  [ITEM_STRONG.id, ITEM_STRONG],
  [ITEM_WEAK.id, ITEM_WEAK],
  [SPELL_A.id, SPELL_A],
]);

function newGame() {
  return createGameState({
    matchId: "m1",
    formatId: "f1",
    startingHealth: 500,
    startingHand: 3,
    players: [
      { userId: "u1", spriteInstanceId: null, cardIds: [ITEM_STRONG.id, ITEM_STRONG.id, SPELL_A.id, ITEM_WEAK.id] },
      { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id, ITEM_WEAK.id, SPELL_A.id, ITEM_STRONG.id] },
    ],
    // Deterministic — no real shuffle needed for these assertions.
    random: () => 0,
  });
}

describe("shuffle", () => {
  it("preserves every element (no loss/duplication) regardless of order", () => {
    const input = [1, 2, 3, 4, 5];
    const result = shuffle(input, () => 0.999);
    expect(result.slice().sort()).toEqual(input.slice().sort());
  });
});

describe("createGameState — opening hand and draw pile", () => {
  it("deals the format's starting hand size to both players", () => {
    const state = newGame();
    expect(state.players[0].hand).toHaveLength(3);
    expect(state.players[1].hand).toHaveLength(3);
  });

  it("leaves the rest of the deck as the draw pile", () => {
    const state = newGame();
    expect(state.players[0].deck).toHaveLength(1);
  });
});

describe("drawCard", () => {
  it("moves the top card from deck to hand", () => {
    const state = newGame();
    const before = state.players[0].deck.length;
    const next = drawCard(state, 0);
    expect(next.players[0].hand).toHaveLength(state.players[0].hand.length + 1);
    expect(next.players[0].deck).toHaveLength(before - 1);
  });

  it("is a no-op on an empty deck rather than erroring", () => {
    let state = newGame();
    state = drawCard(state, 0); // deck now empty (started with 1)
    const again = drawCard(state, 0);
    expect(again).toEqual(state);
  });
});

describe("turn ownership", () => {
  it("player 2 cannot play a card on player 1's turn", () => {
    const state = newGame();
    const opponentCard = state.players[1].hand[0];
    expect(() => playItem(state, 1, opponentCard.instanceId, cardsById)).toThrow(
      IllegalActionError,
    );
  });

  it("a player cannot play a card that isn't in their own hand", () => {
    const state = newGame();
    const opponentCard = state.players[1].hand[0];
    // Active player (0) tries to play player 1's card instance.
    expect(() => playItem(state, 0, opponentCard.instanceId, cardsById)).toThrow(
      IllegalActionError,
    );
  });

  it("a player cannot act when it isn't their turn (attack)", () => {
    const state = newGame();
    expect(() => declareAttack(state, 1, "whatever", cardsById)).toThrow(IllegalActionError);
  });
});

describe("server-validated card plays", () => {
  it("rejects playing a Spell as an Item and vice versa", () => {
    const state = newGame();
    const spellInHand = state.players[0].hand.find((c) => c.cardId === SPELL_A.id)!;
    expect(() => playItem(state, 0, spellInHand.instanceId, cardsById)).toThrow(
      IllegalActionError,
    );
  });

  it("enforces at most 1 Item per turn", () => {
    // startingHand equal to the full deck size guarantees both ITEM_STRONG
    // copies land in hand regardless of shuffle order.
    let state = createGameState({
      matchId: "m-items",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 4,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [ITEM_STRONG.id, ITEM_STRONG.id, SPELL_A.id, ITEM_WEAK.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      random: () => 0,
    });
    const items = state.players[0].hand.filter((c) => c.cardId === ITEM_STRONG.id);
    expect(items).toHaveLength(2);
    state = playItem(state, 0, items[0].instanceId, cardsById);
    expect(() => playItem(state, 0, items[1].instanceId, cardsById)).toThrow(IllegalActionError);
  });

  it("moves a played Item to the battlefield and a played Spell to discard", () => {
    let state = newGame();
    const item = state.players[0].hand.find((c) => c.cardId === ITEM_STRONG.id)!;
    state = playItem(state, 0, item.instanceId, cardsById);
    expect(state.players[0].battlefield.map((c) => c.instanceId)).toContain(item.instanceId);

    const spell = state.players[0].hand.find((c) => c.cardId === SPELL_A.id)!;
    state = playSpell(state, 0, spell.instanceId, cardsById);
    expect(state.players[0].discard.map((c) => c.instanceId)).toContain(spell.instanceId);
  });
});

describe("combat / health", () => {
  it("an unopposed attack deals full Attack damage to the defender's health", () => {
    let state = newGame();
    const item = state.players[0].hand.find((c) => c.cardId === ITEM_STRONG.id)!;
    state = playItem(state, 0, item.instanceId, cardsById);
    const startHealth = state.players[1].health;
    state = declareAttack(state, 0, item.instanceId, cardsById);
    expect(state.players[1].health).toBe(startHealth - ITEM_STRONG.attack!);
  });

  it("a faster defender mitigates damage by its Defence", () => {
    // Attacker speed 20 (ITEM_STRONG), defender speed 5... make defender faster instead.
    const fastDefender: EngineCard = { id: "fast-def", type: "Item", attack: 5, defence: 15, speed: 99 };
    const localCards = new Map(cardsById);
    localCards.set(fastDefender.id, fastDefender);

    let state = createGameState({
      matchId: "m2",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [ITEM_STRONG.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [fastDefender.id] },
      ],
      random: () => 0,
    });
    state = playItem(state, 0, state.players[0].hand[0].instanceId, localCards);
    state = endTurn(state);
    state = playItem(state, 1, state.players[1].hand[0].instanceId, localCards);
    state = endTurn(state); // back to player 0

    const attackerInstance = state.players[0].battlefield[0];
    const before = state.players[1].health;
    state = declareAttack(state, 0, attackerInstance.instanceId, localCards);
    expect(state.players[1].health).toBe(before - (ITEM_STRONG.attack! - fastDefender.defence!));
  });

  it("an attacking Item becomes tired and cannot attack again until tired counters are removed", () => {
    let state = newGame();
    const item = state.players[0].hand.find((c) => c.cardId === ITEM_STRONG.id)!;
    state = playItem(state, 0, item.instanceId, cardsById);
    state = declareAttack(state, 0, item.instanceId, cardsById);
    expect(() => declareAttack(state, 0, item.instanceId, cardsById)).toThrow(IllegalActionError);
  });

  it("win condition: a player at 0 health ends the match with the other player as winner", () => {
    const state = createGameState({
      matchId: "m3",
      formatId: "f1",
      startingHealth: 10,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [ITEM_STRONG.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      random: () => 0,
    });
    let s = playItem(state, 0, state.players[0].hand[0].instanceId, cardsById);
    s = declareAttack(s, 0, s.players[0].battlefield[0].instanceId, cardsById);
    expect(s.phase).toBe("COMPLETE");
    expect(s.winnerIndex).toBe(0);
    expect(() => endTurn(s)).toThrow(IllegalActionError);
  });
});

describe("conceding", () => {
  it("the other player is declared the winner", () => {
    const state = newGame();
    const next = concede(state, 0);
    expect(next.phase).toBe("COMPLETE");
    expect(next.winnerIndex).toBe(1);
  });
});

describe("getLegalActions", () => {
  it("only returns actions for the active player", () => {
    const state = newGame();
    expect(getLegalActions(state, 1, cardsById)).toEqual([]);
    expect(getLegalActions(state, 0, cardsById).length).toBeGreaterThan(0);
  });

  it("stops offering PLAY_ITEM once the per-turn Item has been played", () => {
    let state = newGame();
    const item = state.players[0].hand.find((c) => c.cardId === ITEM_STRONG.id)!;
    state = playItem(state, 0, item.instanceId, cardsById);
    const legal = getLegalActions(state, 0, cardsById);
    expect(legal.some((a) => a.type === "PLAY_ITEM")).toBe(false);
  });
});

describe("hidden information", () => {
  it("a viewer sees their own hand but only counts for the opponent's hand/deck", () => {
    const state = newGame();
    const visible = getVisibleState(state, 0);
    expect(visible.players[0].hand.every((c) => "cardId" in c)).toBe(true);
    expect(visible.players[1].hand.every((c) => "hidden" in c)).toBe(true);
    expect(visible.players[1].hand).toHaveLength(state.players[1].hand.length);
    expect((visible.players as unknown as Record<string, unknown>[])[1]).not.toHaveProperty("deck");
    expect(visible.players[1].deckCount).toBe(state.players[1].deck.length);
  });

  it("the same match state is symmetric from each side's own point of view", () => {
    const state = newGame();
    const p0View = getVisibleState(state, 0);
    const p1View = getVisibleState(state, 1);
    expect(p0View.players[0].hand.every((c) => "cardId" in c)).toBe(true);
    expect(p1View.players[1].hand.every((c) => "cardId" in c)).toBe(true);
  });
});

describe("bot", () => {
  it("only ever chooses from the legal actions list", () => {
    const state = newGame();
    const legal = getLegalActions(state, 0, cardsById);
    const chosen = simpleRulesBot.chooseAction(state, 0, legal, cardsById);
    expect(legal.some((a) => JSON.stringify(a) === JSON.stringify(chosen)) || chosen.type === "END_TURN").toBe(
      true,
    );
  });

  it("runBotTurn always ends with the turn passed back or the match complete", () => {
    const state = newGame();
    const result = runBotTurn(state, 0, cardsById);
    expect(result.activePlayerIndex === 1 || result.phase === "COMPLETE").toBe(true);
  });

  it("a bot turn never lets the bot play more than one Item", () => {
    const state = newGame();
    const result = runBotTurn(state, 0, cardsById);
    // After the turn passes to player 1, player 0's counters reset to 0 —
    // check via the log instead: at most one "played Item" line before the
    // first "Turn ended".
    const turnEndIdx = result.log.findIndex((l) => l.startsWith("Turn ended"));
    const beforeEnd = result.log.slice(0, turnEndIdx === -1 ? result.log.length : turnEndIdx);
    const itemPlays = beforeEnd.filter((l) => l.includes("played Item"));
    expect(itemPlays.length).toBeLessThanOrEqual(1);
  });
});
