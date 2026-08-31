"use client";

import { useActionState, useState } from "react";
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
  const [bestOf, setBestOf] = useState("");
  const isSeries = bestOf !== "";

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
        <label htmlFor="bestOf" className="text-sm font-medium">
          Best of
        </label>
        <select
          id="bestOf"
          name="bestOf"
          value={bestOf}
          onChange={(e) => setBestOf(e.target.value)}
          className="rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
        >
          <option value="">None — organiser declares a winner manually</option>
          <option value="1">Best of 1 (2 players, real tracked match)</option>
          <option value="3">Best of 3 (2 players, first to 2)</option>
          <option value="5">Best of 5 (2 players, first to 3)</option>
          <option value="7">Best of 7 (2 players, first to 4)</option>
        </select>
        {isSeries && (
          <p className="text-xs text-zinc-500">
            A best-of series is head-to-head, so max players is locked to 2
            and the winner is decided automatically from real match
            results.
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="maxPlayers" className="text-sm font-medium">
          Max players
        </label>
        {isSeries ? (
          <>
            {/* A disabled <select> never submits its value, so the real
                value is carried by this hidden input instead. */}
            <input type="hidden" name="maxPlayers" value="2" />
            <select
              disabled
              value="2"
              onChange={() => {}}
              className="rounded border border-zinc-300 bg-zinc-100 px-3 py-2 text-sm text-zinc-500 outline-none"
            >
              <option value="2">2</option>
            </select>
          </>
        ) : (
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
        )}
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
