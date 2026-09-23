// Pure constants for the Coins economy — no server-only imports (no
// Prisma), so this is safe to import from client components too (e.g. the
// pack store UI showing the price on a Buy button). The server-only
// services (coins.ts, packs.ts, match-rewards.ts) re-export these so
// existing call sites don't need to know which file is "the constants
// one" — this module exists purely to keep them client-importable.
export const STARTER_COIN_BALANCE = 1000;
export const PACK_COST = 1000;
export const MATCH_WIN_REWARD = 50;
export const PACK_SIZE = 10;
