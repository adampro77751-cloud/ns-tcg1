import type { DraftResult } from "./draft-logic";

export const DRAFT_RANKS = [
  { name: "Bronze", points: 0, difficulty: 0, description: "Straightforward plays and random targets." },
  { name: "Silver", points: 200, difficulty: 1, description: "Prioritises stronger cards and attackers." },
  { name: "Gold", points: 500, difficulty: 2, description: "Targets valuable threats and drafts stronger cards." },
  { name: "Platinum", points: 900, difficulty: 3, description: "Spots winning attacks and plans around defenders." },
  { name: "Diamond", points: 1400, difficulty: 4, description: "Evaluates card plays and combat outcomes before acting." },
] as const;

export function getDraftRank(points: number) {
  return DRAFT_RANKS.findLast(rank => points >= rank.points) ?? DRAFT_RANKS[0];
}

export function getDraftRankResult(points: number, results: DraftResult[]) {
  const games = results.filter(result => result.seats.includes(0));
  const change = games.reduce((sum, result) => sum + (result.winner === 0 ? 60 : result.winner === null ? 10 : -30), 0);
  const after = Math.max(0, points + change);
  return { before: points, after, change: after - points };
}
