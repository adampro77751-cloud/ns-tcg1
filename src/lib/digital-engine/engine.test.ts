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
  activateTimeBomb,
  activateStarDrop,
} from "./engine";
import { simpleRulesBot, runBotTurn } from "./bot";
import { IllegalActionError } from "./types";
import type { DigitalGameState, EngineCard } from "./types";

const ITEM_STRONG: EngineCard = { id: "item-strong", slug: "item-strong", type: "Item", attack: 50, defence: 10, speed: 20 };
const ITEM_WEAK: EngineCard = { id: "item-weak", slug: "item-weak", type: "Item", attack: 10, defence: 40, speed: 5 };
const SPELL_A: EngineCard = { id: "spell-a", slug: "spell-a", type: "Spell", attack: null, defence: null, speed: null };

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
    const fastDefender: EngineCard = { id: "fast-def", slug: "fast-def", type: "Item", attack: 5, defence: 15, speed: 99 };
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

// ---------------------------------------------------------------------------
// Real card abilities wired through CARD_ABILITIES (abilities.ts) — a
// representative sample, not exhaustive, covering each shape of effect the
// engine executes: a simple ON_PLAY draw, a targeted removal effect, the
// Detention global draw-block, Biologist's item-limit increase, Brooke's
// board-wide buff, and the Mountain Mist + Cutlary combo that exercises the
// MAX_TRIGGER_DEPTH recursion guard.
// ---------------------------------------------------------------------------

const CRICKET_BALL: EngineCard = { id: "cricket-ball-1", slug: "cricket-ball", type: "Item", attack: 10, defence: 10, speed: 10 };
const COKE: EngineCard = { id: "coke-1", slug: "coke", type: "Item", attack: 0, defence: 0, speed: 0 };
const DETENTION: EngineCard = { id: "detention-1", slug: "detention", type: "Item", attack: 0, defence: 0, speed: 0 };
const BIOLOGIST: EngineCard = { id: "biologist-1", slug: "biologist", type: "Item", attack: 0, defence: 0, speed: 0 };
const BROOKE: EngineCard = { id: "brooke-1", slug: "brooke", type: "Spell", attack: null, defence: null, speed: null };
const MOUNTAIN_MIST: EngineCard = { id: "mountain-mist-1", slug: "mountain-mist", type: "Item", attack: 0, defence: 0, speed: 0 };
const CUTLARY: EngineCard = { id: "cutlary-1", slug: "cutlary", type: "Item", attack: 0, defence: 0, speed: 0 };

// Test-only helpers to set up a specific board/hand shape directly, rather
// than fighting the (seeded but still order-sensitive) shuffle — these
// bypass triggers on purpose so each test isolates the one ability under
// test.
function forceToHand(state: DigitalGameState, playerIndex: 0 | 1, cardId: string): DigitalGameState {
  const player = state.players[playerIndex];
  const idx = player.deck.findIndex((c) => c.cardId === cardId);
  if (idx === -1) return state;
  const instance = player.deck[idx];
  const newDeck = [...player.deck.slice(0, idx), ...player.deck.slice(idx + 1)];
  const players = [...state.players] as [typeof player, typeof player];
  players[playerIndex] = { ...player, deck: newDeck, hand: [...player.hand, instance] };
  return { ...state, players };
}

function putOnBattlefield(
  state: DigitalGameState,
  playerIndex: 0 | 1,
  cardId: string,
  instanceId: string,
  charges?: number,
): DigitalGameState {
  const player = state.players[playerIndex];
  const instance = {
    instanceId,
    cardId,
    tired: false,
    buffs: { attack: 0, defence: 0, speed: 0 },
    ...(charges !== undefined ? { charges } : {}),
  };
  const players = [...state.players] as [typeof player, typeof player];
  players[playerIndex] = { ...player, battlefield: [...player.battlefield, instance] };
  return { ...state, players };
}

function putInDiscard(
  state: DigitalGameState,
  playerIndex: 0 | 1,
  cardId: string,
  instanceId: string,
): DigitalGameState {
  const player = state.players[playerIndex];
  const instance = { instanceId, cardId, tired: false, buffs: { attack: 0, defence: 0, speed: 0 } };
  const players = [...state.players] as [typeof player, typeof player];
  players[playerIndex] = { ...player, discard: [...player.discard, instance] };
  return { ...state, players };
}

describe("card abilities — real cards", () => {
  it("Cricket Ball draws a card when played (ON_PLAY DRAW effect)", () => {
    const cards = new Map<string, EngineCard>([
      [CRICKET_BALL.id, CRICKET_BALL],
      [ITEM_WEAK.id, ITEM_WEAK],
    ]);
    let state = createGameState({
      matchId: "cb",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [CRICKET_BALL.id, ITEM_WEAK.id, ITEM_WEAK.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    state = forceToHand(state, 0, CRICKET_BALL.id);
    const handBefore = state.players[0].hand.length;
    const deckBefore = state.players[0].deck.length;
    const cb = state.players[0].hand.find((c) => c.cardId === CRICKET_BALL.id)!;
    state = playItem(state, 0, cb.instanceId, cards);
    // Cricket Ball leaves the hand (-1) but its own ability draws a
    // replacement (+1) — net hand size unchanged, deck down by 1.
    expect(state.players[0].hand).toHaveLength(handBefore);
    expect(state.players[0].deck).toHaveLength(deckBefore - 1);
  });

  it("Coke moves the opponent's strongest Item to their discard pile (auto-targeted removal)", () => {
    const cards = new Map<string, EngineCard>([
      [COKE.id, COKE],
      [ITEM_STRONG.id, ITEM_STRONG],
      [ITEM_WEAK.id, ITEM_WEAK],
    ]);
    let state = createGameState({
      matchId: "coke",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [COKE.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    state = putOnBattlefield(state, 1, ITEM_WEAK.id, "w-inst");
    state = putOnBattlefield(state, 1, ITEM_STRONG.id, "s-inst");
    state = forceToHand(state, 0, COKE.id);
    const coke = state.players[0].hand.find((c) => c.cardId === COKE.id)!;
    state = playItem(state, 0, coke.instanceId, cards);

    expect(state.players[1].battlefield.map((c) => c.instanceId)).not.toContain("s-inst");
    expect(state.players[1].discard.map((c) => c.instanceId)).toContain("s-inst");
    expect(state.players[1].battlefield.map((c) => c.instanceId)).toContain("w-inst");
  });

  it("Detention (\"Players can't draw cards\") blocks draws for both players while in play", () => {
    const cards = new Map<string, EngineCard>([
      [DETENTION.id, DETENTION],
      [ITEM_WEAK.id, ITEM_WEAK],
    ]);
    let state = createGameState({
      matchId: "det",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [ITEM_WEAK.id, ITEM_WEAK.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id, ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    state = putOnBattlefield(state, 0, DETENTION.id, "det-inst");

    const p1DeckBefore = state.players[1].deck.length;
    const p1HandBefore = state.players[1].hand.length;
    state = endTurn(state, cards); // ends player 0's turn -> player 1's draw should be blocked
    expect(state.players[1].deck).toHaveLength(p1DeckBefore);
    expect(state.players[1].hand).toHaveLength(p1HandBefore);

    const p0DeckBefore = state.players[0].deck.length;
    const p0HandBefore = state.players[0].hand.length;
    state = endTurn(state, cards); // ends player 1's turn -> player 0's draw should also be blocked
    expect(state.players[0].deck).toHaveLength(p0DeckBefore);
    expect(state.players[0].hand).toHaveLength(p0HandBefore);
  });

  it("Biologist raises the per-turn Item limit from 1 to 2", () => {
    const cards = new Map<string, EngineCard>([
      [BIOLOGIST.id, BIOLOGIST],
      [ITEM_STRONG.id, ITEM_STRONG],
      [ITEM_WEAK.id, ITEM_WEAK],
    ]);
    let state = createGameState({
      matchId: "bio",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 3,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [ITEM_STRONG.id, ITEM_WEAK.id, ITEM_STRONG.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    state = putOnBattlefield(state, 0, BIOLOGIST.id, "bio-inst");
    const items = state.players[0].hand.filter((c) => c.cardId === ITEM_STRONG.id || c.cardId === ITEM_WEAK.id);
    expect(items).toHaveLength(3);

    state = playItem(state, 0, items[0].instanceId, cards);
    state = playItem(state, 0, items[1].instanceId, cards); // 2nd Item — legal thanks to Biologist
    expect(() => playItem(state, 0, items[2].instanceId, cards)).toThrow(IllegalActionError);
  });

  it("Brooke buffs every Item on either battlefield by +100/+100/+100", () => {
    const cards = new Map<string, EngineCard>([
      [BROOKE.id, BROOKE],
      [ITEM_WEAK.id, ITEM_WEAK],
    ]);
    let state = createGameState({
      matchId: "brooke",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 2,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [BROOKE.id, ITEM_WEAK.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    state = putOnBattlefield(state, 0, ITEM_WEAK.id, "w0");
    state = putOnBattlefield(state, 1, ITEM_WEAK.id, "w1");
    const brooke = state.players[0].hand.find((c) => c.cardId === BROOKE.id)!;
    state = playSpell(state, 0, brooke.instanceId, cards);

    const w0 = state.players[0].battlefield.find((c) => c.instanceId === "w0")!;
    const w1 = state.players[1].battlefield.find((c) => c.instanceId === "w1")!;
    expect(w0.buffs).toEqual({ attack: 100, defence: 100, speed: 100 });
    expect(w1.buffs).toEqual({ attack: 100, defence: 100, speed: 100 });
  });

  it("Mountain Mist + Cutlary combo terminates via MAX_TRIGGER_DEPTH instead of recursing forever", () => {
    const cards = new Map<string, EngineCard>([
      [MOUNTAIN_MIST.id, MOUNTAIN_MIST],
      [CUTLARY.id, CUTLARY],
      [ITEM_WEAK.id, ITEM_WEAK],
    ]);
    let state = createGameState({
      matchId: "combo",
      formatId: "f1",
      startingHealth: 10000,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: new Array(30).fill(ITEM_WEAK.id) },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    state = putOnBattlefield(state, 0, MOUNTAIN_MIST.id, "mm");
    state = putOnBattlefield(state, 0, CUTLARY.id, "cut");

    // "Whenever you draw, deal 30 to the opponent" (Mountain Mist) plus
    // "whenever you deal 30+, draw a card" (Cutlary), both controlled by
    // player 0, can in principle chain forever off each other. Driving two
    // real end-of-turn draws (the second one lands on player 0, kicking off
    // the chain) must still terminate promptly rather than hang.
    state = endTurn(state, cards); // -> player 1's turn, draws (no combo pieces there)
    state = endTurn(state, cards); // -> player 0's turn, draws -> combo fires, capped by depth

    expect(state.players[1].health).toBeLessThan(10000);
    expect(state.players[1].health).toBeGreaterThan(9000); // bounded damage, not unbounded
    expect(state.players[0].deck.length).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// A second batch of real cards, added in a follow-up pass: Art, Pi, Library
// (discard-pile interaction), Running (mutual forced discard), School
// Computers (hand reveal), and Time Bomb (charge counters + an activated
// win condition).
// ---------------------------------------------------------------------------

const ART: EngineCard = { id: "art-1", slug: "art", type: "Spell", attack: null, defence: null, speed: null };
const PI: EngineCard = { id: "pi-1", slug: "pi", type: "Spell", attack: null, defence: null, speed: null };
const LIBRARY: EngineCard = { id: "library-1", slug: "library", type: "Item", attack: 10, defence: 10, speed: 10 };
const RUNNING: EngineCard = { id: "running-1", slug: "running", type: "Spell", attack: null, defence: null, speed: null };
const SCHOOL_COMPUTERS: EngineCard = { id: "school-computers-1", slug: "school-computers", type: "Item", attack: 20, defence: 20, speed: 20 };
const TIME_BOMB: EngineCard = { id: "time-bomb-1", slug: "time-bomb", type: "Item", attack: 0, defence: 0, speed: 0 };
// A Spell fixture reusing the "cricket-ball" ability (ON_PLAY: draw 1) to
// verify Library's discard-recast actually re-fires the recast card's own
// ability — the real Cricket Ball is an Item, but CARD_ABILITIES is keyed
// purely by slug, so this is a valid, decoupled test fixture.
const RECASTABLE_SPELL: EngineCard = { id: "recastable-1", slug: "cricket-ball", type: "Spell", attack: null, defence: null, speed: null };

describe("card abilities — second pass (discard interaction, reveal, counters)", () => {
  it("Art lets a Spell already in discard be played this turn", () => {
    const cards = new Map<string, EngineCard>([[ART.id, ART], [SPELL_A.id, SPELL_A]]);
    let state = createGameState({
      matchId: "art",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 2,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [ART.id, SPELL_A.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    // Simulate SPELL_A having already been discarded earlier this game.
    const spellInHand = state.players[0].hand.find((c) => c.cardId === SPELL_A.id)!;
    state = {
      ...state,
      players: [
        { ...state.players[0], hand: state.players[0].hand.filter((c) => c.instanceId !== spellInHand.instanceId), discard: [spellInHand] },
        state.players[1],
      ],
    };

    const art = state.players[0].hand.find((c) => c.cardId === ART.id)!;
    state = playSpell(state, 0, art.instanceId, cards);
    expect(state.players[0].spellsPlayableFromDiscardThisTurn).toBe(true);

    const legal = getLegalActions(state, 0, cards);
    expect(legal.some((a) => a.type === "PLAY_SPELL" && a.instanceId === spellInHand.instanceId)).toBe(true);

    expect(() => playSpell(state, 0, spellInHand.instanceId, cards)).not.toThrow();
  });

  it("Pi returns every Spell in discard to hand and grants extra Spell plays", () => {
    const cards = new Map<string, EngineCard>([[PI.id, PI], [SPELL_A.id, SPELL_A]]);
    let state = createGameState({
      matchId: "pi",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [PI.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    state = putInDiscard(state, 0, SPELL_A.id, "spell-a-disc-1");
    state = putInDiscard(state, 0, SPELL_A.id, "spell-a-disc-2");

    const pi = state.players[0].hand.find((c) => c.cardId === PI.id)!;
    const extraBefore = state.players[0].extraPlaysThisTurn;
    state = playSpell(state, 0, pi.instanceId, cards);

    expect(state.players[0].hand.map((c) => c.instanceId)).toEqual(
      expect.arrayContaining(["spell-a-disc-1", "spell-a-disc-2"]),
    );
    expect(state.players[0].discard.map((c) => c.instanceId)).not.toContain("spell-a-disc-1");
    expect(state.players[0].extraPlaysThisTurn).toBe(extraBefore + 99);
  });

  it("Library recasts the most recently discarded Spell (re-firing its own ON_PLAY) and deals 20 damage", () => {
    const cards = new Map<string, EngineCard>([
      [LIBRARY.id, LIBRARY],
      [RECASTABLE_SPELL.id, RECASTABLE_SPELL],
      [ITEM_WEAK.id, ITEM_WEAK],
    ]);
    let state = createGameState({
      matchId: "library",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [LIBRARY.id, ITEM_WEAK.id, ITEM_WEAK.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    state = forceToHand(state, 0, LIBRARY.id);
    state = putInDiscard(state, 0, RECASTABLE_SPELL.id, "recast-1");

    const handBefore = state.players[0].hand.length;
    const opponentHealthBefore = state.players[1].health;
    const library = state.players[0].hand.find((c) => c.cardId === LIBRARY.id)!;
    state = playItem(state, 0, library.instanceId, cards);

    // Library itself leaves the hand (-1) but recasting Cricket Ball's own
    // ON_PLAY draws a replacement (+1) — net unchanged.
    expect(state.players[0].hand).toHaveLength(handBefore);
    expect(state.players[1].health).toBe(opponentHealthBefore - 20);
    expect(state.players[0].discard.map((c) => c.instanceId)).toContain("recast-1");
  });

  it("Running makes each player discard their own weakest Item", () => {
    const cards = new Map<string, EngineCard>([
      [RUNNING.id, RUNNING],
      [ITEM_STRONG.id, ITEM_STRONG],
      [ITEM_WEAK.id, ITEM_WEAK],
    ]);
    let state = createGameState({
      matchId: "running",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [RUNNING.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    state = putOnBattlefield(state, 0, ITEM_STRONG.id, "strong-0");
    state = putOnBattlefield(state, 0, ITEM_WEAK.id, "weak-0");
    state = putOnBattlefield(state, 1, ITEM_WEAK.id, "weak-1");

    const running = state.players[0].hand.find((c) => c.cardId === RUNNING.id)!;
    state = playSpell(state, 0, running.instanceId, cards);

    expect(state.players[0].battlefield.map((c) => c.instanceId)).toEqual(["strong-0"]);
    expect(state.players[0].discard.map((c) => c.instanceId)).toContain("weak-0");
    expect(state.players[1].battlefield).toHaveLength(0);
    expect(state.players[1].discard.map((c) => c.instanceId)).toContain("weak-1");
  });

  it("School Computers reveals the opponent's hand when it attacks, cleared at end of turn", () => {
    const cards = new Map<string, EngineCard>([[SCHOOL_COMPUTERS.id, SCHOOL_COMPUTERS], [ITEM_WEAK.id, ITEM_WEAK]]);
    let state = createGameState({
      matchId: "school-computers",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id, ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    state = putOnBattlefield(state, 0, SCHOOL_COMPUTERS.id, "sc-1");
    state = declareAttack(state, 0, "sc-1", cards);

    expect(state.players[1].handRevealedToOpponent).toBe(true);
    const visibleToAttacker = getVisibleState(state, 0);
    expect(visibleToAttacker.players[1].hand.every((c) => "cardId" in c)).toBe(true);

    state = endTurn(state, cards);
    expect(state.players[1].handRevealedToOpponent).toBe(false);
  });

  it("Time Bomb gains a charge whenever its controller casts a Spell", () => {
    const cards = new Map<string, EngineCard>([[TIME_BOMB.id, TIME_BOMB], [SPELL_A.id, SPELL_A]]);
    let state = createGameState({
      matchId: "time-bomb-charge",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [SPELL_A.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    state = putOnBattlefield(state, 0, TIME_BOMB.id, "tb-1");
    const spell = state.players[0].hand.find((c) => c.cardId === SPELL_A.id)!;
    state = playSpell(state, 0, spell.instanceId, cards);

    const bomb = state.players[0].battlefield.find((c) => c.instanceId === "tb-1")!;
    expect(bomb.charges).toBe(1);
  });

  it("activateTimeBomb wins the game once 10 charges are removed, and refuses otherwise", () => {
    const cards = new Map<string, EngineCard>([[TIME_BOMB.id, TIME_BOMB], [ITEM_WEAK.id, ITEM_WEAK]]);
    let state = createGameState({
      matchId: "time-bomb-win",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    state = putOnBattlefield(state, 0, TIME_BOMB.id, "tb-2", 5);
    expect(() => activateTimeBomb(state, 0, "tb-2", cards)).toThrow(IllegalActionError);

    state = putOnBattlefield(state, 0, TIME_BOMB.id, "tb-3", 10);
    const result = activateTimeBomb(state, 0, "tb-3", cards);
    expect(result.phase).toBe("COMPLETE");
    expect(result.winnerIndex).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Commander/Champion entry — a PROVISIONAL, non-canonical decision (see
// types.ts) letting these cards be played from hand via the normal Item
// action, since neither this codebase nor the real rules define how they
// actually enter play.
// ---------------------------------------------------------------------------

const CATHEDRAL_PERGRINES: EngineCard = { id: "cathedral-pergrines-1", slug: "cathedral-pergrines", type: "Commander", attack: 40, defence: 40, speed: 40 };
const STAR_DROP: EngineCard = { id: "star-drop-1", slug: "star-drop", type: "Commander", attack: 30, defence: 30, speed: 30 };
const THE_CURRICULUM: EngineCard = { id: "the-curriculum-1", slug: "the-curriculum", type: "Champion", attack: 60, defence: 60, speed: 60 };

describe("Commander/Champion cards (provisional entry)", () => {
  it("a Commander-type card can be played via playItem", () => {
    const cards = new Map<string, EngineCard>([[CATHEDRAL_PERGRINES.id, CATHEDRAL_PERGRINES]]);
    let state = createGameState({
      matchId: "commander-entry",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [CATHEDRAL_PERGRINES.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    const inHand = state.players[0].hand.find((c) => c.cardId === CATHEDRAL_PERGRINES.id)!;
    state = playItem(state, 0, inHand.instanceId, cards);
    expect(state.players[0].battlefield.map((c) => c.instanceId)).toContain(inHand.instanceId);
  });

  it("a Champion-type card cannot be played as a Spell (still shares the Item slot, not Spell)", () => {
    const cards = new Map<string, EngineCard>([[THE_CURRICULUM.id, THE_CURRICULUM]]);
    let state = createGameState({
      matchId: "champion-not-spell",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [THE_CURRICULUM.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    const inHand = state.players[0].hand.find((c) => c.cardId === THE_CURRICULUM.id)!;
    expect(() => playSpell(state, 0, inHand.instanceId, cards)).toThrow(IllegalActionError);
  });

  it("Cathedral Pergrines discards a card and searches an Item onto the battlefield when it attacks", () => {
    const cards = new Map<string, EngineCard>([
      [CATHEDRAL_PERGRINES.id, CATHEDRAL_PERGRINES],
      [ITEM_WEAK.id, ITEM_WEAK],
    ]);
    let state = createGameState({
      matchId: "dive-bomb",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [ITEM_WEAK.id, ITEM_WEAK.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    state = putOnBattlefield(state, 0, CATHEDRAL_PERGRINES.id, "cp-1");
    // One Item left in deck for the search to find.
    const handBefore = state.players[0].hand.length;
    const battlefieldBefore = state.players[0].battlefield.length;
    state = declareAttack(state, 0, "cp-1", cards);

    expect(state.players[0].hand).toHaveLength(handBefore - 1); // discarded a card
    expect(state.players[0].battlefield.length).toBe(battlefieldBefore + 1); // searched Item entered play
  });

  it("The Curriculum locks Items for the rest of the match, for both players", () => {
    const cards = new Map<string, EngineCard>([[THE_CURRICULUM.id, THE_CURRICULUM], [ITEM_WEAK.id, ITEM_WEAK]]);
    let state = createGameState({
      matchId: "curriculum",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [THE_CURRICULUM.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    const curriculum = state.players[0].hand.find((c) => c.cardId === THE_CURRICULUM.id)!;
    state = playItem(state, 0, curriculum.instanceId, cards);
    expect(state.itemsLockedForRestOfGame).toBe(true);

    expect(getLegalActions(state, 0, cards).some((a) => a.type === "PLAY_ITEM")).toBe(false);

    state = endTurn(state, cards);
    const opponentItem = state.players[1].hand.find((c) => c.cardId === ITEM_WEAK.id)!;
    expect(() => playItem(state, 1, opponentItem.instanceId, cards)).toThrow(IllegalActionError);
  });

  it("activateStarDrop discards a random card and draws, capped at twice per turn", () => {
    const cards = new Map<string, EngineCard>([[STAR_DROP.id, STAR_DROP], [ITEM_WEAK.id, ITEM_WEAK]]);
    let state = createGameState({
      matchId: "star-drop",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 3,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [ITEM_WEAK.id, ITEM_WEAK.id, ITEM_WEAK.id, ITEM_WEAK.id, ITEM_WEAK.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    state = putOnBattlefield(state, 0, STAR_DROP.id, "sd-1");

    state = activateStarDrop(state, 0, "sd-1", cards, () => 0);
    state = activateStarDrop(state, 0, "sd-1", cards, () => 0);
    expect(() => activateStarDrop(state, 0, "sd-1", cards, () => 0)).toThrow(IllegalActionError);

    state = endTurn(state, cards); // resets activationsThisTurn for player 0
    state = endTurn(state, cards); // back to player 0's turn
    expect(() => activateStarDrop(state, 0, "sd-1", cards, () => 0)).not.toThrow();
  });
});
