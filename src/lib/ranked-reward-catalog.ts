import { DRAFT_RANKS } from "./draft-rank";

export const RANKED_REWARDS = [
  { ...DRAFT_RANKS[1], coins: 10000 },
  { ...DRAFT_RANKS[2], coins: 25000 },
  { ...DRAFT_RANKS[3], coins: 50000 },
  { ...DRAFT_RANKS[4], coins: 100000 },
] as const;
