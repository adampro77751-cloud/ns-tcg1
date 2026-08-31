// Sprite match-progression constants. These are the real NS TCG design
// values (not placeholders) — the single source of truth for XP/level
// math. If they ever change, this is the only file to edit.

export const MAX_SPRITE_LEVEL = 5;

export const XP_PER_WIN = 25;
export const XP_PER_LOSS = 10;

// Cumulative XP required to REACH each level (Level 1 starts at 0 XP).
export const LEVEL_XP_THRESHOLDS: Readonly<Record<number, number>> = {
  1: 0,
  2: 50,
  3: 150,
  4: 450,
  5: 950,
};

// Derives a Sprite's level purely from its total XP. This is the only
// place level is computed — never trust a client-submitted level. Capped
// at MAX_SPRITE_LEVEL by construction: the loop only ever considers levels
// up to 5, so no amount of XP (however large, however awarded) can produce
// a level above 5. A DB-level CHECK constraint on SpriteInstance.level is
// a second, independent guarantee of the same cap.
export function levelForXp(xp: number): number {
  let level = 1;
  for (let candidate = 2; candidate <= MAX_SPRITE_LEVEL; candidate++) {
    if (xp >= LEVEL_XP_THRESHOLDS[candidate]) {
      level = candidate;
    }
  }
  return level;
}

// XP still accumulates past Level 5 (visible on the Sprite's page) but has
// no further effect — no Level 6, no progress bar past MAX LEVEL.
export function xpProgress(xp: number): {
  level: number;
  isMaxLevel: boolean;
  nextLevel: number | null;
  xpIntoLevel: number;
  xpForNextLevel: number | null;
} {
  const level = levelForXp(xp);
  const isMaxLevel = level >= MAX_SPRITE_LEVEL;
  const currentThreshold = LEVEL_XP_THRESHOLDS[level];
  const nextLevel = isMaxLevel ? null : level + 1;
  const xpForNextLevel = nextLevel ? LEVEL_XP_THRESHOLDS[nextLevel] : null;

  return {
    level,
    isMaxLevel,
    nextLevel,
    xpIntoLevel: xp - currentThreshold,
    xpForNextLevel: xpForNextLevel !== null ? xpForNextLevel - currentThreshold : null,
  };
}
