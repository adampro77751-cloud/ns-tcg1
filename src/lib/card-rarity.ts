// Card.rarity in the database is free text (never an enum — see
// prisma/schema.prisma's "Coins economy" section comment), with real
// inconsistent casing in the existing data ("Mythic" vs "MYTHIC",
// "Legendary" vs "LEGENDARY", etc.) and some rows using "TBD" or null for
// an unknown rarity. This module is the ONE place that normalizes that
// free text into the 5 canonical tiers this feature's spec names, so pack
// odds/colors never depend on exactly how a given Card row happens to be
// cased — and existing Card data is never migrated/touched to get there.

export type CanonicalRarity = "Common" | "Rare" | "Epic" | "Legendary" | "Mythic";

export const RARITY_ORDER: CanonicalRarity[] = ["Common", "Rare", "Epic", "Legendary", "Mythic"];

export function normalizeRarity(raw: string | null | undefined): CanonicalRarity | null {
  if (!raw) return null;
  switch (raw.trim().toUpperCase()) {
    case "COMMON":
      return "Common";
    case "RARE":
      return "Rare";
    case "EPIC":
      return "Epic";
    case "LEGENDARY":
      return "Legendary";
    case "MYTHIC":
      return "Mythic";
    default:
      // "TBD", unrecognized text, etc. — unclassified, not one of the 5
      // pack tiers. Excluded from pack rarity pools (see src/lib/packs.ts).
      return null;
  }
}

// The rarity colors named in this feature's spec, as a small set of
// Tailwind class groups reused everywhere a rarity needs to be styled
// (pack reveal, collection, store).
export const RARITY_COLORS: Record<
  CanonicalRarity,
  { text: string; bg: string; border: string; ring: string; gradient: string }
> = {
  Common: {
    text: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-400",
    ring: "ring-emerald-300",
    gradient: "from-emerald-500 to-emerald-700",
  },
  Rare: {
    text: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-400",
    ring: "ring-blue-300",
    gradient: "from-blue-500 to-blue-700",
  },
  Epic: {
    text: "text-purple-700",
    bg: "bg-purple-50",
    border: "border-purple-400",
    ring: "ring-purple-300",
    gradient: "from-purple-500 to-purple-700",
  },
  Legendary: {
    text: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-400",
    ring: "ring-amber-300",
    gradient: "from-amber-400 to-amber-600",
  },
  Mythic: {
    text: "text-orange-700",
    bg: "bg-orange-50",
    border: "border-orange-400",
    ring: "ring-orange-300",
    gradient: "from-orange-500 to-orange-700",
  },
};
