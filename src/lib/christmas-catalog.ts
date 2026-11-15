export const CHRISTMAS_START = "2026-12-01T00:00:00.000Z";
export const CHRISTMAS_END = "2027-01-01T00:00:00.000Z";
export const CHRISTMAS_FINAL_CARD_SLUG = "christmas-2026-finale";
export const CHRISTMAS_FINAL_CARD = {
  slug: CHRISTMAS_FINAL_CARD_SLUG,
  name: "Christmas day",
  type: "Spell",
  rarity: null,
  set: null, // Calendar exclusive: normal packs only include cards with a set.
  image: "/cards/christmas-day.png",
  rulesText: "To cast this spell discard your hand.\n\nReturn all item cards in your discard pile to your side of play.\nGain 100 health",
} as const;
export const CHRISTMAS_STYLES = [
  { cardSlug: "cupcake", name: "Christmas Cupcake", day: 5 },
  { cardSlug: "old-book", name: "Christmas Letter", day: 10 },
  { cardSlug: "bio-worm", name: "Christmas Bio Worm", day: 15 },
  { cardSlug: "revision", name: "Christmas Revision", day: 20 },
].map(style => ({ ...style, kind: "card" as const, key: `${style.cardSlug}-christmas-2026`, image: `/cards/styles/christmas-2026/${style.cardSlug}.png` }));

// Total budget: 30,000 Coins and 16 packs. Coins grow by 80 each day.
// Days 11-24 add one pack each; Christmas Day adds two.
export const CHRISTMAS_REWARDS = Array.from({ length: 25 }, (_, index) => {
  const day = index + 1;
  return { day, coins: 240 + (day - 1) * 80, packs: day === 25 ? 2 : day >= 11 ? 1 : 0,
    style: CHRISTMAS_STYLES.find(style => style.day === day), finalCard: day === 25 };
});

export function christmasStatus(now = new Date()) {
  const time = now.getTime();
  if (time < Date.parse(CHRISTMAS_START)) return { phase: "upcoming" as const, unlockedDay: 0 };
  if (time >= Date.parse(CHRISTMAS_END)) return { phase: "ended" as const, unlockedDay: 0 };
  return { phase: "active" as const, unlockedDay: Math.min(25, now.getUTCDate()) };
}

export function christmasClaimError(day: number, now = new Date()) {
  const status = christmasStatus(now);
  if (status.phase === "upcoming") return "The calendar opens on 1 December 2026 at 00:00 GMT.";
  if (status.phase === "ended") return "The Christmas calendar has ended.";
  if (!Number.isInteger(day) || day < 1 || day > 25) return "Choose a valid calendar day.";
  if (day > status.unlockedDay) return "This door has not opened yet. New doors open at midnight GMT.";
  return null;
}
