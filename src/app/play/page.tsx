import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getDeckLegality } from "@/lib/decks";
import { StartMatchForm } from "./start-match-form";
import { JoinMatchForm } from "./join-match-form";
import { JoinEventByCodeForm } from "@/app/events/join-event-by-code-form";
import { AutoRefresh } from "@/components/auto-refresh";

export default async function PlayPage() {
  const session = await auth();

  let legalDecks: { id: string; label: string }[] = [];
  let spriteOptions: { id: string; label: string }[] = [];
  let openMatches: Awaited<ReturnType<typeof getOpenMatches>> = [];
  let publicOpenMatches: Awaited<ReturnType<typeof getPublicOpenMatches>> = [];

  if (session?.user) {
    const decks = await prisma.deck.findMany({
      where: { userId: session.user.id },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, format: { select: { name: true } } },
    });
    const legalityByDeck = await Promise.all(
      decks.map((deck) => getDeckLegality(deck.id)),
    );
    legalDecks = decks
      .filter((_, i) => legalityByDeck[i].legal)
      .map((deck) => ({
        id: deck.id,
        label: `${deck.name} (${deck.format.name})`,
      }));

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
    spriteOptions = spriteInstances.map((s) => ({
      id: s.id,
      label: `${s.name} — ${s.sprite.name}${s.sprite.rarity ? ` (${s.sprite.rarity})` : ""} — Level ${s.level}${s.level >= 5 ? " MAX" : ""}`,
    }));

    openMatches = await getOpenMatches(session.user.id);
    publicOpenMatches = await getPublicOpenMatches(session.user.id);
  }

  // Events listing — public, same as before, no login required to view.
  const events = await prisma.event.findMany({
    where: { status: { in: ["REGISTRATION", "IN_PROGRESS"] } },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      name: true,
      status: true,
      maxPlayers: true,
      organizer: { select: { username: true } },
      format: { select: { name: true } },
      _count: { select: { players: true } },
    },
  });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12">
      <AutoRefresh intervalMs={10000} />
      <h1 className="text-2xl font-bold tracking-tight">Play</h1>

      {session?.user ? (
        <>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <div className="rounded border border-sky-200 bg-white p-4">
              <h2 className="font-semibold">Start a match</h2>
              <StartMatchForm decks={legalDecks} sprites={spriteOptions} />
            </div>
            <div className="rounded border border-sky-200 bg-white p-4">
              <h2 className="font-semibold">Join a match</h2>
              <JoinMatchForm />
            </div>
          </div>

          {publicOpenMatches.length > 0 && (
            <>
              <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-slate-500">
                Open matches
              </h2>
              <ul className="mt-3 flex flex-col gap-2">
                {publicOpenMatches.map((match) => (
                  <li key={match.id}>
                    <Link
                      href={`/play/${match.id}`}
                      className="flex items-center justify-between rounded border border-sky-200 bg-white px-4 py-3 hover:border-slate-400"
                    >
                      <span>
                        {match.format.name} · {match.players[0]?.user.username}
                      </span>
                      <span className="text-xs text-blue-600">Join</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}

          {openMatches.length > 0 && (
            <>
              <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-slate-500">
                Your open matches
              </h2>
              <ul className="mt-3 flex flex-col gap-2">
                {openMatches.map((match) => (
                  <li key={match.id}>
                    <Link
                      href={`/play/${match.id}`}
                      className="flex items-center justify-between rounded border border-sky-200 bg-white px-4 py-3 hover:border-slate-400"
                    >
                      <span>
                        {match.format.name} ·{" "}
                        <span className="font-mono">{match.joinCode}</span>
                      </span>
                      <span className="text-xs text-slate-500">
                        {match.status.replace("_", " ")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      ) : (
        <p className="mt-6 text-sm text-slate-600">
          <Link href="/login" className="text-blue-600">
            Log in
          </Link>{" "}
          to start or join a match.
        </p>
      )}

      <div className="mt-12 flex items-center justify-between border-t border-sky-200 pt-8">
        <h2 className="text-xl font-bold tracking-tight">Events</h2>
        <Link
          href="/events/create"
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Create event
        </Link>
      </div>

      <div className="mt-6 rounded border border-sky-200 bg-white p-4">
        <h2 className="font-semibold">Join with a code</h2>
        <JoinEventByCodeForm />
      </div>

      {events.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">No events yet.</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {events.map((event) => (
            <li key={event.id}>
              <Link
                href={`/events/${event.id}`}
                className="flex items-center justify-between rounded border border-sky-200 bg-white px-4 py-3 hover:border-slate-400"
              >
                <div>
                  <div className="font-medium">{event.name}</div>
                  <div className="text-xs text-slate-500">
                    {event.format.name} · by {event.organizer.username}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-600">
                    {event._count.players} / {event.maxPlayers} players
                  </span>
                  <span className="rounded bg-sky-100 px-2 py-1 text-xs font-semibold uppercase text-slate-600">
                    {event.status.replace("_", " ")}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function getOpenMatches(userId: string) {
  return prisma.match.findMany({
    where: {
      players: { some: { userId } },
      status: { in: ["WAITING", "IN_PROGRESS", "AWAITING_CONFIRMATION"] },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      joinCode: true,
      status: true,
      format: { select: { name: true } },
    },
  });
}

// Normal (non-private) matches still waiting for an opponent, from anyone —
// join directly with no code needed. Excludes matches this viewer already
// created (those already show in "Your open matches").
function getPublicOpenMatches(userId: string) {
  return prisma.match.findMany({
    where: {
      status: "WAITING",
      isPrivate: false,
      eventId: null,
      players: { none: { userId } },
    },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      format: { select: { name: true } },
      players: { select: { user: { select: { username: true } } } },
    },
  });
}
