// Reusable effect/trigger engine — see engine.ts's `resolveAbilities` and
// `dispatchEvent` for how these get executed. CARD_ABILITIES is keyed by
// Card.slug, hand-authored directly from each card's real rulesText (never
// parsed/guessed from free text).
//
// Where a card's real text requires a player CHOICE this engine has no
// picker UI for yet (which target, which card to discard, "choose one"),
// the effect auto-resolves with a documented, clearly-labelled heuristic
// (e.g. "strongest available Item") rather than blocking the card
// entirely. Every such simplification is called out in the final report,
// not hidden.

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

// Who/what an effect applies to. Kept intentionally small and generic —
// engine.ts's effect executor interprets each (type, target) pair with a
// concrete, documented resolution rule.
export type EffectTarget =
  | "SELF" // the ability's controller
  | "OPPONENT" // the ability's controller's opponent
  | "OPPONENT_ITEM" // an opponent's battlefield Item (auto: strongest by Attack)
  | "OWN_ITEM" // the controller's own battlefield Item (auto: strongest by Attack)
  | "ANY_ITEM" // any Item on either battlefield (auto: strongest by Attack)
  | "SELF_DISCARD" // a card in the controller's own discard pile (auto: most recently discarded)
  | "SELF_DECK_ITEM" // an Item card in the controller's own deck (auto: first found; deck reshuffled after)
  | "SELF_HAND_ITEM" // an Item card in the controller's own hand (auto: first found)
  | "OPPONENT_HAND_ITEM" // an Item card in the opponent's hand (auto: highest Attack)
  | "THIS" // the specific instance that triggered a self-referential event
  | "PREVIOUS_TARGET" // reuse the instance resolved by the prior effect in this same ability
  | "ALL_ITEMS_IN_PLAY"; // every Item on either battlefield

export type EffectSpec = {
  type: EffectType;
  amount?: number;
  target?: EffectTarget;
};

export type AbilitySpec = {
  /** "ON_PLAY" fires once when the card resolves from hand. Every other
   *  value is a GameEvent this permanent subscribes to for as long as it's
   *  on the battlefield (see engine.ts's dispatchEvent). */
  trigger: GameEvent | "ON_PLAY";
  effects: EffectSpec[];
  /** Only checked for DAMAGE_DEALT triggers (Cutlary: "30 or more damage"). */
  condition?: { minAmount?: number };
};

// Keyed by Card.slug. A card with no entry here simply has no coded
// ability — it still works through its base Attack/Defence/Speed if it's
// an Item, same as before.
export const CARD_ABILITIES: Record<string, AbilitySpec[]> = {
  // ---- Simple draw/return effects, no targeting ----
  "cricket-ball": [{ trigger: "ON_PLAY", effects: [{ type: "DRAW", amount: 1, target: "SELF" }] }],
  "cricket-bowl": [{ trigger: "ON_PLAY", effects: [{ type: "DRAW", amount: 1, target: "SELF" }] }],
  mathomagics: [{ trigger: "ON_PLAY", effects: [{ type: "DRAW", amount: 3, target: "SELF" }] }],
  "old-book": [
    { trigger: "ON_PLAY", effects: [{ type: "RETURN_TO_HAND", amount: 1, target: "SELF_DISCARD" }] },
  ],
  "blast-from-the-past": [
    { trigger: "ON_PLAY", effects: [{ type: "RETURN_TO_HAND", amount: 2, target: "SELF_DISCARD" }] },
  ],

  // "Discard your hand, then draw 7 cards."
  "school-bag": [
    {
      trigger: "ON_PLAY",
      effects: [
        { type: "DISCARD", amount: 99, target: "SELF" }, // amount capped at actual hand size by the executor
        { type: "DRAW", amount: 7, target: "SELF" },
      ],
    },
  ],

  // "Draw 3 cards and put up to 2 of those cards into play." — simplified:
  // draws 3, then auto-plays up to 2 of the newly-drawn cards that are
  // Items (Spells have nothing to "stay in play" as).
  valpy: [
    {
      trigger: "ON_PLAY",
      effects: [
        { type: "DRAW", amount: 3, target: "SELF" },
        { type: "RETURN_TO_PLAY", amount: 2, target: "SELF_HAND_ITEM" },
      ],
    },
  ],

  // "Deal 100 damage to any target. Gain 100 health."
  parker: [
    {
      trigger: "ON_PLAY",
      effects: [
        { type: "DAMAGE", amount: 100, target: "OPPONENT" },
        { type: "GAIN_HEALTH", amount: 100, target: "SELF" },
      ],
    },
  ],

  // "Draw 2 cards. Deal 100 damage to any target. Target opponent discards
  // 2 cards." — the discard is worded as the OPPONENT'S choice in the real
  // rules; auto-resolved as random since there's no reveal/choice UI yet.
  seagrim: [
    {
      trigger: "ON_PLAY",
      effects: [
        { type: "DRAW", amount: 2, target: "SELF" },
        { type: "DAMAGE", amount: 100, target: "OPPONENT" },
        { type: "DISCARD", amount: 2, target: "OPPONENT" },
      ],
    },
  ],

  // "Look at target opponent's hand. Choose 1 card. They discard that
  // card." — the real card lets the CASTER choose from a revealed hand;
  // simplified to a random discard since there's no hand-reveal UI yet.
  "exam-marking": [{ trigger: "ON_PLAY", effects: [{ type: "DISCARD", amount: 1, target: "OPPONENT" }] }],

  // "Draw 2 cards, then discard 1 card." (no explicit trigger wording on
  // the real card — treated as enters-the-battlefield, matching every
  // other Item with a similarly-shaped one-shot effect.)
  "radnor-springs": [
    {
      trigger: "ON_PLAY",
      effects: [
        { type: "DRAW", amount: 2, target: "SELF" },
        { type: "DISCARD", amount: 1, target: "SELF" },
      ],
    },
  ],

  // "When this enters, put a card from your hand into play under your
  // control, then draw a card." — "a card" restricted to an Item (only
  // Items can be battlefield permanents in this engine).
  "it-room": [
    {
      trigger: "ON_PLAY",
      effects: [
        { type: "RETURN_TO_PLAY", amount: 1, target: "SELF_HAND_ITEM" },
        { type: "DRAW", amount: 1, target: "SELF" },
      ],
    },
  ],

  // "When this enters, target opponent reveals their hand and you choose
  // one card. Put it into play under your control." — the reveal/choice
  // is simplified to auto-picking the opponent's highest-Attack Item.
  "sasuage-roll-3": [{ trigger: "ON_PLAY", effects: [{ type: "GAIN_CONTROL", target: "OPPONENT_HAND_ITEM" }] }],

  // "If this is in your hand at the beginning of the game, put it into
  // play, then draw 2 cards." — handled directly in createGameState
  // (a start-of-game check, not a normal trigger); see there.

  // ---- Targeted removal / control-change effects (auto-target: opponent's
  // strongest Item by Attack, since there's no target-picker UI yet) ----
  coke: [{ trigger: "ON_PLAY", effects: [{ type: "MOVE_TO_DISCARD", target: "OPPONENT_ITEM" }] }],
  reflection: [{ trigger: "ON_PLAY", effects: [{ type: "MOVE_TO_DISCARD", target: "OPPONENT_ITEM" }] }],
  repton: [
    {
      trigger: "ON_PLAY",
      effects: [
        { type: "GAIN_CONTROL", target: "OPPONENT_ITEM" },
        { type: "DRAW", amount: 1, target: "SELF" },
      ],
    },
  ],
  "chemistry-lesson": [
    { trigger: "ON_PLAY", effects: [{ type: "RETURN_TO_PLAY", amount: 1, target: "SELF_DISCARD" }] },
  ],

  // "Put target card into its owner's discard pile, then put it into play
  // under its owner's control." — a same-owner flicker; re-triggers that
  // card's own ON_PLAY ability, if any.
  physics: [
    {
      trigger: "ON_PLAY",
      effects: [
        { type: "MOVE_TO_DISCARD", target: "ANY_ITEM" },
        { type: "RETURN_TO_PLAY", amount: 1, target: "PREVIOUS_TARGET" },
      ],
    },
  ],

  // "Search your deck for an Item card and put it under your control." —
  // no "into play" wording, so this goes to hand (unlike IT Room, which
  // says "into play" explicitly).
  school: [{ trigger: "ON_PLAY", effects: [{ type: "SEARCH_DECK", target: "SELF_DECK_ITEM" }] }],

  // "All Items you control become copies of target Item permanently." —
  // target auto-picked as the strongest Item on either battlefield.
  "the-final-bell": [{ trigger: "ON_PLAY", effects: [{ type: "COPY", target: "ANY_ITEM" }] }],

  // "All item cards get an extra 100 attack, 100 speed and 100 defense." —
  // permanent buff to every Item currently on either battlefield (not
  // scoped to "you control" in the real text).
  brooke: [
    {
      trigger: "ON_PLAY",
      effects: [
        { type: "BUFF_ATTACK", amount: 100, target: "ALL_ITEMS_IN_PLAY" },
        { type: "BUFF_DEFENSE", amount: 100, target: "ALL_ITEMS_IN_PLAY" },
        { type: "BUFF_SPEED", amount: 100, target: "ALL_ITEMS_IN_PLAY" },
      ],
    },
  ],

  // "Target Item gets -50 Defense until end of turn." — implemented as a
  // permanent -50 (no turn-based expiry yet); see report.
  punch: [{ trigger: "ON_PLAY", effects: [{ type: "BUFF_DEFENSE", amount: -50, target: "ANY_ITEM" }] }],

  // "Prevent all damage dealt to you this turn." Playing outside your own
  // turn ("You may play this on your opponent's turn") isn't implemented.
  nelson: [{ trigger: "ON_PLAY", effects: [{ type: "PREVENT_DAMAGE", target: "SELF" }] }],

  // "You may play 3 additional Item cards or Spell cards this turn."
  "super-drop": [{ trigger: "ON_PLAY", effects: [{ type: "EXTRA_ITEM_PLAY", amount: 3 }, { type: "EXTRA_SPELL_PLAY", amount: 3 }] }],
  // "You may play any number of Spells this turn."
  revision: [{ trigger: "ON_PLAY", effects: [{ type: "EXTRA_SPELL_PLAY", amount: 99 }] }],

  // "When this enters, choose one: Draw a card. / Target opponent discards
  // a card." — no choice UI yet; auto-resolves to the first option.
  "the-head-of-the-school": [{ trigger: "ON_PLAY", effects: [{ type: "DRAW", amount: 1, target: "SELF" }] }],

  // ---- Self-referential "when this happens to THIS card" triggers ----
  // "When this enters the discard pile, draw a card."
  "it-support": [{ trigger: "CARD_DISCARDED", effects: [{ type: "DRAW", amount: 1, target: "SELF" }] }],
  // "If this card is discarded, return it to play under your control."
  "lunch-card": [{ trigger: "CARD_DISCARDED", effects: [{ type: "RETURN_TO_PLAY", amount: 1, target: "THIS" }] }],
  // "When Bio Worm attacks, target opponent discards a card."
  "bio-worm": [{ trigger: "ATTACK_STARTED", effects: [{ type: "DISCARD", amount: 1, target: "OPPONENT" }] }],

  // ---- Ongoing "whenever" triggers on a permanent already in play ----
  // "Whenever you draw a card, deal 30 damage to target opponent."
  "mountain-mist": [{ trigger: "CARD_DRAWN", effects: [{ type: "DAMAGE", amount: 30, target: "OPPONENT" }] }],
  // "Whenever you deal 30 or more damage to a player, draw a card." —
  // the >=30 amount threshold is checked by the dispatcher before firing.
  cutlary: [
    {
      trigger: "DAMAGE_DEALT",
      condition: { minAmount: 30 },
      effects: [{ type: "DRAW", amount: 1, target: "SELF" }],
    },
  ],
  // "Whenever an Item enters, deal 20 damage to any target and draw 1
  // card." — literal reading: ANY Item entering, not scoped to "you
  // control" (the real text has no such qualifier).
  dna: [
    {
      trigger: "ITEM_ENTERED",
      effects: [
        { type: "DAMAGE", amount: 20, target: "OPPONENT" },
        { type: "DRAW", amount: 1, target: "SELF" },
      ],
    },
  ],
  // "Players can't draw cards." — a global static effect, special-cased
  // directly in drawCard() rather than modelled as a trigger; see there.

  // Budge's first two abilities are simple draw triggers; its third
  // ("whenever Budge attacks, search your library...") is not
  // implemented, and Budge can't currently be played at all — see report
  // (Commander-type cards have no defined way to enter play).
  budge: [
    { trigger: "ITEM_PLAYED", effects: [{ type: "DRAW", amount: 1, target: "SELF" }] },
    { trigger: "SPELL_PLAYED", effects: [{ type: "DRAW", amount: 2, target: "SELF" }] },
  ],
};

export function getCardAbilities(cardSlug: string): AbilitySpec[] {
  return CARD_ABILITIES[cardSlug] ?? [];
}
