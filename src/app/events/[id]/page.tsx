import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getEventDetails, MIN_EVENT_PLAYERS } from "@/lib/events";
import { getDeckLegality } from "@/lib/decks";
import { matchesToWinFor, getEventRoundWins, getOpenEventRoundMatch } from "@/lib/event-series";
import {
  joinEventAction,
  startEventAction,
  cancelEventAction,
} from "@/lib/actions/event-actions";
import { DeclareWinnerForm } from "./declare-winner-form";
import { StartRoundForm } from "./start-round-form";

const ERROR_MESSAGES: Record<string, string> = {
  "not-enough-players": `You need at least ${MIN_EVENT_PLAYERS} players to start.`,
  "invalid-winner": "Choose one of the joined players as the winner.",
  "series-auto-decided":
    "This is a best-of series — its winner is decided automatically from match results.",
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

  let joinSprites: { id: string; label: string }[] = [];
  if (session?.user && !isPlayer && !isFull && event.status === "REGISTRATION") {
    const spriteInstances = await prisma.spriteInstance.findMany({
      where: { ownerId: session.user.id },
      select: {
        id: true,
        name: true,
        level: true,
        sprite: { select: { name: true, rarity: true } },
      },
      orderBy: [{ sprite: { name: "asc" } }, { obtainedAt: "asc" }],
    });
    joinSprites = spriteInstances.map((s) => ({
      id: s.id,
      label: `${s.name} — ${s.sprite.name}${s.sprite.rarity ? ` (${s.sprite.rarity})` : ""} — Level ${s.level}${s.level >= 5 ? " MAX" : ""}`,
    }));
  }

  const isSeries = Boolean(event.bestOf);
  const roundWins = isSeries ? await getEventRoundWins(event.id) : {};
  const roundTarget = event.bestOf ? matchesToWinFor(event.bestOf) : null;
  const openRound =
    isSeries && event.status === "IN_PROGRESS"
      ? await getOpenEventRoundMatch(event.id)
      : null;

  // Deck + Sprite for starting the next round are chosen right here, not
  // up front — only fetched when this viewer could actually start one.
  let roundDecks: { id: string; label: string }[] = [];
  let roundSprites: { id: string; label: string }[] = [];
  if (session?.user && isPlayer && isSeries && event.status === "IN_PROGRESS" && !openRound) {
    const decks = await prisma.deck.findMany({
      where: { userId: session.user.id, formatId: event.formatId },
      select: { id: true, name: true },
    });
    const legality = await Promise.all(decks.map((d) => getDeckLegality(d.id)));
    roundDecks = decks
      .filter((_, i) => legality[i].legal)
      .map((d) => ({ id: d.id, label: d.name }));

    const spriteInstances = await prisma.spriteInstance.findMany({
      where: { ownerId: session.user.id },
      select: {
        id: true,
        name: true,
        level: true,
        sprite: { select: { name: true, rarity: true } },
      },
      orderBy: [{ sprite: { name: "asc" } }, { obtainedAt: "asc" }],
    });
    roundSprites = spriteInstances.map((s) => ({
      id: s.id,
      label: `${s.name} — ${s.sprite.name}${s.sprite.rarity ? ` (${s.sprite.rarity})` : ""} — Level ${s.level}${s.level >= 5 ? " MAX" : ""}`,
    }));
  }

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
            <div>
              <Link href={`/player/${p.user.username}`} className="hover:underline">
                {p.user.username}
              </Link>
              <div className="text-xs text-zinc-500">
                {p.spriteInstance ? (
                  <>
                    {p.spriteInstance.name} · {p.spriteInstance.sprite.name} ·
                    Level {p.spriteInstance.level}
                    {p.spriteInstance.level >= 5 ? " — MAX LEVEL" : ""}
                  </>
                ) : (
                  "No Sprite"
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {p.userId === event.organizerId && (
                <span className="text-xs text-zinc-400">Organiser</span>
              )}
              {event.winnerId === p.userId && (
                <span className="text-xs font-semibold text-green-700">Winner</span>
              )}
            </div>
          </li>
        ))}
      </ul>

      {event.status === "REGISTRATION" && (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {session?.user && !isPlayer && !isFull && (
            <form action={joinEventAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="eventId" value={event.id} />
              <select
                name="spriteInstanceId"
                defaultValue=""
                className="rounded border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-blue-600"
              >
                <option value="">No Sprite</option>
                {joinSprites.map((sprite) => (
                  <option key={sprite.id} value={sprite.id}>
                    {sprite.label}
                  </option>
                ))}
              </select>
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

      {event.status === "IN_PROGRESS" && isSeries && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Best of {event.bestOf} — first to {roundTarget}
          </h2>
          <ul className="mt-3 flex flex-col gap-1.5">
            {event.players.map((p) => (
              <li
                key={p.userId}
                className="flex items-center justify-between rounded border border-zinc-200 px-3 py-2 text-sm"
              >
                <span>{p.user.username}</span>
                <span className="font-semibold">
                  {roundWins[p.userId] ?? 0} round
                  {(roundWins[p.userId] ?? 0) === 1 ? "" : "s"} won
                </span>
              </li>
            ))}
          </ul>
          {isPlayer && openRound && (
            <Link
              href={`/play/${openRound.id}`}
              className="mt-3 inline-block rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Go to current round
            </Link>
          )}
          {isPlayer && !openRound && (
            <StartRoundForm
              eventId={event.id}
              decks={roundDecks}
              sprites={roundSprites}
            />
          )}
        </div>
      )}

      {event.status === "IN_PROGRESS" && isOrganizer && !isSeries && (
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
          <p className="text-base text-green-900">
            🏆 <strong>{event.winner.username}</strong> won this event
            {isSeries ? ` (best of ${event.bestOf})` : ""}!
          </p>

          {isSeries && (
            <>
              <ul className="mt-3 flex flex-col gap-1.5">
                {event.players.map((p) => (
                  <li
                    key={p.userId}
                    className="flex items-center justify-between rounded border border-green-200 bg-white px-3 py-2 text-sm"
                  >
                    <span>{p.user.username}</span>
                    <span className="font-semibold">
                      {roundWins[p.userId] ?? 0} round
                      {(roundWins[p.userId] ?? 0) === 1 ? "" : "s"} won
                    </span>
                  </li>
                ))}
              </ul>

              <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-green-800">
                Rounds
              </h3>
              <ul className="mt-2 flex flex-col gap-1.5">
                {event.matches.map((m, i) => {
                  const winnerUsername =
                    m.result?.status === "CONFIRMED"
                      ? event.players.find((p) => p.userId === m.result?.winnerId)
                          ?.user.username
                      : null;
                  return (
                    <li key={m.id}>
                      <Link
                        href={`/play/${m.id}`}
                        className="flex items-center justify-between rounded border border-green-100 bg-white px-3 py-2 text-sm hover:border-green-300"
                      >
                        <span>Round {i + 1}</span>
                        <span className="text-zinc-600">
                          {winnerUsername
                            ? `${winnerUsername} won`
                            : m.status.replace("_", " ")}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}

      {event.status === "CANCELLED" && (
        <p className="mt-6 text-sm text-zinc-500">This event was cancelled.</p>
      )}
    </div>
  );
}
