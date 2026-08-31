import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getPlayerStats } from "@/lib/stats";
import { auth } from "@/auth";

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-zinc-200 px-4 py-3">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-zinc-500">{label}</div>
    </div>
  );
}

export default async function PlayerProfilePage({
  params,
}: PageProps<"/player/[username]">) {
  const { username } = await params;

  // Only public-safe fields are selected — never email or passwordHash.
  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      createdAt: true,
      profile: { select: { displayName: true, bio: true } },
      decks: {
        select: {
          id: true,
          name: true,
          createdAt: true,
          format: { select: { name: true } },
        },
        orderBy: { updatedAt: "desc" },
      },
    },
  });

  if (!user) notFound();

  const [stats, session] = await Promise.all([getPlayerStats(user.id), auth()]);
  const isOwnProfile = session?.user?.id === user.id;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {user.username}
          </h1>
          {user.profile?.displayName && (
            <p className="text-zinc-600">{user.profile.displayName}</p>
          )}
        </div>
        {isOwnProfile && (
          <a
            href="/profile/edit"
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50"
          >
            Edit profile
          </a>
        )}
      </div>

      {user.profile?.bio && (
        <p className="mt-4 max-w-xl text-sm text-zinc-700">
          {user.profile.bio}
        </p>
      )}

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Match record
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Matches played" value={String(stats.matchesPlayed)} />
        <StatTile label="Wins" value={String(stats.wins)} />
        <StatTile label="Losses" value={String(stats.losses)} />
        <StatTile
          label="Win rate"
          value={`${stats.winPercentage.toFixed(1)}%`}
        />
      </div>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Event record
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Events played" value={String(stats.eventsPlayed)} />
        <StatTile label="Events won" value={String(stats.eventsWon)} />
      </div>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Decks
      </h2>
      {user.decks.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">No saved decks yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {user.decks.map((deck) => (
            <li key={deck.id}>
              <Link
                href={`/decks/${deck.id}`}
                className="flex items-center justify-between rounded border border-zinc-200 px-4 py-3 hover:border-zinc-400"
              >
                <span className="font-medium">{deck.name}</span>
                <span className="text-sm text-zinc-500">
                  {deck.format.name}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
