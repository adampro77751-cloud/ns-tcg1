import Link from "next/link";
import { requireAdminPage } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { banUserAction, unbanUserAction } from "@/lib/actions/admin-user-actions";

export default async function AdminUsersPage({
  searchParams,
}: PageProps<"/admin/users">) {
  const session = await requireAdminPage();
  const search = await searchParams;
  const q = typeof search.q === "string" ? search.q.trim() : "";

  // Only public-safe-plus-role fields — never email or passwordHash.
  const users = await prisma.user.findMany({
    where: q.length > 0 ? { username: { contains: q, mode: "insensitive" } } : undefined,
    select: { id: true, username: true, role: true, bannedAt: true, createdAt: true },
    orderBy: { username: "asc" },
    take: 200,
  });

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12">
      <Link href="/admin" className="text-sm text-blue-600">
        ← Admin
      </Link>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">Users</h1>
      <p className="mt-1 text-sm text-slate-500">
        Ban blocks an account from logging in — it never deletes the account
        or its data.
      </p>

      <form className="mt-6 flex gap-2" action="/admin/users">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Search by username..."
          className="min-w-0 flex-1 rounded border border-sky-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
        />
        <button
          type="submit"
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Search
        </button>
      </form>

      <ul className="mt-6 flex flex-col gap-2">
        {users.map((user) => {
          const isSelf = user.id === session.user.id;
          const isAdmin = user.role === "ADMIN";
          return (
            <li
              key={user.id}
              className="flex items-center justify-between rounded border border-sky-200 bg-white px-4 py-3"
            >
              <div>
                <span className="font-medium">{user.username}</span>
                {isAdmin && (
                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800">
                    Admin
                  </span>
                )}
                {user.bannedAt && (
                  <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-700">
                    Banned
                  </span>
                )}
              </div>

              {user.bannedAt ? (
                <form action={unbanUserAction}>
                  <input type="hidden" name="userId" value={user.id} />
                  <button
                    type="submit"
                    className="rounded border border-sky-300 px-3 py-1.5 text-sm hover:bg-sky-50"
                  >
                    Unban
                  </button>
                </form>
              ) : isAdmin || isSelf ? null : (
                <form action={banUserAction}>
                  <input type="hidden" name="userId" value={user.id} />
                  <button
                    type="submit"
                    className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
                  >
                    Ban
                  </button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
