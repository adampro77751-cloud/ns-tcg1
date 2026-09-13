import {
  declareAttack,
  resolveDefense,
  previewDefenseDamage,
  endTurn,
  getLegalActions,
  playItem,
  playSpell,
  type LegalAction,
} from "./engine";
import type { DigitalGameState, EngineCard } from "./types";
import type { SpriteEngineData } from "./sprite-abilities";

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
// (Defending is handled separately by chooseBotDefender below, since it's
// never part of this priority list — getLegalActions never returns DEFEND/
// NO_DEFENDER together with the normal action set.)
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

// Picks the defender that minimizes damage taken (per the brief: "prefer
// defending where it reduces damage or gives a favourable outcome").
// Defending never has a downside in this engine (the defender doesn't
// become tired), so this always picks whichever legal option — including
// "no defender" — results in the least damage, with ties resolved toward
// not bothering to defend.
export function chooseBotDefender(
  state: DigitalGameState,
  cardsById: Map<string, EngineCard>,
  spritesById: Map<string, SpriteEngineData>,
): string | null {
  const pending = state.pendingCombat;
  if (!pending) return null;

  const undefendedDamage = previewDefenseDamage(state, cardsById, spritesById, null);
  let best: { instanceId: string; damage: number } | null = null;
  for (const instanceId of pending.legalDefenderInstanceIds) {
    const damage = previewDefenseDamage(state, cardsById, spritesById, instanceId);
    if (!best || damage < best.damage) best = { instanceId, damage };
  }
  if (best && best.damage < undefendedDamage) return best.instanceId;
  return null;
}

// Resolves the bot's defense choice for a pending attack where the bot is
// the DEFENDING player — called regardless of whose turn it nominally is,
// since defending isn't gated by activePlayerIndex.
export function runBotDefense(
  state: DigitalGameState,
  botIndex: 0 | 1,
  cardsById: Map<string, EngineCard>,
  spritesById: Map<string, SpriteEngineData>,
): DigitalGameState {
  if (!state.pendingCombat || state.pendingCombat.defendingPlayerIndex !== botIndex) return state;
  const defenderInstanceId = chooseBotDefender(state, cardsById, spritesById);
  return resolveDefense(state, botIndex, defenderInstanceId, cardsById, spritesById);
}

// Drives one full bot turn by repeatedly asking the provider for the next
// action and applying it through the real engine functions, stopping at
// END_TURN, a win, a PENDING COMBAT the bot itself declared (must wait for
// the opponent to defend before doing anything else), or a safety cap (in
// case a future provider misbehaves).
export function runBotTurn(
  initialState: DigitalGameState,
  playerIndex: 0 | 1,
  cardsById: Map<string, EngineCard>,
  spritesById: Map<string, SpriteEngineData> = new Map(),
  provider: BotDecisionProvider = simpleRulesBot,
): DigitalGameState {
  let state = initialState;
  const MAX_STEPS = 50;

  for (let step = 0; step < MAX_STEPS; step++) {
    if (state.phase === "COMPLETE" || state.activePlayerIndex !== playerIndex) {
      return state;
    }
    // The bot just declared an attack against an opponent with a legal
    // defender — play pauses here until the opponent (human or bot, via
    // runBotDefense) resolves it. Nothing else to do this call.
    if (state.pendingCombat) return state;

    const legalActions = getLegalActions(state, playerIndex, cardsById);
    const action = provider.chooseAction(state, playerIndex, legalActions, cardsById);

    if (action.type === "END_TURN") {
      return endTurn(state, cardsById, spritesById);
    }
    if (action.type === "PLAY_ITEM") {
      state = playItem(state, playerIndex, action.instanceId, cardsById, undefined, spritesById);
    } else if (action.type === "PLAY_SPELL") {
      state = playSpell(state, playerIndex, action.instanceId, cardsById, undefined, spritesById);
    } else if (action.type === "ATTACK") {
      state = declareAttack(state, playerIndex, action.instanceId, cardsById, spritesById);
    }
  }

  // Safety net — force the turn to end rather than looping forever.
  return state.phase === "COMPLETE" || state.pendingCombat ? state : endTurn(state, cardsById, spritesById);
}
