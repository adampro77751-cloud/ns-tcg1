import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { getEventDetails, MIN_EVENT_PLAYERS } from "@/lib/events";
import {
  joinEventAction,
  startEventAction,
  cancelEventAction,
} from "@/lib/actions/event-actions";
import { DeclareWinnerForm } from "./declare-winner-form";

const ERROR_MESSAGES: Record<string, string> = {
  "not-enough-players": `You need at least ${MIN_EVENT_PLAYERS} players to start.`,
  "invalid-winner": "Choose one of the joined players as the winner.",
};

export default async function EventDetailPage({
  params,
  searchParams,
}: PageProps<"/events/[id]">) {
  const { id } = await params;
  const search = await searchParams;
  const session = await auth();

  const event = await getEventDetails(id);
  if (!event) notFound();

  const isOrganizer = session?.user?.id === event.organizerId;
  const isPlayer = event.players.some((p) => p.userId === session?.user?.id);
  const isFull = event.players.length >= event.maxPlayers;
  const errorParam = typeof search.error === "string" ? search.error : null;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{event.name}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {event.format.name} · organised by {event.organizer.username}
          </p>
        </div>
        <span className="rounded bg-zinc-100 px-2 py-1 text-xs font-semibold uppercase text-zinc-600">
          {event.status.replace("_", " ")}
        </span>
      </div>
      <p className="mt-1 font-mono text-sm text-zinc-500">
        Join code: {event.joinCode}
      </p>

      {errorParam && (
        <p className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {ERROR_MESSAGES[errorParam] ?? "Something went wrong."}
        </p>
      )}

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Players ({event.players.length} / {event.maxPlayers})
      </h2>
      <ul className="mt-3 flex flex-col gap-1.5">
        {event.players.map((p) => (
          <li
            key={p.userId}
            className="flex items-center justify-between rounded border border-zinc-200 px-3 py-2"
          >
            <Link href={`/player/${p.user.username}`} className="hover:underline">
              {p.user.username}
            </Link>
            {p.userId === event.organizerId && (
              <span className="text-xs text-zinc-400">Organiser</span>
            )}
            {event.winnerId === p.userId && (
              <span className="text-xs font-semibold text-green-700">Winner</span>
            )}
          </li>
        ))}
      </ul>

      {event.status === "REGISTRATION" && (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {session?.user && !isPlayer && !isFull && (
            <form action={joinEventAction}>
              <input type="hidden" name="eventId" value={event.id} />
              <button
                type="submit"
                className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                Join event
              </button>
            </form>
          )}
          {!session?.user && (
            <p className="text-sm text-zinc-600">
              <Link href="/login" className="text-blue-600">
                Log in
              </Link>{" "}
              to join this event.
            </p>
          )}
          {isFull && !isPlayer && (
            <p className="text-sm text-zinc-500">This event is full.</p>
          )}
          {isOrganizer && (
            <>
              <form action={startEventAction}>
                <input type="hidden" name="eventId" value={event.id} />
                <button
                  type="submit"
                  disabled={event.players.length < MIN_EVENT_PLAYERS}
                  className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50"
                >
                  Start event
                </button>
              </form>
              <form action={cancelEventAction}>
                <input type="hidden" name="eventId" value={event.id} />
                <button
                  type="submit"
                  className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
                >
                  Cancel event
                </button>
              </form>
            </>
          )}
        </div>
      )}

      {event.status === "IN_PROGRESS" && isOrganizer && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Declare winner
          </h2>
          <DeclareWinnerForm
            eventId={event.id}
            players={event.players.map((p) => ({
              userId: p.userId,
              username: p.user.username,
            }))}
          />
        </div>
      )}

      {event.status === "COMPLETED" && event.winner && (
        <div className="mt-6 rounded border border-green-200 bg-green-50 px-4 py-4">
          <p className="text-sm text-green-900">
            <strong>{event.winner.username}</strong> won this event.
          </p>
        </div>
      )}

      {event.status === "CANCELLED" && (
        <p className="mt-6 text-sm text-zinc-500">This event was cancelled.</p>
      )}
    </div>
  );
}
