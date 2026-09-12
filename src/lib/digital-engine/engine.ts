import {
  IllegalActionError,
  type CardInstance,
  type DigitalGameState,
  type EngineCard,
  type PlayerGameState,
} from "./types";

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

function requireCard(cardsById: Map<string, EngineCard>, cardId: string): EngineCard {
  const card = cardsById.get(cardId);
  if (!card) throw new IllegalActionError("Unknown card.");
  return card;
}

function checkWin(state: DigitalGameState): DigitalGameState {
  const [a, b] = state.players;
  if (a.health <= 0 && b.health <= 0) {
    // Simultaneous KO — the active player's opponent is ruled the winner
    // (the active player dealt the final blow on their own turn).
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

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export type PlayerSetup = {
  userId: string | null;
  spriteInstanceId: string | null;
  /** Card instances to build the deck from, one entry per physical copy. */
  cardIds: string[];
};

// Deterministic-shape, non-deterministic-order shuffle (Fisher-Yates).
// Exported so tests can seed a PRNG; production calls it with Math.random.
export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildPlayerState(
  setup: PlayerSetup,
  startingHealth: number,
  startingHand: number,
  makeInstanceId: () => string,
  random: () => number,
): PlayerGameState {
  const deck: CardInstance[] = shuffle(
    setup.cardIds.map((cardId) => ({
      instanceId: makeInstanceId(),
      cardId,
      tired: false,
    })),
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
  };
}

export function createGameState(params: {
  matchId: string;
  formatId: string;
  startingHealth: number;
  startingHand: number;
  players: [PlayerSetup, PlayerSetup];
  makeInstanceId?: () => string;
  random?: () => number;
}): DigitalGameState {
  let counter = 0;
  const makeInstanceId = params.makeInstanceId ?? (() => `ci_${counter++}`);
  const random = params.random ?? Math.random;

  return {
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
  };
}

// ---------------------------------------------------------------------------
// Actions — every one of these is the ONLY way state changes. The action
// layer (src/lib/actions/digital-match-actions.ts) calls these after
// authenticating the caller; the bot (bot.ts) calls the exact same
// functions. Neither path can bypass validation, by construction.
// ---------------------------------------------------------------------------

export function drawCard(state: DigitalGameState, playerIndex: 0 | 1): DigitalGameState {
  const player = state.players[playerIndex];
  if (player.deck.length === 0) return state; // empty deck: no-op, no invented fatigue/loss rule
  const [drawn, ...rest] = player.deck;
  const nextPlayer: PlayerGameState = {
    ...player,
    deck: rest,
    hand: [...player.hand, drawn],
  };
  const players = [...state.players] as [PlayerGameState, PlayerGameState];
  players[playerIndex] = nextPlayer;
  return { ...state, players };
}

function playCard(
  state: DigitalGameState,
  playerIndex: 0 | 1,
  instanceId: string,
  cardsById: Map<string, EngineCard>,
  expectedType: "Item" | "Spell",
): DigitalGameState {
  requireInProgress(state);
  requireTurn(state, playerIndex);

  const player = state.players[playerIndex];
  const inHand = findCardInstance(player.hand, instanceId);
  if (!inHand) throw new IllegalActionError("That card isn't in your hand.");

  const card = requireCard(cardsById, inHand.cardId);
  if (card.type !== expectedType) {
    throw new IllegalActionError(`That card isn't a ${expectedType}.`);
  }

  if (expectedType === "Item" && player.itemsPlayedThisTurn >= 1) {
    throw new IllegalActionError("You've already played an Item this turn.");
  }
  if (expectedType === "Spell" && player.spellsPlayedThisTurn >= 1) {
    throw new IllegalActionError("You've already played a Spell this turn.");
  }

  const remainingHand = removeFromZone(player.hand, instanceId);
  const played: CardInstance = { ...inHand, tired: false };

  const nextPlayer: PlayerGameState = {
    ...player,
    hand: remainingHand,
    // Items stay in play; Spells resolve once and go straight to the
    // discard pile — no coded Spell effects yet (see abilities.ts).
    battlefield: expectedType === "Item" ? [...player.battlefield, played] : player.battlefield,
    discard: expectedType === "Spell" ? [...player.discard, played] : player.discard,
    itemsPlayedThisTurn: player.itemsPlayedThisTurn + (expectedType === "Item" ? 1 : 0),
    spellsPlayedThisTurn: player.spellsPlayedThisTurn + (expectedType === "Spell" ? 1 : 0),
  };

  const players = [...state.players] as [PlayerGameState, PlayerGameState];
  players[playerIndex] = nextPlayer;
  return {
    ...state,
    players,
    log: [...state.log, `${describePlayer(playerIndex)} played ${expectedType} (${card.id}).`],
  };
}

export function playItem(
  state: DigitalGameState,
  playerIndex: 0 | 1,
  instanceId: string,
  cardsById: Map<string, EngineCard>,
): DigitalGameState {
  return playCard(state, playerIndex, instanceId, cardsById, "Item");
}

export function playSpell(
  state: DigitalGameState,
  playerIndex: 0 | 1,
  instanceId: string,
  cardsById: Map<string, EngineCard>,
): DigitalGameState {
  return playCard(state, playerIndex, instanceId, cardsById, "Spell");
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
  const attack = attackerCard.attack ?? 0;
  const attackerSpeed = attackerCard.speed ?? 0;

  // Auto-select the best available defender (highest Defence, untired) —
  // see the module-level "Combat resolution" note for why this is
  // provisional.
  let bestDefenderInstance: CardInstance | null = null;
  let bestDefenderCard: EngineCard | null = null;
  for (const instance of defenderPlayer.battlefield) {
    if (instance.tired) continue;
    const card = requireCard(cardsById, instance.cardId);
    if (!bestDefenderCard || (card.defence ?? 0) > (bestDefenderCard.defence ?? 0)) {
      bestDefenderInstance = instance;
      bestDefenderCard = card;
    }
  }

  let damage = attack;
  let logSuffix = "unopposed";
  if (bestDefenderInstance && bestDefenderCard) {
    const defenderSpeed = bestDefenderCard.speed ?? 0;
    if (defenderSpeed >= attackerSpeed) {
      damage = Math.max(0, attack - (bestDefenderCard.defence ?? 0));
      logSuffix = `defended by ${bestDefenderCard.id} (won speed check)`;
    } else {
      logSuffix = `defender too slow — attack went through unmitigated`;
    }
  }

  const newDefenderHealth = defenderPlayer.health - damage;

  const players = [...state.players] as [PlayerGameState, PlayerGameState];
  players[playerIndex] = {
    ...attackerPlayer,
    battlefield: attackerPlayer.battlefield.map((c) =>
      c.instanceId === attackerInstanceId ? { ...c, tired: true } : c,
    ),
  };
  players[defenderIndex] = { ...defenderPlayer, health: newDefenderHealth };

  let next: DigitalGameState = {
    ...state,
    players,
    log: [
      ...state.log,
      `${describePlayer(playerIndex)} attacked with ${attackerCard.id} for ${damage} damage (${logSuffix}).`,
    ],
  };
  next = checkWin(next);
  return next;
}

export function endTurn(state: DigitalGameState): DigitalGameState {
  requireInProgress(state);

  const nextIndex = opponentIndex(state.activePlayerIndex);
  const players = [...state.players] as [PlayerGameState, PlayerGameState];

  // Reset the player whose turn is ending.
  players[state.activePlayerIndex] = {
    ...players[state.activePlayerIndex],
    itemsPlayedThisTurn: 0,
    spellsPlayedThisTurn: 0,
  };

  // Start of the new active player's turn: remove tired counters, then draw.
  players[nextIndex] = {
    ...players[nextIndex],
    battlefield: players[nextIndex].battlefield.map((c) => ({ ...c, tired: false })),
  };

  let next: DigitalGameState = {
    ...state,
    players,
    activePlayerIndex: nextIndex,
    turnNumber: state.turnNumber + 1,
    log: [...state.log, `Turn ended. ${describePlayer(nextIndex)}'s turn.`],
  };
  next = drawCard(next, nextIndex);
  return next;
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

function describePlayer(index: 0 | 1): string {
  return index === 0 ? "Player 1" : "Player 2";
}

// ---------------------------------------------------------------------------
// Legal-action introspection — used by both the UI (to highlight what's
// clickable) and the bot (to choose from the same real options). Neither
// consumer can act outside this list because every action above
// independently re-validates anyway.
// ---------------------------------------------------------------------------

export type LegalAction =
  | { type: "PLAY_ITEM"; instanceId: string }
  | { type: "PLAY_SPELL"; instanceId: string }
  | { type: "ATTACK"; instanceId: string }
  | { type: "END_TURN" };

export function getLegalActions(
  state: DigitalGameState,
  playerIndex: 0 | 1,
  cardsById: Map<string, EngineCard>,
): LegalAction[] {
  if (state.phase === "COMPLETE" || state.activePlayerIndex !== playerIndex) return [];

  const player = state.players[playerIndex];
  const actions: LegalAction[] = [];

  if (player.itemsPlayedThisTurn < 1) {
    for (const c of player.hand) {
      if (requireCard(cardsById, c.cardId).type === "Item") {
        actions.push({ type: "PLAY_ITEM", instanceId: c.instanceId });
      }
    }
  }
  if (player.spellsPlayedThisTurn < 1) {
    for (const c of player.hand) {
      if (requireCard(cardsById, c.cardId).type === "Spell") {
        actions.push({ type: "PLAY_SPELL", instanceId: c.instanceId });
      }
    }
  }
  for (const c of player.battlefield) {
    if (!c.tired) actions.push({ type: "ATTACK", instanceId: c.instanceId });
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

// A viewer sees their OWN hand/deck-count fully, and only counts (never
// identities) for the opponent's hand and deck. Battlefield/discard/health
// are always public, matching real NS TCG (nothing there is hidden info).
export function getVisibleState(state: DigitalGameState, viewerIndex: 0 | 1): VisibleGameState {
  const redact = (p: PlayerGameState, isViewer: boolean): VisiblePlayerState => ({
    userId: p.userId,
    health: p.health,
    spriteInstanceId: p.spriteInstanceId,
    deckCount: p.deck.length,
    hand: isViewer ? p.hand : p.hand.map((c) => ({ instanceId: c.instanceId, hidden: true as const })),
    battlefield: p.battlefield,
    discard: p.discard,
    itemsPlayedThisTurn: p.itemsPlayedThisTurn,
    spellsPlayedThisTurn: p.spellsPlayedThisTurn,
  });

  return {
    matchId: state.matchId,
    formatId: state.formatId,
    turnNumber: state.turnNumber,
    activePlayerIndex: state.activePlayerIndex,
    phase: state.phase,
    log: state.log,
    winnerIndex: state.winnerIndex,
    viewerIndex,
    players: [redact(state.players[0], viewerIndex === 0), redact(state.players[1], viewerIndex === 1)],
  };
}
