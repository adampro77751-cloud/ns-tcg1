import { randomCodeSegment, normalizeCode } from "@/lib/codes";

// Short join codes shared verbally/by screen for matches and events, e.g.
// K7P4XQ. ~32^6 (~1 billion) combinations, plus a DB uniqueness check.
export function generateJoinCode(): string {
  return randomCodeSegment(6);
}

export const normalizeJoinCode = normalizeCode;
