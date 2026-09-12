// Pure, server-authoritative game state for a Digital Play match. This
// entire tree is what's persisted as DigitalMatch.state (JSON). It has
// zero dependency on Prisma/Next.js so the engine (engine.ts) is fully
// unit-testable in isolation, same principle as src/lib/metagame-logic.ts.
//
// IMPORTANT — what this does NOT model yet: Delay, Window, and player
// CHOICE between multiple options or targets (auto-resolved with a
// documented heuristic instead of a real target-picker UI). Star Drop's
// second ability text is incomplete/malformed in the source data and is
// skipped for that reason.
//
// Commander/Champion cards (Cathedral Pergrines, Star Drop, The
// Curriculum) have NO rules-defined way to enter play — neither this
// codebase's physical Rules page nor the real card text say how. Per
// explicit user direction this is handled as a PROVISIONAL, non-canonical
// engineering choice for Digital Play only: they're played from hand via
// the normal Item action, sharing its per-turn slot/limit. This is very
// likely wrong once real Commander rules exist and should be revisited.

export type Zone = "DECK" | "HAND" | "BATTLEFIELD" | "DISCARD";

export type StatBuffs = {
  attack: number;
  defence: number;
  speed: number;
};

// One physical copy of a card, for the duration of a single match. Distinct
// from Card.id: two copies of the same Card each get their own
// CardInstance so they can independently be tired/attacking/buffed/etc.
export type CardInstance = {
  instanceId: string;
  cardId: string;
  /** True only while on BATTLEFIELD and having attacked this cycle. */
  tired: boolean;
  /** Cumulative stat modifiers from effects like Brooke/Punch. Additive on
   *  top of the card's base Attack/Defence/Speed — see getEffectiveStats. */
  buffs: StatBuffs;
  /** Time Bomb only: charge counters accumulated via its own ability.
   *  Undefined/0 for every other card. */
  charges?: number;
  /** Star Drop only: how many times THIS instance's own activated ability
   *  has been used this turn (capped at 2). Reset at endTurn. Undefined/0
   *  for every other card. */
  activationsThisTurn?: number;
};

export type PlayerGameState = {
  /** null identifies the V1 rules-bot's slot. */
  userId: string | null;
  health: number;
  spriteInstanceId: string | null;
  deck: CardInstance[]; // index 0 = top of deck
  hand: CardInstance[];
  battlefield: CardInstance[];
  discard: CardInstance[];
  itemsPlayedThisTurn: number;
  spellsPlayedThisTurn: number;
  /** Shared pool consumed by an Item or Spell play once the normal 1-per-
   *  type limit is hit (Super Drop: "3 additional Item or Spell cards"). */
  extraPlaysThisTurn: number;
  /** Revision: no per-turn Spell limit at all while true. */
  unlimitedSpellsThisTurn: boolean;
  /** Nelson: incoming damage to this player is reduced to 0 while true. */
  damagePreventedThisTurn: boolean;
  /** Art: this player's Spells may also be played from their discard pile
   *  this turn (in addition to hand). Reset at endTurn. */
  spellsPlayableFromDiscardThisTurn: boolean;
  /** School Computers: this player's hand is currently visible to their
   *  opponent (a real reveal, not a redacted view). Cleared at endTurn — a
   *  simplification, since the real card doesn't say how long the reveal
   *  lasts and there's no "glance and forget" concept in a persisted
   *  server-authoritative state. */
  handRevealedToOpponent: boolean;
};

export type GamePhase = "MAIN" | "COMPLETE";

export type DigitalGameState = {
  matchId: string;
  formatId: string;
  turnNumber: number;
  /** Index into `players` of whoever's turn it currently is. */
  activePlayerIndex: 0 | 1;
  phase: GamePhase;
  players: [PlayerGameState, PlayerGameState];
  /** Human-readable event log, most recent last. Public — no hidden info. */
  log: string[];
  winnerIndex: 0 | 1 | null;
  /** The Curriculum: once true, Items (or Spells) can never be played
   *  again by EITHER player for the rest of the match — a literal reading
   *  of the card's unscoped "no more X can be played" text (no "you"
   *  qualifier in the real rulesText). */
  itemsLockedForRestOfGame: boolean;
  spellsLockedForRestOfGame: boolean;
};

// Card data the engine needs but does not itself store (kept in the DB,
// looked up once per action and passed in) — this is what makes the
// engine reusable/testable without a database. `slug` is what
// CARD_ABILITIES in abilities.ts is keyed by.
export type EngineCard = {
  id: string;
  slug: string;
  type: string | null; // "Item" | "Spell" | ... (free text in the DB)
  attack: number | null;
  defence: number | null;
  speed: number | null;
};

export class IllegalActionError extends Error {}
