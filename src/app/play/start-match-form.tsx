"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  createMatchAction,
  type FormState,
} from "@/lib/actions/match-actions";

const initialState: FormState = { error: null };

export function StartMatchForm({
  decks,
  sprites,
}: {
  decks: { id: string; label: string }[];
  sprites: { id: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    createMatchAction,
    initialState,
  );

  if (decks.length === 0) {
    return (
      <p className="mt-3 text-sm text-zinc-500">
        You need a legal deck to start a match. Build one in{" "}
        <Link href="/decks/new" className="text-blue-600">
          Decks
        </Link>
        .
      </p>
    );
  }

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-3">
      <select
        name="deckId"
        required
        defaultValue=""
        className="rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
      >
        <option value="" disabled>
          Choose a deck
        </option>
        {decks.map((deck) => (
          <option key={deck.id} value={deck.id}>
            {deck.label}
          </option>
        ))}
      </select>
      <select
        name="spriteInstanceId"
        defaultValue=""
        className="rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
      >
        <option value="">No Sprite</option>
        {sprites.map((sprite) => (
          <option key={sprite.id} value={sprite.id}>
            {sprite.label}
          </option>
        ))}
      </select>
      <fieldset className="flex items-center gap-4 text-sm">
        <legend className="mb-1 text-sm font-medium">Visibility</legend>
        <label className="flex items-center gap-1.5">
          <input type="radio" name="visibility" value="private" defaultChecked />
          Private (code/link only)
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" name="visibility" value="public" />
          Normal (listed for anyone to join)
        </label>
      </fieldset>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {pending ? "Starting..." : "Start match"}
      </button>
    </form>
  );
}
