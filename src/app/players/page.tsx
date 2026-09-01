import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getPlayerStats } from "@/lib/stats";

const RESULT_LIMIT = 100;

export default async function PlayersPage({
  searchParams,
}: PageProps<"/players">) {
  const search = await searchParams;
  const q = typeof search.q === "string" ? search.q.trim() : "";

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

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-bold tracking-tight">Find players</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Browse or search for another NS TCG account by username.
      </p>

      <form className="mt-6 flex gap-2" action="/players">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Search by username..."
          autoFocus
          className="min-w-0 flex-1 rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
        />
        <button
          type="submit"
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Search
        </button>
      </form>

      {users.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-500">
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
                  className="flex items-center justify-between rounded border border-zinc-200 px-4 py-3 hover:border-zinc-400"
                >
                  <span className="flex items-center gap-2 font-medium">
                    {user.username}
                    {user.role === "ADMIN" && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800">
                        Owner
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-zinc-500">
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
        <p className="mt-3 text-xs text-zinc-500">
          Showing the first {RESULT_LIMIT} accounts — search to narrow this
          down further.
        </p>
      )}
    </div>
  );
}
