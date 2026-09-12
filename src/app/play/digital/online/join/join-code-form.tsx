"use client";

import { useActionState } from "react";
import {
  findDigitalMatchByCodeAction,
  type DigitalFormState,
} from "@/lib/actions/digital-match-actions";

const initialState: DigitalFormState = { error: null };

export function JoinCodeForm() {
  const [state, formAction, pending] = useActionState(
    findDigitalMatchByCodeAction,
    initialState,
  );

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-3">
      <input
        name="code"
        type="text"
        required
        placeholder="A7K92"
        autoComplete="off"
        className="rounded border border-sky-300 px-3 py-2 font-mono text-sm uppercase outline-none focus:border-blue-600"
      />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full bg-violet-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-60"
      >
        {pending ? "Looking up..." : "Find match"}
      </button>
    </form>
  );
}
