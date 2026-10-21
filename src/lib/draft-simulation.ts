import { createGameState, endTurn, resolveDefense } from "@/lib/digital-engine/engine";
import { runBotDefense, runBotStep } from "@/lib/digital-engine/bot";
import { IllegalActionError, type EngineCard } from "@/lib/digital-engine/types";
import { DRAFT_HAND, DRAFT_HEALTH } from "@/lib/draft-logic";

// The other pod matches use the same rules engine as the visible match.
// A stalled bot game is a draw after 100 turns / 1,000 decisions.
export function simulateDraftBots(
  decks: [string[], string[]],
  cards: Map<string, EngineCard>,
  difficulty?: number,
): 0 | 1 | null {
  let state = createGameState({
    matchId: "draft-simulation", formatId: "draft", startingHealth: DRAFT_HEALTH,
    startingHand: DRAFT_HAND, cardsById: cards,
    players: decks.map((cardIds) => ({ userId: null, spriteInstanceId: null, cardIds })) as [
      { userId: null; spriteInstanceId: null; cardIds: string[] },
      { userId: null; spriteInstanceId: null; cardIds: string[] },
    ],
  });
  if (difficulty !== undefined) state.botDifficulty = difficulty;
  for (let step = 0; step < 1000 && state.turnNumber <= 100 && state.phase !== "COMPLETE"; step++) {
    try {
      state = state.pendingCombat
        ? runBotDefense(state, state.pendingCombat.defendingPlayerIndex, cards, new Map())
        : runBotStep(state, state.activePlayerIndex, cards);
    } catch (error) {
      if (!(error instanceof IllegalActionError)) throw error;
      // A rules-bot choice can become invalid after triggered effects.
      // Pass the turn (or take the attack) through normal engine rules.
      state = state.pendingCombat
        ? resolveDefense(state, state.pendingCombat.defendingPlayerIndex, null, cards, new Map())
        : endTurn(state, cards, new Map());
    }
  }
  return state.phase === "COMPLETE" ? state.winnerIndex : null;
}
