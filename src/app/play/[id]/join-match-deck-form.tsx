"use client";

import { useActionState } from "react";
import {
  joinMatchAction,
  type FormState,
} from "@/lib/actions/match-actions";

const initialState: FormState = { error: null };

export function JoinMatchDeckForm({
  matchId,
  decks,
  sprites,
}: {
  matchId: string;
  decks: { id: string; label: string }[];
  sprites: { id: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    joinMatchAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="matchId" value={matchId} />
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
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {pending ? "Joining..." : "Join match"}
      </button>
    </form>
  );
}
