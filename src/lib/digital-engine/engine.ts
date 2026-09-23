import {
  IllegalActionError,
  type CardInstance,
  type DigitalGameState,
  type EngineCard,
  type PendingCombat,
  type PlayerGameState,
  type StatBuffs,
} from "./types";
import {
  getCardAbilities,
  getRequiredTarget,
  type AbilitySpec,
  type EffectSpec,
  type GameEvent,
  type TargetRequirement,
} from "./abilities";
import { getEquippedSprite, getSpriteTopicBonus, type SpriteEngineData } from "./sprite-abilities";

// ---------------------------------------------------------------------------
// Combat resolution — PROVISIONAL, see final report.
// ---------------------------------------------------------------------------
// The existing NS TCG Rules page names a turn structure (Draw, remove tired
// counters, Play cards, Attacks, Speed check, Defenders, Damage, Attackers
// gain tired counters) and defines Attack/Defence/Speed/Health stats, but
// does NOT specify anywhere in the codebase the exact formula for how those
// stats resolve into damage — nor exactly what causes an Item to become
// Tired beyond the turn-order step names, nor exactly how a defender is
// declared. Rather than block on that, this engine implements one concrete,
// internally-consistent reading of those named steps:
//   - An attack always targets the opponent's health (Items have no
//     separate "health"/toughness field in the schema — only Attack/
//     Defence/Speed — so nothing is ever "destroyed" in combat, except via
//     the separate PROVISIONAL damage-to-Item rule documented in
//     abilities.ts).
//   - Tired: an Item becomes Tired the moment it's declared as an attacker
//     ("Attackers gain tired counters" — the last turn-order step) and
//     stays Tired until the start of ITS CONTROLLER'S OWN next turn
//     ("Remove tired counters" — the first turn-order step), matching the
//     turn order exactly. A Tired Item cannot attack and cannot be chosen
//     as a defender.
//   - Defending is a real, player-chosen action (see PendingCombat /
//     resolveDefense below) — the defending player picks any ONE of their
//     untired battlefield Items, or explicitly takes the attack
//     undefended. If they have no untired Item at all, there's no
//     meaningful choice and the attack resolves as unopposed immediately.
//   - Speed check: if the chosen defender's Speed >= the attacker's Speed,
//     the defence applies and damage = max(0, attack - defence). Otherwise
//     the defender is "too slow" and the full Attack goes through
//     unmitigated (same outcome as not defending at all).
// This needs confirming/correcting against the real designed rules —
// flagged explicitly, not silently assumed to be canonical.

// Recursion-depth SAFETY NET ONLY — not a gameplay limiter. It exists
// purely to bound the JS call stack in case some future card creates a
// truly unbounded cycle (one with no finite resource backing it). It must
// NEVER be small enough to cut off a legitimate, self-limiting combo before
// it reaches its own natural stopping point.
//
// The canonical example: Mountain Mist ("whenever you draw, deal 30
// damage") + Cutlary ("whenever you deal 30+ damage, draw a card") chain
// indefinitely on paper, but every real playout is bounded by the
// controller's own deck size — drawWithTrigger is a no-op on an empty
// deck (no CARD_DRAWN dispatch fires), so the chain always terminates on
// its own once the deck runs out, or sooner if the opponent reaches 0
// health first (checkWin short-circuits further dispatch immediately).
// Real NS TCG decks are nowhere near large enough to approach this bound
// (each full draw/damage/draw cycle costs ~2 depth units), so this value
// is chosen to comfortably outlast any realistic deck while still being
// small enough to protect the server's call stack from a genuinely
// unbounded loop.
const MAX_TRIGGER_DEPTH = 2000;
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

// Combat-specific stat lookup: base + card buffs (getEffectiveStat) PLUS
// the owning player's equipped Sprite's passive bonus for that same stat,
// if any is implemented (see sprite-abilities.ts). Deliberately scoped to
// combat math only (declareAttack/resolveDefense/previewDefenseDamage) —
// the older auto-targeting heuristics (pickStrongestItem etc.) still use
// plain getEffectiveStat, unaffected by equipped Sprites.
function combatStat(
  state: DigitalGameState,
  ownerIndex: 0 | 1,
  instance: CardInstance,
  card: EngineCard,
  stat: "attack" | "defence" | "speed",
  spritesById: Map<string, SpriteEngineData>,
): number {
  const sprite = getEquippedSprite(state.players[ownerIndex].spriteInstanceId, spritesById);
  return getEffectiveStat(instance, card, stat) + getSpriteTopicBonus(sprite, stat);
}

// One shared damage-math implementation for both the real resolution
// (resolveDefense / declareAttack's unopposed fast-path) and the bot's
// preview (previewDefenseDamage), so they can never drift apart.
function computeDamage(
  attack: number,
  attackerSpeed: number,
  defender: { speed: number; defence: number; cardId: string } | null,
): { damage: number; logSuffix: string } {
  if (!defender) return { damage: attack, logSuffix: "unopposed" };
  if (defender.speed >= attackerSpeed) {
    return {
      damage: Math.max(0, attack - defender.defence),
      logSuffix: `defended by ${defender.cardId} (won speed check)`,
    };
  }
  return { damage: attack, logSuffix: "defender too slow — attack went through unmitigated" };
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

// While an attack is awaiting a defender, the ATTACKING player (who is
// still nominally "on turn" per activePlayerIndex) must not be able to do
// anything else — playing cards, attacking again, or ending the turn.
// The defending player is separately blocked from these same actions by
// requireTurn, since it's never their turn while this is true.
function requireNoPendingCombat(state: DigitalGameState) {
  if (state.pendingCombat) {
    throw new IllegalActionError("Resolve the pending attack first.");
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
    pendingCombat: null,
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

// Raw draw (Detention check + actually shifting a card, no dispatch) —
// shared by drawWithTrigger (the recursive-context entry point) and
// applyEffect's DRAW case when running inside dispatchEvent's iterative
// queue (see EffectRunCtx.enqueue), so both paths apply the exact same
// draw semantics.
function performRawDraw(
  state: DigitalGameState,
  playerIndex: 0 | 1,
  cardsById: Map<string, EngineCard>,
): { state: DigitalGameState; drew: boolean } {
  if (isDetentionInPlay(state, cardsById)) return { state, drew: false };
  const before = state.players[playerIndex].deck.length;
  state = drawCardRaw(state, playerIndex);
  return { state, drew: state.players[playerIndex].deck.length !== before };
}

// Raw damage (Fire Sprite bonus + prevention + health update + win check,
// no dispatch) — same sharing principle as performRawDraw, for
// dealDamageWithTrigger and applyEffect's DAMAGE case.
function performRawDamage(
  state: DigitalGameState,
  targetIndex: 0 | 1,
  amount: number,
  dealtByIndex: 0 | 1,
  spritesById: Map<string, SpriteEngineData>,
): { state: DigitalGameState; actualAmount: number } {
  // Fire Sprite: "If you would deal damage to an opponent, deal an
  // additional 10/20 damage." Only applies when dealing damage to the
  // OPPONENT (not self-inflicted effects), matching the real text exactly.
  const dealerSprite = getEquippedSprite(state.players[dealtByIndex].spriteInstanceId, spritesById);
  const boostedAmount =
    targetIndex !== dealtByIndex ? amount + getSpriteTopicBonus(dealerSprite, "damageDealt") : amount;

  if (boostedAmount !== amount) {
    state = {
      ...state,
      log: [...state.log, `${describePlayer(dealtByIndex)}'s Fire Sprite adds ${boostedAmount - amount} damage.`],
    };
  }

  const target = state.players[targetIndex];
  const actualAmount = target.damagePreventedThisTurn ? 0 : boostedAmount;
  state = updatePlayer(state, targetIndex, (p) => ({ ...p, health: p.health - actualAmount }));
  state = checkWin(state);
  return { state, actualAmount };
}

function drawWithTrigger(
  state: DigitalGameState,
  playerIndex: 0 | 1,
  cardsById: Map<string, EngineCard>,
  depth: number,
  spritesById: Map<string, SpriteEngineData> = new Map(),
): DigitalGameState {
  const { state: next, drew } = performRawDraw(state, playerIndex, cardsById);
  if (!drew) return next;
  return dispatchEvent(next, "CARD_DRAWN", { drawingPlayerIndex: playerIndex }, cardsById, depth + 1, spritesById);
}

function dealDamageWithTrigger(
  state: DigitalGameState,
  targetIndex: 0 | 1,
  amount: number,
  dealtByIndex: 0 | 1,
  cardsById: Map<string, EngineCard>,
  depth: number,
  spritesById: Map<string, SpriteEngineData> = new Map(),
): DigitalGameState {
  const { state: next, actualAmount } = performRawDamage(state, targetIndex, amount, dealtByIndex, spritesById);
  if (next.phase === "COMPLETE" || actualAmount <= 0) return next;
  return dispatchEvent(
    next,
    "DAMAGE_DEALT",
    { dealtByPlayerIndex: dealtByIndex, amount: actualAmount },
    cardsById,
    depth + 1,
    spritesById,
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
  spritesById: Map<string, SpriteEngineData> = new Map(),
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
      spritesById,
    );
  }
  if (depth < MAX_TRIGGER_DEPTH) {
    state = dispatchEvent(
      state,
      "ITEM_ENTERED",
      { enteredInstanceId: instance.instanceId },
      cardsById,
      depth + 1,
      spritesById,
    );
  }
  return state;
}

// ---------------------------------------------------------------------------
// Effect execution
// ---------------------------------------------------------------------------

type EventPayload = {
  drawingPlayerIndex?: 0 | 1;
  dealtByPlayerIndex?: 0 | 1;
  amount?: number;
  enteredInstanceId?: string;
  playerIndex?: 0 | 1;
};

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
  spritesById: Map<string, SpriteEngineData>;
  /** Set ONLY when this effect is running inside dispatchEvent's own
   *  iterative queue (i.e. it's itself a reaction to some other event).
   *  When present, a DRAW/DAMAGE effect that actually draws/deals damage
   *  pushes the resulting CARD_DRAWN/DAMAGE_DEALT event onto that SAME
   *  queue instead of recursively calling dispatchEvent again — this is
   *  what lets a long chain (Mountain Mist + Cutlary combo-ing off each
   *  other for as many cycles as the deck allows) run as a flat loop
   *  instead of nested recursion, so it can never overflow the call
   *  stack no matter how long the deck lets it run. When absent (the
   *  ON_PLAY / CARD_DISCARDED / ATTACK_STARTED resolution paths, which
   *  aren't themselves inside that queue), DRAW/DAMAGE fall back to the
   *  normal recursive drawWithTrigger/dealDamageWithTrigger — those are
   *  each still just ONE call deep from here (dispatchEvent's own queue
   *  absorbs everything past that), so this stays shallow either way. */
  enqueue?: (event: GameEvent, payload: EventPayload) => void;
};

// Applies damage, then either enqueues the resulting DAMAGE_DEALT (when
// running inside dispatchEvent's iterative queue — see EffectRunCtx.enqueue)
// or falls back to the normal recursive dealDamageWithTrigger.
function dealDamageMaybeEnqueue(
  state: DigitalGameState,
  targetIndex: 0 | 1,
  amount: number,
  dealtByIndex: 0 | 1,
  cardsById: Map<string, EngineCard>,
  depth: number,
  ctx: EffectRunCtx,
): DigitalGameState {
  if (ctx.enqueue) {
    const { state: next, actualAmount } = performRawDamage(state, targetIndex, amount, dealtByIndex, ctx.spritesById);
    if (next.phase === "COMPLETE" || actualAmount <= 0) return next;
    ctx.enqueue("DAMAGE_DEALT", { dealtByPlayerIndex: dealtByIndex, amount: actualAmount });
    return next;
  }
  return dealDamageWithTrigger(state, targetIndex, amount, dealtByIndex, cardsById, depth, ctx.spritesById);
}

// Parses a "<prefix><id1>,<id2>,..." chosenTarget into its list of
// instanceIds, or undefined if chosenTarget doesn't start with that
// prefix at all (meaning: no real choice was made — the caller should
// fall back to its own auto-heuristic). Shared by every discard-picker
// effect (RETURN_TO_HAND, RETURN_TO_PLAY's SELF_DISCARD default,
// CAST_FROM_DISCARD) so they all parse the "discard:" prefix identically.
function parseChosenInstanceIds(chosenTarget: string | undefined, prefix: string): string[] | undefined {
  if (!chosenTarget?.startsWith(prefix)) return undefined;
  return chosenTarget.slice(prefix.length).split(",").filter(Boolean);
}

// Where a SEARCH_DECK effect's found card ends up — shared by applyEffect
// (to decide the actual placement) and getSearchableDeckItemsAction (to
// decide, BEFORE the player picks, which cards in the deck are even legal
// choices — Item-only for a battlefield placement, since only Items can be
// battlefield permanents here). Exported so the server action can mirror
// this exactly rather than re-deriving it.
export function resolveSearchDeckDestination(
  effect: Pick<EffectSpec, "destination" | "conditionThreshold">,
  state: DigitalGameState,
  controllerIndex: 0 | 1,
  cardsById: Map<string, EngineCard>,
): "BATTLEFIELD" | "HAND" {
  if (effect.destination === "HAND") return "HAND";
  if (effect.destination === "CONDITIONAL_ON_DISCARD_SPELLS") {
    const threshold = effect.conditionThreshold ?? 0;
    const spellsInDiscard = state.players[controllerIndex].discard.filter(
      (c) => cardsById.get(c.cardId)?.type === "Spell",
    ).length;
    return spellsInDiscard >= threshold ? "BATTLEFIELD" : "HAND";
  }
  return "BATTLEFIELD";
}

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
        if (ctx.enqueue) {
          const { state: next, drew } = performRawDraw(state, targetIndex, cardsById);
          state = next;
          if (drew) ctx.enqueue("CARD_DRAWN", { drawingPlayerIndex: targetIndex });
        } else {
          state = drawWithTrigger(state, targetIndex, cardsById, depth, ctx.spritesById);
        }
      }
      return { state, resolvedTarget: null };
    }

    case "DAMAGE": {
      if (effect.target === "ANY_TARGET") {
        const chosen = ctx.chosenTarget;
        if (chosen?.startsWith("player:")) {
          const targetIndex = chosen === "player:0" ? 0 : 1;
          state = dealDamageMaybeEnqueue(state, targetIndex, amount, controllerIndex, cardsById, depth, ctx);
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
              state = afterMoveToDiscard(state, found.ownerIndex, found.instance, cardsById, depth, ctx.spritesById);
            }
            return { state, resolvedTarget: chosen };
          }
        }
        // No (valid) chosen target — bot/fallback path, same as before this feature existed.
        state = dealDamageMaybeEnqueue(state, opponentIdx, amount, controllerIndex, cardsById, depth, ctx);
        return { state, resolvedTarget: null };
      }
      const targetIndex = effect.target === "SELF" ? controllerIndex : opponentIdx;
      state = dealDamageMaybeEnqueue(state, targetIndex, amount, controllerIndex, cardsById, depth, ctx);
      return { state, resolvedTarget: null };
    }

    // Angel Sprite: "Whenever you gain Health, gain an additional 10/20
    // Health." Only the controller's OWN Health gain is boosted — a Spell
    // that gives the opponent health (none currently do) wouldn't get it.
    case "GAIN_HEALTH": {
      const targetIndex = effect.target === "OPPONENT" ? opponentIdx : controllerIndex;
      const gainerSprite =
        targetIndex === controllerIndex
          ? getEquippedSprite(state.players[controllerIndex].spriteInstanceId, ctx.spritesById)
          : undefined;
      const boostedAmount = amount + getSpriteTopicBonus(gainerSprite, "healthGained");
      state = updatePlayer(state, targetIndex, (p) => ({ ...p, health: p.health + boostedAmount }));
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
        state = afterMoveToDiscard(state, targetIndex, instance, cardsById, depth, ctx.spritesById);
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
      state = afterMoveToDiscard(state, found.ownerIndex, found.instance, cardsById, depth, ctx.spritesById);
      return { state, resolvedTarget: found.instance.instanceId };
    }

    case "RETURN_TO_HAND": {
      const targetIndex = controllerIndex; // only used from own discard in this pass
      const discard = state.players[targetIndex].discard;
      // A human gets a real discard-picker (getRequiredTarget's
      // DISCARD_CARD kind) — "discard:<id1>,<id2>,..." is that choice,
      // validated against this exact discard pile and capped at `amount`
      // before trusting it. Falls back to "most recently discarded" (the
      // old heuristic) for the Bot, or if the choice is missing/stale.
      const chosenIds = parseChosenInstanceIds(ctx.chosenTarget, "discard:");
      const chosenPicked = chosenIds
        ? chosenIds
            .slice(0, amount)
            .map((id) => discard.find((c) => c.instanceId === id))
            .filter((c): c is CardInstance => c !== undefined)
        : undefined;
      const picked = chosenPicked && chosenPicked.length > 0 ? chosenPicked : discard.slice(-Math.min(amount, discard.length));
      const pickedIds = new Set(picked.map((c) => c.instanceId));
      state = updatePlayer(state, targetIndex, (p) => ({
        ...p,
        discard: p.discard.filter((c) => !pickedIds.has(c.instanceId)),
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
            state = enterBattlefield(state, ownerIndex, instance, cardsById, depth, undefined, ctx.spritesById);
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
        state = enterBattlefield(state, controllerIndex, instance, cardsById, depth, undefined, ctx.spritesById);
        return { state, resolvedTarget: instance.instanceId };
      }
      if (effect.target === "SELF_HAND_ITEM") {
        const hand = state.players[controllerIndex].hand;
        const items = hand.filter((c) => cardsById.get(c.cardId)?.type === "Item");
        const n = Math.min(amount, items.length);
        for (let i = 0; i < n; i++) {
          const instance = items[i];
          state = updatePlayer(state, controllerIndex, (p) => ({ ...p, hand: removeFromZone(p.hand, instance.instanceId) }));
          state = enterBattlefield(state, controllerIndex, instance, cardsById, depth, undefined, ctx.spritesById);
        }
        return { state, resolvedTarget: null };
      }
      // Default: SELF_DISCARD — an Item from own discard. A human gets a
      // real discard-picker (DISCARD_CARD); falls back to "first Item
      // found" for the Bot or a missing/stale choice.
      const discard = state.players[controllerIndex].discard;
      const chosenDiscardId = parseChosenInstanceIds(ctx.chosenTarget, "discard:")?.[0];
      const chosenItem = chosenDiscardId
        ? discard.find((c) => c.instanceId === chosenDiscardId && cardsById.get(c.cardId)?.type === "Item")
        : undefined;
      const item = chosenItem ?? discard.find((c) => cardsById.get(c.cardId)?.type === "Item");
      if (!item) return { state, resolvedTarget: null };
      state = updatePlayer(state, controllerIndex, (p) => ({ ...p, discard: removeFromZone(p.discard, item.instanceId) }));
      state = enterBattlefield(state, controllerIndex, item, cardsById, depth, undefined, ctx.spritesById);
      return { state, resolvedTarget: item.instanceId };
    }

    // Used by School ("search your deck for an Item, put it under your
    // control" — clarified to mean directly onto the battlefield),
    // Cathedral Pergrines ("search your deck for any Item and put it onto
    // the battlefield under your control"), and Budge ("search your
    // library for a card, then put it into your hand unless you have 3+
    // Spells in your discard, in which case put it into play instead").
    case "SEARCH_DECK": {
      const deck = state.players[controllerIndex].deck;
      const destination = resolveSearchDeckDestination(effect, state, controllerIndex, cardsById);
      const itemsOnly = destination === "BATTLEFIELD"; // only Items can be battlefield permanents
      const matchesFilter = (c: CardInstance) => !itemsOnly || cardsById.get(c.cardId)?.type === "Item";
      // A human gets a real search-your-deck picker (see getRequiredTarget's
      // DECK_ITEM kind) — "deck:<instanceId>" is that choice, validated
      // against the SAME filter the picker itself used server-side before
      // trusting it; falls back to the first legal card found in the deck
      // for the Bot, or if the choice is somehow stale.
      const chosenInstanceId = ctx.chosenTarget?.startsWith("deck:") ? ctx.chosenTarget.slice(5) : undefined;
      const chosen = chosenInstanceId
        ? deck.find((c) => c.instanceId === chosenInstanceId && matchesFilter(c))
        : undefined;
      const found = chosen ?? deck.find(matchesFilter);
      if (!found) return { state, resolvedTarget: null };
      const rest = shuffle(removeFromZone(deck, found.instanceId), ctx.random);
      state = updatePlayer(state, controllerIndex, (p) => ({ ...p, deck: rest }));
      if (destination === "BATTLEFIELD") {
        state = enterBattlefield(state, controllerIndex, found, cardsById, depth, undefined, ctx.spritesById);
      } else {
        state = updatePlayer(state, controllerIndex, (p) => ({ ...p, hand: [...p.hand, found] }));
      }
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
        state = enterBattlefield(state, controllerIndex, best.instance, cardsById, depth, undefined, ctx.spritesById);
        return { state, resolvedTarget: best.instance.instanceId };
      }
      const found = findItemForTarget(state, effect.target, controllerIndex, cardsById, ctx.chosenTarget);
      if (!found || found.ownerIndex === controllerIndex) return { state, resolvedTarget: null };
      state = updatePlayer(state, found.ownerIndex, (p) => ({
        ...p,
        battlefield: removeFromZone(p.battlefield, found.instance.instanceId),
      }));
      state = enterBattlefield(state, controllerIndex, found.instance, cardsById, depth, undefined, ctx.spritesById);
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
        state = afterMoveToDiscard(state, idx, weakest, cardsById, depth, ctx.spritesById);
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
      // A human gets a real discard-picker (DISCARD_CARD, filtered to
      // Spells); falls back to "most recently discarded Spell" for the
      // Bot or a missing/stale choice.
      const chosenSpellId = parseChosenInstanceIds(ctx.chosenTarget, "discard:")?.[0];
      const chosenSpell = chosenSpellId
        ? discard.find((c) => c.instanceId === chosenSpellId && cardsById.get(c.cardId)?.type === "Spell")
        : undefined;
      const spell = chosenSpell ?? [...discard].reverse().find((c) => cardsById.get(c.cardId)?.type === "Spell");
      if (!spell) return { state, resolvedTarget: null };
      const spellCard = cardsById.get(spell.cardId);
      if (!spellCard) return { state, resolvedTarget: null };
      state = updatePlayer(state, controllerIndex, (p) => ({ ...p, discard: removeFromZone(p.discard, spell.instanceId) }));
      state = resolveAbilities(
        state,
        controllerIndex,
        spellCard.slug,
        "ON_PLAY",
        cardsById,
        spell.instanceId,
        depth,
        ctx.random,
        undefined,
        ctx.spritesById,
      );
      if (state.phase === "COMPLETE") return { state, resolvedTarget: spell.instanceId };
      state = updatePlayer(state, controllerIndex, (p) => ({ ...p, discard: [...p.discard, spell] }));
      state = afterMoveToDiscard(state, controllerIndex, spell, cardsById, depth, ctx.spritesById);
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
  spritesById: Map<string, SpriteEngineData> = new Map(),
): DigitalGameState {
  if (depth >= MAX_TRIGGER_DEPTH) return state;
  const card = cardsById.get(instance.cardId);
  if (!card) return state;
  return resolveAbilities(
    state,
    ownerIndex,
    card.slug,
    "CARD_DISCARDED",
    cardsById,
    instance.instanceId,
    depth + 1,
    Math.random,
    undefined,
    spritesById,
  );
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
  spritesById: Map<string, SpriteEngineData> = new Map(),
): DigitalGameState {
  if (depth >= MAX_TRIGGER_DEPTH) return state;
  const abilities = getCardAbilities(cardSlug).filter((a) => a.trigger === trigger);
  for (const ability of abilities) {
    // ON_PLAY is already narrated by the "played Item/Spell" log line from
    // playCard — only genuinely reactive triggers get their own line here,
    // so the match log reads as a clear play-by-play of what fired and why
    // (helps a lot when it's the bot acting, since nothing else narrates
    // its turn as it happens).
    if (trigger !== "ON_PLAY") {
      state = { ...state, log: [...state.log, describeTrigger(controllerIndex, cardSlug, trigger, cardsById)] };
    }
    let previousTarget: string | null = null;
    for (const effect of ability.effects) {
      const result = applyEffect(
        state,
        effect,
        { controllerIndex, thisInstanceId, cardsById, depth, random, chosenTarget, spritesById },
        previousTarget,
      );
      state = result.state;
      if (result.resolvedTarget) previousTarget = result.resolvedTarget;
      if (state.phase === "COMPLETE") return state;
    }
  }
  return state;
}

// Human-readable line for a reactive ability firing — resolveAbilities and
// dispatchEvent both use this so the log narrates every trigger the same
// way, not just the handful of cards with a bespoke message. Looks the
// card up by slug (its only unique identity available at this call site)
// purely to log its real DB id — the client substitutes id -> name for
// display (see the battlefield UI's humanizeLog), same trick as every
// other log line here.
function describeTrigger(
  controllerIndex: 0 | 1,
  cardSlug: string,
  trigger: AbilitySpec["trigger"],
  cardsById: Map<string, EngineCard>,
): string {
  const card = Array.from(cardsById.values()).find((c) => c.slug === cardSlug);
  const label = card?.id ?? cardSlug;
  const triggerLabel = TRIGGER_LABELS[trigger] ?? trigger;
  return `${describePlayer(controllerIndex)}'s ${label} triggered (${triggerLabel}).`;
}

const TRIGGER_LABELS: Record<string, string> = {
  CARD_DRAWN: "on draw",
  CARD_DISCARDED: "on discard",
  DAMAGE_DEALT: "on damage dealt",
  ATTACK_STARTED: "on attack",
  ITEM_ENTERED: "an Item entered",
  ITEM_PLAYED: "an Item was played",
  SPELL_PLAYED: "a Spell was played",
  TURN_STARTED: "on turn start",
  TURN_ENDED: "on turn end",
};

// Board-wide dispatch for ongoing "whenever" triggers — scans every
// permanent already on either battlefield (for ITEM_ENTERED, excluding the
// instance that just entered) and fires any ability matching `event`,
// applying an optional amount-threshold condition (Cutlary's ">=30
// damage").
// Iterative, NOT recursive — this is what lets a long legitimate chain
// (Mountain Mist + Cutlary drawing/dealing damage off each other, for as
// many cycles as the controller's deck allows) run to its own natural
// conclusion (deck exhaustion, or a win) as a flat loop instead of nested
// function calls, so it can never overflow the JS call stack regardless of
// how long the chain runs. A DRAW/DAMAGE effect that fires while this loop
// is already draining (see EffectRunCtx.enqueue, passed to every applyEffect
// call below) pushes its resulting event onto the SAME queue rather than
// recursing back into dispatchEvent — the queue IS the recursion, made
// explicit and bounded by MAX_TRIGGER_DEPTH iterations (a stack-overflow
// safety net only, never a gameplay limiter — see that constant's comment).
function dispatchEvent(
  state: DigitalGameState,
  event: GameEvent,
  payload: EventPayload,
  cardsById: Map<string, EngineCard>,
  depth: number,
  spritesById: Map<string, SpriteEngineData> = new Map(),
): DigitalGameState {
  if (depth >= MAX_TRIGGER_DEPTH) return state;

  const queue: { event: GameEvent; payload: EventPayload }[] = [{ event, payload }];
  const enqueue = (e: GameEvent, p: EventPayload) => queue.push({ event: e, payload: p });
  let iterations = depth;

  while (queue.length > 0) {
    if (state.phase === "COMPLETE") return state;
    if (iterations >= MAX_TRIGGER_DEPTH) return state;
    iterations++;

    const current = queue.shift()!;
    for (const ownerIndex of [0, 1] as const) {
      for (const instance of state.players[ownerIndex].battlefield) {
        if (current.event === "ITEM_ENTERED" && instance.instanceId === current.payload.enteredInstanceId) continue;
        const card = cardsById.get(instance.cardId);
        if (!card) continue;
        const abilities = getCardAbilities(card.slug).filter((a) => a.trigger === current.event);
        for (const ability of abilities) {
          if (current.event === "CARD_DRAWN" && current.payload.drawingPlayerIndex !== ownerIndex) continue;
          if (current.event === "ITEM_PLAYED" && current.payload.playerIndex !== ownerIndex) continue;
          if (current.event === "SPELL_PLAYED" && current.payload.playerIndex !== ownerIndex) continue;
          if (current.event === "DAMAGE_DEALT") {
            if (current.payload.dealtByPlayerIndex !== ownerIndex) continue;
            const min = ability.condition?.minAmount;
            if (min !== undefined && (current.payload.amount ?? 0) < min) continue;
          }
          state = { ...state, log: [...state.log, describeTrigger(ownerIndex, card.slug, current.event, cardsById)] };
          let previousTarget: string | null = null;
          for (const effect of ability.effects) {
            const result = applyEffect(
              state,
              effect,
              {
                controllerIndex: ownerIndex,
                thisInstanceId: instance.instanceId,
                cardsById,
                depth: iterations,
                random: Math.random,
                spritesById,
                enqueue,
              },
              previousTarget,
            );
            state = result.state;
            if (result.resolvedTarget) previousTarget = result.resolvedTarget;
            if (state.phase === "COMPLETE") return state;
          }
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
  spritesById: Map<string, SpriteEngineData> = new Map(),
): DigitalGameState {
  requireInProgress(state);
  requireTurn(state, playerIndex);
  requireNoPendingCombat(state);

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
    // Water Sprite L5: "You may play 1 additional Spell each turn" — same
    // shape as Biologist's raised Item limit.
    const spriteSpellLimit =
      1 + getSpriteTopicBonus(getEquippedSprite(player.spriteInstanceId, spritesById), "extraSpellLimit");
    const unlimited = player.unlimitedSpellsThisTurn;
    const withinBaseLimit = player.spellsPlayedThisTurn < spriteSpellLimit;
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
    state = enterBattlefield(state, playerIndex, inHand, cardsById, 0, chosenTarget, spritesById);
    state = dispatchEvent(state, "ITEM_PLAYED", { playerIndex }, cardsById, 1, spritesById);
  } else {
    state = resolveAbilities(
      state,
      playerIndex,
      card.slug,
      "ON_PLAY",
      cardsById,
      inHand.instanceId,
      0,
      Math.random,
      chosenTarget,
      spritesById,
    );
    if (state.phase !== "COMPLETE") {
      state = updatePlayer(state, playerIndex, (p) => ({ ...p, discard: [...p.discard, inHand] }));
      state = afterMoveToDiscard(state, playerIndex, inHand, cardsById, 0, spritesById);
      state = dispatchEvent(state, "SPELL_PLAYED", { playerIndex }, cardsById, 1, spritesById);
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
  spritesById: Map<string, SpriteEngineData> = new Map(),
): DigitalGameState {
  return playCard(state, playerIndex, instanceId, cardsById, "Item", chosenTarget, spritesById);
}

export function playSpell(
  state: DigitalGameState,
  playerIndex: 0 | 1,
  instanceId: string,
  cardsById: Map<string, EngineCard>,
  chosenTarget?: string,
  spritesById: Map<string, SpriteEngineData> = new Map(),
): DigitalGameState {
  return playCard(state, playerIndex, instanceId, cardsById, "Spell", chosenTarget, spritesById);
}

export function declareAttack(
  state: DigitalGameState,
  playerIndex: 0 | 1,
  attackerInstanceId: string,
  cardsById: Map<string, EngineCard>,
  spritesById: Map<string, SpriteEngineData> = new Map(),
  chosenTarget?: string,
): DigitalGameState {
  requireInProgress(state);
  requireTurn(state, playerIndex);
  requireNoPendingCombat(state);

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

  // "Attackers gain tired counters" — the real turn-order's last combat
  // step, applied immediately on declaration (before the defender is even
  // chosen), matching what this replaces and the step's ordering relative
  // to "Defenders"/"Damage".
  state = updatePlayer(state, playerIndex, (p) => ({
    ...p,
    battlefield: p.battlefield.map((c) => (c.instanceId === attackerInstanceId ? { ...c, tired: true } : c)),
  }));
  state = {
    ...state,
    log: [...state.log, `${describePlayer(playerIndex)} attacked with ${attackerCard.id}.`],
  };

  // "When Bio Worm/Cathedral Pergrines/Budge attacks, ..." — self-only,
  // fires at declaration regardless of how the defender choice later
  // resolves. Cathedral Pergrines' Dive Bomb and Budge's tutor (both
  // SEARCH_DECK) get the same real search-your-deck picker School does —
  // `chosenTarget` ("deck:<id>") flows through here exactly like it does
  // for playItem/playSpell.
  state = resolveAbilities(
    state,
    playerIndex,
    attackerCard.slug,
    "ATTACK_STARTED",
    cardsById,
    attackerInstanceId,
    0,
    Math.random,
    chosenTarget,
    spritesById,
  );
  if (state.phase === "COMPLETE") return state;

  const legalDefenderInstanceIds = defenderPlayer.battlefield.filter((c) => !c.tired).map((c) => c.instanceId);

  if (legalDefenderInstanceIds.length === 0) {
    // No untired Item to possibly defend with — there's no meaningful
    // choice, so resolve immediately as unopposed rather than making the
    // defending player click through a pointless "no defender" step.
    const attack = combatStat(state, playerIndex, attackerInstance, attackerCard, "attack", spritesById);
    state = {
      ...state,
      log: [...state.log, `${describePlayer(defenderIndex)} has no untired Item to defend with — unopposed.`],
    };
    return dealDamageWithTrigger(state, defenderIndex, attack, playerIndex, cardsById, 0, spritesById);
  }

  return {
    ...state,
    pendingCombat: {
      attackerInstanceId,
      attackingPlayerIndex: playerIndex,
      defendingPlayerIndex: defenderIndex,
      legalDefenderInstanceIds,
    },
    log: [...state.log, `Awaiting ${describePlayer(defenderIndex)}'s defender.`],
  };
}

// The defending player's response to a PendingCombat: either the
// instanceId of one of their own untired battlefield Items, or null to
// explicitly take the attack undefended. Re-validates the choice against
// the LIVE battlefield (never trusts PendingCombat.legalDefenderInstanceIds
// alone), applies the same Speed-check/damage formula declareAttack used
// to use inline, then clears the pending state and lets play continue.
export function resolveDefense(
  state: DigitalGameState,
  playerIndex: 0 | 1,
  defenderInstanceId: string | null,
  cardsById: Map<string, EngineCard>,
  spritesById: Map<string, SpriteEngineData> = new Map(),
): DigitalGameState {
  requireInProgress(state);
  const pending = state.pendingCombat;
  if (!pending) throw new IllegalActionError("There is no attack awaiting a defender.");
  if (pending.defendingPlayerIndex !== playerIndex) {
    throw new IllegalActionError("You aren't the defending player for this attack.");
  }

  const attackerInstance = findCardInstance(
    state.players[pending.attackingPlayerIndex].battlefield,
    pending.attackerInstanceId,
  );
  if (!attackerInstance) {
    // Attacker is somehow gone (shouldn't happen — the attacker can't act
    // while a combat is pending) — nothing left to resolve.
    return { ...state, pendingCombat: null };
  }
  const attackerCard = requireCard(cardsById, attackerInstance.cardId);
  const attack = combatStat(state, pending.attackingPlayerIndex, attackerInstance, attackerCard, "attack", spritesById);
  const attackerSpeed = combatStat(
    state,
    pending.attackingPlayerIndex,
    attackerInstance,
    attackerCard,
    "speed",
    spritesById,
  );

  let defenderStats: { speed: number; defence: number; cardId: string } | null = null;
  if (defenderInstanceId !== null) {
    const instance = findCardInstance(state.players[playerIndex].battlefield, defenderInstanceId);
    if (!instance || instance.tired) {
      throw new IllegalActionError("That Item can't defend.");
    }
    const card = requireCard(cardsById, instance.cardId);
    defenderStats = {
      speed: combatStat(state, playerIndex, instance, card, "speed", spritesById),
      defence: combatStat(state, playerIndex, instance, card, "defence", spritesById),
      cardId: card.id,
    };
  }

  const { damage, logSuffix } = computeDamage(attack, attackerSpeed, defenderStats);

  state = {
    ...state,
    pendingCombat: null,
    log: [
      ...state.log,
      `${describePlayer(pending.attackingPlayerIndex)}'s attack resolved for ${damage} damage (${logSuffix}).`,
    ],
  };
  return dealDamageWithTrigger(state, playerIndex, damage, pending.attackingPlayerIndex, cardsById, 0, spritesById);
}

// Pure preview of what resolveDefense would deal for a given candidate
// defender (or null for "no defender") — used by the bot to pick the
// option that minimizes damage taken, without mutating state. Shares
// computeDamage with the real resolution so they can never disagree.
export function previewDefenseDamage(
  state: DigitalGameState,
  cardsById: Map<string, EngineCard>,
  spritesById: Map<string, SpriteEngineData>,
  defenderInstanceId: string | null,
): number {
  const pending = state.pendingCombat;
  if (!pending) return 0;
  const attackerInstance = findCardInstance(
    state.players[pending.attackingPlayerIndex].battlefield,
    pending.attackerInstanceId,
  );
  if (!attackerInstance) return 0;
  const attackerCard = requireCard(cardsById, attackerInstance.cardId);
  const attack = combatStat(state, pending.attackingPlayerIndex, attackerInstance, attackerCard, "attack", spritesById);
  const attackerSpeed = combatStat(
    state,
    pending.attackingPlayerIndex,
    attackerInstance,
    attackerCard,
    "speed",
    spritesById,
  );
  if (defenderInstanceId === null) return attack;

  const instance = findCardInstance(state.players[pending.defendingPlayerIndex].battlefield, defenderInstanceId);
  if (!instance) return attack;
  const card = requireCard(cardsById, instance.cardId);
  const { damage } = computeDamage(attack, attackerSpeed, {
    speed: combatStat(state, pending.defendingPlayerIndex, instance, card, "speed", spritesById),
    defence: combatStat(state, pending.defendingPlayerIndex, instance, card, "defence", spritesById),
    cardId: card.id,
  });
  return damage;
}

export function endTurn(
  state: DigitalGameState,
  cardsById: Map<string, EngineCard> = new Map(),
  spritesById: Map<string, SpriteEngineData> = new Map(),
): DigitalGameState {
  requireInProgress(state);
  requireNoPendingCombat(state);

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
  state = drawWithTrigger(state, nextIndex, cardsById, 0, spritesById);
  return state;
}

export function concede(state: DigitalGameState, playerIndex: 0 | 1): DigitalGameState {
  requireInProgress(state);
  return {
    ...state,
    phase: "COMPLETE",
    winnerIndex: opponentIndex(playerIndex),
    pendingCombat: null,
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
  requireNoPendingCombat(state);

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
  spritesById: Map<string, SpriteEngineData> = new Map(),
): DigitalGameState {
  requireInProgress(state);
  requireTurn(state, playerIndex);
  requireNoPendingCombat(state);

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
  state = afterMoveToDiscard(state, playerIndex, discarded, cardsById, 0, spritesById);
  state = drawWithTrigger(state, playerIndex, cardsById, 0, spritesById);
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
  | { type: "DEFEND"; instanceId: string }
  | { type: "NO_DEFENDER" }
  | { type: "END_TURN" };

// Every legal target for a given requirement, from `playerIndex`'s point of
// view — the SAME candidate set the battlefield UI highlights for a human
// to click, and what a Bot's decision-making checks before ever attempting
// a targeted play. Shared here so both stay in sync by construction. Takes
// only the minimal shape it needs (just each side's battlefield) so it
// works equally on the full authoritative DigitalGameState and the
// redacted VisibleGameState the client actually has.
export function getTargetCandidateIds(
  state: { players: readonly [{ battlefield: CardInstance[] }, { battlefield: CardInstance[] }] },
  playerIndex: 0 | 1,
  requirement: TargetRequirement,
): { playerTargetIds: string[]; itemInstanceIds: string[] } {
  // DECK_ITEM (School/Cathedral Pergrines) and DISCARD_CARD (Old Book,
  // Blast From The Past, Chemistry Lesson, Library) aren't battlefield/
  // player targets at all — they're resolved via their own dedicated
  // pickers ("deck:"/"discard:" chosenTarget prefixes in the relevant
  // effect cases below), not this function.
  if (!requirement || requirement.kind === "DECK_ITEM" || requirement.kind === "DISCARD_CARD") {
    return { playerTargetIds: [], itemInstanceIds: [] };
  }
  const opponentIdx = opponentIndex(playerIndex);
  const ownItemIds = state.players[playerIndex].battlefield.map((c) => c.instanceId);
  const oppItemIds = state.players[opponentIdx].battlefield.map((c) => c.instanceId);
  if (requirement.kind === "ANY_TARGET") {
    return {
      playerTargetIds: [`player:${playerIndex}`, `player:${opponentIdx}`],
      itemInstanceIds: [...ownItemIds, ...oppItemIds],
    };
  }
  if (requirement.scope === "OWN_ITEM") return { playerTargetIds: [], itemInstanceIds: ownItemIds };
  if (requirement.scope === "OPPONENT_ITEM") return { playerTargetIds: [], itemInstanceIds: oppItemIds };
  return { playerTargetIds: [], itemInstanceIds: [...ownItemIds, ...oppItemIds] };
}

// A card whose ON_PLAY effect requires a target (see getRequiredTarget)
// isn't a legal play at all if nothing currently qualifies as that target
// — e.g. Coke ("move target Item your opponent controls...") simply
// cannot be cast if the opponent controls no Item. Cards with no target
// requirement are always viable on this front (other limits still apply
// elsewhere in getLegalActions).
function hasPlayableTarget(
  state: DigitalGameState,
  playerIndex: 0 | 1,
  cardId: string,
  cardsById: Map<string, EngineCard>,
): boolean {
  const slug = cardsById.get(cardId)?.slug;
  if (!slug) return true;
  const requirement = getRequiredTarget(slug);
  if (!requirement) return true;
  if (requirement.kind === "DECK_ITEM") {
    return state.players[playerIndex].deck.some((c) => cardsById.get(c.cardId)?.type === "Item");
  }
  if (requirement.kind === "DISCARD_CARD") {
    return state.players[playerIndex].discard.some((c) => matchesDiscardFilter(c, requirement.filter, cardsById));
  }
  const { playerTargetIds, itemInstanceIds } = getTargetCandidateIds(state, playerIndex, requirement);
  return playerTargetIds.length + itemInstanceIds.length > 0;
}

function matchesDiscardFilter(
  instance: CardInstance,
  filter: "ANY" | "ITEM" | "SPELL",
  cardsById: Map<string, EngineCard>,
): boolean {
  if (filter === "ANY") return true;
  const wantedType = filter === "ITEM" ? "Item" : "Spell";
  return cardsById.get(instance.cardId)?.type === wantedType;
}

export function getLegalActions(
  state: DigitalGameState,
  playerIndex: 0 | 1,
  cardsById: Map<string, EngineCard>,
): LegalAction[] {
  if (state.phase === "COMPLETE") return [];

  // While an attack is awaiting a defender, ONLY the defending player has
  // anything to do — pick one of their own untired battlefield Items, or
  // explicitly take the attack undefended. The attacking player (still
  // nominally "on turn") and anyone else get nothing until this resolves.
  if (state.pendingCombat) {
    if (state.pendingCombat.defendingPlayerIndex !== playerIndex) return [];
    const defenderActions: LegalAction[] = state.players[playerIndex].battlefield
      .filter((c) => !c.tired)
      .map((c) => ({ type: "DEFEND" as const, instanceId: c.instanceId }));
    defenderActions.push({ type: "NO_DEFENDER" });
    return defenderActions;
  }

  if (state.activePlayerIndex !== playerIndex) return [];

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
      if (
        isPlayableAsItem(cardType) &&
        !(cardType === "Item" && state.itemsLockedForRestOfGame) &&
        hasPlayableTarget(state, playerIndex, c.cardId, cardsById)
      ) {
        actions.push({ type: "PLAY_ITEM", instanceId: c.instanceId });
      }
    }
  }
  if (canPlaySpell) {
    for (const c of player.hand) {
      if (
        requireCard(cardsById, c.cardId).type === "Spell" &&
        !state.spellsLockedForRestOfGame &&
        hasPlayableTarget(state, playerIndex, c.cardId, cardsById)
      ) {
        actions.push({ type: "PLAY_SPELL", instanceId: c.instanceId });
      }
    }
  }
  // Art's discard-cast allowance is exempt from the normal per-turn Spell
  // limit entirely (see playCard's `fromDiscard` branch), so it's listed
  // regardless of canPlaySpell.
  if (player.spellsPlayableFromDiscardThisTurn && !state.spellsLockedForRestOfGame) {
    for (const c of player.discard) {
      if (cardsById.get(c.cardId)?.type === "Spell" && hasPlayableTarget(state, playerIndex, c.cardId, cardsById)) {
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
    pendingCombat: state.pendingCombat,
    viewerIndex,
    players: [redact(state.players[0], viewerIndex === 0), redact(state.players[1], viewerIndex === 1)],
  };
}
