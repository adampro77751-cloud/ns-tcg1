import {
  IllegalActionError,
  type CardInstance,
  type DigitalGameState,
  type EngineCard,
  type PlayerGameState,
  type StatBuffs,
} from "./types";
import { getCardAbilities, type AbilitySpec, type EffectSpec, type GameEvent } from "./abilities";

// ---------------------------------------------------------------------------
// Combat resolution — PROVISIONAL, see final report.
// ---------------------------------------------------------------------------
// The existing NS TCG Rules page names a turn structure (Draw, remove tired
// counters, Play cards, Attacks, Speed check, Defenders, Damage, Attackers
// gain tired counters) and defines Attack/Defence/Speed/Health stats, but
// does NOT specify anywhere in the codebase the exact formula for how those
// stats resolve into damage. Rather than block Phase 1 on that, this engine
// implements one concrete, internally-consistent reading of those named
// steps:
//   - An attack always targets the opponent's health (Items have no
//     separate "health"/toughness field in the schema — only Attack/
//     Defence/Speed — so nothing is ever "destroyed" in combat).
//   - The server auto-selects the defending player's untired battlefield
//     Item with the highest Defence as the defender (no manual "choose
//     your defender" UI yet — a known V1 limitation).
//   - Speed check: if the defender's Speed >= the attacker's Speed, the
//     defence applies and damage = max(0, attack - defence). Otherwise the
//     defender is "too slow" and the full Attack goes through unmitigated.
//   - If the defending player has no untired Item, the full Attack goes
//     through unmitigated.
// This needs confirming/correcting against the real designed rules —
// flagged explicitly, not silently assumed to be canonical.

const MAX_TRIGGER_DEPTH = 8;
const ZERO_BUFFS: StatBuffs = { attack: 0, defence: 0, speed: 0 };

function findCardInstance(
  zone: CardInstance[],
  instanceId: string,
): CardInstance | undefined {
  return zone.find((c) => c.instanceId === instanceId);
}

function removeFromZone(zone: CardInstance[], instanceId: string): CardInstance[] {
  return zone.filter((c) => c.instanceId !== instanceId);
}

function opponentIndex(playerIndex: 0 | 1): 0 | 1 {
  return playerIndex === 0 ? 1 : 0;
}

// PROVISIONAL — see types.ts's top-of-file comment. Commander/Champion
// cards have no rules-defined entry method, so they're allowed into play
// via the normal Item action/slot as a non-canonical engineering choice.
function isPlayableAsItem(type: string | null): boolean {
  return type === "Item" || type === "Commander" || type === "Champion";
}

function requireCard(cardsById: Map<string, EngineCard>, cardId: string): EngineCard {
  const card = cardsById.get(cardId);
  if (!card) throw new IllegalActionError("Unknown card.");
  return card;
}

function getEffectiveStat(
  instance: CardInstance,
  card: EngineCard,
  stat: "attack" | "defence" | "speed",
): number {
  return (card[stat] ?? 0) + (instance.buffs?.[stat] ?? 0);
}

function pickStrongestItem(
  candidates: { ownerIndex: 0 | 1; instance: CardInstance }[],
  cardsById: Map<string, EngineCard>,
): { ownerIndex: 0 | 1; instance: CardInstance } | undefined {
  let best: { ownerIndex: 0 | 1; instance: CardInstance } | undefined;
  let bestAttack = -Infinity;
  for (const c of candidates) {
    const card = cardsById.get(c.instance.cardId);
    if (!card || card.type !== "Item") continue;
    const attack = getEffectiveStat(c.instance, card, "attack");
    if (attack > bestAttack) {
      best = c;
      bestAttack = attack;
    }
  }
  return best;
}

function checkWin(state: DigitalGameState): DigitalGameState {
  const [a, b] = state.players;
  if (a.health <= 0 && b.health <= 0) {
    return { ...state, phase: "COMPLETE", winnerIndex: opponentIndex(state.activePlayerIndex) };
  }
  if (a.health <= 0) return { ...state, phase: "COMPLETE", winnerIndex: 1 };
  if (b.health <= 0) return { ...state, phase: "COMPLETE", winnerIndex: 0 };
  return state;
}

function requireInProgress(state: DigitalGameState) {
  if (state.phase === "COMPLETE") {
    throw new IllegalActionError("This match has already ended.");
  }
}

function requireTurn(state: DigitalGameState, playerIndex: 0 | 1) {
  if (state.activePlayerIndex !== playerIndex) {
    throw new IllegalActionError("It isn't your turn.");
  }
}

function updatePlayer(
  state: DigitalGameState,
  index: 0 | 1,
  fn: (p: PlayerGameState) => PlayerGameState,
): DigitalGameState {
  const players = [...state.players] as [PlayerGameState, PlayerGameState];
  players[index] = fn(players[index]);
  return { ...state, players };
}

function describePlayer(index: 0 | 1): string {
  return index === 0 ? "Player 1" : "Player 2";
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export type PlayerSetup = {
  userId: string | null;
  spriteInstanceId: string | null;
  /** Card instances to build the deck from, one entry per physical copy. */
  cardIds: string[];
};

export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function freshInstance(instanceId: string, cardId: string): CardInstance {
  return { instanceId, cardId, tired: false, buffs: { ...ZERO_BUFFS } };
}

function buildPlayerState(
  setup: PlayerSetup,
  startingHealth: number,
  startingHand: number,
  makeInstanceId: () => string,
  random: () => number,
): PlayerGameState {
  const deck: CardInstance[] = shuffle(
    setup.cardIds.map((cardId) => freshInstance(makeInstanceId(), cardId)),
    random,
  );

  const hand: CardInstance[] = [];
  for (let i = 0; i < startingHand && deck.length > 0; i++) {
    hand.push(deck.shift()!);
  }

  return {
    userId: setup.userId,
    health: startingHealth,
    spriteInstanceId: setup.spriteInstanceId,
    deck,
    hand,
    battlefield: [],
    discard: [],
    itemsPlayedThisTurn: 0,
    spellsPlayedThisTurn: 0,
    extraPlaysThisTurn: 0,
    unlimitedSpellsThisTurn: false,
    damagePreventedThisTurn: false,
    spellsPlayableFromDiscardThisTurn: false,
    handRevealedToOpponent: false,
  };
}

export function createGameState(params: {
  matchId: string;
  formatId: string;
  startingHealth: number;
  startingHand: number;
  players: [PlayerSetup, PlayerSetup];
  cardsById?: Map<string, EngineCard>;
  makeInstanceId?: () => string;
  random?: () => number;
}): DigitalGameState {
  let counter = 0;
  const makeInstanceId = params.makeInstanceId ?? (() => `ci_${counter++}`);
  const random = params.random ?? Math.random;

  let state: DigitalGameState = {
    matchId: params.matchId,
    formatId: params.formatId,
    turnNumber: 1,
    activePlayerIndex: 0,
    phase: "MAIN",
    players: [
      buildPlayerState(params.players[0], params.startingHealth, params.startingHand, makeInstanceId, random),
      buildPlayerState(params.players[1], params.startingHealth, params.startingHand, makeInstanceId, random),
    ],
    log: ["Match started."],
    winnerIndex: null,
    itemsLockedForRestOfGame: false,
    spellsLockedForRestOfGame: false,
  };

  // "End Of Year Test: If this is in your hand at the beginning of the
  // game, put it into play, then draw 2 cards." A start-of-game check, not
  // a normal trigger, so it's special-cased here rather than in
  // abilities.ts. Only applies if we know which card is which (cardsById
  // provided) — degrades to "no effect" rather than guessing otherwise.
  if (params.cardsById) {
    for (const playerIndex of [0, 1] as const) {
      const inHand = state.players[playerIndex].hand.find((c) => {
        const card = params.cardsById!.get(c.cardId);
        return card?.slug === "end-of-year-test";
      });
      if (inHand) {
        state = updatePlayer(state, playerIndex, (p) => ({
          ...p,
          hand: removeFromZone(p.hand, inHand.instanceId),
        }));
        state = enterBattlefield(state, playerIndex, inHand, params.cardsById, 0);
        state = drawWithTrigger(state, playerIndex, params.cardsById, 0);
        state = drawWithTrigger(state, playerIndex, params.cardsById, 0);
        state = {
          ...state,
          log: [...state.log, `${describePlayer(playerIndex)}'s End Of Year Test started in play.`],
        };
      }
    }
  }

  return state;
}

// ---------------------------------------------------------------------------
// Low-level zone moves (no triggers) — used internally by the
// trigger-aware wrappers below, which are what everything else calls.
// ---------------------------------------------------------------------------

function drawCardRaw(state: DigitalGameState, playerIndex: 0 | 1): DigitalGameState {
  const player = state.players[playerIndex];
  if (player.deck.length === 0) return state; // empty deck: no-op, no invented fatigue/loss rule
  const [drawn, ...rest] = player.deck;
  return updatePlayer(state, playerIndex, (p) => ({ ...p, deck: rest, hand: [...p.hand, drawn] }));
}

export function drawCard(state: DigitalGameState, playerIndex: 0 | 1): DigitalGameState {
  return drawCardRaw(state, playerIndex);
}

// ---------------------------------------------------------------------------
// Trigger-aware wrappers — the only paths that fire GameEvents. Every one
// takes `depth` so a chain of triggers (e.g. Mountain Mist + Cutlary
// combo-ing off each other) can never recurse forever; past
// MAX_TRIGGER_DEPTH further triggers simply stop firing.
// ---------------------------------------------------------------------------

// "Detention: Players can't draw cards." — a global static effect with no
// natural trigger to hook, so it's special-cased here as the single
// chokepoint every meaningful draw goes through, rather than generalizing
// a whole static-effects layer for one Set 1 card.
function isDetentionInPlay(state: DigitalGameState, cardsById: Map<string, EngineCard>): boolean {
  return [...state.players[0].battlefield, ...state.players[1].battlefield].some(
    (c) => cardsById.get(c.cardId)?.slug === "detention",
  );
}

function drawWithTrigger(
  state: DigitalGameState,
  playerIndex: 0 | 1,
  cardsById: Map<string, EngineCard>,
  depth: number,
): DigitalGameState {
  if (isDetentionInPlay(state, cardsById)) return state;
  const before = state.players[playerIndex].deck.length;
  state = drawCardRaw(state, playerIndex);
  if (state.players[playerIndex].deck.length === before) return state; // was a no-op (empty deck)
  return dispatchEvent(state, "CARD_DRAWN", { drawingPlayerIndex: playerIndex }, cardsById, depth + 1);
}

function dealDamageWithTrigger(
  state: DigitalGameState,
  targetIndex: 0 | 1,
  amount: number,
  dealtByIndex: 0 | 1,
  cardsById: Map<string, EngineCard>,
  depth: number,
): DigitalGameState {
  const target = state.players[targetIndex];
  const actualAmount = target.damagePreventedThisTurn ? 0 : amount;
  state = updatePlayer(state, targetIndex, (p) => ({ ...p, health: p.health - actualAmount }));
  state = checkWin(state);
  if (state.phase === "COMPLETE" || actualAmount <= 0) return state;
  return dispatchEvent(
    state,
    "DAMAGE_DEALT",
    { dealtByPlayerIndex: dealtByIndex, amount: actualAmount },
    cardsById,
    depth + 1,
  );
}

// Places `instance` onto `playerIndex`'s battlefield: resets tired/buffs
// (a permanent re-entering play is a fresh object, standard TCG
// convention), fires its own ON_PLAY abilities, then dispatches
// ITEM_ENTERED for every OTHER permanent already in play watching for it
// (e.g. DNA) — used both for a normal hand-play and for effects that
// return/give control of a card to the battlefield (Physics, Chemistry
// Lesson, Repton, ...), so "enters the battlefield" triggers fire
// consistently regardless of how the card got there.
function enterBattlefield(
  state: DigitalGameState,
  playerIndex: 0 | 1,
  rawInstance: CardInstance,
  cardsById: Map<string, EngineCard>,
  depth: number,
  chosenTarget?: string,
): DigitalGameState {
  const instance: CardInstance = { ...rawInstance, tired: false, buffs: { ...ZERO_BUFFS } };
  state = updatePlayer(state, playerIndex, (p) => ({ ...p, battlefield: [...p.battlefield, instance] }));

  const card = cardsById.get(instance.cardId);
  if (card) {
    state = resolveAbilities(
      state,
      playerIndex,
      card.slug,
      "ON_PLAY",
      cardsById,
      instance.instanceId,
      depth,
      Math.random,
      chosenTarget,
    );
  }
  if (depth < MAX_TRIGGER_DEPTH) {
    state = dispatchEvent(
      state,
      "ITEM_ENTERED",
      { enteredInstanceId: instance.instanceId },
      cardsById,
      depth + 1,
    );
  }
  return state;
}

// ---------------------------------------------------------------------------
// Effect execution
// ---------------------------------------------------------------------------

type EffectRunCtx = {
  controllerIndex: 0 | 1;
  /** The specific instance a self-referential trigger (CARD_DISCARDED) is
   *  about — resolves EffectTarget "THIS". */
  thisInstanceId?: string;
  cardsById: Map<string, EngineCard>;
  depth: number;
  random: () => number;
  /** A real target chosen by the human player who just played this card
   *  from hand/discard — "player:0" | "player:1" | "item:<instanceId>".
   *  Only set for the top-level ON_PLAY resolution of a directly-played
   *  card (see playCard/enterBattlefield); undefined everywhere else, in
   *  which case ANY_ITEM/OPPONENT_ITEM/OWN_ITEM/ANY_TARGET fall back to
   *  their documented auto-heuristic. */
  chosenTarget?: string;
};

function findInstanceAnywhere(
  state: DigitalGameState,
  instanceId: string,
): { ownerIndex: 0 | 1; instance: CardInstance } | undefined {
  for (const ownerIndex of [0, 1] as const) {
    const instance = findCardInstance(state.players[ownerIndex].battlefield, instanceId);
    if (instance) return { ownerIndex, instance };
  }
  return undefined;
}

function applyEffect(
  state: DigitalGameState,
  effect: EffectSpec,
  ctx: EffectRunCtx,
  previousTarget: string | null,
): { state: DigitalGameState; resolvedTarget: string | null } {
  const { controllerIndex, cardsById, depth } = ctx;
  const opponentIdx = opponentIndex(controllerIndex);
  const amount = effect.amount ?? 0;

  switch (effect.type) {
    case "DRAW": {
      const targetIndex = effect.target === "OPPONENT" ? opponentIdx : controllerIndex;
      for (let i = 0; i < amount; i++) {
        state = drawWithTrigger(state, targetIndex, cardsById, depth);
      }
      return { state, resolvedTarget: null };
    }

    case "DAMAGE": {
      if (effect.target === "ANY_TARGET") {
        const chosen = ctx.chosenTarget;
        if (chosen?.startsWith("player:")) {
          const targetIndex = chosen === "player:0" ? 0 : 1;
          state = dealDamageWithTrigger(state, targetIndex, amount, controllerIndex, cardsById, depth);
          return { state, resolvedTarget: chosen };
        }
        if (chosen?.startsWith("item:")) {
          const found = findInstanceAnywhere(state, chosen.slice(5));
          if (found) {
            // PROVISIONAL rule (explicit user decision, not in the real
            // rules — Items have no health/toughness stat): damage >= the
            // Item's effective Defence destroys it; otherwise no effect.
            const card = cardsById.get(found.instance.cardId);
            const defence = card ? getEffectiveStat(found.instance, card, "defence") : 0;
            if (amount >= defence) {
              state = updatePlayer(state, found.ownerIndex, (p) => ({
                ...p,
                battlefield: removeFromZone(p.battlefield, found.instance.instanceId),
                discard: [...p.discard, found.instance],
              }));
              state = afterMoveToDiscard(state, found.ownerIndex, found.instance, cardsById, depth);
            }
            return { state, resolvedTarget: chosen };
          }
        }
        // No (valid) chosen target — bot/fallback path, same as before this feature existed.
        state = dealDamageWithTrigger(state, opponentIdx, amount, controllerIndex, cardsById, depth);
        return { state, resolvedTarget: null };
      }
      const targetIndex = effect.target === "SELF" ? controllerIndex : opponentIdx;
      state = dealDamageWithTrigger(state, targetIndex, amount, controllerIndex, cardsById, depth);
      return { state, resolvedTarget: null };
    }

    case "GAIN_HEALTH": {
      const targetIndex = effect.target === "OPPONENT" ? opponentIdx : controllerIndex;
      state = updatePlayer(state, targetIndex, (p) => ({ ...p, health: p.health + amount }));
      return { state, resolvedTarget: null };
    }

    case "DISCARD": {
      const targetIndex = effect.target === "SELF" ? controllerIndex : opponentIdx;
      const hand = state.players[targetIndex].hand;
      const n = Math.min(amount, hand.length);
      let remaining = hand;
      let movedToDiscard: CardInstance[] = [];
      for (let i = 0; i < n; i++) {
        const idx = Math.floor(ctx.random() * remaining.length);
        const [chosen] = remaining.splice(idx, 1);
        movedToDiscard = [...movedToDiscard, chosen];
      }
      state = updatePlayer(state, targetIndex, (p) => ({
        ...p,
        hand: remaining,
        discard: [...p.discard, ...movedToDiscard],
      }));
      for (const instance of movedToDiscard) {
        state = afterMoveToDiscard(state, targetIndex, instance, cardsById, depth);
      }
      return { state, resolvedTarget: null };
    }

    case "MOVE_TO_DISCARD": {
      const found = findItemForTarget(state, effect.target, controllerIndex, cardsById, ctx.chosenTarget);
      if (!found) return { state, resolvedTarget: null };
      state = updatePlayer(state, found.ownerIndex, (p) => ({
        ...p,
        battlefield: removeFromZone(p.battlefield, found.instance.instanceId),
        discard: [...p.discard, found.instance],
      }));
      state = afterMoveToDiscard(state, found.ownerIndex, found.instance, cardsById, depth);
      return { state, resolvedTarget: found.instance.instanceId };
    }

    case "RETURN_TO_HAND": {
      const targetIndex = controllerIndex; // only used from own discard in this pass
      const discard = state.players[targetIndex].discard;
      const n = Math.min(amount, discard.length);
      const picked = discard.slice(-n); // most recently discarded
      state = updatePlayer(state, targetIndex, (p) => ({
        ...p,
        discard: p.discard.slice(0, p.discard.length - n),
        hand: [...p.hand, ...picked],
      }));
      return { state, resolvedTarget: null };
    }

    case "RETURN_TO_PLAY": {
      if (effect.target === "PREVIOUS_TARGET") {
        if (!previousTarget) return { state, resolvedTarget: null };
        // The previous target should currently be sitting in some
        // player's discard pile (MOVE_TO_DISCARD just put it there).
        for (const ownerIndex of [0, 1] as const) {
          const instance = findCardInstance(state.players[ownerIndex].discard, previousTarget);
          if (instance) {
            state = updatePlayer(state, ownerIndex, (p) => ({
              ...p,
              discard: removeFromZone(p.discard, instance.instanceId),
            }));
            state = enterBattlefield(state, ownerIndex, instance, cardsById, depth);
            return { state, resolvedTarget: instance.instanceId };
          }
        }
        return { state, resolvedTarget: null };
      }
      if (effect.target === "THIS") {
        if (!ctx.thisInstanceId) return { state, resolvedTarget: null };
        const instance = findCardInstance(state.players[controllerIndex].discard, ctx.thisInstanceId);
        if (!instance) return { state, resolvedTarget: null };
        state = updatePlayer(state, controllerIndex, (p) => ({
          ...p,
          discard: removeFromZone(p.discard, instance.instanceId),
        }));
        state = enterBattlefield(state, controllerIndex, instance, cardsById, depth);
        return { state, resolvedTarget: instance.instanceId };
      }
      if (effect.target === "SELF_HAND_ITEM") {
        const hand = state.players[controllerIndex].hand;
        const items = hand.filter((c) => cardsById.get(c.cardId)?.type === "Item");
        const n = Math.min(amount, items.length);
        for (let i = 0; i < n; i++) {
          const instance = items[i];
          state = updatePlayer(state, controllerIndex, (p) => ({ ...p, hand: removeFromZone(p.hand, instance.instanceId) }));
          state = enterBattlefield(state, controllerIndex, instance, cardsById, depth);
        }
        return { state, resolvedTarget: null };
      }
      // Default: SELF_DISCARD — an Item from own discard.
      const discard = state.players[controllerIndex].discard;
      const item = discard.find((c) => cardsById.get(c.cardId)?.type === "Item");
      if (!item) return { state, resolvedTarget: null };
      state = updatePlayer(state, controllerIndex, (p) => ({ ...p, discard: removeFromZone(p.discard, item.instanceId) }));
      state = enterBattlefield(state, controllerIndex, item, cardsById, depth);
      return { state, resolvedTarget: item.instanceId };
    }

    case "SEARCH_DECK": {
      const deck = state.players[controllerIndex].deck;
      const found = deck.find((c) => cardsById.get(c.cardId)?.type === "Item");
      if (!found) return { state, resolvedTarget: null };
      const rest = shuffle(removeFromZone(deck, found.instanceId), ctx.random);
      state = updatePlayer(state, controllerIndex, (p) => ({ ...p, deck: rest, hand: [...p.hand, found] }));
      return { state, resolvedTarget: null };
    }

    // Cathedral Pergrines: same search as SEARCH_DECK, but the found Item
    // goes straight onto the battlefield ("put it onto the battlefield"),
    // not into hand.
    case "SEARCH_DECK_TO_PLAY": {
      const deck = state.players[controllerIndex].deck;
      const found = deck.find((c) => cardsById.get(c.cardId)?.type === "Item");
      if (!found) return { state, resolvedTarget: null };
      const rest = shuffle(removeFromZone(deck, found.instanceId), ctx.random);
      state = updatePlayer(state, controllerIndex, (p) => ({ ...p, deck: rest }));
      state = enterBattlefield(state, controllerIndex, found, cardsById, depth);
      return { state, resolvedTarget: found.instanceId };
    }

    // The Curriculum.
    case "LOCK_CARD_TYPE": {
      state = effect.choice === "SPELL" ? { ...state, spellsLockedForRestOfGame: true } : { ...state, itemsLockedForRestOfGame: true };
      return { state, resolvedTarget: null };
    }

    case "BUFF_ATTACK":
    case "BUFF_DEFENSE":
    case "BUFF_SPEED": {
      const stat = effect.type === "BUFF_ATTACK" ? "attack" : effect.type === "BUFF_DEFENSE" ? "defence" : "speed";
      if (effect.target === "ALL_ITEMS_IN_PLAY") {
        for (const ownerIndex of [0, 1] as const) {
          state = updatePlayer(state, ownerIndex, (p) => ({
            ...p,
            battlefield: p.battlefield.map((c) =>
              cardsById.get(c.cardId)?.type === "Item"
                ? { ...c, buffs: { ...c.buffs, [stat]: c.buffs[stat] + amount } }
                : c,
            ),
          }));
        }
        return { state, resolvedTarget: null };
      }
      const found = findItemForTarget(state, effect.target, controllerIndex, cardsById, ctx.chosenTarget);
      if (!found) return { state, resolvedTarget: null };
      state = updatePlayer(state, found.ownerIndex, (p) => ({
        ...p,
        battlefield: p.battlefield.map((c) =>
          c.instanceId === found.instance.instanceId
            ? { ...c, buffs: { ...c.buffs, [stat]: c.buffs[stat] + amount } }
            : c,
        ),
      }));
      return { state, resolvedTarget: found.instance.instanceId };
    }

    case "GAIN_CONTROL": {
      if (effect.target === "OPPONENT_HAND_ITEM") {
        const hand = state.players[opponentIdx].hand;
        const best = hand
          .filter((c) => cardsById.get(c.cardId)?.type === "Item")
          .map((instance) => ({ instance, attack: getEffectiveStat(instance, cardsById.get(instance.cardId)!, "attack") }))
          .sort((a, b) => b.attack - a.attack)[0];
        if (!best) return { state, resolvedTarget: null };
        state = updatePlayer(state, opponentIdx, (p) => ({ ...p, hand: removeFromZone(p.hand, best.instance.instanceId) }));
        state = enterBattlefield(state, controllerIndex, best.instance, cardsById, depth);
        return { state, resolvedTarget: best.instance.instanceId };
      }
      const found = findItemForTarget(state, effect.target, controllerIndex, cardsById, ctx.chosenTarget);
      if (!found || found.ownerIndex === controllerIndex) return { state, resolvedTarget: null };
      state = updatePlayer(state, found.ownerIndex, (p) => ({
        ...p,
        battlefield: removeFromZone(p.battlefield, found.instance.instanceId),
      }));
      state = enterBattlefield(state, controllerIndex, found.instance, cardsById, depth);
      return { state, resolvedTarget: found.instance.instanceId };
    }

    case "COPY": {
      const found = findItemForTarget(state, effect.target, controllerIndex, cardsById, ctx.chosenTarget);
      if (!found) return { state, resolvedTarget: null };
      const targetCardId = found.instance.cardId;
      state = updatePlayer(state, controllerIndex, (p) => ({
        ...p,
        battlefield: p.battlefield.map((c) => ({ ...c, cardId: targetCardId, buffs: { ...ZERO_BUFFS } })),
      }));
      return { state, resolvedTarget: found.instance.instanceId };
    }

    case "PREVENT_DAMAGE": {
      state = updatePlayer(state, controllerIndex, (p) => ({ ...p, damagePreventedThisTurn: true }));
      return { state, resolvedTarget: null };
    }

    case "EXTRA_ITEM_PLAY":
    case "EXTRA_SPELL_PLAY": {
      state = updatePlayer(state, controllerIndex, (p) => ({
        ...p,
        extraPlaysThisTurn: p.extraPlaysThisTurn + amount,
      }));
      return { state, resolvedTarget: null };
    }

    case "ALLOW_SPELLS_FROM_DISCARD": {
      state = updatePlayer(state, controllerIndex, (p) => ({ ...p, spellsPlayableFromDiscardThisTurn: true }));
      return { state, resolvedTarget: null };
    }

    case "REVEAL_HAND": {
      const targetIndex = effect.target === "SELF" ? controllerIndex : opponentIdx;
      state = updatePlayer(state, targetIndex, (p) => ({ ...p, handRevealedToOpponent: true }));
      return { state, resolvedTarget: null };
    }

    case "RETURN_ALL_SPELLS_FROM_DISCARD": {
      const discard = state.players[controllerIndex].discard;
      const spells = discard.filter((c) => cardsById.get(c.cardId)?.type === "Spell");
      if (spells.length === 0) return { state, resolvedTarget: null };
      const spellIds = new Set(spells.map((c) => c.instanceId));
      state = updatePlayer(state, controllerIndex, (p) => ({
        ...p,
        discard: p.discard.filter((c) => !spellIds.has(c.instanceId)),
        hand: [...p.hand, ...spells],
      }));
      return { state, resolvedTarget: null };
    }

    // "Each player must put an Item they control into discard." Each
    // player's own choice in the real text — auto-resolved to their own
    // weakest Item by Attack (see abilities.ts comment on `running`).
    case "MUTUAL_DISCARD_ITEM": {
      for (const idx of [0, 1] as const) {
        const items = state.players[idx].battlefield.filter((c) => cardsById.get(c.cardId)?.type === "Item");
        if (items.length === 0) continue;
        let weakest = items[0];
        let weakestAttack = getEffectiveStat(weakest, cardsById.get(weakest.cardId)!, "attack");
        for (const c of items.slice(1)) {
          const atk = getEffectiveStat(c, cardsById.get(c.cardId)!, "attack");
          if (atk < weakestAttack) {
            weakest = c;
            weakestAttack = atk;
          }
        }
        state = updatePlayer(state, idx, (p) => ({
          ...p,
          battlefield: removeFromZone(p.battlefield, weakest.instanceId),
          discard: [...p.discard, weakest],
        }));
        state = afterMoveToDiscard(state, idx, weakest, cardsById, depth);
      }
      return { state, resolvedTarget: null };
    }

    // Time Bomb's own trigger — adds a charge counter to itself.
    case "ADD_CHARGE": {
      if (!ctx.thisInstanceId) return { state, resolvedTarget: null };
      state = updatePlayer(state, controllerIndex, (p) => ({
        ...p,
        battlefield: p.battlefield.map((c) =>
          c.instanceId === ctx.thisInstanceId ? { ...c, charges: (c.charges ?? 0) + 1 } : c,
        ),
      }));
      return { state, resolvedTarget: null };
    }

    // Library: casts the most-recently-discarded Spell from the
    // controller's own discard, resolving its ON_PLAY effects, then puts it
    // back in discard — a simplification documented in abilities.ts (no
    // SPELL_PLAYED event fires for this recast).
    case "CAST_FROM_DISCARD": {
      const discard = state.players[controllerIndex].discard;
      const spell = [...discard].reverse().find((c) => cardsById.get(c.cardId)?.type === "Spell");
      if (!spell) return { state, resolvedTarget: null };
      const spellCard = cardsById.get(spell.cardId);
      if (!spellCard) return { state, resolvedTarget: null };
      state = updatePlayer(state, controllerIndex, (p) => ({ ...p, discard: removeFromZone(p.discard, spell.instanceId) }));
      state = resolveAbilities(state, controllerIndex, spellCard.slug, "ON_PLAY", cardsById, spell.instanceId, depth, ctx.random);
      if (state.phase === "COMPLETE") return { state, resolvedTarget: spell.instanceId };
      state = updatePlayer(state, controllerIndex, (p) => ({ ...p, discard: [...p.discard, spell] }));
      state = afterMoveToDiscard(state, controllerIndex, spell, cardsById, depth);
      return { state, resolvedTarget: spell.instanceId };
    }

    default:
      return { state, resolvedTarget: null };
  }
}

// Shared target resolution for effects that pick a single battlefield Item.
function findItemForTarget(
  state: DigitalGameState,
  target: EffectSpec["target"],
  controllerIndex: 0 | 1,
  cardsById: Map<string, EngineCard>,
  chosenTarget?: string,
): { ownerIndex: 0 | 1; instance: CardInstance } | undefined {
  const opponentIdx = opponentIndex(controllerIndex);

  if (chosenTarget?.startsWith("item:")) {
    const found = findInstanceAnywhere(state, chosenTarget.slice(5));
    if (found) {
      // Validate the chosen instance actually matches the ability's scope
      // — a client bug or stale UI shouldn't let a player pick an illegal
      // target; fall through to the auto-heuristic if it doesn't match.
      if (target === "OWN_ITEM" && found.ownerIndex !== controllerIndex) {
        // invalid — ignore chosenTarget, fall through below
      } else if (target === "OPPONENT_ITEM" && found.ownerIndex !== opponentIdx) {
        // invalid — ignore chosenTarget, fall through below
      } else {
        return found;
      }
    }
  }

  if (target === "OWN_ITEM") {
    return pickStrongestItem(
      state.players[controllerIndex].battlefield.map((instance) => ({ ownerIndex: controllerIndex, instance })),
      cardsById,
    );
  }
  if (target === "OPPONENT_ITEM") {
    return pickStrongestItem(
      state.players[opponentIdx].battlefield.map((instance) => ({ ownerIndex: opponentIdx, instance })),
      cardsById,
    );
  }
  // ANY_ITEM (default)
  const all = [
    ...state.players[0].battlefield.map((instance) => ({ ownerIndex: 0 as const, instance })),
    ...state.players[1].battlefield.map((instance) => ({ ownerIndex: 1 as const, instance })),
  ];
  return pickStrongestItem(all, cardsById);
}

// Runs after a card lands in a discard pile from ANY source (a played
// Spell resolving, an effect, or a straight DISCARD) — checks that
// specific card's own self-referential abilities (IT Support, Lunch Card).
function afterMoveToDiscard(
  state: DigitalGameState,
  ownerIndex: 0 | 1,
  instance: CardInstance,
  cardsById: Map<string, EngineCard>,
  depth: number,
): DigitalGameState {
  if (depth >= MAX_TRIGGER_DEPTH) return state;
  const card = cardsById.get(instance.cardId);
  if (!card) return state;
  return resolveAbilities(state, ownerIndex, card.slug, "CARD_DISCARDED", cardsById, instance.instanceId, depth + 1);
}

// Resolves every ability of `cardSlug` matching `trigger`, run from
// `controllerIndex`'s perspective. Effects within one AbilitySpec share a
// `previousTarget` chain (see Physics: MOVE_TO_DISCARD then
// RETURN_TO_PLAY of the SAME card).
function resolveAbilities(
  state: DigitalGameState,
  controllerIndex: 0 | 1,
  cardSlug: string,
  trigger: AbilitySpec["trigger"],
  cardsById: Map<string, EngineCard>,
  thisInstanceId: string | undefined,
  depth: number,
  random: () => number = Math.random,
  chosenTarget?: string,
): DigitalGameState {
  if (depth >= MAX_TRIGGER_DEPTH) return state;
  const abilities = getCardAbilities(cardSlug).filter((a) => a.trigger === trigger);
  for (const ability of abilities) {
    let previousTarget: string | null = null;
    for (const effect of ability.effects) {
      const result = applyEffect(
        state,
        effect,
        { controllerIndex, thisInstanceId, cardsById, depth, random, chosenTarget },
        previousTarget,
      );
      state = result.state;
      if (result.resolvedTarget) previousTarget = result.resolvedTarget;
      if (state.phase === "COMPLETE") return state;
    }
  }
  return state;
}

// Board-wide dispatch for ongoing "whenever" triggers — scans every
// permanent already on either battlefield (for ITEM_ENTERED, excluding the
// instance that just entered) and fires any ability matching `event`,
// applying an optional amount-threshold condition (Cutlary's ">=30
// damage").
function dispatchEvent(
  state: DigitalGameState,
  event: GameEvent,
  payload: {
    drawingPlayerIndex?: 0 | 1;
    dealtByPlayerIndex?: 0 | 1;
    amount?: number;
    enteredInstanceId?: string;
    playerIndex?: 0 | 1;
  },
  cardsById: Map<string, EngineCard>,
  depth: number,
): DigitalGameState {
  if (depth >= MAX_TRIGGER_DEPTH) return state;

  for (const ownerIndex of [0, 1] as const) {
    for (const instance of state.players[ownerIndex].battlefield) {
      if (event === "ITEM_ENTERED" && instance.instanceId === payload.enteredInstanceId) continue;
      const card = cardsById.get(instance.cardId);
      if (!card) continue;
      const abilities = getCardAbilities(card.slug).filter((a) => a.trigger === event);
      for (const ability of abilities) {
        if (event === "CARD_DRAWN" && payload.drawingPlayerIndex !== ownerIndex) continue;
        if (event === "ITEM_PLAYED" && payload.playerIndex !== ownerIndex) continue;
        if (event === "SPELL_PLAYED" && payload.playerIndex !== ownerIndex) continue;
        if (event === "DAMAGE_DEALT") {
          if (payload.dealtByPlayerIndex !== ownerIndex) continue;
          const min = ability.condition?.minAmount;
          if (min !== undefined && (payload.amount ?? 0) < min) continue;
        }
        let previousTarget: string | null = null;
        for (const effect of ability.effects) {
          const result = applyEffect(
            state,
            effect,
            { controllerIndex: ownerIndex, thisInstanceId: instance.instanceId, cardsById, depth, random: Math.random },
            previousTarget,
          );
          state = result.state;
          if (result.resolvedTarget) previousTarget = result.resolvedTarget;
          if (state.phase === "COMPLETE") return state;
        }
      }
    }
  }
  return state;
}

// ---------------------------------------------------------------------------
// Player actions — every one of these is the ONLY way state changes. The
// action layer (src/lib/actions/digital-match-actions.ts) calls these
// after authenticating the caller; the bot (bot.ts) calls the exact same
// functions. Neither path can bypass validation, by construction.
// ---------------------------------------------------------------------------

function playCard(
  state: DigitalGameState,
  playerIndex: 0 | 1,
  instanceId: string,
  cardsById: Map<string, EngineCard>,
  expectedType: "Item" | "Spell",
  chosenTarget?: string,
): DigitalGameState {
  requireInProgress(state);
  requireTurn(state, playerIndex);

  const player = state.players[playerIndex];
  let inHand = findCardInstance(player.hand, instanceId);
  let fromDiscard = false;
  if (!inHand && expectedType === "Spell" && player.spellsPlayableFromDiscardThisTurn) {
    inHand = findCardInstance(player.discard, instanceId);
    fromDiscard = true;
  }
  if (!inHand) throw new IllegalActionError("That card isn't in your hand.");

  const card = requireCard(cardsById, inHand.cardId);
  const typeMatches = expectedType === "Item" ? isPlayableAsItem(card.type) : card.type === expectedType;
  if (!typeMatches) {
    throw new IllegalActionError(`That card isn't a ${expectedType}.`);
  }

  // The Curriculum: a lock is scoped to the card's real type NAME (not the
  // provisional "playable as Item" grouping), so a Commander/Champion card
  // is unaffected by an Item lock unless it is literally type "Item".
  if (card.type === "Item" && state.itemsLockedForRestOfGame) {
    throw new IllegalActionError("Items can no longer be played this game (The Curriculum).");
  }
  if (card.type === "Spell" && state.spellsLockedForRestOfGame) {
    throw new IllegalActionError("Spells can no longer be played this game (The Curriculum).");
  }

  const hasBiologist = player.battlefield.some((c) => cardsById.get(c.cardId)?.slug === "biologist");
  const itemLimit = 1 + (hasBiologist ? 1 : 0);

  if (expectedType === "Item") {
    const withinBaseLimit = player.itemsPlayedThisTurn < itemLimit;
    if (!withinBaseLimit) {
      if (player.extraPlaysThisTurn <= 0) {
        throw new IllegalActionError("You've already played an Item this turn.");
      }
      state = updatePlayer(state, playerIndex, (p) => ({ ...p, extraPlaysThisTurn: p.extraPlaysThisTurn - 1 }));
    }
  } else if (!fromDiscard) {
    // Art's "play Spells from your discard pile this turn" is specifically
    // an ADDITIONAL allowance on top of the normal 1-per-turn Spell limit
    // (otherwise the ability would be pointless — Art itself already used
    // that turn's one Spell) — so a discard-sourced cast never consumes or
    // is blocked by this counter at all.
    const unlimited = player.unlimitedSpellsThisTurn;
    const withinBaseLimit = player.spellsPlayedThisTurn < 1;
    if (!unlimited && !withinBaseLimit) {
      if (player.extraPlaysThisTurn <= 0) {
        throw new IllegalActionError("You've already played a Spell this turn.");
      }
      state = updatePlayer(state, playerIndex, (p) => ({ ...p, extraPlaysThisTurn: p.extraPlaysThisTurn - 1 }));
    }
  }

  state = updatePlayer(state, playerIndex, (p) => ({
    ...p,
    hand: fromDiscard ? p.hand : removeFromZone(p.hand, instanceId),
    discard: fromDiscard ? removeFromZone(p.discard, instanceId) : p.discard,
    itemsPlayedThisTurn: p.itemsPlayedThisTurn + (expectedType === "Item" ? 1 : 0),
    spellsPlayedThisTurn: p.spellsPlayedThisTurn + (expectedType === "Spell" && !fromDiscard ? 1 : 0),
  }));

  state = {
    ...state,
    log: [...state.log, `${describePlayer(playerIndex)} played ${expectedType} (${card.id}).`],
  };

  if (expectedType === "Item") {
    state = enterBattlefield(state, playerIndex, inHand, cardsById, 0, chosenTarget);
    state = dispatchEvent(state, "ITEM_PLAYED", { playerIndex }, cardsById, 1);
  } else {
    state = resolveAbilities(state, playerIndex, card.slug, "ON_PLAY", cardsById, inHand.instanceId, 0, Math.random, chosenTarget);
    if (state.phase !== "COMPLETE") {
      state = updatePlayer(state, playerIndex, (p) => ({ ...p, discard: [...p.discard, inHand] }));
      state = afterMoveToDiscard(state, playerIndex, inHand, cardsById, 0);
      state = dispatchEvent(state, "SPELL_PLAYED", { playerIndex }, cardsById, 1);
    }
  }

  return state;
}

export function playItem(
  state: DigitalGameState,
  playerIndex: 0 | 1,
  instanceId: string,
  cardsById: Map<string, EngineCard>,
  chosenTarget?: string,
): DigitalGameState {
  return playCard(state, playerIndex, instanceId, cardsById, "Item", chosenTarget);
}

export function playSpell(
  state: DigitalGameState,
  playerIndex: 0 | 1,
  instanceId: string,
  cardsById: Map<string, EngineCard>,
  chosenTarget?: string,
): DigitalGameState {
  return playCard(state, playerIndex, instanceId, cardsById, "Spell", chosenTarget);
}

export function declareAttack(
  state: DigitalGameState,
  playerIndex: 0 | 1,
  attackerInstanceId: string,
  cardsById: Map<string, EngineCard>,
): DigitalGameState {
  requireInProgress(state);
  requireTurn(state, playerIndex);

  const defenderIndex = opponentIndex(playerIndex);
  const attackerPlayer = state.players[playerIndex];
  const defenderPlayer = state.players[defenderIndex];

  const attackerInstance = findCardInstance(attackerPlayer.battlefield, attackerInstanceId);
  if (!attackerInstance) {
    throw new IllegalActionError("That Item isn't on your battlefield.");
  }
  if (attackerInstance.tired) {
    throw new IllegalActionError("That Item is tired and can't attack.");
  }

  const attackerCard = requireCard(cardsById, attackerInstance.cardId);
  const attack = getEffectiveStat(attackerInstance, attackerCard, "attack");
  const attackerSpeed = getEffectiveStat(attackerInstance, attackerCard, "speed");

  let bestDefenderInstance: CardInstance | null = null;
  let bestDefenderCard: EngineCard | null = null;
  let bestDefenderValue = -Infinity;
  for (const instance of defenderPlayer.battlefield) {
    if (instance.tired) continue;
    const card = requireCard(cardsById, instance.cardId);
    const defence = getEffectiveStat(instance, card, "defence");
    if (defence > bestDefenderValue) {
      bestDefenderInstance = instance;
      bestDefenderCard = card;
      bestDefenderValue = defence;
    }
  }

  let damage = attack;
  let logSuffix = "unopposed";
  if (bestDefenderInstance && bestDefenderCard) {
    const defenderSpeed = getEffectiveStat(bestDefenderInstance, bestDefenderCard, "speed");
    if (defenderSpeed >= attackerSpeed) {
      damage = Math.max(0, attack - getEffectiveStat(bestDefenderInstance, bestDefenderCard, "defence"));
      logSuffix = `defended by ${bestDefenderCard.id} (won speed check)`;
    } else {
      logSuffix = `defender too slow — attack went through unmitigated`;
    }
  }

  state = updatePlayer(state, playerIndex, (p) => ({
    ...p,
    battlefield: p.battlefield.map((c) => (c.instanceId === attackerInstanceId ? { ...c, tired: true } : c)),
  }));

  state = {
    ...state,
    log: [
      ...state.log,
      `${describePlayer(playerIndex)} attacked with ${attackerCard.id} for ${damage} damage (${logSuffix}).`,
    ],
  };

  // "When Bio Worm attacks, ..." — self-only, checked before damage so a
  // damage-caused KO can't skip it, matching "attack declared" timing.
  state = resolveAbilities(state, playerIndex, attackerCard.slug, "ATTACK_STARTED", cardsById, attackerInstanceId, 0);
  if (state.phase === "COMPLETE") return state;

  state = dealDamageWithTrigger(state, defenderIndex, damage, playerIndex, cardsById, 0);
  return state;
}

export function endTurn(
  state: DigitalGameState,
  cardsById: Map<string, EngineCard> = new Map(),
): DigitalGameState {
  requireInProgress(state);

  const endingIndex = state.activePlayerIndex;
  const nextIndex = opponentIndex(endingIndex);

  state = updatePlayer(state, endingIndex, (p) => ({
    ...p,
    itemsPlayedThisTurn: 0,
    spellsPlayedThisTurn: 0,
    extraPlaysThisTurn: 0,
    unlimitedSpellsThisTurn: false,
    damagePreventedThisTurn: false,
    spellsPlayableFromDiscardThisTurn: false,
    battlefield: p.battlefield.map((c) => ({ ...c, activationsThisTurn: 0 })),
  }));

  state = updatePlayer(state, nextIndex, (p) => ({
    ...p,
    battlefield: p.battlefield.map((c) => ({ ...c, tired: false })),
    handRevealedToOpponent: false,
  }));

  state = {
    ...state,
    activePlayerIndex: nextIndex,
    turnNumber: state.turnNumber + 1,
    log: [...state.log, `Turn ended. ${describePlayer(nextIndex)}'s turn.`],
  };
  state = drawWithTrigger(state, nextIndex, cardsById, 0);
  return state;
}

export function concede(state: DigitalGameState, playerIndex: 0 | 1): DigitalGameState {
  requireInProgress(state);
  return {
    ...state,
    phase: "COMPLETE",
    winnerIndex: opponentIndex(playerIndex),
    log: [...state.log, `${describePlayer(playerIndex)} conceded.`],
  };
}

// "Time Bomb: ... Remove 10 charge counters: Win the game." A player-
// CHOSEN activated ability, not a trigger, so it's its own action rather
// than a CARD_ABILITIES entry — same reasoning as Detention/Biologist.
export function activateTimeBomb(
  state: DigitalGameState,
  playerIndex: 0 | 1,
  instanceId: string,
  cardsById: Map<string, EngineCard>,
): DigitalGameState {
  requireInProgress(state);
  requireTurn(state, playerIndex);

  const instance = findCardInstance(state.players[playerIndex].battlefield, instanceId);
  if (!instance) throw new IllegalActionError("That Item isn't on your battlefield.");
  const card = requireCard(cardsById, instance.cardId);
  if (card.slug !== "time-bomb") throw new IllegalActionError("That card has no activatable ability.");
  if ((instance.charges ?? 0) < 10) throw new IllegalActionError("Not enough charge counters yet.");

  return {
    ...state,
    phase: "COMPLETE",
    winnerIndex: playerIndex,
    log: [...state.log, `${describePlayer(playerIndex)} removed 10 charge counters from Time Bomb and won the game.`],
  };
}

// "Star Drop: Discard a card: Draw a card. Activate this ability only
// twice each turn." A player-CHOSEN activated ability with no trigger half
// at all — see the comment in abilities.ts. "Discard a card" has no
// picker UI yet, so it's auto-resolved to a random card from hand, the
// same policy as every other undirected discard effect in this engine.
export function activateStarDrop(
  state: DigitalGameState,
  playerIndex: 0 | 1,
  instanceId: string,
  cardsById: Map<string, EngineCard>,
  random: () => number = Math.random,
): DigitalGameState {
  requireInProgress(state);
  requireTurn(state, playerIndex);

  const instance = findCardInstance(state.players[playerIndex].battlefield, instanceId);
  if (!instance) throw new IllegalActionError("That card isn't on your battlefield.");
  const card = requireCard(cardsById, instance.cardId);
  if (card.slug !== "star-drop") throw new IllegalActionError("That card has no activatable ability.");
  if ((instance.activationsThisTurn ?? 0) >= 2) {
    throw new IllegalActionError("Star Drop's ability can only be activated twice each turn.");
  }
  const hand = state.players[playerIndex].hand;
  if (hand.length === 0) throw new IllegalActionError("You have no cards to discard.");

  const discarded = hand[Math.floor(random() * hand.length)];
  state = updatePlayer(state, playerIndex, (p) => ({
    ...p,
    hand: removeFromZone(p.hand, discarded.instanceId),
    discard: [...p.discard, discarded],
    battlefield: p.battlefield.map((c) =>
      c.instanceId === instanceId ? { ...c, activationsThisTurn: (c.activationsThisTurn ?? 0) + 1 } : c,
    ),
  }));
  state = afterMoveToDiscard(state, playerIndex, discarded, cardsById, 0);
  state = drawWithTrigger(state, playerIndex, cardsById, 0);
  return state;
}

// ---------------------------------------------------------------------------
// Legal-action introspection
// ---------------------------------------------------------------------------

export type LegalAction =
  | { type: "PLAY_ITEM"; instanceId: string }
  | { type: "PLAY_SPELL"; instanceId: string }
  | { type: "ATTACK"; instanceId: string }
  | { type: "ACTIVATE_TIME_BOMB"; instanceId: string }
  | { type: "ACTIVATE_STAR_DROP"; instanceId: string }
  | { type: "END_TURN" };

export function getLegalActions(
  state: DigitalGameState,
  playerIndex: 0 | 1,
  cardsById: Map<string, EngineCard>,
): LegalAction[] {
  if (state.phase === "COMPLETE" || state.activePlayerIndex !== playerIndex) return [];

  const player = state.players[playerIndex];
  const actions: LegalAction[] = [];

  const hasBiologist = player.battlefield.some((c) => cardsById.get(c.cardId)?.slug === "biologist");
  const itemLimit = 1 + (hasBiologist ? 1 : 0);
  const canPlayItem = player.itemsPlayedThisTurn < itemLimit || player.extraPlaysThisTurn > 0;
  const canPlaySpell =
    player.unlimitedSpellsThisTurn || player.spellsPlayedThisTurn < 1 || player.extraPlaysThisTurn > 0;

  if (canPlayItem) {
    for (const c of player.hand) {
      const cardType = requireCard(cardsById, c.cardId).type;
      if (isPlayableAsItem(cardType) && !(cardType === "Item" && state.itemsLockedForRestOfGame)) {
        actions.push({ type: "PLAY_ITEM", instanceId: c.instanceId });
      }
    }
  }
  if (canPlaySpell) {
    for (const c of player.hand) {
      if (requireCard(cardsById, c.cardId).type === "Spell" && !state.spellsLockedForRestOfGame) {
        actions.push({ type: "PLAY_SPELL", instanceId: c.instanceId });
      }
    }
  }
  // Art's discard-cast allowance is exempt from the normal per-turn Spell
  // limit entirely (see playCard's `fromDiscard` branch), so it's listed
  // regardless of canPlaySpell.
  if (player.spellsPlayableFromDiscardThisTurn && !state.spellsLockedForRestOfGame) {
    for (const c of player.discard) {
      if (cardsById.get(c.cardId)?.type === "Spell") {
        actions.push({ type: "PLAY_SPELL", instanceId: c.instanceId });
      }
    }
  }
  for (const c of player.battlefield) {
    if (!c.tired) actions.push({ type: "ATTACK", instanceId: c.instanceId });
    if (cardsById.get(c.cardId)?.slug === "time-bomb" && (c.charges ?? 0) >= 10) {
      actions.push({ type: "ACTIVATE_TIME_BOMB", instanceId: c.instanceId });
    }
    if (
      cardsById.get(c.cardId)?.slug === "star-drop" &&
      (c.activationsThisTurn ?? 0) < 2 &&
      player.hand.length > 0
    ) {
      actions.push({ type: "ACTIVATE_STAR_DROP", instanceId: c.instanceId });
    }
  }
  actions.push({ type: "END_TURN" });
  return actions;
}

// ---------------------------------------------------------------------------
// Hidden-information redaction — the ONLY shape ever sent to a browser.
// ---------------------------------------------------------------------------

export type RedactedCardInstance = CardInstance | { instanceId: string; hidden: true };

export type VisiblePlayerState = Omit<PlayerGameState, "deck" | "hand"> & {
  deckCount: number;
  hand: RedactedCardInstance[];
};

export type VisibleGameState = Omit<DigitalGameState, "players"> & {
  players: [VisiblePlayerState, VisiblePlayerState];
  viewerIndex: 0 | 1;
};

export function getVisibleState(state: DigitalGameState, viewerIndex: 0 | 1): VisibleGameState {
  const redact = (p: PlayerGameState, isViewer: boolean): VisiblePlayerState => ({
    userId: p.userId,
    health: p.health,
    spriteInstanceId: p.spriteInstanceId,
    deckCount: p.deck.length,
    // School Computers: a hand this player has revealed to their opponent
    // is genuinely visible, not just "counted" like a normal opponent hand.
    hand:
      isViewer || p.handRevealedToOpponent
        ? p.hand
        : p.hand.map((c) => ({ instanceId: c.instanceId, hidden: true as const })),
    battlefield: p.battlefield,
    discard: p.discard,
    itemsPlayedThisTurn: p.itemsPlayedThisTurn,
    spellsPlayedThisTurn: p.spellsPlayedThisTurn,
    extraPlaysThisTurn: p.extraPlaysThisTurn,
    unlimitedSpellsThisTurn: p.unlimitedSpellsThisTurn,
    damagePreventedThisTurn: p.damagePreventedThisTurn,
    spellsPlayableFromDiscardThisTurn: p.spellsPlayableFromDiscardThisTurn,
    handRevealedToOpponent: p.handRevealedToOpponent,
  });

  return {
    matchId: state.matchId,
    formatId: state.formatId,
    turnNumber: state.turnNumber,
    activePlayerIndex: state.activePlayerIndex,
    phase: state.phase,
    log: state.log,
    winnerIndex: state.winnerIndex,
    itemsLockedForRestOfGame: state.itemsLockedForRestOfGame,
    spellsLockedForRestOfGame: state.spellsLockedForRestOfGame,
    viewerIndex,
    players: [redact(state.players[0], viewerIndex === 0), redact(state.players[1], viewerIndex === 1)],
  };
}
