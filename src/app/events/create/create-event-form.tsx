"use client";

import { useActionState } from "react";
import {
  createEventAction,
  type FormState,
} from "@/lib/actions/event-actions";

const initialState: FormState = { error: null };

export function CreateEventForm({
  formats,
}: {
  formats: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    createEventAction,
    initialState,
  );

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium">
          Event name
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
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="maxPlayers" className="text-sm font-medium">
          Max players
        </label>
        <select
          id="maxPlayers"
          name="maxPlayers"
          required
          defaultValue="6"
          className="rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
        >
          {[2, 3, 4, 5, 6, 7, 8].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending || formats.length === 0}
        className="mt-2 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {pending ? "Creating..." : "Create event"}
      </button>
    </form>
  );
}
