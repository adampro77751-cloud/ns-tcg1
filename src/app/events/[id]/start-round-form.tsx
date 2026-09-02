"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  startEventRoundAction,
  type StartRoundFormState,
} from "@/lib/actions/event-actions";

const initialState: StartRoundFormState = { error: null };

export function StartRoundForm({
  eventId,
  decks,
  sprites,
}: {
  eventId: string;
  decks: { id: string; label: string }[];
  sprites: { id: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    startEventRoundAction,
    initialState,
  );

  if (decks.length === 0) {
    return (
      <p className="mt-3 text-sm text-slate-500">
        You need a legal deck for this event's format to start a round.
        Build one in{" "}
        <Link href="/decks/new" className="text-blue-600">
          Decks
        </Link>
        .
      </p>
    );
  }

  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-center gap-2">
      <input type="hidden" name="eventId" value={eventId} />
      <select
        name="deckId"
        required
        defaultValue=""
        className="rounded border border-sky-300 px-3 py-1.5 text-sm outline-none focus:border-blue-600"
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
        className="rounded border border-sky-300 px-3 py-1.5 text-sm outline-none focus:border-blue-600"
      >
        <option value="">No Sprite</option>
        {sprites.map((sprite) => (
          <option key={sprite.id} value={sprite.id}>
            {sprite.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {pending ? "Starting..." : "Start next round"}
      </button>
      {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
