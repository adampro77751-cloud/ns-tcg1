import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { JoinEventByCodeForm } from "./join-event-by-code-form";
import { AutoRefresh } from "@/components/auto-refresh";

export default async function EventsPage() {
  const events = await prisma.event.findMany({
    // Once an event is COMPLETED or CANCELLED it's no longer joinable, so
    // it's dropped from this public listing to keep it current — the event
    // itself, its results, and any Sprite XP/history it produced are never
    // deleted, and it's still reachable directly via its join code/URL.
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Events</h1>
        <Link
          href="/events/create"
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Create event
        </Link>
      </div>

      <div className="mt-6 rounded border border-zinc-200 p-4">
        <h2 className="font-semibold">Join with a code</h2>
        <JoinEventByCodeForm />
      </div>

      {events.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-500">No events yet.</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {events.map((event) => (
            <li key={event.id}>
              <Link
                href={`/events/${event.id}`}
                className="flex items-center justify-between rounded border border-zinc-200 px-4 py-3 hover:border-zinc-400"
              >
                <div>
                  <div className="font-medium">{event.name}</div>
                  <div className="text-xs text-zinc-500">
                    {event.format.name} · by {event.organizer.username}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-zinc-600">
                    {event._count.players} / {event.maxPlayers} players
                  </span>
                  <span className="rounded bg-zinc-100 px-2 py-1 text-xs font-semibold uppercase text-zinc-600">
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
