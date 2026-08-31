"use client";

import { useActionState } from "react";
import {
  renameDeckAction,
  type FormState,
} from "@/lib/actions/deck-actions";

const initialState: FormState = { error: null };

export function RenameDeckForm({
  deckId,
  initialName,
}: {
  deckId: string;
  initialName: string;
}) {
  const [state, formAction, pending] = useActionState(
    renameDeckAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="deckId" value={deckId} />
      <input
        name="name"
        type="text"
        defaultValue={initialName}
        maxLength={60}
        className="rounded border border-transparent px-1 -mx-1 text-2xl font-bold tracking-tight outline-none hover:border-zinc-300 focus:border-blue-600"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-60"
      >
        {pending ? "Saving..." : "Save"}
      </button>
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
