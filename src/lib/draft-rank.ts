import type { DraftResult } from "./draft-logic";

// Diamond takes 20 perfect five-match pods, or 29 pods with a 4-1 record.
// A perfect pod earns 300 RP; a 4-1 pod earns 210 RP.
export const DRAFT_RANKS = [
  { name: "Bronze", points: 0, difficulty: 0, description: "Straightforward plays and random targets." },
  { name: "Silver", points: 1000, difficulty: 1, description: "Prioritises stronger cards and attackers." },
  { name: "Gold", points: 2400, difficulty: 2, description: "Targets valuable threats and drafts stronger cards." },
  { name: "Platinum", points: 4200, difficulty: 3, description: "Spots winning attacks and plans around defenders." },
  { name: "Diamond", points: 6000, difficulty: 4, description: "Evaluates card plays and combat outcomes before acting." },
] as const;

export const DEMON_RANK = {
  name: "Demon", points: 15000, difficulty: 4,
  description: "Secret rank unlocked. Face the strongest ranked bots.",
} as const;

export function getVisibleDraftRanks(points: number) {
  return points >= DEMON_RANK.points ? [...DRAFT_RANKS, DEMON_RANK] : [...DRAFT_RANKS];
}

export function getDraftRank(points: number) {
  if (points >= DEMON_RANK.points) return DEMON_RANK;
  return DRAFT_RANKS.findLast(rank => points >= rank.points) ?? DRAFT_RANKS[0];
}

export function getDraftRankResult(points: number, results: DraftResult[]) {
  const games = results.filter(result => result.seats.includes(0));
  const change = games.reduce((sum, result) => sum + (result.winner === 0 ? 60 : result.winner === null ? 10 : -30), 0);
  const after = Math.max(0, points + change);
  return { before: points, after, change: after - points };
}
