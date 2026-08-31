"use client";

import { useActionState } from "react";
import {
  createDeckAction,
  type FormState,
} from "@/lib/actions/deck-actions";

const initialState: FormState = { error: null };

export function NewDeckForm({
  formats,
}: {
  formats: { id: string; name: string; description: string | null }[];
}) {
  const [state, formAction, pending] = useActionState(
    createDeckAction,
    initialState,
  );

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium">
          Deck name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          maxLength={60}
          className="rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="formatId" className="text-sm font-medium">
          Format
        </label>
        <select
          id="formatId"
          name="formatId"
          required
          defaultValue=""
          className="rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
        >
          <option value="" disabled>
            Choose a format
          </option>
          {formats.map((format) => (
            <option key={format.id} value={format.id}>
              {format.name}
            </option>
          ))}
        </select>
        {formats.length === 0 && (
          <p className="text-xs text-red-600">
            No formats are available yet.
          </p>
        )}
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending || formats.length === 0}
        className="mt-2 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {pending ? "Creating..." : "Create deck"}
      </button>
    </form>
  );
}
