import { describe, expect, it } from "vitest";
import { createGameState, getLegalActions } from "./engine";
import { rankedRulesBot, runBotStep } from "./bot";
import type { CardInstance, EngineCard } from "./types";

const weak: EngineCard = { id: "weak", slug: "rank-test-weak", type: "Item", attack: 10, defence: 5, speed: 5 };
const strong: EngineCard = { id: "strong", slug: "rank-test-strong", type: "Item", attack: 100, defence: 40, speed: 40 };
const coke: EngineCard = { id: "coke", slug: "coke", type: "Spell", attack: null, defence: null, speed: null };
const cards = new Map([weak, strong, coke].map(card => [card.id, card]));
const instance = (id: string): CardInstance => ({ instanceId: id, cardId: id, tired: false, buffs: { attack: 0, defence: 0, speed: 0 } });
function game(difficulty: number) {
  const state = createGameState({ matchId: "rank-test", formatId: "draft", startingHealth: 500, startingHand: 0, cardsById: cards,
    players: [{ userId: "human", spriteInstanceId: null, cardIds: [] }, { userId: null, spriteInstanceId: null, cardIds: [] }], random: () => 0.99 });
  state.activePlayerIndex = 1;
  state.botDifficulty = difficulty;
  state.players[1].hand = [instance("weak"), instance("strong")];
  return state;
}

describe("ranked bot skill", () => {
  it("Bronze uses simple ordering while Silver selects the stronger legal card", () => {
    const bronze = game(0);
    const silver = game(1);
    expect(rankedRulesBot.chooseAction(bronze, 1, getLegalActions(bronze, 1, cards), cards)).toEqual({ type: "PLAY_ITEM", instanceId: "weak" });
    expect(rankedRulesBot.chooseAction(silver, 1, getLegalActions(silver, 1, cards), cards)).toEqual({ type: "PLAY_ITEM", instanceId: "strong" });
    const next = runBotStep(silver, 1, cards);
    expect(next.players[1].battlefield.map(card => card.cardId)).toEqual(["strong"]);
    expect(next.botDifficulty).toBe(1);
  });

  it("Gold targets the strongest opposing threat rather than a random one", () => {
    const state = game(2);
    state.players[1].hand = [instance("coke")];
    state.players[0].battlefield = [instance("weak"), instance("strong")];
    const next = runBotStep(state, 1, cards, new Map(), rankedRulesBot, () => 0);
    expect(next.players[0].battlefield.map(card => card.cardId)).toEqual(["weak"]);
  });

  it("Platinum takes a guaranteed winning attack before playing more cards", () => {
    const state = game(3);
    state.players[0].health = 20;
    state.players[1].battlefield = [instance("strong")];
    expect(rankedRulesBot.chooseAction(state, 1, getLegalActions(state, 1, cards), cards)).toEqual({ type: "ATTACK", instanceId: "strong" });
  });

  it("Diamond evaluates board impact, prefers removing a threat, and leaves the source state intact", () => {
    const state = game(4);
    state.players[1].hand = [instance("weak"), instance("coke")];
    state.players[0].battlefield = [instance("strong")];
    const before = structuredClone(state);
    expect(rankedRulesBot.chooseAction(state, 1, getLegalActions(state, 1, cards), cards)).toEqual({ type: "PLAY_SPELL", instanceId: "coke" });
    expect(state).toEqual(before);
  });
});
