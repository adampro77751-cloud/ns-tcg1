import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getPlayerStats, getRecentMatches } from "@/lib/stats";
import { SPECIAL_USERNAME_TAGS } from "@/lib/special-tags";
import { auth } from "@/auth";
import { AutoRefresh } from "@/components/auto-refresh";
import { PlayerProfileContent } from "@/components/player-profile-content";

const RESULT_LIMIT = 100;

export default async function PlayersPage({
  searchParams,
}: PageProps<"/players">) {
  const search = await searchParams;
  const q = typeof search.q === "string" ? search.q.trim() : "";
  const session = await auth();

  // Only public-safe fields are selected — never email, passwordHash, or
  // any auth/session data. `role` is selected only to render the "Owner"
  // tag on the Admin account — its raw value is never rendered, only that
  // one derived label. Search is case-insensitive partial match on
  // username; login/signup still treat usernames as case-sensitive/exact,
  // this is purely a discovery convenience. With no search term, every
  // account is listed (alphabetically, scrollable) rather than showing
  // nothing until you type.
  const users = await prisma.user.findMany({
    where: q.length > 0 ? { username: { contains: q, mode: "insensitive" } } : undefined,
    select: { id: true, username: true, role: true },
    orderBy: { username: "asc" },
    take: RESULT_LIMIT,
  });

  const stats = await Promise.all(users.map((u) => getPlayerStats(u.id)));

  // The logged-in viewer's own profile, shown below the search — same
  // content, same component, as visiting /player/[you] directly.
  const ownProfile = session?.user
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
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
      })
    : null;

  const ownProfileData = ownProfile
    ? await Promise.all([
        getPlayerStats(ownProfile.id),
        getRecentMatches(ownProfile.id, 10),
        prisma.spriteInstance.findMany({
          where: { ownerId: ownProfile.id },
          select: {
            id: true,
            name: true,
            level: true,
            sprite: { select: { name: true, rarity: true } },
            edition: { select: { name: true } },
          },
          orderBy: [{ level: "desc" }, { sprite: { name: "asc" } }],
        }),
      ])
    : null;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-bold tracking-tight">Find players</h1>
      <p className="mt-1 text-sm text-slate-500">
        Browse or search for another NS TCG account by username.
      </p>

      <form className="mt-6 flex gap-2" action="/players">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Search by username..."
          autoFocus
          className="min-w-0 flex-1 rounded border border-sky-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
        />
        <button
          type="submit"
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Search
        </button>
      </form>

      {users.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">
          {q.length > 0
            ? `No players found matching "${q}".`
            : "No players yet."}
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {users.map((user, i) => {
            const s = stats[i];
            return (
              <li key={user.username}>
                <Link
                  href={`/player/${user.username}`}
                  className="flex items-center justify-between rounded border border-sky-200 bg-white px-4 py-3 hover:border-slate-400"
                >
                  <span className="flex items-center gap-2 font-medium">
                    {user.username}
                    {user.role === "ADMIN" && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800">
                        Owner
                      </span>
                    )}
                    {SPECIAL_USERNAME_TAGS[user.username] && (
                      <span className="rounded bg-pink-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-pink-800">
                        {SPECIAL_USERNAME_TAGS[user.username]}
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-slate-500">
                    {s.matchesPlayed} played · {s.wins}W-{s.losses}L ·{" "}
                    {s.winPercentage.toFixed(1)}% win rate
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {users.length === RESULT_LIMIT && (
        <p className="mt-3 text-xs text-slate-500">
          Showing the first {RESULT_LIMIT} accounts — search to narrow this
          down further.
        </p>
      )}

      {ownProfile && ownProfileData && (
        <div className="mt-12 border-t border-sky-200 pt-8">
          <AutoRefresh intervalMs={15000} />
          <h2 className="text-xl font-bold tracking-tight">My Profile</h2>
          <div className="mt-4">
            <PlayerProfileContent
              user={ownProfile}
              stats={ownProfileData[0]}
              recentMatches={ownProfileData[1]}
              spriteInstances={ownProfileData[2]}
              isOwnProfile
            />
          </div>
        </div>
      )}
    </div>
  );
}
