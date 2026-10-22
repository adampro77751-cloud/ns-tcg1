export const GOLDEN_COINS_STYLE = {
  kind: "card",
  key: "cathedral-pergrines-golden-coins",
  cardSlug: "cathedral-pergrines",
  name: "Golden Coins",
  image: "/cards/styles/cathedral-pergrines-golden-coins.png",
  productId: "coins-50000",
} as const;

export const HALLOWEEN_PACK_COST = 500;
export const HALLOWEEN_PACK_SIZE = 3;
export const HALLOWEEN_PACK_NAME = "Halloween 2026";
// Exclusive end: the pack remains on sale throughout 7 November (UTC).
export const HALLOWEEN_PACK_END = "2026-11-08T00:00:00.000Z";
export const HALLOWEEN_STYLES = ([
  { kind: "card", cardSlug: "cupcake", cardName: "Cupcake" },
  { kind: "card", cardSlug: "home-clothes-day", cardName: "Home Clothes Day" },
  { kind: "card", cardSlug: "library", cardName: "Library" },
  { kind: "card", cardSlug: "biologist", cardName: "Biologist" },
  { kind: "card", cardSlug: "old-book", cardName: "Old book" },
  { kind: "card", cardSlug: "cathedral", cardName: "Cathedral" },
  { kind: "card", cardSlug: "punch", cardName: "Punch" },
  { kind: "card", cardSlug: "bio-worm", cardName: "Bio Worm" },
  { kind: "sprite", spriteSlug: "devil-sprite", cardName: "Devil Sprite" },
  { kind: "card", cardSlug: "budge", cardName: "Budge, Cathedral Cat" },
] as const).map(style => {
  const slug = style.kind === "sprite" ? style.spriteSlug : style.cardSlug;
  return { ...style, key: `${slug}-halloween-2026`, name: "Halloween 2026", image: `/cards/styles/halloween-2026/${slug}.png` };
});

export const DIAMOND_RANK_STYLE = {
  kind: "card", key: "the-final-bell-diamond-rank", cardSlug: "the-final-bell",
  name: "Diamond Rank", image: "/cards/styles/the-final-bell-diamond-rank.png",
} as const;

export const ART_STYLES = [GOLDEN_COINS_STYLE, DIAMOND_RANK_STYLE, ...HALLOWEEN_STYLES];
export function isHalloweenPackAvailable(now = new Date()) {
  return now.getTime() < new Date(HALLOWEEN_PACK_END).getTime();
}
