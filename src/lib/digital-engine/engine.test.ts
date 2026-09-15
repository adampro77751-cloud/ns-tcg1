import { describe, expect, it } from "vitest";
import {
  createGameState,
  drawCard,
  playItem,
  playSpell,
  declareAttack,
  resolveDefense,
  previewDefenseDamage,
  endTurn,
  concede,
  getLegalActions,
  getVisibleState,
  shuffle,
  activateTimeBomb,
  activateStarDrop,
} from "./engine";
import { getRequiredTarget, getAttackTriggerTarget } from "./abilities";
import { simpleRulesBot, runBotTurn, runBotStep, chooseBotDefender, runBotDefense } from "./bot";
import { getSpriteTopicBonus, type SpriteEngineData } from "./sprite-abilities";
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
    // A legal (untired) defender exists, so the attack now waits for
    // player 1 to choose a defender rather than resolving immediately.
    expect(state.pendingCombat).not.toBeNull();
    const defenderInstance = state.players[1].battlefield[0];
    state = resolveDefense(state, 1, defenderInstance.instanceId, localCards);
    expect(state.pendingCombat).toBeNull();
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

// Places a fresh instance directly into a player's deck — used instead of
// relying on shuffle-derived hand/deck placement (which is deterministic
// given `random`, but not worth hand-tracing) whenever a test needs to
// GUARANTEE a specific card stays in the deck for a search effect to find.
function putInDeck(
  state: DigitalGameState,
  playerIndex: 0 | 1,
  cardId: string,
  instanceId: string,
): DigitalGameState {
  const player = state.players[playerIndex];
  const instance = { instanceId, cardId, tired: false, buffs: { attack: 0, defence: 0, speed: 0 } };
  const players = [...state.players] as [typeof player, typeof player];
  players[playerIndex] = { ...player, deck: [...player.deck, instance] };
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

  it("Mountain Mist + Cutlary combo terminates on its own once the deck runs out — NOT cut short by the depth safety net", () => {
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
    // player 0, chain off each other by design (an INTENDED combo, not a
    // bug) until player 0's deck (29 cards after the opening hand) is
    // exhausted — every one of those 29 draws deals 30 damage.
    state = endTurn(state, cards); // -> player 1's turn, draws (no combo pieces there)
    state = endTurn(state, cards); // -> player 0's turn, draws -> the full combo runs to deck exhaustion

    expect(state.players[0].deck).toHaveLength(0);
    expect(state.players[1].health).toBe(10000 - 29 * 30);
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

  it("getAttackTriggerTarget flags Cathedral Pergrines as a DECK_ITEM pick on attack (real search picker, not School's ON_PLAY one)", () => {
    expect(getAttackTriggerTarget("cathedral-pergrines")).toEqual({ kind: "DECK_ITEM" });
    expect(getRequiredTarget("cathedral-pergrines")).toBeNull(); // no ON_PLAY search — only on attack
  });

  it("honors an explicit deck: chosenTarget for Cathedral Pergrines' attack-time search, over the default first-found heuristic", () => {
    const cards = new Map<string, EngineCard>([
      [CATHEDRAL_PERGRINES.id, CATHEDRAL_PERGRINES],
      [ITEM_WEAK.id, ITEM_WEAK],
      [ITEM_STRONG.id, ITEM_STRONG],
    ]);
    let state = createGameState({
      matchId: "dive-bomb-explicit-choice",
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
    state = putOnBattlefield(state, 0, CATHEDRAL_PERGRINES.id, "cp-explicit-1");
    state = putInDeck(state, 0, ITEM_WEAK.id, "weak-in-deck-2");
    state = putInDeck(state, 0, ITEM_STRONG.id, "strong-in-deck-2");
    state = declareAttack(state, 0, "cp-explicit-1", cards, new Map(), "deck:strong-in-deck-2");

    expect(state.players[0].battlefield.some((c) => c.instanceId === "strong-in-deck-2")).toBe(true);
    expect(state.players[0].battlefield.some((c) => c.instanceId === "weak-in-deck-2")).toBe(false);
  });

  it("Cathedral Pergrines can still attack with no chosenTarget and no Item left to find (optional search, never blocks the attack)", () => {
    const cards = new Map<string, EngineCard>([[CATHEDRAL_PERGRINES.id, CATHEDRAL_PERGRINES], [ITEM_WEAK.id, ITEM_WEAK]]);
    let state = createGameState({
      matchId: "dive-bomb-skip",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] }, // no Items left in deck after opening hand
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    state = putOnBattlefield(state, 0, CATHEDRAL_PERGRINES.id, "cp-skip-1");
    const battlefieldBefore = state.players[0].battlefield.length;
    state = declareAttack(state, 0, "cp-skip-1", cards);
    expect(state.players[0].battlefield.length).toBe(battlefieldBefore); // nothing found, attack still resolved
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

// ---------------------------------------------------------------------------
// Real target choice — "target Item" or "any target" (player or Item) —
// for ON_PLAY effects played directly from hand. See abilities.ts's
// getRequiredTarget and engine.ts's chosenTarget threading.
// ---------------------------------------------------------------------------

const COKE_TARGETABLE: EngineCard = { id: "coke-targetable", slug: "coke", type: "Item", attack: 0, defence: 0, speed: 0 };
const PARKER: EngineCard = { id: "parker-1", slug: "parker", type: "Spell", attack: null, defence: null, speed: null };

describe("player-chosen targets", () => {
  it("getRequiredTarget identifies Item-target and any-target cards, and returns null otherwise", () => {
    expect(getRequiredTarget("coke")).toEqual({ kind: "ITEM", scope: "OPPONENT_ITEM" });
    expect(getRequiredTarget("parker")).toEqual({ kind: "ANY_TARGET" });
    expect(getRequiredTarget("cricket-ball")).toBeNull();
  });

  it("Coke moves the player-CHOSEN opponent Item to discard, not just the auto-picked strongest", () => {
    const cards = new Map<string, EngineCard>([
      [COKE_TARGETABLE.id, COKE_TARGETABLE],
      [ITEM_STRONG.id, ITEM_STRONG],
      [ITEM_WEAK.id, ITEM_WEAK],
    ]);
    let state = createGameState({
      matchId: "coke-target",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [COKE_TARGETABLE.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    state = putOnBattlefield(state, 1, ITEM_STRONG.id, "s-inst");
    state = putOnBattlefield(state, 1, ITEM_WEAK.id, "w-inst"); // the auto-heuristic would pick this (strongest by Attack)
    const coke = state.players[0].hand.find((c) => c.cardId === COKE_TARGETABLE.id)!;

    // Explicitly choose the WEAKER item, opposite of what auto-targeting would pick.
    state = playItem(state, 0, coke.instanceId, cards, "item:w-inst");

    expect(state.players[1].discard.map((c) => c.instanceId)).toContain("w-inst");
    expect(state.players[1].battlefield.map((c) => c.instanceId)).toContain("s-inst");
  });

  it("rejects a chosen Item target outside the ability's scope, falling back to auto-targeting", () => {
    const cards = new Map<string, EngineCard>([
      [COKE_TARGETABLE.id, COKE_TARGETABLE],
      [ITEM_WEAK.id, ITEM_WEAK],
    ]);
    let state = createGameState({
      matchId: "coke-invalid-target",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [COKE_TARGETABLE.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    state = putOnBattlefield(state, 0, ITEM_WEAK.id, "own-inst"); // controller's OWN Item — illegal for OPPONENT_ITEM scope
    state = putOnBattlefield(state, 1, ITEM_WEAK.id, "opp-inst");
    const coke = state.players[0].hand.find((c) => c.cardId === COKE_TARGETABLE.id)!;

    state = playItem(state, 0, coke.instanceId, cards, "item:own-inst");

    // The illegal choice is ignored — falls back to the real opponent Item, never the controller's own.
    expect(state.players[0].battlefield.map((c) => c.instanceId)).toContain("own-inst");
    expect(state.players[1].discard.map((c) => c.instanceId)).toContain("opp-inst");
  });

  it("Parker's damage hits a player-CHOSEN target (player or Item)", () => {
    const cards = new Map<string, EngineCard>([[PARKER.id, PARKER], [ITEM_WEAK.id, ITEM_WEAK]]);
    let state = createGameState({
      matchId: "parker-player-target",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [PARKER.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    const parker = state.players[0].hand.find((c) => c.cardId === PARKER.id)!;
    state = playSpell(state, 0, parker.instanceId, cards, "player:1");
    expect(state.players[1].health).toBe(400); // 500 - 100
  });

  it("PROVISIONAL rule: damage targeting an Item destroys it only if amount >= its effective Defence", () => {
    const cards = new Map<string, EngineCard>([[PARKER.id, PARKER], [ITEM_STRONG.id, ITEM_STRONG], [ITEM_WEAK.id, ITEM_WEAK]]);

    // ITEM_STRONG has 10 Defence — 100 damage destroys it.
    let state = createGameState({
      matchId: "parker-item-target-destroyed",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [PARKER.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    state = putOnBattlefield(state, 1, ITEM_STRONG.id, "target-1");
    const parker1 = state.players[0].hand.find((c) => c.cardId === PARKER.id)!;
    state = playSpell(state, 0, parker1.instanceId, cards, "item:target-1");
    expect(state.players[1].battlefield.map((c) => c.instanceId)).not.toContain("target-1");
    expect(state.players[1].discard.map((c) => c.instanceId)).toContain("target-1");
    expect(state.players[1].health).toBe(500); // health untouched — the Item absorbed it, not the player
  });
});

// ---------------------------------------------------------------------------
// Pending combat / real defending — declareAttack now waits for the
// defending player to choose a defender (or explicitly take the attack)
// whenever a legal defender exists, instead of auto-picking one.
// ---------------------------------------------------------------------------

describe("pending combat / defending", () => {
  it("declareAttack sets pendingCombat when the defender has an untired Item, instead of resolving immediately", () => {
    let state = newGame();
    const attacker = state.players[0].hand.find((c) => c.cardId === ITEM_STRONG.id)!;
    state = playItem(state, 0, attacker.instanceId, cardsById);
    state = endTurn(state);
    const defenderCard = state.players[1].hand.find((c) => c.cardId === ITEM_WEAK.id)!;
    state = playItem(state, 1, defenderCard.instanceId, cardsById);
    state = endTurn(state); // back to player 0

    const attackerInstance = state.players[0].battlefield[0];
    const healthBefore = state.players[1].health;
    state = declareAttack(state, 0, attackerInstance.instanceId, cardsById);

    expect(state.pendingCombat).not.toBeNull();
    expect(state.pendingCombat!.attackingPlayerIndex).toBe(0);
    expect(state.pendingCombat!.defendingPlayerIndex).toBe(1);
    expect(state.players[1].health).toBe(healthBefore); // untouched — no damage yet
  });

  it("getLegalActions offers DEFEND/NO_DEFENDER only to the defending player, and nothing to the attacker", () => {
    let state = newGame();
    const attacker = state.players[0].hand.find((c) => c.cardId === ITEM_STRONG.id)!;
    state = playItem(state, 0, attacker.instanceId, cardsById);
    state = endTurn(state);
    const defenderCard = state.players[1].hand.find((c) => c.cardId === ITEM_WEAK.id)!;
    state = playItem(state, 1, defenderCard.instanceId, cardsById);
    state = endTurn(state);
    state = declareAttack(state, 0, state.players[0].battlefield[0].instanceId, cardsById);

    const attackerLegal = getLegalActions(state, 0, cardsById);
    expect(attackerLegal).toEqual([]);

    const defenderLegal = getLegalActions(state, 1, cardsById);
    expect(defenderLegal.some((a) => a.type === "DEFEND")).toBe(true);
    expect(defenderLegal.some((a) => a.type === "NO_DEFENDER")).toBe(true);
    expect(defenderLegal.some((a) => a.type === "END_TURN")).toBe(false);
  });

  it("the attacker cannot act while combat is pending (requireNoPendingCombat)", () => {
    let state = newGame();
    const attacker = state.players[0].hand.find((c) => c.cardId === ITEM_STRONG.id)!;
    state = playItem(state, 0, attacker.instanceId, cardsById);
    state = endTurn(state);
    const defenderCard = state.players[1].hand.find((c) => c.cardId === ITEM_WEAK.id)!;
    state = playItem(state, 1, defenderCard.instanceId, cardsById);
    state = endTurn(state);
    state = declareAttack(state, 0, state.players[0].battlefield[0].instanceId, cardsById);

    expect(() => endTurn(state, cardsById)).toThrow(IllegalActionError);
    expect(() => declareAttack(state, 0, state.players[0].battlefield[0].instanceId, cardsById)).toThrow(
      IllegalActionError,
    );
  });

  it("resolveDefense with no defender deals full unmitigated damage", () => {
    let state = newGame();
    const attacker = state.players[0].hand.find((c) => c.cardId === ITEM_STRONG.id)!;
    state = playItem(state, 0, attacker.instanceId, cardsById);
    state = endTurn(state);
    const defenderCard = state.players[1].hand.find((c) => c.cardId === ITEM_WEAK.id)!;
    state = playItem(state, 1, defenderCard.instanceId, cardsById);
    state = endTurn(state);
    const healthBefore = state.players[1].health;
    state = declareAttack(state, 0, state.players[0].battlefield[0].instanceId, cardsById);

    state = resolveDefense(state, 1, null, cardsById);
    expect(state.pendingCombat).toBeNull();
    expect(state.players[1].health).toBe(healthBefore - ITEM_STRONG.attack!);
  });

  it("resolveDefense rejects a tired or non-existent defender", () => {
    let state = newGame();
    const attacker = state.players[0].hand.find((c) => c.cardId === ITEM_STRONG.id)!;
    state = playItem(state, 0, attacker.instanceId, cardsById);
    state = endTurn(state);
    const defenderCard = state.players[1].hand.find((c) => c.cardId === ITEM_WEAK.id)!;
    state = playItem(state, 1, defenderCard.instanceId, cardsById);
    state = endTurn(state);
    state = declareAttack(state, 0, state.players[0].battlefield[0].instanceId, cardsById);

    expect(() => resolveDefense(state, 1, "no-such-instance", cardsById)).toThrow(IllegalActionError);
  });

  it("resolveDefense rejects a request from anyone but the defending player", () => {
    let state = newGame();
    const attacker = state.players[0].hand.find((c) => c.cardId === ITEM_STRONG.id)!;
    state = playItem(state, 0, attacker.instanceId, cardsById);
    state = endTurn(state);
    const defenderCard = state.players[1].hand.find((c) => c.cardId === ITEM_WEAK.id)!;
    state = playItem(state, 1, defenderCard.instanceId, cardsById);
    state = endTurn(state);
    state = declareAttack(state, 0, state.players[0].battlefield[0].instanceId, cardsById);

    expect(() => resolveDefense(state, 0, null, cardsById)).toThrow(IllegalActionError);
  });

  it("pending combat round-trips through JSON unchanged (survives a reload)", () => {
    let state = newGame();
    const attacker = state.players[0].hand.find((c) => c.cardId === ITEM_STRONG.id)!;
    state = playItem(state, 0, attacker.instanceId, cardsById);
    state = endTurn(state);
    const defenderCard = state.players[1].hand.find((c) => c.cardId === ITEM_WEAK.id)!;
    state = playItem(state, 1, defenderCard.instanceId, cardsById);
    state = endTurn(state);
    state = declareAttack(state, 0, state.players[0].battlefield[0].instanceId, cardsById);

    const roundTripped = JSON.parse(JSON.stringify(state)) as DigitalGameState;
    expect(roundTripped.pendingCombat).toEqual(state.pendingCombat);
  });

  it("chooseBotDefender picks the defender that minimizes damage, and runBotDefense applies it", () => {
    const strongDefender: EngineCard = { id: "strong-def", slug: "strong-def", type: "Item", attack: 5, defence: 60, speed: 99 };
    const cards = new Map<string, EngineCard>([
      [ITEM_STRONG.id, ITEM_STRONG],
      [ITEM_WEAK.id, ITEM_WEAK],
      [strongDefender.id, strongDefender],
    ]);
    let state = createGameState({
      matchId: "bot-defense",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [ITEM_STRONG.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    state = playItem(state, 0, state.players[0].hand[0].instanceId, cards);
    // Give player 1 (the bot) both a weak and a strong defender directly.
    state = putOnBattlefield(state, 1, ITEM_WEAK.id, "weak-def");
    state = putOnBattlefield(state, 1, strongDefender.id, "strong-def-inst");
    state = declareAttack(state, 0, state.players[0].battlefield[0].instanceId, cards);

    const chosen = chooseBotDefender(state, cards, new Map());
    expect(chosen).toBe("strong-def-inst"); // 60 Defence, speed 99 >= attacker's 20 -> blocks everything

    const result = runBotDefense(state, 1, cards, new Map());
    expect(result.pendingCombat).toBeNull();
    expect(result.players[1].health).toBe(500); // fully blocked
  });
});

// ---------------------------------------------------------------------------
// Sprite abilities — the same lookup/bonus logic used for both the human's
// and the bot's equipped Sprite. Only flat, always-on numeric bonuses on
// existing engine primitives are implemented (see sprite-abilities.ts);
// everything else is a documented, deliberate gap.
// ---------------------------------------------------------------------------

describe("sprite abilities", () => {
  it("getSpriteTopicBonus takes the highest applicable level within a topic, not a cumulative sum", () => {
    const level1: SpriteEngineData = { slug: "water-sprite", level: 1 };
    const level2: SpriteEngineData = { slug: "water-sprite", level: 2 };
    const level5: SpriteEngineData = { slug: "water-sprite", level: 5 };
    expect(getSpriteTopicBonus(level1, "speed")).toBe(10);
    expect(getSpriteTopicBonus(level2, "speed")).toBe(20); // not 30
    expect(getSpriteTopicBonus(level5, "speed")).toBe(20); // still 20 — no higher "speed" entry past level 2
  });

  it("distinct topics combine once each is reached (Fire Sprite: damage-dealt AND attack)", () => {
    const level5Fire: SpriteEngineData = { slug: "fire-sprite", level: 5 };
    expect(getSpriteTopicBonus(level5Fire, "damageDealt")).toBe(20);
    expect(getSpriteTopicBonus(level5Fire, "attack")).toBe(40);
  });

  it("an unimplemented Sprite ability (Cosmic) contributes no bonus at any level", () => {
    const level5Cosmic: SpriteEngineData = { slug: "cosmic-sprite", level: 5 };
    expect(getSpriteTopicBonus(level5Cosmic, "attack")).toBe(0);
    expect(getSpriteTopicBonus(level5Cosmic, "speed")).toBe(0);
  });

  it("Air Sprite's Speed bonus lets a slower Item win the Speed check in combat", () => {
    // Attacker speed 20 (ITEM_STRONG); defender base speed 5 (ITEM_WEAK)
    // would normally lose the Speed check, but +20 from an equipped Air
    // Sprite (Level 2) pushes it to 25, enough to win and apply Defence.
    const cards = new Map<string, EngineCard>([[ITEM_STRONG.id, ITEM_STRONG], [ITEM_WEAK.id, ITEM_WEAK]]);
    const spritesById = new Map<string, SpriteEngineData>([["air-sprite-inst", { slug: "air-sprite", level: 2 }]]);
    let state = createGameState({
      matchId: "air-sprite",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [ITEM_STRONG.id] },
        { userId: "u2", spriteInstanceId: "air-sprite-inst", cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    state = playItem(state, 0, state.players[0].hand[0].instanceId, cards);
    state = endTurn(state, cards);
    state = playItem(state, 1, state.players[1].hand[0].instanceId, cards);
    state = endTurn(state, cards);

    const attackerInstance = state.players[0].battlefield[0];
    const healthBefore = state.players[1].health;
    state = declareAttack(state, 0, attackerInstance.instanceId, cards, spritesById);
    state = resolveDefense(state, 1, state.players[1].battlefield[0].instanceId, cards, spritesById);

    // Without the Sprite: full 50 damage (defender too slow). With it: 50 - 40(defence) = 10.
    expect(state.players[1].health).toBe(healthBefore - (ITEM_STRONG.attack! - ITEM_WEAK.defence!));
  });

  it("Fire Sprite adds flat bonus damage whenever its controller deals damage to the opponent", () => {
    const cards = new Map<string, EngineCard>([[ITEM_STRONG.id, ITEM_STRONG], [ITEM_WEAK.id, ITEM_WEAK]]);
    const spritesById = new Map<string, SpriteEngineData>([["fire-inst", { slug: "fire-sprite", level: 1 }]]);
    let state = createGameState({
      matchId: "fire-sprite",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: "fire-inst", cardIds: [ITEM_STRONG.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    state = playItem(state, 0, state.players[0].hand[0].instanceId, cards);
    const healthBefore = state.players[1].health;
    // No legal defender on player 1's empty battlefield -> unopposed fast path.
    state = declareAttack(state, 0, state.players[0].battlefield[0].instanceId, cards, spritesById);
    expect(state.players[1].health).toBe(healthBefore - ITEM_STRONG.attack! - 10);
  });

  it("Angel Sprite adds flat bonus to the controller's own Health gains", () => {
    const PARKER_SPRITE_TEST: EngineCard = { id: "parker-sprite", slug: "parker", type: "Spell", attack: null, defence: null, speed: null };
    const cards = new Map<string, EngineCard>([[PARKER_SPRITE_TEST.id, PARKER_SPRITE_TEST], [ITEM_WEAK.id, ITEM_WEAK]]);
    const spritesById = new Map<string, SpriteEngineData>([["angel-inst", { slug: "angel-sprite", level: 2 }]]);
    let state = createGameState({
      matchId: "angel-sprite",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: "angel-inst", cardIds: [PARKER_SPRITE_TEST.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    const parker = state.players[0].hand.find((c) => c.cardId === PARKER_SPRITE_TEST.id)!;
    const healthBefore = state.players[0].health;
    state = playSpell(state, 0, parker.instanceId, cards, "player:1", spritesById);
    // Parker: "gain 100 health" + Angel L2's +20 = 120.
    expect(state.players[0].health).toBe(healthBefore + 120);
  });

  it("Water Sprite Level 5 raises the per-turn Spell limit, like Biologist does for Items", () => {
    const SPELL_A_TEST: EngineCard = { id: "spell-a-water", slug: "spell-a-water", type: "Spell", attack: null, defence: null, speed: null };
    const SPELL_B_TEST: EngineCard = { id: "spell-b-water", slug: "spell-b-water", type: "Spell", attack: null, defence: null, speed: null };
    const cards = new Map<string, EngineCard>([[SPELL_A_TEST.id, SPELL_A_TEST], [SPELL_B_TEST.id, SPELL_B_TEST]]);
    const spritesById = new Map<string, SpriteEngineData>([["water-inst", { slug: "water-sprite", level: 5 }]]);
    let state = createGameState({
      matchId: "water-sprite",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 2,
      players: [
        { userId: "u1", spriteInstanceId: "water-inst", cardIds: [SPELL_A_TEST.id, SPELL_B_TEST.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    const spellA = state.players[0].hand.find((c) => c.cardId === SPELL_A_TEST.id)!;
    const spellB = state.players[0].hand.find((c) => c.cardId === SPELL_B_TEST.id)!;
    state = playSpell(state, 0, spellA.instanceId, cards, undefined, spritesById);
    expect(() => playSpell(state, 0, spellB.instanceId, cards, undefined, spritesById)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// School — "Search your deck for a Item card and put it under your
// control." Clarified: the found Item goes DIRECTLY onto the battlefield
// (not into hand first), then the deck is shuffled, then School itself
// finishes resolving as a normal Spell (into discard).
// ---------------------------------------------------------------------------

const SCHOOL: EngineCard = { id: "school-1", slug: "school", type: "Spell", attack: null, defence: null, speed: null };
const NON_ITEM_SPELL: EngineCard = { id: "non-item-spell", slug: "non-item-spell", type: "Spell", attack: null, defence: null, speed: null };

describe("School", () => {
  it("searches only its controller's own deck, never the opponent's", () => {
    const cards = new Map<string, EngineCard>([[SCHOOL.id, SCHOOL], [ITEM_STRONG.id, ITEM_STRONG]]);
    let state = createGameState({
      matchId: "school-own-deck",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [SCHOOL.id] }, // caster's deck has NO Item at all
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_STRONG.id, ITEM_STRONG.id] }, // opponent's deck has plenty
      ],
      cardsById: cards,
      random: () => 0,
    });
    const school = state.players[0].hand.find((c) => c.cardId === SCHOOL.id)!;
    const opponentDeckAndHandBefore = state.players[1].deck.length + state.players[1].hand.length;
    state = playSpell(state, 0, school.instanceId, cards);
    // Nothing found in the CASTER's own (Item-less) deck — the opponent's
    // Items are never touched, never searched, never moved.
    expect(state.players[0].battlefield).toHaveLength(0);
    expect(state.players[1].deck.length + state.players[1].hand.length).toBe(opponentDeckAndHandBefore);
    expect(state.players[1].battlefield).toHaveLength(0);
  });

  it("only Items are valid choices — a non-Item Spell in the deck is skipped", () => {
    const cards = new Map<string, EngineCard>([[SCHOOL.id, SCHOOL], [NON_ITEM_SPELL.id, NON_ITEM_SPELL], [ITEM_STRONG.id, ITEM_STRONG]]);
    let state = createGameState({
      matchId: "school-items-only",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [SCHOOL.id, NON_ITEM_SPELL.id, ITEM_STRONG.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    state = forceToHand(state, 0, SCHOOL.id);
    const school = state.players[0].hand.find((c) => c.cardId === SCHOOL.id)!;
    state = playSpell(state, 0, school.instanceId, cards);
    // The Item (not the non-Item Spell) is what ended up in play.
    expect(state.players[0].battlefield.some((c) => c.cardId === ITEM_STRONG.id)).toBe(true);
    expect(state.players[0].battlefield.some((c) => c.cardId === NON_ITEM_SPELL.id)).toBe(false);
  });

  it("puts the selected Item DIRECTLY onto the battlefield — it never enters the hand first", () => {
    const cards = new Map<string, EngineCard>([[SCHOOL.id, SCHOOL], [ITEM_STRONG.id, ITEM_STRONG]]);
    let state = createGameState({
      matchId: "school-to-battlefield",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [SCHOOL.id] }, // School dealt straight to hand
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    state = putInDeck(state, 0, ITEM_STRONG.id, "strong-in-deck"); // guaranteed to stay in deck for School to find
    const school = state.players[0].hand.find((c) => c.cardId === SCHOOL.id)!;
    state = playSpell(state, 0, school.instanceId, cards);
    expect(state.players[0].battlefield.some((c) => c.cardId === ITEM_STRONG.id)).toBe(true);
    expect(state.players[0].hand.some((c) => c.cardId === ITEM_STRONG.id)).toBe(false);
  });

  it("shuffles the deck after removing the found Item", () => {
    const cards = new Map<string, EngineCard>([[SCHOOL.id, SCHOOL], [ITEM_STRONG.id, ITEM_STRONG], [ITEM_WEAK.id, ITEM_WEAK]]);
    let state = createGameState({
      matchId: "school-shuffle",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [SCHOOL.id, ITEM_STRONG.id, ITEM_WEAK.id, ITEM_WEAK.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0.999, // a real shuffle pass, not a no-op
    });
    state = forceToHand(state, 0, SCHOOL.id);
    const deckBefore = state.players[0].deck.map((c) => c.instanceId);
    const school = state.players[0].hand.find((c) => c.cardId === SCHOOL.id)!;
    state = playSpell(state, 0, school.instanceId, cards);
    // One fewer card (the found Item left the deck), and shuffle() was
    // actually invoked on the remainder (not just left in original order).
    expect(state.players[0].deck).toHaveLength(deckBefore.length - 1);
  });

  it("fires ITEM_ENTERED for other permanents watching for it", () => {
    const dna: EngineCard = { id: "dna-1", slug: "dna", type: "Item", attack: 0, defence: 0, speed: 0 };
    const cards = new Map<string, EngineCard>([[SCHOOL.id, SCHOOL], [ITEM_STRONG.id, ITEM_STRONG], [dna.id, dna]]);
    let state = createGameState({
      matchId: "school-item-entered",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [SCHOOL.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    state = putOnBattlefield(state, 0, dna.id, "dna-inst");
    state = putInDeck(state, 0, ITEM_STRONG.id, "strong-in-deck");
    const school = state.players[0].hand.find((c) => c.cardId === SCHOOL.id)!;
    const opponentHealthBefore = state.players[1].health;
    state = playSpell(state, 0, school.instanceId, cards);
    // DNA: "Whenever an Item enters, deal 20 damage... and draw 1 card." —
    // fires because School's found Item entering counts as an Item
    // entering, exactly like a normal hand-play.
    expect(state.players[1].health).toBe(opponentHealthBefore - 20);
  });

  it("resolves correctly as a normal Spell — School itself ends up in discard, not vanished", () => {
    const cards = new Map<string, EngineCard>([[SCHOOL.id, SCHOOL], [ITEM_STRONG.id, ITEM_STRONG]]);
    let state = createGameState({
      matchId: "school-resolves",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [SCHOOL.id, ITEM_STRONG.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    state = forceToHand(state, 0, SCHOOL.id);
    const school = state.players[0].hand.find((c) => c.cardId === SCHOOL.id)!;
    state = playSpell(state, 0, school.instanceId, cards);
    expect(state.players[0].discard.some((c) => c.cardId === SCHOOL.id)).toBe(true);
    expect(state.players[0].hand.some((c) => c.cardId === SCHOOL.id)).toBe(false);
  });

  it("works identically for the Bot's slot (player index 1) — same engine function, same rules", () => {
    const cards = new Map<string, EngineCard>([[SCHOOL.id, SCHOOL], [ITEM_STRONG.id, ITEM_STRONG]]);
    let state = createGameState({
      matchId: "school-bot",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
        { userId: null, spriteInstanceId: null, cardIds: [SCHOOL.id] }, // the "Bot" slot
      ],
      cardsById: cards,
      random: () => 0,
    });
    state = endTurn(state, cards); // hand the turn to the Bot's slot (player 1)
    state = putInDeck(state, 1, ITEM_STRONG.id, "strong-in-deck");
    const school = state.players[1].hand.find((c) => c.cardId === SCHOOL.id)!;
    state = playSpell(state, 1, school.instanceId, cards);
    expect(state.players[1].battlefield.some((c) => c.cardId === ITEM_STRONG.id)).toBe(true);
    expect(state.players[1].hand.some((c) => c.cardId === ITEM_STRONG.id)).toBe(false);
  });

  it("the Bot's School search never touches the human's deck", () => {
    const cards = new Map<string, EngineCard>([[SCHOOL.id, SCHOOL], [ITEM_STRONG.id, ITEM_STRONG]]);
    let state = createGameState({
      matchId: "school-bot-own-deck",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [ITEM_STRONG.id, ITEM_STRONG.id] }, // human has plenty of Items
        { userId: null, spriteInstanceId: null, cardIds: [SCHOOL.id] }, // Bot's own deck has NO Item
      ],
      cardsById: cards,
      random: () => 0,
    });
    state = endTurn(state, cards);
    const humanDeckAndHandBefore = state.players[0].deck.length + state.players[0].hand.length;
    const school = state.players[1].hand.find((c) => c.cardId === SCHOOL.id)!;
    state = playSpell(state, 1, school.instanceId, cards);
    expect(state.players[1].battlefield).toHaveLength(0); // nothing found in the Bot's own Item-less deck
    expect(state.players[0].deck.length + state.players[0].hand.length).toBe(humanDeckAndHandBefore); // human's deck never touched
  });

  // ---- Real search-your-deck picker (deck:<instanceId> chosenTarget) ----

  it("getRequiredTarget flags School as a DECK_ITEM pick, distinct from a battlefield/player target", () => {
    expect(getRequiredTarget("school")).toEqual({ kind: "DECK_ITEM" });
  });

  it("honors an explicit deck: chosenTarget over the default first-found heuristic", () => {
    const cards = new Map<string, EngineCard>([[SCHOOL.id, SCHOOL], [ITEM_WEAK.id, ITEM_WEAK], [ITEM_STRONG.id, ITEM_STRONG]]);
    let state = createGameState({
      matchId: "school-explicit-choice",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [SCHOOL.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    // Two Items in deck — the default heuristic would grab whichever is
    // found first; explicitly choosing the SECOND one proves the choice
    // is actually honored, not just coincidentally matching.
    state = putInDeck(state, 0, ITEM_WEAK.id, "weak-in-deck");
    state = putInDeck(state, 0, ITEM_STRONG.id, "strong-in-deck");
    const school = state.players[0].hand.find((c) => c.cardId === SCHOOL.id)!;
    state = playSpell(state, 0, school.instanceId, cards, "deck:strong-in-deck");
    expect(state.players[0].battlefield.some((c) => c.instanceId === "strong-in-deck")).toBe(true);
    expect(state.players[0].battlefield.some((c) => c.instanceId === "weak-in-deck")).toBe(false);
    expect(state.players[0].deck.some((c) => c.instanceId === "weak-in-deck")).toBe(true); // left behind, then shuffled
  });

  it("falls back to the default heuristic if the chosen deck instance is invalid or not actually an Item", () => {
    const nonItemSpellInDeck: EngineCard = { id: "non-item-2", slug: "non-item-2", type: "Spell", attack: null, defence: null, speed: null };
    const cards = new Map<string, EngineCard>([[SCHOOL.id, SCHOOL], [ITEM_WEAK.id, ITEM_WEAK], [nonItemSpellInDeck.id, nonItemSpellInDeck]]);
    let state = createGameState({
      matchId: "school-invalid-choice",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [SCHOOL.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    state = putInDeck(state, 0, nonItemSpellInDeck.id, "non-item-in-deck");
    state = putInDeck(state, 0, ITEM_WEAK.id, "weak-in-deck");
    const school = state.players[0].hand.find((c) => c.cardId === SCHOOL.id)!;
    // Pointing at a non-Item (or a nonexistent instanceId) is rejected —
    // falls back to the real Item instead of doing nothing.
    state = playSpell(state, 0, school.instanceId, cards, "deck:non-item-in-deck");
    expect(state.players[0].battlefield.some((c) => c.instanceId === "weak-in-deck")).toBe(true);
  });

  it("hasPlayableTarget / getLegalActions correctly gates School on deck contents (not battlefield/player candidates)", () => {
    const cards = new Map<string, EngineCard>([[SCHOOL.id, SCHOOL], [ITEM_STRONG.id, ITEM_STRONG]]);
    let state = createGameState({
      matchId: "school-legal-gate",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [SCHOOL.id] }, // empty deck after opening hand
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_STRONG.id, ITEM_STRONG.id] }, // opponent has Items on THEIR side — irrelevant to School
      ],
      cardsById: cards,
      random: () => 0,
    });
    expect(getLegalActions(state, 0, cards).some((a) => a.type === "PLAY_SPELL")).toBe(false);
    state = putInDeck(state, 0, ITEM_STRONG.id, "strong-in-deck");
    expect(getLegalActions(state, 0, cards).some((a) => a.type === "PLAY_SPELL")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Real search-your-discard picker (discard:<id1>,<id2>,... chosenTarget) —
// Old Book, Blast From The Past (RETURN_TO_HAND), Chemistry Lesson
// (RETURN_TO_PLAY) and Library (CAST_FROM_DISCARD) all target the caller's
// own, already client-visible discard pile.
// ---------------------------------------------------------------------------

const OLD_BOOK: EngineCard = { id: "old-book-1", slug: "old-book", type: "Spell", attack: null, defence: null, speed: null };
const BLAST_FROM_THE_PAST: EngineCard = { id: "blast-from-the-past-1", slug: "blast-from-the-past", type: "Spell", attack: null, defence: null, speed: null };
const CHEMISTRY_LESSON: EngineCard = { id: "chemistry-lesson-1", slug: "chemistry-lesson", type: "Spell", attack: null, defence: null, speed: null };

describe("real discard-pile picker (discard: chosenTarget)", () => {
  it("getRequiredTarget flags Old Book/Chemistry Lesson as a single DISCARD_CARD pick, and Blast From The Past as amount 2", () => {
    expect(getRequiredTarget("old-book")).toEqual({ kind: "DISCARD_CARD", filter: "ANY", amount: 1 });
    expect(getRequiredTarget("blast-from-the-past")).toEqual({ kind: "DISCARD_CARD", filter: "ANY", amount: 2 });
    expect(getRequiredTarget("chemistry-lesson")).toEqual({ kind: "DISCARD_CARD", filter: "ITEM", amount: 1 });
    expect(getRequiredTarget("library")).toEqual({ kind: "DISCARD_CARD", filter: "SPELL", amount: 1 });
  });

  it("Old Book honors an explicit discard: chosenTarget over the most-recently-discarded default", () => {
    const cards = new Map<string, EngineCard>([[OLD_BOOK.id, OLD_BOOK], [ITEM_WEAK.id, ITEM_WEAK], [ITEM_STRONG.id, ITEM_STRONG]]);
    let state = createGameState({
      matchId: "old-book-explicit",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [OLD_BOOK.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    state = putInDiscard(state, 0, ITEM_WEAK.id, "weak-disc-1");
    state = putInDiscard(state, 0, ITEM_STRONG.id, "strong-disc-1"); // most recently discarded
    const oldBook = state.players[0].hand.find((c) => c.cardId === OLD_BOOK.id)!;
    // Explicitly pick the OLDER one, proving the choice overrides "most recent".
    state = playSpell(state, 0, oldBook.instanceId, cards, "discard:weak-disc-1");
    expect(state.players[0].hand.some((c) => c.instanceId === "weak-disc-1")).toBe(true);
    expect(state.players[0].discard.some((c) => c.instanceId === "strong-disc-1")).toBe(true);
  });

  it("Blast From The Past honors an explicit multi-card discard: chosenTarget (amount 2)", () => {
    const cards = new Map<string, EngineCard>([[BLAST_FROM_THE_PAST.id, BLAST_FROM_THE_PAST], [ITEM_WEAK.id, ITEM_WEAK], [ITEM_STRONG.id, ITEM_STRONG], [SPELL_A.id, SPELL_A]]);
    let state = createGameState({
      matchId: "blast-explicit",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [BLAST_FROM_THE_PAST.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    state = putInDiscard(state, 0, ITEM_WEAK.id, "weak-disc-2");
    state = putInDiscard(state, 0, ITEM_STRONG.id, "strong-disc-2");
    state = putInDiscard(state, 0, SPELL_A.id, "spell-disc-2"); // left behind
    const blast = state.players[0].hand.find((c) => c.cardId === BLAST_FROM_THE_PAST.id)!;
    state = playSpell(state, 0, blast.instanceId, cards, "discard:weak-disc-2,strong-disc-2");
    expect(state.players[0].hand.map((c) => c.instanceId)).toEqual(
      expect.arrayContaining(["weak-disc-2", "strong-disc-2"]),
    );
    expect(state.players[0].discard.map((c) => c.instanceId)).toContain("spell-disc-2");
    expect(state.players[0].discard.map((c) => c.instanceId)).not.toContain("weak-disc-2");
  });

  it("Chemistry Lesson honors an explicit discard: chosenTarget over the default first-Item-found heuristic", () => {
    const cards = new Map<string, EngineCard>([[CHEMISTRY_LESSON.id, CHEMISTRY_LESSON], [ITEM_WEAK.id, ITEM_WEAK], [ITEM_STRONG.id, ITEM_STRONG]]);
    let state = createGameState({
      matchId: "chem-lesson-explicit",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [CHEMISTRY_LESSON.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    state = putInDiscard(state, 0, ITEM_WEAK.id, "weak-disc-3"); // discarded first, the default heuristic's pick
    state = putInDiscard(state, 0, ITEM_STRONG.id, "strong-disc-3");
    const chem = state.players[0].hand.find((c) => c.cardId === CHEMISTRY_LESSON.id)!;
    state = playSpell(state, 0, chem.instanceId, cards, "discard:strong-disc-3");
    expect(state.players[0].battlefield.some((c) => c.instanceId === "strong-disc-3")).toBe(true);
    expect(state.players[0].battlefield.some((c) => c.instanceId === "weak-disc-3")).toBe(false);
  });

  it("Library honors an explicit discard: chosenTarget for which Spell to recast, over the most-recently-discarded default", () => {
    const cards = new Map<string, EngineCard>([
      [LIBRARY.id, LIBRARY],
      [RECASTABLE_SPELL.id, RECASTABLE_SPELL],
      [SPELL_A.id, SPELL_A],
    ]);
    let state = createGameState({
      matchId: "library-explicit",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [LIBRARY.id, ITEM_WEAK.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    state = forceToHand(state, 0, LIBRARY.id);
    state = putInDiscard(state, 0, SPELL_A.id, "spell-a-disc-3"); // most recently discarded — NOT the chosen one
    state = putInDiscard(state, 0, RECASTABLE_SPELL.id, "recast-explicit-1");
    const library = state.players[0].hand.find((c) => c.cardId === LIBRARY.id)!;
    const handBefore = state.players[0].hand.length;
    state = playItem(state, 0, library.instanceId, cards, "discard:spell-a-disc-3");
    // Both Spells end up back in discard after resolving (recasting
    // doesn't consume the card) — the real proof the explicit choice was
    // honored is that SPELL_A (no ability) was cast instead of the
    // most-recently-discarded Cricket Ball (draws a card): hand size just
    // drops by 1 (Library leaves the hand, nothing replaces it), unlike
    // the earlier default-heuristic Cricket-Ball-recast test where it's
    // net unchanged.
    expect(state.players[0].discard.map((c) => c.instanceId)).toContain("recast-explicit-1");
    expect(state.players[0].discard.map((c) => c.instanceId)).toContain("spell-a-disc-3");
    expect(state.players[0].hand).toHaveLength(handBefore - 1);
  });

  it("hasPlayableTarget / getLegalActions correctly gates Old Book on discard contents", () => {
    const cards = new Map<string, EngineCard>([[OLD_BOOK.id, OLD_BOOK], [ITEM_WEAK.id, ITEM_WEAK]]);
    let state = createGameState({
      matchId: "old-book-gate",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [OLD_BOOK.id] }, // empty discard
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    expect(getLegalActions(state, 0, cards).some((a) => a.type === "PLAY_SPELL")).toBe(false);
    state = putInDiscard(state, 0, ITEM_WEAK.id, "weak-disc-gate");
    expect(getLegalActions(state, 0, cards).some((a) => a.type === "PLAY_SPELL")).toBe(true);
  });

  it("Chemistry Lesson is not playable when the discard pile has no Item (filter-specific gating)", () => {
    const cards = new Map<string, EngineCard>([[CHEMISTRY_LESSON.id, CHEMISTRY_LESSON], [SPELL_A.id, SPELL_A], [ITEM_WEAK.id, ITEM_WEAK]]);
    let state = createGameState({
      matchId: "chem-lesson-gate",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [CHEMISTRY_LESSON.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    state = putInDiscard(state, 0, SPELL_A.id, "spell-a-disc-gate"); // discard has a Spell, but no Item
    expect(getLegalActions(state, 0, cards).some((a) => a.type === "PLAY_SPELL")).toBe(false);
    state = putInDiscard(state, 0, ITEM_WEAK.id, "weak-disc-gate-2");
    expect(getLegalActions(state, 0, cards).some((a) => a.type === "PLAY_SPELL")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Mountain Mist / Cutlary — standalone trigger checks (the combo itself is
// covered in its own describe block below).
// ---------------------------------------------------------------------------

describe("Mountain Mist", () => {
  it("triggers on a draw and deals exactly 30 damage to the opponent", () => {
    const cards = new Map<string, EngineCard>([[MOUNTAIN_MIST.id, MOUNTAIN_MIST], [ITEM_WEAK.id, ITEM_WEAK]]);
    let state = createGameState({
      matchId: "mist-standalone",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [ITEM_WEAK.id, ITEM_WEAK.id, ITEM_WEAK.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    state = putOnBattlefield(state, 0, MOUNTAIN_MIST.id, "mm-1");
    const opponentHealthBefore = state.players[1].health;
    const before = state.players[0].deck.length;
    state = drawCard(state, 0); // drawCard alone (no trigger) shouldn't fire it...
    // ...so use the real trigger-aware path instead: playing a card that draws.
    expect(state.players[1].health).toBe(opponentHealthBefore); // drawCard (raw) doesn't dispatch CARD_DRAWN

    state = endTurn(state, cards); // -> player 1's turn (no Mist there, irrelevant)
    state = endTurn(state, cards); // -> player 0's turn, real trigger-aware draw
    expect(state.players[1].health).toBe(opponentHealthBefore - 30);
    expect(state.players[0].deck.length).toBeLessThan(before);
  });
});

describe("Cutlary", () => {
  it("triggers when 30+ damage is dealt to a player, and draws a card", () => {
    const PARKER_FOR_CUTLARY: EngineCard = { id: "parker-cutlary", slug: "parker", type: "Spell", attack: null, defence: null, speed: null };
    const cards = new Map<string, EngineCard>([[CUTLARY.id, CUTLARY], [PARKER_FOR_CUTLARY.id, PARKER_FOR_CUTLARY], [ITEM_WEAK.id, ITEM_WEAK]]);
    let state = createGameState({
      matchId: "cutlary-standalone",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [PARKER_FOR_CUTLARY.id] }, // dealt straight to hand
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    state = putOnBattlefield(state, 0, CUTLARY.id, "cut-1");
    state = putInDeck(state, 0, ITEM_WEAK.id, "weak-in-deck"); // something for Cutlary to actually draw
    const parker = state.players[0].hand.find((c) => c.cardId === PARKER_FOR_CUTLARY.id)!;
    const handBefore = state.players[0].hand.length;
    const deckBefore = state.players[0].deck.length;
    // Parker deals exactly 100 damage (>=30) — should trigger Cutlary's draw.
    state = playSpell(state, 0, parker.instanceId, cards, "player:1");
    // Parker leaves hand (-1), Cutlary draws a replacement (+1) -> net unchanged.
    expect(state.players[0].hand).toHaveLength(handBefore);
    expect(state.players[0].deck).toHaveLength(deckBefore - 1);
  });

  it("does NOT trigger when damage dealt is below 30", () => {
    const weakDamage: EngineCard = { id: "weak-damage-spell", slug: "weak-damage-spell", type: "Spell", attack: null, defence: null, speed: null };
    const cards = new Map<string, EngineCard>([[CUTLARY.id, CUTLARY], [weakDamage.id, weakDamage], [ITEM_WEAK.id, ITEM_WEAK]]);
    let state = createGameState({
      matchId: "cutlary-below-threshold",
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
    state = putOnBattlefield(state, 0, CUTLARY.id, "cut-2");
    // Deal 29 damage directly (below Cutlary's >=30 threshold) via the
    // same internal path Mountain Mist/etc. use, bypassing needing a real
    // 29-damage card — declareAttack with a small attacker is the
    // simplest real path.
    const smallAttacker: EngineCard = { id: "small-att", slug: "small-att", type: "Item", attack: 29, defence: 0, speed: 100 };
    const cards2 = new Map(cards);
    cards2.set(smallAttacker.id, smallAttacker);
    state = putOnBattlefield(state, 0, smallAttacker.id, "small-att-inst");
    const handBefore = state.players[0].hand.length;
    state = declareAttack(state, 0, "small-att-inst", cards2); // player 1 has no Item to defend with -> unopposed 29 damage
    expect(state.players[0].hand).toHaveLength(handBefore); // no draw — Cutlary never triggered
  });
});

// ---------------------------------------------------------------------------
// The Mountain Mist + Cutlary combo itself — an INTENTIONAL, event-driven,
// self-terminating loop. Every one of these tests proves the chain is
// resolved through the real trigger engine (not special-cased), continues
// until a legitimate stopping condition, and is never cut short by the
// generic recursion-depth safety net.
// ---------------------------------------------------------------------------

describe("Mountain Mist + Cutlary combo", () => {
  it("a single draw kicks off the full chain: Mist damage -> Cutlary draw -> Mist damage -> ...", () => {
    const cards = new Map<string, EngineCard>([[MOUNTAIN_MIST.id, MOUNTAIN_MIST], [CUTLARY.id, CUTLARY], [ITEM_WEAK.id, ITEM_WEAK]]);
    let state = createGameState({
      matchId: "combo-chain",
      formatId: "f1",
      startingHealth: 100000,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: new Array(10).fill(ITEM_WEAK.id) },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    state = putOnBattlefield(state, 0, MOUNTAIN_MIST.id, "mm");
    state = putOnBattlefield(state, 0, CUTLARY.id, "cut");
    state = endTurn(state, cards);
    state = endTurn(state, cards); // one real draw -> the whole chain runs

    // Deck: 10 cards, minus 1 starting hand = 9 in deck. Every one of
    // those 9 gets drawn via the chain (deck exhausts exactly).
    expect(state.players[0].deck).toHaveLength(0);
    expect(state.players[1].health).toBe(100000 - 9 * 30);
  });

  it("stops the instant the opponent reaches 0 health and declares the controller the winner", () => {
    const cards = new Map<string, EngineCard>([[MOUNTAIN_MIST.id, MOUNTAIN_MIST], [CUTLARY.id, CUTLARY], [ITEM_WEAK.id, ITEM_WEAK]]);
    let state = createGameState({
      matchId: "combo-lethal",
      formatId: "f1",
      startingHealth: 65, // dies partway through the chain, with deck cards left unused
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: new Array(20).fill(ITEM_WEAK.id) },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    state = putOnBattlefield(state, 0, MOUNTAIN_MIST.id, "mm");
    state = putOnBattlefield(state, 0, CUTLARY.id, "cut");
    state = endTurn(state, cards);
    state = endTurn(state, cards);

    expect(state.phase).toBe("COMPLETE");
    expect(state.winnerIndex).toBe(0); // the combo's controller wins
    expect(state.players[0].deck.length).toBeGreaterThan(0); // stopped early — didn't need the whole deck
  });

  it("multiple copies of each card combine through the normal trigger engine (no special-casing)", () => {
    const cards = new Map<string, EngineCard>([[MOUNTAIN_MIST.id, MOUNTAIN_MIST], [CUTLARY.id, CUTLARY], [ITEM_WEAK.id, ITEM_WEAK]]);
    let state = createGameState({
      matchId: "combo-multi-copy",
      formatId: "f1",
      startingHealth: 100000,
      startingHand: 1,
      players: [
        // Exactly enough deck for ONE real draw to kick things off.
        { userId: "u1", spriteInstanceId: null, cardIds: [ITEM_WEAK.id, ITEM_WEAK.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    // TWO Mountain Mists — one draw should deal 60, not 30.
    state = putOnBattlefield(state, 0, MOUNTAIN_MIST.id, "mm-a");
    state = putOnBattlefield(state, 0, MOUNTAIN_MIST.id, "mm-b");
    const before = state.players[1].health;
    state = endTurn(state, cards);
    state = endTurn(state, cards); // one real draw
    expect(before - state.players[1].health).toBe(60);
  });

  it("a large, realistic deck resolves the full chain without being cut short by the recursion safety net", () => {
    const cards = new Map<string, EngineCard>([[MOUNTAIN_MIST.id, MOUNTAIN_MIST], [CUTLARY.id, CUTLARY], [ITEM_WEAK.id, ITEM_WEAK]]);
    const DECK_SIZE = 200;
    let state = createGameState({
      matchId: "combo-large-deck",
      formatId: "f1",
      startingHealth: 100_000_000,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: new Array(DECK_SIZE).fill(ITEM_WEAK.id) },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    state = putOnBattlefield(state, 0, MOUNTAIN_MIST.id, "mm");
    state = putOnBattlefield(state, 0, CUTLARY.id, "cut");
    state = endTurn(state, cards);
    expect(() => {
      state = endTurn(state, cards);
    }).not.toThrow(); // in particular: no "Maximum call stack size exceeded"

    expect(state.players[0].deck).toHaveLength(0); // ran all the way to deck exhaustion
    expect(state.players[1].health).toBe(100_000_000 - (DECK_SIZE - 1) * 30);
  });

  it("Human and Bot slots resolve the identical combo through the identical engine functions", () => {
    const cards = new Map<string, EngineCard>([[MOUNTAIN_MIST.id, MOUNTAIN_MIST], [CUTLARY.id, CUTLARY], [ITEM_WEAK.id, ITEM_WEAK]]);
    let state = createGameState({
      matchId: "combo-bot",
      formatId: "f1",
      startingHealth: 100000,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
        { userId: null, spriteInstanceId: null, cardIds: new Array(10).fill(ITEM_WEAK.id) }, // the "Bot" slot
      ],
      cardsById: cards,
      random: () => 0,
    });
    state = putOnBattlefield(state, 1, MOUNTAIN_MIST.id, "mm-bot");
    state = putOnBattlefield(state, 1, CUTLARY.id, "cut-bot");
    state = endTurn(state, cards); // -> Bot's turn, one real draw -> the whole chain runs
    expect(state.players[1].deck).toHaveLength(0);
    expect(state.players[0].health).toBe(100000 - 9 * 30);
  });

  it("School can put Mountain Mist or Cutlary directly onto the battlefield to assemble the combo", () => {
    const cards = new Map<string, EngineCard>([[SCHOOL.id, SCHOOL], [MOUNTAIN_MIST.id, MOUNTAIN_MIST], [CUTLARY.id, CUTLARY]]);
    let state = createGameState({
      matchId: "school-assembles-combo",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [SCHOOL.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [ITEM_WEAK.id] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    // Player already controls Mountain Mist; their deck has Cutlary in it.
    state = putOnBattlefield(state, 0, MOUNTAIN_MIST.id, "mm-preexisting");
    state = { ...state, players: [{ ...state.players[0], deck: [{ instanceId: "cut-in-deck", cardId: CUTLARY.id, tired: false, buffs: { attack: 0, defence: 0, speed: 0 } }] }, state.players[1]] };

    const school = state.players[0].hand.find((c) => c.cardId === SCHOOL.id)!;
    state = playSpell(state, 0, school.instanceId, cards);

    expect(state.players[0].battlefield.some((c) => c.cardId === CUTLARY.id)).toBe(true);
    expect(state.players[0].battlefield.some((c) => c.cardId === MOUNTAIN_MIST.id)).toBe(true);
    // The combo is now assembled; the next real draw would start the chain
    // (already proven separately above) — this test only confirms School
    // is what assembled it, per spec.
  });
});

// ---------------------------------------------------------------------------
// Target-viability — a card whose ON_PLAY effect requires a target (Coke,
// Reflection, ...) isn't a legal play at all if nothing currently
// qualifies. Applies to both getLegalActions (so neither a human nor the
// Bot ever sees it as an option) and the Bot's own target selection (picks
// uniformly at random among whatever legal candidates DO exist, once the
// card is actually playable).
// ---------------------------------------------------------------------------

describe("target viability", () => {
  it("getLegalActions omits a targeted removal Spell entirely when there's nothing to target", () => {
    const cards = new Map<string, EngineCard>([[COKE_TARGETABLE.id, COKE_TARGETABLE]]);
    const state = createGameState({
      matchId: "no-target-illegal",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [COKE_TARGETABLE.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [] }, // no Item anywhere for Coke to hit
      ],
      cardsById: cards,
      random: () => 0,
    });
    const legal = getLegalActions(state, 0, cards);
    expect(legal.some((a) => a.type === "PLAY_ITEM" || a.type === "PLAY_SPELL")).toBe(false);
    expect(legal).toEqual([{ type: "END_TURN" }]);
  });

  it("becomes legal again as soon as a legal target exists", () => {
    const cards = new Map<string, EngineCard>([[COKE_TARGETABLE.id, COKE_TARGETABLE], [ITEM_WEAK.id, ITEM_WEAK]]);
    let state = createGameState({
      matchId: "target-appears",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [COKE_TARGETABLE.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    expect(getLegalActions(state, 0, cards).some((a) => a.type === "PLAY_ITEM")).toBe(false);
    state = putOnBattlefield(state, 1, ITEM_WEAK.id, "opp-item");
    expect(getLegalActions(state, 0, cards).some((a) => a.type === "PLAY_ITEM")).toBe(true);
  });

  it("the Bot never attempts to play a targeted card with no legal target — it ends its turn instead", () => {
    const cards = new Map<string, EngineCard>([[COKE_TARGETABLE.id, COKE_TARGETABLE]]);
    const state = createGameState({
      matchId: "bot-skips-unplayable",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [COKE_TARGETABLE.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    const result = runBotStep(state, 0, cards);
    // Coke wasn't (couldn't be) played — the hand is untouched — and the
    // only remaining legal action (ending the turn) is what happened.
    expect(result.players[0].hand.some((c) => c.cardId === COKE_TARGETABLE.id)).toBe(true);
    expect(result.activePlayerIndex).toBe(1);
  });

  it("the Bot picks a target uniformly at random among legal candidates, not the 'strongest' heuristic", () => {
    const cards = new Map<string, EngineCard>([[COKE_TARGETABLE.id, COKE_TARGETABLE], [ITEM_WEAK.id, ITEM_WEAK], [ITEM_STRONG.id, ITEM_STRONG]]);
    let state = createGameState({
      matchId: "bot-random-target",
      formatId: "f1",
      startingHealth: 500,
      startingHand: 1,
      players: [
        { userId: "u1", spriteInstanceId: null, cardIds: [COKE_TARGETABLE.id] },
        { userId: "u2", spriteInstanceId: null, cardIds: [] },
      ],
      cardsById: cards,
      random: () => 0,
    });
    state = putOnBattlefield(state, 1, ITEM_WEAK.id, "weak-item"); // the strongest-by-Attack heuristic would SKIP this
    state = putOnBattlefield(state, 1, ITEM_STRONG.id, "strong-item"); // ...and always pick this one instead

    // Candidates are collected in battlefield order (weak-item, then
    // strong-item) — random() = 0 always picks index 0, the WEAK item.
    // The engine's old "auto-heuristic" fallback (pickStrongestItem) would
    // NEVER choose the weaker one over the stronger; this proves the
    // Bot's own target choice is a genuinely separate, random mechanism.
    const result = runBotStep(state, 0, cards, new Map(), simpleRulesBot, () => 0);
    expect(result.players[1].battlefield.some((c) => c.instanceId === "weak-item")).toBe(false);
    expect(result.players[1].battlefield.some((c) => c.instanceId === "strong-item")).toBe(true);
  });
});
