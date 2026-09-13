// Sprite gameplay engine — the SAME lookup/bonus logic used for both the
// human's and the bot's equipped Sprite (engine.ts never branches on who's
// controlling a player index). Keyed by Sprite.slug, hand-authored
// directly from each Sprite's real level1Ability..level5Ability text in
// prisma/seed.ts (never invented, never parsed from free text).
//
// Only abilities that reduce to a flat, always-on numeric bonus on an
// EXISTING engine primitive (Attack/Defence/Speed, damage dealt, health
// gained, or the Item/Spell per-turn play limit) are implemented here.
// Every other seeded ability needs a new engine mechanic that does not
// exist yet — "won a Speed check" as a dispatchable event, a Relegate
// zone, Sneak Attack, once-per-turn shields/triggers, or playing a Spell
// outside your own turn — and is deliberately left unimplemented rather
// than invented. See the Digital Play report for the exact list.
//
// LEVELING RULE (an explicit, documented interpretation — the seed text
// doesn't say whether higher levels stack with lower ones): within one
// TOPIC (e.g. Water Sprite's Speed bonus at L1 vs L2), only the highest
// level at-or-below the Sprite's current level applies — L2's "+20 Speed"
// replaces L1's "+10", it does not add on top of it. Across DISTINCT
// topics (e.g. Fire Sprite's damage-dealt bonus at L1/2 vs its separate
// Attack buff at L4/5), both apply once each is reached, since they're
// different effects entirely.

export type SpriteEngineData = { slug: string; level: number };

export type SpriteTopic =
  | "attack"
  | "defence"
  | "speed"
  | "damageDealt"
  | "healthGained"
  | "extraSpellLimit";

// slug -> topic -> level -> flat bonus value at that level.
const SPRITE_TOPIC_LEVELS: Record<string, Partial<Record<SpriteTopic, Record<number, number>>>> = {
  // "Your cards get +10/+20 Speed." (L1/L2). L3 ("draw on 2nd spell"), L4
  // ("play Spells on opponent's turn") not implemented. L5 ("+1
  // additional Spell each turn") IS implemented — same shape as
  // Biologist's raised Item limit.
  "water-sprite": {
    speed: { 1: 10, 2: 20 },
    extraSpellLimit: { 5: 1 },
  },
  // "If you would deal damage to an opponent, deal an additional 10/20
  // damage." (L1/L2). "All items you control get +20/+40 attack." (L4/L5).
  // L3 ("draw if dealing >100 at once") not implemented.
  "fire-sprite": {
    damageDealt: { 1: 10, 2: 20 },
    attack: { 4: 20, 5: 40 },
  },
  // "Your cards get +10/+20/+40 Speed." (L1/L2/L4). L3/L5 ("win a Speed
  // check -> ...") not implemented — no "won a Speed check" dispatchable
  // event exists yet.
  "air-sprite": {
    speed: { 1: 10, 2: 20, 4: 40 },
  },
  // "Your Items get +10/+20/+40 Defence." (L1/L2/L4). L3/L5 (Items being
  // "destroyed"/"surviving an attack") not implemented — this engine has
  // no concept of an Item being destroyed by combat damage at all.
  "earth-sprite": {
    defence: { 1: 10, 2: 20, 4: 40 },
  },
  // "Your Items get +10/+20 Speed." (L1/L2). L3 (win-Speed-check draw),
  // L4/L5 (Sneak Attack) not implemented.
  "ninja-sprite": {
    speed: { 1: 10, 2: 20 },
  },
  // "Whenever you gain Health, gain an additional 10/20 Health." (L1/L2).
  // L3 (first-gain-each-turn draw), L4 (once-per-turn 30-damage shield),
  // L5 (death replacement) not implemented.
  "angel-sprite": {
    healthGained: { 1: 10, 2: 20 },
  },
  // "Your Items get +10/+20 Attack." (L1/L2). L3/L4/L5 (Health-loss
  // triggers) not implemented.
  "devil-sprite": {
    attack: { 1: 10, 2: 20 },
  },
  // cosmic-sprite: every level is Relegate-based — Relegate is not a zone
  // that exists anywhere in this engine. No topic implemented.
};

export function getSpriteTopicBonus(sprite: SpriteEngineData | undefined, topic: SpriteTopic): number {
  if (!sprite) return 0;
  const levels = SPRITE_TOPIC_LEVELS[sprite.slug]?.[topic];
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
