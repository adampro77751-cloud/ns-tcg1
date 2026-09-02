"use client";

import { useActionState } from "react";
import {
  findMatchByCodeAction,
  type FormState,
} from "@/lib/actions/match-actions";

const initialState: FormState = { error: null };

export function JoinMatchForm() {
  const [state, formAction, pending] = useActionState(
    findMatchByCodeAction,
    initialState,
  );

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-3">
      <input
        name="code"
        type="text"
        required
        placeholder="K7P4XQ"
        autoComplete="off"
        className="rounded border border-sky-300 px-3 py-2 font-mono text-sm uppercase outline-none focus:border-blue-600"
      />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-sky-300 px-4 py-2 text-sm font-medium hover:bg-sky-50 disabled:opacity-60"
      >
        {pending ? "Looking up..." : "Join match"}
      </button>
    </form>
  );
}
