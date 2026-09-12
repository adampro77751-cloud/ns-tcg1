// Pure, server-authoritative game state for a Digital Play match. This
// entire tree is what's persisted as DigitalMatch.state (JSON). It has
// zero dependency on Prisma/Next.js so the engine (engine.ts) is fully
// unit-testable in isolation, same principle as src/lib/metagame-logic.ts.
//
// IMPORTANT — what this does NOT model yet (see the report for the current
// pass, not invented here): Delay, Window, Commander/Champion cards
// entering play (the schema/rules never define how — see report), player
// CHOICE between multiple options or targets (auto-resolved with a
// documented heuristic instead of a real target-picker UI), and a couple
// of cards whose real text is structurally novel enough to skip for now
// (Time Bomb's win condition, Star Drop's incomplete second ability).

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
