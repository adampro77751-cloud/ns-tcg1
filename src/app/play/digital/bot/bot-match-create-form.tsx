"use client";

import { useActionState } from "react";
import type { DigitalFormState } from "@/lib/actions/digital-match-actions";

type DeckWithLegality = {
  id: string;
  name: string;
  legality: { legal: boolean; errors: string[] };
};
type SpriteOption = { id: string; label: string };

const initialState: DigitalFormState = { error: null };

// Bot matches need TWO independent deck/Sprite choices from the same
// admin tester's own collection — the bot has no User account of its own,
// so "the Bot's deck/Sprite" is simply a second pick via the existing
// Deck/Sprite systems, never a fabricated second identity.
function DeckAndSpritePicker({
  legend,
  deckFieldName,
  spriteFieldName,
  decks,
  spriteOptions,
}: {
  legend: string;
  deckFieldName: string;
  spriteFieldName: string;
  decks: DeckWithLegality[];
  spriteOptions: SpriteOption[];
}) {
  return (
    <fieldset className="rounded-lg border border-sky-200 p-3">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{legend}</legend>
      <ul className="mt-2 flex flex-col gap-1.5">
        {decks.map((deck) => (
          <li key={deck.id}>
            <label
              className={
                "flex items-start gap-2 rounded border px-3 py-2 text-sm " +
                (deck.legality.legal ? "border-sky-200 bg-white" : "border-sky-200 bg-sky-50 text-slate-400")
              }
            >
              <input
                type="radio"
                name={deckFieldName}
                value={deck.id}
                disabled={!deck.legality.legal}
                required
                className="mt-1"
              />
              <span>
                <span className="font-medium">{deck.name}</span>
                {!deck.legality.legal && (
                  <span className="block text-xs text-red-600">{deck.legality.errors.join(" ")}</span>
                )}
              </span>
            </label>
          </li>
        ))}
      </ul>

      <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-500">Sprite</label>
      <select
        name={spriteFieldName}
        defaultValue=""
        className="mt-1 w-full rounded border border-sky-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
      >
        <option value="">No Sprite</option>
        {spriteOptions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
    </fieldset>
  );
}

export function BotMatchCreateForm({
  formatId,
  decks,
  spriteOptions,
  action,
}: {
  formatId: string;
  decks: DeckWithLegality[];
  spriteOptions: SpriteOption[];
  action: (state: DigitalFormState, formData: FormData) => Promise<DigitalFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const legalDecks = decks.filter((d) => d.legality.legal);

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <input type="hidden" name="formatId" value={formatId} />

      <DeckAndSpritePicker
        legend="Your deck"
        deckFieldName="deckId"
        spriteFieldName="spriteInstanceId"
        decks={decks}
        spriteOptions={spriteOptions}
      />
      <DeckAndSpritePicker
        legend="Bot deck"
        deckFieldName="botDeckId"
        spriteFieldName="botSpriteInstanceId"
        decks={decks}
        spriteOptions={spriteOptions}
      />

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending || legalDecks.length === 0}
        className="self-start rounded-full bg-violet-600 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-violet-700 disabled:opacity-60"
      >
        {pending ? "Starting..." : "Start bot match"}
      </button>
    </form>
  );
}
