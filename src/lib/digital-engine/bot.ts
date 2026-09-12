import {
  declareAttack,
  endTurn,
  getLegalActions,
  playItem,
  playSpell,
  type LegalAction,
} from "./engine";
import type { DigitalGameState, EngineCard } from "./types";

// Pluggable so a future LLM/API-backed bot can be dropped in without
// touching the engine or the turn-driving loop below — it only needs to
// choose from the SAME getLegalActions() list the UI highlights for a
// human, and every choice still goes through the normal validated engine
// functions (declareAttack, playItem, ...), so a bot can never bypass
// server validation.
export interface BotDecisionProvider {
  chooseAction(
    state: DigitalGameState,
    playerIndex: 0 | 1,
    legalActions: LegalAction[],
    cardsById: Map<string, EngineCard>,
  ): LegalAction;
}

// V1: no external AI API. Simple, deterministic priority order — play an
// Item if it can, then a Spell, then attack with whatever it can, then end
// turn. "Sensible" for V1 means it never wastes a legal action and always
// eventually ends its turn; it does not evaluate matchups/board state.
export const simpleRulesBot: BotDecisionProvider = {
  chooseAction(_state, _playerIndex, legalActions) {
    const playItemAction = legalActions.find((a) => a.type === "PLAY_ITEM");
    if (playItemAction) return playItemAction;

    const playSpellAction = legalActions.find((a) => a.type === "PLAY_SPELL");
    if (playSpellAction) return playSpellAction;

    const attackAction = legalActions.find((a) => a.type === "ATTACK");
    if (attackAction) return attackAction;

    return { type: "END_TURN" };
  },
};

// Drives one full bot turn by repeatedly asking the provider for the next
// action and applying it through the real engine functions, stopping at
// END_TURN, a win, or a safety cap (in case a future provider misbehaves).
export function runBotTurn(
  initialState: DigitalGameState,
  playerIndex: 0 | 1,
  cardsById: Map<string, EngineCard>,
  provider: BotDecisionProvider = simpleRulesBot,
): DigitalGameState {
  let state = initialState;
  const MAX_STEPS = 50;

  for (let step = 0; step < MAX_STEPS; step++) {
    if (state.phase === "COMPLETE" || state.activePlayerIndex !== playerIndex) {
      return state;
    }

    const legalActions = getLegalActions(state, playerIndex, cardsById);
    const action = provider.chooseAction(state, playerIndex, legalActions, cardsById);

    if (action.type === "END_TURN") {
      return endTurn(state, cardsById);
    }
    if (action.type === "PLAY_ITEM") {
      state = playItem(state, playerIndex, action.instanceId, cardsById);
    } else if (action.type === "PLAY_SPELL") {
      state = playSpell(state, playerIndex, action.instanceId, cardsById);
    } else if (action.type === "ATTACK") {
      state = declareAttack(state, playerIndex, action.instanceId, cardsById);
    }
  }

  // Safety net — force the turn to end rather than looping forever.
  return state.phase === "COMPLETE" ? state : endTurn(state, cardsById);
}
