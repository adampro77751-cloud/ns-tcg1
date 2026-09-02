"use client";

import { declareWinnerAction } from "@/lib/actions/event-actions";

export function DeclareWinnerForm({
  eventId,
  players,
}: {
  eventId: string;
  players: { userId: string; username: string }[];
}) {
  return (
    <form action={declareWinnerAction} className="mt-3 flex flex-wrap gap-3">
      <input type="hidden" name="eventId" value={eventId} />
      <select
        name="winnerId"
        required
        defaultValue=""
        className="rounded border border-sky-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
      >
        <option value="" disabled>
          Choose the winner
        </option>
        {players.map((p) => (
          <option key={p.userId} value={p.userId}>
            {p.username}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        Confirm winner
      </button>
    </form>
  );
}
