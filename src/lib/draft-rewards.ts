import { getDraftStandings, type DraftResult } from "./draft-logic";

export const DRAFT_PRIZES = [
  { place: 1, coins: 2000, packs: 3 },
  { place: 2, coins: 1000, packs: 2 },
  { place: 3, coins: 500, packs: 1 },
  { place: 4, coins: 250, packs: 0 },
  { place: 5, coins: 250, packs: 0 },
  { place: 6, coins: 250, packs: 0 },
] as const;

export function getDraftPrize(results: DraftResult[], seat = 0) {
  const standings = getDraftStandings(results);
  const player = standings.find((row) => row.seat === seat);
  if (!player) throw new Error("Invalid draft seat.");
  const place = 1 + standings.filter((row) => row.points > player.points ||
    (row.points === player.points && row.wins > player.wins)).length;
  return { ...DRAFT_PRIZES[place - 1] };
}
