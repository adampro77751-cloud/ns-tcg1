"use client";

import { useActionState } from "react";
import {
  findEventByCodeAction,
  type FormState,
} from "@/lib/actions/event-actions";

const initialState: FormState = { error: null };

export function JoinEventByCodeForm() {
  const [state, formAction, pending] = useActionState(
    findEventByCodeAction,
    initialState,
  );

  return (
    <form action={formAction} className="mt-3 flex flex-wrap gap-3">
      <input
        name="code"
        type="text"
        required
        placeholder="P8KF2M"
        autoComplete="off"
        className="rounded border border-zinc-300 px-3 py-2 font-mono text-sm uppercase outline-none focus:border-blue-600"
      />
      {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60"
      >
        {pending ? "Looking up..." : "Go to event"}
      </button>
    </form>
  );
}
