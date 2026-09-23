// Sprite gameplay engine — the SAME lookup/dispatch logic used for both the
// human's and the bot's equipped Sprite (engine.ts never branches on who's
// controlling a player index). Keyed by Sprite.slug, hand-authored directly
// from each Sprite's real level1Ability..level5Ability text in
// prisma/seed.ts (never invented, never parsed from free text). Real
// display text for the UI comes from the DB itself (see
// getSpriteAbilityTextMap in digital-play.ts) — this file only carries the
// MECHANICAL shape of each ability, so the two can never drift silently:
// a change to the real ability text doesn't change what this engine does.
//
// Three kinds of ability, each with its own model:
//
//  - PASSIVE (SPRITE_TOPICS below): a flat, always-on numeric bonus on an
//    existing engine primitive (Attack/Defence/Speed, damage dealt, health
//    gained, an extra Item/Spell play). Looked up directly at the relevant
//    engine chokepoint (combatStat, performRawDamage, ...).
//
//  - TRIGGERED (SPRITE_TRIGGERS below): reacts to a GameEvent exactly like
//    a card's own CARD_ABILITIES entry, dispatched by the SAME
//    dispatchEvent loop in engine.ts (which checks each player's equipped
//    Sprite in addition to their battlefield permanents) and resolved
//    through the SAME EffectSpec executor (applyEffect) — full reuse of
//    the existing trigger engine, not a parallel system.
//
//  - ACTIVATED (SPRITE_ACTIVATED below): a player-chosen action with its
//    own cost/target/once-per-turn-or-game gating, too heterogeneous to
//    express as a small effect list — implemented as its own bespoke case
//    in engine.ts's activateSpriteAbility, with this table supplying only
//    the level-gate/cost/target metadata the UI and legality checks need.
//
// LEVELING RULE for PASSIVE topics (an explicit, documented interpretation
// — the seed text doesn't say whether higher levels stack with lower
// ones): within one topic, only the highest level at-or-below the
// Sprite's current level applies — it does not add on top of lower
// levels. Across DISTINCT topics/triggers, both apply once each is
// reached, since they're different effects entirely (e.g. Air Sprite's
// Speed topic at L1/2/4 and its separate "win a Speed check" triggers at
// L3/L5 all apply simultaneously once unlocked).

import type { EffectSpec, GameEvent } from "./abilities";

export type SpriteEngineData = { slug: string; level: number };

export type SpriteTopic =
  | "attack"
  | "defence"
  | "speed"
  | "damageDealt"
  | "healthGained"
  | "extraSpellLimit"
  | "extraItemLimit"
  /** Air Sprite L3: "+10 Attack for that attack" when the controller wins
   *  a Speed check — a ONE-COMBAT pulse, not an always-on bonus, so it's
   *  looked up and consumed manually at the one call site that needs it
   *  (resolveDefense) rather than folded into combatStat's general Attack
   *  lookup. Modeled as a topic anyway for the same non-cumulative
   *  highest-level-wins leveling rule. */
  | "speedCheckAttackBonus";

// slug -> topic -> level -> flat bonus value at that level.
const SPRITE_TOPICS: Record<string, Partial<Record<SpriteTopic, Record<number, number>>>> = {
  // "Your cards get +10/+20 Speed." (L1/L2). L3/L4 are TRIGGERED/off-turn
  // (see SPRITE_TRIGGERS and engine.ts's playCard). "+1 additional Spell
  // each turn" (L5) — same shape as Biologist's raised Item limit.
  "water-sprite": {
    speed: { 1: 10, 2: 20 },
    extraSpellLimit: { 5: 1 },
  },
  // "If you would deal damage to an opponent, deal an additional 10/20
  // damage." (L1/L2). L3 is TRIGGERED (see SPRITE_TRIGGERS). "All items
  // you control get +20/+40 attack." (L4/L5).
  "fire-sprite": {
    damageDealt: { 1: 10, 2: 20 },
    attack: { 4: 20, 5: 40 },
  },
  // "Your cards get +10/+20/+40 Speed." (L1/L2/L4). L3/L5 ("win a Speed
  // check -> ...") are TRIGGERED (see SPRITE_TRIGGERS).
  "air-sprite": {
    speed: { 1: 10, 2: 20, 4: 40 },
    speedCheckAttackBonus: { 3: 10 },
  },
  // "Your Items get +10/+20/+40 Defence." (L1/L2/L4). L3/L5 (surviving an
  // attack / destruction prevention) are TRIGGERED / bespoke (see
  // SPRITE_TRIGGERS and engine.ts's DAMAGE-to-Item destruction case).
  "earth-sprite": {
    defence: { 1: 10, 2: 20, 4: 40 },
  },
  // "Your Items get +10/+20 Speed." (L1/L2). L3 is TRIGGERED; L4/L5
  // (Sneak Attack) are ACTIVATED (see SPRITE_TRIGGERS/SPRITE_ACTIVATED).
  "ninja-sprite": {
    speed: { 1: 10, 2: 20 },
  },
  // "Whenever you gain Health, gain an additional 10/20 Health." (L1/L2).
  // L3 is TRIGGERED; L4 is ACTIVATED; L5 is a bespoke game-loss intercept
  // (see engine.ts's checkWin).
  "angel-sprite": {
    healthGained: { 1: 10, 2: 20 },
  },
  // "Your Items get +10/+20 Attack." (L1/L2). L3/L4 are ACTIVATED; L5 is
  // TRIGGERED (see SPRITE_TRIGGERS/SPRITE_ACTIVATED).
  "devil-sprite": {
    attack: { 1: 10, 2: 20 },
  },
  // Every level is Relegate-based (see SPRITE_ACTIVATED for L1/L2/L4 and
  // engine.ts's playCard for L3's discard-play allowance). L5 ("+1
  // additional Item each turn") — same shape as Biologist's raised Item
  // limit, on the Item side instead of Spell.
  "cosmic-sprite": {
    extraItemLimit: { 5: 1 },
  },
};

export function getSpriteTopicBonus(sprite: SpriteEngineData | undefined, topic: SpriteTopic): number {
  if (!sprite) return 0;
  const levels = SPRITE_TOPICS[sprite.slug]?.[topic];
  if (!levels) return 0;
  let bestLevel = -1;
  let bestValue = 0;
  for (const [levelStr, value] of Object.entries(levels)) {
    const level = Number(levelStr);
    if (level <= sprite.level && level > bestLevel) {
      bestLevel = level;
      bestValue = value;
    }
  }
  return bestValue;
}

export function getEquippedSprite(
  spriteInstanceId: string | null,
  spritesById: Map<string, SpriteEngineData>,
): SpriteEngineData | undefined {
  if (!spriteInstanceId) return undefined;
  return spritesById.get(spriteInstanceId);
}

// ---------------------------------------------------------------------------
// Triggered abilities — dispatched by engine.ts's dispatchEvent, resolved
// through the same EffectSpec executor (applyEffect) card abilities use.
// ---------------------------------------------------------------------------

export type SpriteTriggerAbility = {
  level: number;
  trigger: GameEvent;
  effects: EffectSpec[];
  condition?: { minAmount?: number; spellCountEquals?: number; firstPerTurnKey?: string };
};

const SPRITE_TRIGGERS: Record<string, SpriteTriggerAbility[]> = {
  // "When you play your second spell in a turn, draw a card."
  "water-sprite": [
    {
      level: 3,
      trigger: "SPELL_PLAYED",
      condition: { spellCountEquals: 2 },
      effects: [{ type: "DRAW", amount: 1, target: "SELF" }],
    },
  ],
  // "If you would deal over 100 damage at 1 time, draw a card." — reuses
  // the same DAMAGE_DEALT minAmount condition Cutlary uses; 101 is the
  // integer-exclusive floor for "over 100" (damage amounts are always
  // whole numbers in this engine).
  "fire-sprite": [
    {
      level: 3,
      trigger: "DAMAGE_DEALT",
      condition: { minAmount: 101 },
      effects: [{ type: "DRAW", amount: 1, target: "SELF" }],
    },
  ],
  // "When you win a Speed check, draw a card." (L3 for Ninja, L5 for Air
  // — see below). Air L3's "+10 Attack for that attack" is a
  // speedCheckAttackBonus TOPIC instead (a one-combat pulse consumed
  // inline at resolveDefense, not a dispatched draw).
  "air-sprite": [{ level: 5, trigger: "SPEED_CHECK_WON", effects: [{ type: "DRAW", amount: 1, target: "SELF" }] }],
  "ninja-sprite": [{ level: 3, trigger: "SPEED_CHECK_WON", effects: [{ type: "DRAW", amount: 1, target: "SELF" }] }],
  // "When an Item you control survives an attack, it gets +10 Defence." —
  // under this engine's combat model an Item is never destroyed by
  // ordinary combat, so every chosen defender unconditionally "survives";
  // BUFF_DEFENSE's target "THIS" resolves to the specific defending
  // instance via the DEFENDER_SURVIVED event's subjectInstanceId (see
  // engine.ts's dispatchEvent sprite branch).
  "earth-sprite": [{ level: 3, trigger: "DEFENDER_SURVIVED", effects: [{ type: "BUFF_DEFENSE", amount: 10, target: "THIS" }] }],
  // "The first time you gain Health each turn, draw a card."
  "angel-sprite": [
    {
      level: 3,
      trigger: "HEALTH_GAINED",
      condition: { firstPerTurnKey: "healthGain" },
      effects: [{ type: "DRAW", amount: 1, target: "SELF" }],
    },
  ],
  // "The first time you lose Health each turn, your Items get +40 Attack
  // this turn." — a transient THIS-TURN-ONLY pool (PlayerGameState.
  // spriteRuntime.turnAttackBonus, reset at this player's own next
  // TURN_STARTED), not a permanent CardInstance buff, since it must
  // expire — SPRITE_TURN_ATTACK_BONUS is a dedicated effect type for
  // exactly this shape.
  "devil-sprite": [
    {
      level: 5,
      trigger: "HEALTH_LOST",
      condition: { firstPerTurnKey: "healthLoss" },
      effects: [{ type: "SPRITE_TURN_ATTACK_BONUS", amount: 40 }],
    },
  ],
};

export function getSpriteTriggerAbilities(slug: string, trigger: GameEvent): SpriteTriggerAbility[] {
  return (SPRITE_TRIGGERS[slug] ?? []).filter((a) => a.trigger === trigger);
}

// ---------------------------------------------------------------------------
// Activated abilities — player-chosen, with their own cost/target/usage
// gating. Too heterogeneous for the small EffectSpec language, so each id
// is handled as its own bespoke case in engine.ts's activateSpriteAbility;
// this table supplies only the metadata the UI and legality checks need.
// ---------------------------------------------------------------------------

export type SpriteActivatedAbility = {
  id: string;
  level: number;
  name: string;
  /** Health paid by the controller to activate, if any. */
  costHealth?: number;
  oncePerTurn?: boolean;
  oncePerGame?: boolean;
  /** True only for Ninja Sneak Attack — needs a target instanceId (another
   *  untired Item the controller owns) and is only usable while the
   *  controller's own attack is pending a defender. */
  needsTarget?: boolean;
};

const SPRITE_ACTIVATED: Record<string, SpriteActivatedAbility[]> = {
  // "Once per turn, you may Relegate 1/2 to draw 1/2 cards." — ONE ability
  // id covering both levels; the actual N (and whether the first/second
  // Relegated card(s) become playable this turn, per L3/L4) is derived
  // from the Sprite's current level at activation time in engine.ts, not
  // duplicated here.
  "cosmic-sprite": [{ id: "cosmic-relegate", level: 1, name: "Relegate", oncePerTurn: true }],
  "devil-sprite": [
    { id: "devil-health-draw", level: 3, name: "Trade Health for a Card", costHealth: 20, oncePerTurn: true },
    { id: "devil-health-item", level: 4, name: "Trade Health for an Item Play", costHealth: 30, oncePerTurn: true },
  ],
  "angel-sprite": [{ id: "angel-shield", level: 4, name: "Guardian Shield", oncePerTurn: true }],
  "ninja-sprite": [{ id: "ninja-sneak-attack", level: 4, name: "Sneak Attack", oncePerTurn: true, needsTarget: true }],
};

export function getUnlockedActivatedAbilities(slug: string, level: number): SpriteActivatedAbility[] {
  return (SPRITE_ACTIVATED[slug] ?? []).filter((a) => a.level <= level);
}

export function getActivatedAbilityDef(slug: string, id: string): SpriteActivatedAbility | undefined {
  return (SPRITE_ACTIVATED[slug] ?? []).find((a) => a.id === id);
}
