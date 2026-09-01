import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getPlayerStats, getRecentMatches } from "@/lib/stats";
import { MAX_SPRITE_LEVEL } from "@/lib/xp";
import { auth } from "@/auth";
import { AutoRefresh } from "@/components/auto-refresh";

const RARITY_STYLES: Record<string, string> = {
  RARE: "bg-blue-100 text-blue-800",
  MYTHIC: "bg-purple-100 text-purple-800",
  LEGENDARY: "bg-amber-100 text-amber-800",
};

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

  // Only public-safe fields are selected — never email, passwordHash, or
  // any auth/session data. `role` is selected only to render the "Owner"
  // tag on the Admin account — its raw value is never rendered directly.
  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      role: true,
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

  // Individually owned Sprites — nickname, base Sprite name/rarity, edition,
  // and level only. No redemption-code or batch data is selected here.
  const spriteInstancesPromise = prisma.spriteInstance.findMany({
    where: { ownerId: user.id },
    select: {
      id: true,
      name: true,
      level: true,
      sprite: { select: { name: true, rarity: true } },
      edition: { select: { name: true } },
    },
    orderBy: [{ level: "desc" }, { sprite: { name: "asc" } }],
  });

  const [stats, recentMatches, spriteInstances, session] = await Promise.all([
    getPlayerStats(user.id),
    getRecentMatches(user.id, 10),
    spriteInstancesPromise,
    auth(),
  ]);
  const isOwnProfile = session?.user?.id === user.id;
  const highestLevelSprite = spriteInstances[0] ?? null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12">
      <AutoRefresh intervalMs={15000} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            {user.username}
            {user.role === "ADMIN" && (
              <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold uppercase text-amber-800">
                Owner
              </span>
            )}
          </h1>
          {user.profile?.displayName && (
            <p className="text-zinc-600">{user.profile.displayName}</p>
          )}
          <p className="mt-1 text-xs text-zinc-500">
            Joined {user.createdAt.toLocaleDateString()}
          </p>
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

      {stats.formatRecords.length > 0 && (
        <>
          <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Record by format
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.formatRecords.map((record) => (
              <StatTile
                key={record.formatSlug}
                label={record.formatName}
                value={`${record.wins}-${record.losses}`}
              />
            ))}
          </div>
        </>
      )}

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Event record
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Events played" value={String(stats.eventsPlayed)} />
        <StatTile label="Events won" value={String(stats.eventsWon)} />
      </div>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Sprites
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Sprites owned" value={String(spriteInstances.length)} />
        <StatTile
          label="Highest level Sprite"
          value={
            highestLevelSprite
              ? `${highestLevelSprite.sprite.name} (Lv ${highestLevelSprite.level})`
              : "—"
          }
        />
      </div>
      {spriteInstances.length > 0 ? (
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {spriteInstances.map((instance) => (
            <li
              key={instance.id}
              className="flex flex-col gap-1 rounded border border-zinc-200 p-3"
            >
              <span className="font-medium">{instance.name}</span>
              <span className="text-xs text-zinc-500">
                {instance.sprite.name}
              </span>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {instance.sprite.rarity && (
                  <span
                    className={
                      "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase " +
                      (RARITY_STYLES[instance.sprite.rarity] ??
                        "bg-zinc-100 text-zinc-600")
                    }
                  >
                    {instance.sprite.rarity}
                  </span>
                )}
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600">
                  {instance.edition.name}
                </span>
              </div>
              <span className="mt-1 text-xs text-zinc-500">
                Level {instance.level}
                {instance.level >= MAX_SPRITE_LEVEL ? " — MAX LEVEL" : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-zinc-500">No Sprites owned yet.</p>
      )}

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Recent matches
      </h2>
      {recentMatches.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">No completed matches yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {recentMatches.map((match) => (
            <li key={match.matchId}>
              <Link
                href={`/play/${match.matchId}`}
                className="flex items-center justify-between rounded border border-zinc-200 px-4 py-3 hover:border-zinc-400"
              >
                <div>
                  <span
                    className={
                      "mr-2 text-xs font-semibold " +
                      (match.won ? "text-green-700" : "text-red-700")
                    }
                  >
                    {match.won ? "WIN" : "LOSS"}
                  </span>
                  <span className="text-sm">
                    vs{" "}
                    {match.opponentUsername ?? (
                      <span className="text-zinc-400">Unknown</span>
                    )}
                  </span>
                  <div className="text-xs text-zinc-500">
                    {match.formatName}
                    {match.spriteLabel ? ` · ${match.spriteLabel}` : ""}
                  </div>
                </div>
                <span className="text-xs text-zinc-500">
                  {match.date?.toLocaleDateString() ?? ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

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
