// Reusable effect/trigger engine skeleton — the extension point for Set 1
// card abilities, deliberately kept separate from engine.ts's core turn/
// combat rules. NOT wired up to real cards yet (see PHASE-1 limitations):
// Card.rulesText in the database is free-text for humans to read, not
// machine-readable data, so there is currently no reliable, non-invented
// way to turn e.g. Coke's rules text into an EffectSpec automatically.
// CARD_ABILITIES below is where that mapping goes once each card's real
// effect is deliberately hand-authored (not parsed/guessed) — the engine
// itself does not need to change to support that.
//
// This intentionally matches the "reusable effect engine, not hundreds of
// `if card.name === ...` checks" requirement structurally, without
// fabricating effect data for cards whose actual rules aren't safely
// machine-encodable yet.

export type EffectType =
  | "DRAW"
  | "DAMAGE"
  | "GAIN_HEALTH"
  | "DISCARD"
  | "MOVE_TO_DISCARD"
  | "RETURN_TO_HAND"
  | "RETURN_TO_PLAY"
  | "SEARCH_DECK"
  | "BUFF_ATTACK"
  | "BUFF_DEFENSE"
  | "BUFF_SPEED"
  | "GAIN_CONTROL"
  | "COPY"
  | "PREVENT_DAMAGE"
  | "EXTRA_ITEM_PLAY"
  | "EXTRA_SPELL_PLAY";

export type GameEvent =
  | "CARD_PLAYED"
  | "ITEM_PLAYED"
  | "SPELL_PLAYED"
  | "ITEM_ENTERED"
  | "CARD_DRAWN"
  | "CARD_DISCARDED"
  | "DAMAGE_DEALT"
  | "ATTACK_STARTED"
  | "TURN_STARTED"
  | "TURN_ENDED";

export type EffectSpec = {
  type: EffectType;
  amount?: number;
  target?: "SELF" | "OPPONENT" | "ANY" | "OPPONENT_ITEM" | "OWN_ITEM";
};

export type AbilitySpec = {
  /** Which game event triggers this ability. "ON_PLAY" fires immediately
   *  when the card resolves from hand (equivalent to a CARD_PLAYED trigger
   *  on itself), rather than needing a subscription. */
  trigger: GameEvent | "ON_PLAY";
  effects: EffectSpec[];
};

// Keyed by Card.slug. Empty for Phase 1 — see file header. Adding a card's
// real ability here (once authored, not guessed) is the only change
// needed; engine.ts and the action layer already call into this map
// generically.
export const CARD_ABILITIES: Record<string, AbilitySpec[]> = {};

export function getCardAbilities(cardSlug: string): AbilitySpec[] {
  return CARD_ABILITIES[cardSlug] ?? [];
}
