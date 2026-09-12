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

export function DigitalCreateForm({
  hiddenFields,
  decks,
  spriteOptions,
  action,
  submitLabel,
}: {
  /** e.g. { formatId } when creating, { matchId } when joining an existing match. */
  hiddenFields: Record<string, string>;
  decks: DeckWithLegality[];
  spriteOptions: SpriteOption[];
  action: (state: DigitalFormState, formData: FormData) => Promise<DigitalFormState>;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const legalDecks = decks.filter((d) => d.legality.legal);

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Your deck
        </h2>
        <ul className="mt-2 flex flex-col gap-1.5">
          {decks.map((deck) => (
            <li key={deck.id}>
              <label
                className={
                  "flex items-start gap-2 rounded border px-3 py-2 text-sm " +
                  (deck.legality.legal
                    ? "border-sky-200 bg-white"
                    : "border-sky-200 bg-sky-50 text-slate-400")
                }
              >
                <input
                  type="radio"
                  name="deckId"
                  value={deck.id}
                  disabled={!deck.legality.legal}
                  required
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">{deck.name}</span>
                  {!deck.legality.legal && (
                    <span className="block text-xs text-red-600">
                      {deck.legality.errors.join(" ")}
                    </span>
                  )}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Your Sprite
        </h2>
        <select
          name="spriteInstanceId"
          defaultValue=""
          className="mt-2 w-full rounded border border-sky-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
        >
          <option value="">No Sprite</option>
          {spriteOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending || legalDecks.length === 0}
        className="self-start rounded-full bg-violet-600 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-violet-700 disabled:opacity-60"
      >
        {pending ? "Starting..." : submitLabel}
      </button>
    </form>
  );
}
